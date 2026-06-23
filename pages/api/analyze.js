// POST /api/analyze
// Body: { threads: [...] }
// Returns: { results: [{ id, summary, resolution, category, flags, isSpam }] }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { threads } = req.body;
  if (!threads?.length) return res.status(400).json({ error: "No threads provided" });

  const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

  // Process in batches of 5 to avoid token limits
  const BATCH_SIZE = 5;
  const allResults = [];

  for (let i = 0; i < threads.length; i += BATCH_SIZE) {
    const batch = threads.slice(i, i + BATCH_SIZE);

    const prompt = `You are a customer support analyst for i2R CNC, a CNC router manufacturer that sells CNC routers and related equipment.

Analyze the following support email threads and return a JSON array. For EACH thread return an object with:
- "id": the thread id string (required, copy exactly)
- "isSpam": true if this is NOT a genuine customer support inquiry (auto-reply, out-of-office, newsletter, order confirmation, shipping notification, marketing, do-not-reply sender). false if it's a real customer issue or question.
- "category": one of ["Software", "Hardware", "Setup", "Connectivity", "Contact request", "Other"] (only if isSpam is false)
- "summary": 1-2 sentence plain English description of the customer's problem or question. Be specific — mention the machine model, error, or symptom if present. (only if isSpam is false)
- "resolution": 1-2 sentence description of how support responded or resolved it. If hasSent is false or unclear, write "Unresolved — no reply sent yet." (only if isSpam is false)
- "flags": array containing any of these that apply (can be empty []):
    "no-reply" if hasSent is false
    "urgent" if the content contains urgent/frustrated/angry language
    "repeat" if this customer email appears in multiple threads in this batch

Threads:
${JSON.stringify(batch.map(t => ({
  id: t.id,
  subject: t.subject,
  content: t.content || t.snippet || "",
  customer: t.customer,
  customerEmail: t.customerEmail,
  date: t.date,
  hasSent: t.hasSent,
  messageCount: t.messageCount,
})), null, 2)}

IMPORTANT: Return ONLY a valid JSON array with exactly ${batch.length} objects, one per thread. No markdown, no backticks, no explanation.`;

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error("Anthropic API error:", data.error);
        // Return fallback results for this batch
        batch.forEach(t => allResults.push({ id: t.id, isSpam: false, category: "Other", summary: "Summary unavailable.", resolution: "Unresolved — awaiting response.", flags: t.hasSent ? [] : ["no-reply"] }));
        continue;
      }

      const text = data.content?.[0]?.text || "[]";

      let results;
      try {
        results = JSON.parse(text);
      } catch {
        const match = text.match(/\[[\s\S]*\]/);
        results = match ? JSON.parse(match[0]) : [];
      }

      if (Array.isArray(results)) {
        allResults.push(...results);
      }
    } catch (err) {
      console.error("AI analyze batch error:", err);
      batch.forEach(t => allResults.push({ id: t.id, isSpam: false, category: "Other", summary: "Summary unavailable.", resolution: "Unresolved — awaiting response.", flags: [] }));
    }
  }

  return res.status(200).json({ results: allResults });
}
