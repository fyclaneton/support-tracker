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

// Strip anything that could break JSON serialization
function sanitize(str, maxLen = 300) {
  if (!str) return "";
  return String(str)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // control chars
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
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

  // Build thread list safely
  const threadList = threads.map(t => {
    const id = sanitize(t.id, 50);
    const from = sanitize(t.customer, 80);
    const email = t.customerEmail ? `<${sanitize(t.customerEmail, 80)}>` : "";
    const subject = sanitize(t.subject, 150);
    const content = sanitize(t.content || t.snippet, 300);
    return `ID: ${id}\nFrom: ${from} ${email}\nSubject: ${subject}\nContent: ${content}\nHas reply: ${t.hasSent}`;
  }).join("\n---\n");

  const prompt = `You are a classifier for i2R CNC (CNC router manufacturer — sells machines only, does NOT offer cutting/engraving services).

Classify each email thread. Return a JSON array with one object per thread.

Each object needs:
- "id": exact thread id
- "isSpam": true if junk/marketing/automated/newsletter/cold-outreach
- "category": one of: Hardware, Software, Setup, Connectivity, Warranty/Repair, Sales inquiry, Contact request, Unrelated, Other
- "summary": 1 sentence what customer needs
- "resolution": 1 sentence on outcome, or "Unresolved - no reply sent yet."
- "flags": array with "no-reply" if hasSent=false, "urgent" if angry tone
- "machineModel": i2R model like B.24 or null

If spam: {"id":"...","isSpam":true}

Threads to classify:
${threadList}

Return ONLY a valid JSON array, no markdown fences.`;

  const maxTokens = Math.max(256, 200 * threads.length);

  // Build request body and validate it serializes cleanly
  const requestBody = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };

  let bodyStr;
  try {
    bodyStr = JSON.stringify(requestBody);
  } catch (serErr) {
    console.error("JSON serialization error:", serErr.message);
    return threads.map(t => ({ id: t.id, isSpam: false, category: "Other", summary: null, resolution: "Unresolved.", flags: [], machineModel: null }));
  }

  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: bodyStr,
    });

    const respText = await resp.text();

    if (!resp.ok) {
      console.error(`Anthropic ${resp.status}:`, respText.slice(0, 500));
      return threads.map(t => ({ id: t.id, isSpam: false, category: "Other", summary: null, resolution: "Unresolved.", flags: t.hasSent ? [] : ["no-reply"], machineModel: null }));
    }

    let data;
    try { data = JSON.parse(respText); }
    catch { return threads.map(t => ({ id: t.id, isSpam: false, category: "Other", summary: null, resolution: "Unresolved.", flags: [], machineModel: null })); }

    if (data.error) {
      console.error("Anthropic error:", data.error);
      return threads.map(t => ({ id: t.id, isSpam: false, category: "Other", summary: null, resolution: "Unresolved.", flags: [], machineModel: null }));
    }

    const text = (data.content?.[0]?.text || "[]").trim();
    let results;
    try { results = JSON.parse(text); }
    catch {
      const match = text.match(/\[[\s\S]*\]/);
      try { results = match ? JSON.parse(match[0]) : []; }
      catch { results = []; }
    }

    if (Array.isArray(results)) {
      results.forEach(r => { if (r.machineModel) r.machineModel = normalizeModel(r.machineModel); });
      return results;
    }
    return threads.map(t => ({ id: t.id, isSpam: false, category: "Other", summary: null, resolution: "Unresolved.", flags: [], machineModel: null }));
  } catch (err) {
    console.error("Analyze error:", err.message);
    return threads.map(t => ({ id: t.id, isSpam: false, category: "Other", summary: null, resolution: "Unresolved.", flags: [], machineModel: null }));
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { threads } = req.body;
  if (!threads?.length) return res.status(400).json({ error: "No threads" });

  const nonSpam = threads.filter(t => !isObviousSpam(t));
  const spamResults = threads.filter(t => isObviousSpam(t)).map(t => ({ id: t.id, isSpam: true }));

  if (!nonSpam.length) return res.status(200).json({ results: spamResults });

  const BATCH_SIZE = 5;
  const analyzed = [];
  for (let i = 0; i < nonSpam.length; i += BATCH_SIZE) {
    const batch = nonSpam.slice(i, i + BATCH_SIZE);
    const results = await analyzeBatch(batch);
    analyzed.push(...results);
    if (i + BATCH_SIZE < nonSpam.length) await new Promise(r => setTimeout(r, 300));
  }

  return res.status(200).json({ results: [...spamResults, ...analyzed] });
}
