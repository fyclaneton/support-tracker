// GET /api/test-ai — tests Anthropic API with a minimal request
export default async function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(200).json({ ok: false, error: "No API key set" });

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 20,
        messages: [{ role: "user", content: "Say OK" }],
      }),
    });
    const text = await resp.text();
    if (!resp.ok) return res.status(200).json({ ok: false, status: resp.status, error: text });
    const data = JSON.parse(text);
    return res.status(200).json({ ok: true, response: data.content?.[0]?.text });
  } catch(e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}
