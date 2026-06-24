// GET  /api/import-progress — get saved import progress for current account
// POST /api/import-progress { pageToken, processed, saved } — save progress
// DELETE /api/import-progress — clear progress (import done)

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet, kvDel } from "../../lib/kv";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const email = session.user?.email || "unknown";
  const key = `import-progress:${email.replace(/[@.]/g, "_")}`;

  if (req.method === "GET") {
    try {
      const progress = await kvGet(key);
      return res.status(200).json({ progress: progress || null });
    } catch {
      return res.status(200).json({ progress: null });
    }
  }

  if (req.method === "POST") {
    const { pageToken, processed, saved, total } = req.body;
    try {
      await kvSet(key, { pageToken, processed, saved, total, updatedAt: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "DELETE") {
    try {
      await kvDel(key);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
