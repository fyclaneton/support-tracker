// POST /api/region-detect { threadId, content, customer, subject }
// Uses AI to detect region, returns suggestion

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";

export const config = { maxDuration: 15 };

const REGIONS = ["Japan", "Korea", "Czech Republic", "United States", "Canada", "United Kingdom", "Other"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { threadId, content, customer, subject, region } = req.body;

  // If region is being saved manually
  if (region !== undefined && threadId) {
    try {
      const thread = await kvGet(`thread:${threadId}`);
      if (thread) await kvSet(`thread:${threadId}`, { ...thread, region });
      await kvSet(`region:${threadId}`, region);
      return res.status(200).json({ ok: true, region });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // AI detect region
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(200).json({ region: "Other", confidence: "low" });

  const prompt = `Based on this customer email, what region/country are they likely from?

Customer name: ${customer}
Subject: ${subject}
Content: ${(content || "").slice(0, 400)}

Choose ONE from: Japan, Korea, Czech Republic, United States, Canada, United Kingdom, Other

Reply with ONLY the region name, nothing else.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 10, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await resp.json();
    const raw = (data.content?.[0]?.text || "Other").trim();
    const detected = REGIONS.find(r => raw.toLowerCase().includes(r.toLowerCase())) || "Other";
    return res.status(200).json({ region: detected });
  } catch {
    return res.status(200).json({ region: "Other" });
  }
}
