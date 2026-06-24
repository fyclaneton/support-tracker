import { isDefiniteJunk } from "../../lib/junk-filter";
import { normalizeModel } from "../../lib/models";

export const config = { maxDuration: 60 };

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

function isObviousSpam(thread) {
  return isDefiniteJunk(
    thread.customerEmail || thread.customer || "",
    thread.subject || "",
    thread.customer || ""
  );
}

// Analyze up to 5 threads in a SINGLE API call — much cheaper
async function analyzeBatch(threads) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return threads.map(t => ({
      id: t.id, isSpam: false, category: "Other",
      summary: "Set ANTHROPIC_API_KEY in Vercel.",
      resolution: t.hasSent ? "Reply sent." : "Unresolved — no reply sent yet.",
      flags: t.hasSent ? [] : ["no-reply"], machineModel: null,
    }));
  }

  const prompt = `You are a classifier for i2R CNC (CNC router manufacturer — sells machines, does NOT offer cutting/engraving services).

Classify each email thread below. Return a JSON array with one object per thread.

Each object must have:
- "id": exact thread id
- "isSpam": true if junk/marketing/automated/newsletter/cold-outreach
- "category": Hardware|Software|Setup|Connectivity|Warranty/Repair|Sales inquiry|Contact request|Unrelated|Other (Unrelated = off-topic or wants cutting services)
- "summary": 1 sentence what customer needs
- "resolution": 1 sentence on resolution, or "Unresolved — no reply sent yet."
- "flags": [] array — add "no-reply" if hasSent=false, "urgent" if angry tone
- "machineModel": i2R series model like B.24 or null

If spam: just {"id":"...","isSpam":true}

Threads:
${threads.map(t => `ID: ${t.id}
From: ${t.customer} ${t.customerEmail ? "<"+t.customerEmail+">" : ""}
Subject: ${t.subject}
Content: ${(t.content||t.snippet||"").slice(0,300)}
Has reply: ${t.hasSent}`).join("\n---\n")}

Return ONLY a JSON array. No markdown.`;

  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150 * threads.length, // ~150 tokens per thread
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`Anthropic HTTP ${resp.status}:`, err);
      return threads.map(t => ({ id: t.id, isSpam: false, category: "Other", summary: `API error ${resp.status}`, resolution: "Unresolved.", flags: [], machineModel: null }));
    }

    const data = await resp.json();
    if (data.error) {
      console.error("Anthropic error:", data.error);
      return threads.map(t => ({ id: t.id, isSpam: false, category: "Other", summary: `Error: ${data.error.message}`, resolution: "Unresolved.", flags: [], machineModel: null }));
    }

    const text = (data.content?.[0]?.text || "[]").trim();
    let results;
    try { results = JSON.parse(text); }
    catch {
      const match = text.match(/\[[\s\S]*\]/);
      results = match ? JSON.parse(match[0]) : [];
    }

    // Normalize machine models
    if (Array.isArray(results)) {
      results.forEach(r => { if (r.machineModel) r.machineModel = normalizeModel(r.machineModel); });
      return results;
    }
    return threads.map(t => ({ id: t.id, isSpam: false, category: "Other", summary: "Parse error.", resolution: "Unresolved.", flags: [], machineModel: null }));
  } catch (err) {
    console.error("Fetch error:", err.message);
    return threads.map(t => ({ id: t.id, isSpam: false, category: "Other", summary: `Network error.`, resolution: "Unresolved.", flags: [], machineModel: null }));
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { threads } = req.body;
  if (!threads?.length) return res.status(400).json({ error: "No threads" });

  // Step 1: filter obvious spam without any API call
  const nonSpam = threads.filter(t => !isObviousSpam(t));
  const spamResults = threads
    .filter(t => isObviousSpam(t))
    .map(t => ({ id: t.id, isSpam: true }));

  if (!nonSpam.length) return res.status(200).json({ results: spamResults });

  // Step 2: analyze remaining in batches of 5 — ONE API call per batch
  const BATCH_SIZE = 5;
  const analyzed = [];
  for (let i = 0; i < nonSpam.length; i += BATCH_SIZE) {
    const batch = nonSpam.slice(i, i + BATCH_SIZE);
    const results = await analyzeBatch(batch);
    analyzed.push(...results);
    if (i + BATCH_SIZE < nonSpam.length) {
      await new Promise(r => setTimeout(r, 300)); // rate limit buffer
    }
  }

  return res.status(200).json({ results: [...spamResults, ...analyzed] });
}
