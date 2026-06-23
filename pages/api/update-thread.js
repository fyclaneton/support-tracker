// POST /api/update-thread { id, updates }
// Patches a saved thread record in Upstash with new field values
// Used to persist status, category, flag changes to the thread store

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { id, updates } = req.body;
  if (!id || !updates) return res.status(400).json({ error: "Missing id or updates" });

  try {
    const existing = await kvGet(`thread:${id}`);
    if (!existing) {
      // Thread not in saved store yet — nothing to update
      return res.status(200).json({ ok: true, notFound: true });
    }

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user?.email || "unknown",
    };

    await kvSet(`thread:${id}`, updated);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("update-thread error:", err);
    return res.status(500).json({ error: err.message });
  }
}
