// GET  /api/manage-accounts — list all unique receivedBy/fetchedBy accounts in saved threads
// POST /api/manage-accounts { removeAccount, replaceWith } — remove or reassign an account tag

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const savedIds = await kvGet("shared:saved-thread-ids").catch(() => []);
  const ids = Array.isArray(savedIds) ? savedIds : [];

  if (req.method === "GET") {
    // Count threads per account
    const counts = {};
    const BATCH = 20;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const threads = await Promise.all(batch.map(id => kvGet(`thread:${id}`).catch(() => null)));
      threads.filter(Boolean).forEach(t => {
        const acct = t.receivedBy || t.fetchedBy || "__untagged__";
        counts[acct] = (counts[acct] || 0) + 1;
      });
      if (i + BATCH < ids.length) await new Promise(r => setTimeout(r, 50));
    }
    return res.status(200).json({ accounts: counts });
  }

  if (req.method === "POST") {
    const { removeAccount, replaceWith } = req.body;
    if (!removeAccount) return res.status(400).json({ error: "Missing removeAccount" });

    let updated = 0;
    const BATCH = 10;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      await Promise.all(batch.map(async id => {
        try {
          const t = await kvGet(`thread:${id}`);
          if (!t) return;
          const acct = t.receivedBy || t.fetchedBy;
          if (acct !== removeAccount) return;
          await kvSet(`thread:${id}`, {
            ...t,
            receivedBy: replaceWith || null,
            fetchedBy: replaceWith || null,
          });
          updated++;
        } catch {}
      }));
      if (i + BATCH < ids.length) await new Promise(r => setTimeout(r, 100));
    }
    return res.status(200).json({ ok: true, updated });
  }

  return res.status(405).end();
}
