// POST /api/analyze { threads }
// Uses Anthropic API to classify and summarize threads
// Each thread analyzed individually for reliability

export const config = { maxDuration: 60 };

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

import { isDefiniteJunk } from "../../lib/junk-filter";

function isObviousSpam(thread) {
  return isDefiniteJunk(
    thread.customerEmail || thread.customer || "",
    thread.subject || "",
    thread.customer || ""
  );
}

async function summarizeThread(thread) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { id: thread.id, isSpam: false, category: "Other", summary: "Set ANTHROPIC_API_KEY in Vercel environment variables to enable AI summaries.", resolution: thread.hasSent ? "Reply sent." : "Unresolved — no reply sent yet.", flags: thread.hasSent ? [] : ["no-reply"], machineModel: null };
  }

  const prompt = `Classify this email for i2R CNC (CNC router manufacturer — sells machines only, does NOT offer cutting/engraving/woodworking services).

From: ${thread.customer} ${thread.customerEmail ? "<"+thread.customerEmail+">" : ""}
Subject: ${thread.subject}
Content: ${(thread.content || thread.snippet || "").slice(0, 600)}
Has our reply: ${thread.hasSent}

Reply with JSON only — no markdown:
{
  "isSpam": true if junk/marketing/automated/newsletter/cold-outreach,
  "category": one of: Hardware|Software|Setup|Connectivity|Warranty/Repair|Sales inquiry|Contact request|Unrelated|Other
    Use Unrelated if customer wants cutting/engraving/woodworking SERVICES or is completely off-topic,
  "summary": "1-2 sentences what customer needs",
  "resolution": "1-2 sentences on resolution or Unresolved — no reply sent yet.",
  "flags": array — no-reply if hasSent=false, urgent if angry/frustrated,
  "machineModel": "i2R model like B.24 or null"
}

If spam: {"isSpam":true}`;

  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`Anthropic HTTP ${resp.status}:`, err);
      return { id: thread.id, isSpam: false, category: "Other", summary: `API error ${resp.status} — check logs`, resolution: thread.hasSent ? "Reply sent." : "Unresolved.", flags: thread.hasSent ? [] : ["no-reply"], machineModel: null };
    }

    const data = await resp.json();
    if (data.error) {
      console.error("Anthropic error:", data.error);
      return { id: thread.id, isSpam: false, category: "Other", summary: `Anthropic error: ${data.error.message}`, resolution: "Unresolved.", flags: [], machineModel: null };
    }

    const text = (data.content?.[0]?.text || "{}").trim();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { isSpam: false };
    }
    return { ...parsed, id: thread.id };
  } catch (err) {
    console.error("Fetch error:", err.message);
    return { id: thread.id, isSpam: false, category: "Other", summary: `Network error: ${err.message}`, resolution: "Unresolved.", flags: [], machineModel: null };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { threads } = req.body;
  if (!threads?.length) return res.status(400).json({ error: "No threads" });

  const results = [];
  for (const thread of threads) {
    // Skip obvious spam without calling AI
    if (isObviousSpam(thread)) {
      results.push({ id: thread.id, isSpam: true });
      continue;
    }
    const result = await summarizeThread(thread);
    results.push(result);
    // Small delay between calls to avoid rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  return res.status(200).json({ results });
}
