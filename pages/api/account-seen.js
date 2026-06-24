// GET  /api/account-seen?email=  — check if this account has been seen before
// POST /api/account-seen { email } — mark account as seen

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const email = session.user?.email;
  if (!email) return res.status(400).json({ error: "No email" });

  const key = `account-seen:${email.replace(/[@.]/g, "_")}`;

  if (req.method === "GET") {
    try {
      const seen = await kvGet(key);
      return res.status(200).json({ seen: !!seen, email });
    } catch {
      return res.status(200).json({ seen: false, email });
    }
  }

  if (req.method === "POST") {
    try {
      await kvSet(key, { email, firstSeen: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
