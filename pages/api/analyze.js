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

function sanitize(str, maxLen = 300) {
  if (!str) return "";
  return str
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ") // remove control chars
    .replace(/\\/g, " ")   // remove backslashes that could break JSON
    .trim()
    .slice(0, maxLen);
}

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

  const threadList = threads.map(t =>
    `ID: ${t.id}\nFrom: ${sanitize(t.customer, 80)} ${t.customerEmail ? "<"+sanitize(t.customerEmail, 80)+">" : ""}\nSubject: ${sanitize(t.subject, 150)}\nContent: ${sanitize(t.content || t.snippet, 300)}\nHas reply: ${t.hasSent}`
  ).join("\n---\n");

  const prompt = `You are a classifier for i2R CNC (CNC router manufacturer — sells machines only, does NOT offer cutting/engraving services).

Classify each email thread. Return a JSON array with one object per thread.

Each object:
- "id": exact thread id
- "isSpam": true if junk/marketing/automated/newsletter/cold-outreach
- "category": Hardware|Software|Setup|Connectivity|Warranty/Repair|Sales inquiry|Contact request|Unrelated|Other
- "summary": 1 sentence what customer needs
- "resolution": 1 sentence on outcome, or "Unresolved — no reply sent yet."
- "flags": array — "no-reply" if hasSent=false, "urgent" if angry tone
- "machineModel": i2R model like B.24 or null

If spam: {"id":"...","isSpam":true}

Threads:
${threadList}

Return ONLY a valid JSON array, no markdown.`;

  const maxTokens = Math.max(200, 150 * threads.length);

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
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`Anthropic HTTP ${resp.status}:`, errText);
      // Return graceful fallback — don't surface error in summary
      return threads.map(t => ({
        id: t.id, isSpam: false, category: "Other",
        summary: null,
        resolution: t.hasSent ? "Reply sent." : "Unresolved — no reply sent yet.",
        flags: t.hasSent ? [] : ["no-reply"], machineModel: null,
      }));
    }

    const data = await resp.json();
    if (data.error) {
      console.error("Anthropic error:", data.error);
      return threads.map(t => ({
        id: t.id, isSpam: false, category: "Other",
        summary: null, resolution: "Unresolved.", flags: [], machineModel: null,
      }));
    }

    const text = (data.content?.[0]?.text || "[]").trim();
    let results;
    try {
      results = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      try { results = match ? JSON.parse(match[0]) : []; }
      catch { results = []; }
    }

    if (Array.isArray(results)) {
      results.forEach(r => {
        if (r.machineModel) r.machineModel = normalizeModel(r.machineModel);
      });
      return results;
    }
    return threads.map(t => ({ id: t.id, isSpam: false, category: "Other", summary: null, resolution: "Unresolved.", flags: [], machineModel: null }));
  } catch (err) {
    console.error("Analyze fetch error:", err.message);
    return threads.map(t => ({ id: t.id, isSpam: false, category: "Other", summary: null, resolution: "Unresolved.", flags: [], machineModel: null }));
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { threads } = req.body;
  if (!threads?.length) return res.status(400).json({ error: "No threads" });

  const nonSpam = threads.filter(t => !isObviousSpam(t));
  const spamResults = threads
    .filter(t => isObviousSpam(t))
    .map(t => ({ id: t.id, isSpam: true }));

  if (!nonSpam.length) return res.status(200).json({ results: spamResults });

  const BATCH_SIZE = 5;
  const analyzed = [];
  for (let i = 0; i < nonSpam.length; i += BATCH_SIZE) {
    const batch = nonSpam.slice(i, i + BATCH_SIZE);
    const results = await analyzeBatch(batch);
    analyzed.push(...results);
    if (i + BATCH_SIZE < nonSpam.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return res.status(200).json({ results: [...spamResults, ...analyzed] });
}
