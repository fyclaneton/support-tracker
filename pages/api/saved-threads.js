import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvKeys } from "../../lib/kv";

export const config = { maxDuration: 30 };

// GET /api/saved-threads
// Returns all threads saved in Upstash KV

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  try {
    // Get all saved thread IDs from index
    const savedIds = await kvGet("shared:saved-thread-ids");
    if (!savedIds || !Array.isArray(savedIds) || savedIds.length === 0) {
      return res.status(200).json({ threads: [], ids: [], total: 0 });
    }

    // idsOnly mode — just return IDs, much faster, used to check what's already saved
    if (req.query.idsOnly === "true") {
      return res.status(200).json({ ids: savedIds, total: savedIds.length });
    }

    // Fetch all threads in parallel batches of 20
    const BATCH = 20;
    const threads = [];
    for (let i = 0; i < savedIds.length; i += BATCH) {
      const batch = savedIds.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(id => kvGet(`thread:${id}`).catch(() => null)));
      results.forEach(t => { if (t && t.id) threads.push(t); });
    }

    // Sort by date descending
    threads.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    return res.status(200).json({ threads, total: threads.length });
  } catch (err) {
    console.error("saved-threads error:", err);
    return res.status(500).json({ error: err.message });
  }
}
