import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";

export const config = { maxDuration: 15 };

const REGIONS = ["Japan", "Korea", "Czech Republic", "United States", "Canada", "United Kingdom", "Other"];

// Domain-based quick detection before using AI
const DOMAIN_MAP = {
  ".jp": "Japan", ".co.jp": "Japan",
  ".kr": "Korea", ".co.kr": "Korea",
  ".cz": "Czech Republic",
  ".ca": "Canada",
  ".co.uk": "United Kingdom", ".uk": "United Kingdom",
  ".us": "United States",
};

function detectFromDomain(email) {
  if (!email) return null;
  const domain = email.toLowerCase().split("@")[1] || "";
  for (const [ext, region] of Object.entries(DOMAIN_MAP)) {
    if (domain.endsWith(ext)) return region;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { threadId, content, customer, subject, customerEmail, region } = req.body;

  // Save manually set region
  if (region !== undefined && threadId) {
    try {
      const thread = await kvGet(`thread:${threadId}`);
      if (thread) await kvSet(`thread:${threadId}`, { ...thread, region });
      return res.status(200).json({ ok: true, region });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Quick domain-based detection first (free, no API call)
  const domainRegion = detectFromDomain(customerEmail);
  if (domainRegion) {
    // Save it too
    if (threadId) {
      const thread = await kvGet(`thread:${threadId}`).catch(() => null);
      if (thread) await kvSet(`thread:${threadId}`, { ...thread, region: domainRegion }).catch(() => {});
    }
    return res.status(200).json({ region: domainRegion, source: "domain" });
  }

  // AI detection — only if we have some content
  const textToAnalyze = [customer, subject, (content || "").slice(0, 300)].filter(Boolean).join(" ");
  if (!textToAnalyze.trim()) {
    return res.status(200).json({ region: "Other", source: "fallback" });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(200).json({ region: "Other", source: "no-key" });

  const prompt = `What country/region is this customer most likely from? Look for clues in their name, email domain, writing style, and content.

Customer: ${customer || ""}
Email: ${customerEmail || ""}
Subject: ${subject || ""}
Content excerpt: ${(content || "").slice(0, 250)}

Choose exactly ONE: Japan, Korea, Czech Republic, United States, Canada, United Kingdom, Other

Reply with ONLY the region name.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 15,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("Region detect API error:", resp.status, err);
      return res.status(200).json({ region: "Other", source: "api-error" });
    }

    const data = await resp.json();
    if (data.error) {
      console.error("Region detect Anthropic error:", data.error);
      return res.status(200).json({ region: "Other", source: "api-error" });
    }

    const raw = (data.content?.[0]?.text || "Other").trim();
    const detected = REGIONS.find(r => raw.toLowerCase().includes(r.toLowerCase())) || "Other";

    // Save to thread record
    if (threadId) {
      const thread = await kvGet(`thread:${threadId}`).catch(() => null);
      if (thread) await kvSet(`thread:${threadId}`, { ...thread, region: detected }).catch(() => {});
    }

    return res.status(200).json({ region: detected, source: "ai" });
  } catch (err) {
    console.error("Region detect error:", err.message);
    return res.status(200).json({ region: "Other", source: "error" });
  }
}
