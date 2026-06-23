export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    return res.status(200).json({
      ok: false,
      step: "env_check",
      error: "ANTHROPIC_API_KEY is not set. Go to Vercel → your project → Settings → Environment Variables and add it, then redeploy."
    });
  }

  if (!key.startsWith("sk-ant-")) {
    return res.status(200).json({
      ok: false,
      step: "key_format",
      error: `Key looks wrong — should start with 'sk-ant-' but got '${key.slice(0,10)}...'`
    });
  }

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
        max_tokens: 10,
        messages: [{ role: "user", content: "Say OK" }],
      }),
    });

    const data = await resp.json();

    if (!resp.ok || data.error) {
      return res.status(200).json({ ok: false, step: "api_call", status: resp.status, error: data.error?.message || JSON.stringify(data) });
    }

    return res.status(200).json({ ok: true, response: data.content?.[0]?.text, model: data.model, keyPrefix: key.slice(0, 16) + "..." });
  } catch (err) {
    return res.status(200).json({ ok: false, step: "network", error: err.message });
  }
}
