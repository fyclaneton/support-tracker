// POST /api/analyze
// Body: { threads: [...] }
// Returns: { results: [{ id, isSpam, summary, resolution, category, flags, machineModel }] }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { threads } = req.body;
  if (!threads?.length) return res.status(400).json({ error: "No threads provided" });

  const BATCH_SIZE = 5;
  const allResults = [];

  for (let i = 0; i < threads.length; i += BATCH_SIZE) {
    const batch = threads.slice(i, i + BATCH_SIZE);

    const prompt = `You are a strict customer support classifier for i2R CNC, a CNC router manufacturer.

Your job is to read email threads and decide: is this a REAL customer inquiry that our support team needs to act on or archive?

KEEP (isSpam: false) — these are real inquiries:
- Customer reporting a machine problem, error, or malfunction (any i2R model)
- Customer asking for setup, installation, or calibration help
- Software issues: UCCNC errors, post processor problems, controller not connecting
- Hardware issues: axis not moving, spindle problems, limit switch errors, losing steps
- Warranty claims, repair requests, parts requests
- Sales inquiries: asking about pricing, models, availability, shipping
- Customer requesting a phone call or follow-up from support
- Complaints or frustrated customers

DISCARD (isSpam: true) — drop these completely:
- QuickBooks / accounting software sync summaries or notifications
- Shopify store notifications, order confirmations, settings changes
- Marketing emails, newsletters, promotional campaigns, cold outreach
- Password reset emails, security alerts from software tools
- Shipping carrier notifications (FedEx, UPS, USPS, DHL)
- AI tool emails (HelloRep, Johnny AI, any AI sales assistant)
- Social media notifications
- Payment processor receipts (PayPal, Stripe, Square)
- Internal system alerts not from customers
- Automated no-reply emails of any kind
- Any email where there is no real human customer asking for help

For each thread that is NOT spam, extract:
- "category": one of ["Hardware", "Software", "Setup", "Connectivity", "Warranty/Repair", "Sales inquiry", "Contact request", "Other"]
- "summary": 1-2 sentences describing exactly what the customer needs. Be specific — include machine model, error message, or symptom if mentioned.
- "resolution": 1-2 sentences on how it was resolved. If our side sent the last reply, summarize what we said. If no reply was sent, write "Unresolved — no reply sent yet."
- "flags": array of applicable flags — "no-reply" if hasSent is false, "urgent" if customer used urgent/angry/frustrated language, "repeat" if same customer email appears in multiple threads in this batch
- "machineModel": detected i2R model if mentioned (e.g. "B.24", "D.22", "M+350") or null

Threads to analyze:
${JSON.stringify(batch.map(t => ({
  id: t.id,
  subject: t.subject,
  content: t.content || t.snippet || "(no content)",
  customer: t.customer,
  customerEmail: t.customerEmail,
  date: t.date,
  hasSent: t.hasSent,
  messageCount: t.messageCount,
})), null, 2)}

Return ONLY a valid JSON array with exactly ${batch.length} objects. Each object must have "id" and "isSpam". Add other fields only when isSpam is false. No markdown, no backticks, no explanation.`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
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
        console.error("Anthropic error:", data.error);
        batch.forEach(t => allResults.push({ id: t.id, isSpam: false, category: "Other", summary: "Summary unavailable.", resolution: t.hasSent ? "Reply sent." : "Unresolved — no reply sent yet.", flags: t.hasSent ? [] : ["no-reply"], machineModel: null }));
        continue;
      }

      const text = data.content?.[0]?.text || "[]";
      let results;
      try { results = JSON.parse(text); }
      catch { const match = text.match(/\[[\s\S]*\]/); results = match ? JSON.parse(match[0]) : []; }

      if (Array.isArray(results)) allResults.push(...results);
    } catch (err) {
      console.error("Analyze batch error:", err);
      batch.forEach(t => allResults.push({ id: t.id, isSpam: false, category: "Other", summary: "Summary unavailable.", resolution: "Unresolved — no reply sent yet.", flags: [], machineModel: null }));
    }
  }

  return res.status(200).json({ results: allResults });
}
