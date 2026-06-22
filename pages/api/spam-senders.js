// GET  /api/spam-senders          → returns list of flagged spam senders
// POST /api/spam-senders { email } → adds a sender to spam list
// DELETE /api/spam-senders { email } → removes a sender from spam list

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
const SPAM_KEY = "shared:spam-senders";

async function kvGet(key) {
  const res = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
  });
  const data = await res.json();
  return data.result ?? null;
}

async function kvSet(key, value) {
  await fetch(`${KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

async function getSpamList() {
  const raw = await kvGet(SPAM_KEY);
  if (!raw) return [];
  try { return JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw)); } catch { return []; }
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const list = await getSpamList();
    return res.status(200).json({ senders: list });
  }

  if (req.method === "POST") {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email" });
    const list = await getSpamList();
    if (!list.includes(email)) {
      list.push(email);
      await kvSet(SPAM_KEY, JSON.stringify(list));
    }
    return res.status(200).json({ ok: true, senders: list });
  }

  if (req.method === "DELETE") {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email" });
    const list = await getSpamList();
    const updated = list.filter(e => e !== email);
    await kvSet(SPAM_KEY, JSON.stringify(updated));
    return res.status(200).json({ ok: true, senders: updated });
  }

  return res.status(405).end();
}
