// POST /api/clear-saved
// Clears all saved thread data from Upstash so bulk import can start fresh

export const config = { maxDuration: 30 };

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvDel, kvSet, kvKeys } from "../../lib/kv";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  try {
    // Get all saved thread IDs
    const savedIds = await kvGet("shared:saved-thread-ids");
    const ids = Array.isArray(savedIds) ? savedIds : [];

    // Delete each thread record
    let deleted = 0;
    for (const id of ids) {
      try { await kvDel(`thread:${id}`); deleted++; } catch {}
    }

    // Clear the index
    await kvSet("shared:saved-thread-ids", []);

    return res.status(200).json({ ok: true, deleted });
  } catch (err) {
    console.error("clear-saved error:", err);
    return res.status(500).json({ error: err.message });
  }
}
