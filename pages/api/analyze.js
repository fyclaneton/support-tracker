// POST /api/analyze
// Body: { threads: [...] }
// Returns: { results: [{ id, summary, resolution, category, flags, isSpam }] }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { threads } = req.body;
  if (!threads?.length) return res.status(400).json({ error: "No threads provided" });

  const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

  const prompt = `You are a customer support analyst for i2R CNC, a CNC router manufacturer.

Analyze the following support email threads and return a JSON array. For each thread respond with:
- id: the thread id (string)
- isSpam: true if this is NOT a real customer support inquiry (auto-reply, OOO, newsletter, order confirmation, marketing, etc). false if it's a real customer issue.
- category: one of ["Software", "Hardware", "Setup", "Connectivity", "Contact request", "Other"] — only if isSpam is false
- summary: 1-2 sentence plain English summary of what the customer's problem or inquiry is — only if isSpam is false
- resolution: 1-2 sentence summary of how it was resolved or what response was given. If unresolved, write "Unresolved — awaiting response." — only if isSpam is false
- flags: array of zero or more of these strings that apply:
    "no-reply" — thread has no reply from support at all
    "urgent" — customer used urgent, angry, or frustrated language (words like urgent, ASAP, frustrated, broken, stuck, can't work, losing money, etc.)
    "repeat" — customer email appears in more than one thread in this batch

Threads to analyze:
${JSON.stringify(threads.map(t => ({
  id: t.id,
  subject: t.subject,
  snippet: t.snippet,
  customer: t.customer,
  date: t.date,
  hasSent: t.hasSent,
  messageCount: t.messageCount,
})), null, 2)}

Respond ONLY with a valid JSON array. No markdown, no explanation, no backticks.`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "[]";

    let results;
    try {
      results = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      results = match ? JSON.parse(match[0]) : [];
    }

    return res.status(200).json({ results });
  } catch (err) {
    console.error("AI analyze error:", err);
    return res.status(500).json({ error: err.message });
  }
}
