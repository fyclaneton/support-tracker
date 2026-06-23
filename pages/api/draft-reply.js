// POST /api/draft-reply { thread }
// Uses KB entries as context to draft a reply with Claude

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet } from "../../lib/kv";

export const config = { maxDuration: 30 };

async function getRelevantKBEntries(thread) {
  try {
    const raw = await kvGet("shared:kb-index");
    const index = Array.isArray(raw) ? raw : [];
    if (!index.length) return [];

    // Fetch up to 30 most recent entries to search through
    const recent = index.slice(-30);
    const entries = (await Promise.all(
      recent.map(id => kvGet(`kb:${id}`).catch(() => null))
    )).filter(Boolean);

    // Score entries by relevance to this thread
    const threadText = `${thread.subject} ${thread.content || thread.snippet || ""}`.toLowerCase();
    const scored = entries.map(e => {
      let score = 0;
      if (e.category === thread.category) score += 3;
      if (e.machineModel && e.machineModel === thread.machineModel) score += 5;
      const words = threadText.split(/\s+/).filter(w => w.length > 4);
      words.forEach(w => {
        if (e.problem?.toLowerCase().includes(w)) score += 1;
        if (e.solution?.toLowerCase().includes(w)) score += 1;
      });
      return { ...e, score };
    });

    // Return top 3 most relevant
    return scored.sort((a, b) => b.score - a.score).slice(0, 3).filter(e => e.score > 0);
  } catch { return []; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { thread } = req.body;
  if (!thread) return res.status(400).json({ error: "Missing thread" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(200).json({ draft: "Set ANTHROPIC_API_KEY in Vercel to enable AI draft replies." });

  const kbEntries = await getRelevantKBEntries(thread);

  const kbContext = kbEntries.length > 0
    ? `\n\nRelevant past resolutions from our knowledge base:\n${kbEntries.map((e, i) =>
        `${i+1}. Problem: ${e.problem}\n   Solution: ${e.solution}`
      ).join("\n\n")}`
    : "";

  const prompt = `You are a customer support agent for i2R CNC, a CNC router manufacturer.

Write a helpful, professional email reply to this customer inquiry. Be specific and actionable.
${kbContext}

Customer: ${thread.customer}
Subject: ${thread.subject}
Their message: ${(thread.content || thread.snippet || "").slice(0, 600)}
Machine model: ${thread.machineModel || "Unknown"}
Category: ${thread.category || "Other"}
AI summary: ${thread.summary || ""}

Write only the email body (no subject line). Start with "Hi [customer first name]," and end with a professional sign-off from the i2R CNC support team. If past resolutions are available, use them to give specific, proven advice. Keep it concise and helpful.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await resp.json();
    if (data.error) return res.status(200).json({ draft: `Error: ${data.error.message}` });

    const draft = data.content?.[0]?.text || "";
    return res.status(200).json({ draft, kbUsed: kbEntries.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
