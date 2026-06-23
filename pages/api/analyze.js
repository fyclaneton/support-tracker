// POST /api/analyze { threads }
// Analyzes threads one at a time to avoid Vercel timeout
// Returns { results: [...] }

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

async function analyzeOne(thread) {
  const prompt = `You are a customer support classifier for i2R CNC, a CNC router manufacturer.

Classify this email thread and return a single JSON object.

KEEP (isSpam: false): machine problems, software errors, setup help, warranty/repair, sales inquiries, contact requests from real humans.
DISCARD (isSpam: true): QuickBooks, Shopify notifications, marketing, newsletters, password resets, shipping notifications, receipts, AI sales tools, auto-replies, cold outreach with no real question.

Thread:
Subject: ${thread.subject}
From: ${thread.customer} ${thread.customerEmail ? "<"+thread.customerEmail+">" : ""}
Date: ${thread.date}
Messages: ${thread.messageCount}
Has our reply: ${thread.hasSent}
Content: ${(thread.content||thread.snippet||"").slice(0,800)}

Return ONLY a JSON object with these fields:
{
  "id": "${thread.id}",
  "isSpam": true or false,
  "category": one of ["Hardware","Software","Setup","Connectivity","Warranty/Repair","Sales inquiry","Contact request","Other"] (omit if isSpam),
  "summary": "1-2 sentences describing exactly what the customer needs" (omit if isSpam),
  "resolution": "1-2 sentences on resolution or 'Unresolved — no reply sent yet.'" (omit if isSpam),
  "flags": [] array with "no-reply" if no reply, "urgent" if angry/urgent language, "repeat" if mentioned contacting before (omit if isSpam),
  "machineModel": "detected model like B.24 or D.22" or null (omit if isSpam)
}

No markdown, no backticks. Just the JSON object.`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001", // Use Haiku — faster and cheaper for classification
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    console.error("Anthropic error for thread", thread.id, ":", JSON.stringify(data.error || data));
    return { id: thread.id, isSpam: false, category: "Other", summary: "AI analysis failed — check ANTHROPIC_API_KEY in Vercel.", resolution: thread.hasSent ? "Reply sent." : "Unresolved — no reply sent yet.", flags: thread.hasSent ? [] : ["no-reply"], machineModel: null };
  }

  const text = data.content?.[0]?.text || "{}";
  try {
    const parsed = JSON.parse(text);
    return { ...parsed, id: thread.id };
  } catch {
    // Try to extract JSON from text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return { ...JSON.parse(match[0]), id: thread.id }; } catch {}
    }
    return { id: thread.id, isSpam: false, category: "Other", summary: text.slice(0, 200), resolution: "Unresolved.", flags: [], machineModel: null };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { threads } = req.body;
  if (!threads?.length) return res.status(400).json({ error: "No threads provided" });

  // Check API key is set
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set in environment variables");
    const fallback = threads.map(t => ({ id: t.id, isSpam: false, category: "Other", summary: "ANTHROPIC_API_KEY not set in Vercel environment variables.", resolution: t.hasSent ? "Reply sent." : "Unresolved.", flags: t.hasSent ? [] : ["no-reply"], machineModel: null }));
    return res.status(200).json({ results: fallback });
  }

  // Process in parallel batches of 3 (fast but won't hit rate limits)
  const BATCH_SIZE = 3;
  const allResults = [];

  for (let i = 0; i < threads.length; i += BATCH_SIZE) {
    const batch = threads.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(analyzeOne));
    allResults.push(...results);
  }

  return res.status(200).json({ results: allResults });
}
