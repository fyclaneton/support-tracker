import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";

const SPAM_KEY = "shared:spam-senders";

async function getSpamList() {
  const raw = await kvGet(SPAM_KEY);
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [];
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    try {
      const senders = await getSpamList();
      return res.status(200).json({ senders });
    } catch (err) {
      console.error("spam GET error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email" });
    try {
      const list = await getSpamList();
      if (!list.includes(email)) list.push(email);
      await kvSet(SPAM_KEY, list);
      return res.status(200).json({ ok: true, senders: list });
    } catch (err) {
      console.error("spam POST error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "DELETE") {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email" });
    try {
      const list = await getSpamList();
      const updated = list.filter(e => e !== email);
      await kvSet(SPAM_KEY, updated);
      return res.status(200).json({ ok: true, senders: updated });
    } catch (err) {
      console.error("spam DELETE error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
