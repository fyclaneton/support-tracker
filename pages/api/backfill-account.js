// POST /api/backfill-account { email }
// Tags all saved threads that have no fetchedBy with the provided email
// Run once per account to retroactively label historical data

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const email = req.body.email || session.user?.email;
  if (!email) return res.status(400).json({ error: "No email" });

  try {
    const savedIds = await kvGet("shared:saved-thread-ids");
    const ids = Array.isArray(savedIds) ? savedIds : [];
    let tagged = 0;

    const BATCH = 10;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      await Promise.all(batch.map(async id => {
        try {
          const thread = await kvGet(`thread:${id}`);
          if (thread && !thread.fetchedBy) {
            await kvSet(`thread:${id}`, { ...thread, fetchedBy: email });
            tagged++;
          }
        } catch {}
      }));
      if (i + BATCH < ids.length) await new Promise(r => setTimeout(r, 100));
    }

    return res.status(200).json({ ok: true, tagged, total: ids.length, email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
