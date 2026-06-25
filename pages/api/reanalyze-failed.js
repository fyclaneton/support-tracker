// POST /api/reanalyze-failed
// Finds all saved threads with failed AI summaries and clears them
// so they get re-analyzed on next page load

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";

export const config = { maxDuration: 60 };

const FAILED_PATTERNS = [
  "API error",
  "api error",
  "Network error",
  "Parse error",
  "Summary unavailable",
  "No API key",
  "balance",
  "Error:",
  "error ",
];

function isFailed(summary) {
  if (!summary) return true; // no summary = needs analysis
  return FAILED_PATTERNS.some(p => summary.includes(p));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  try {
    const savedIds = await kvGet("shared:saved-thread-ids");
    const ids = Array.isArray(savedIds) ? savedIds : [];
    let cleared = 0;
    let checked = 0;

    const BATCH = 10;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      await Promise.all(batch.map(async id => {
        try {
          const thread = await kvGet(`thread:${id}`);
          if (!thread) return;
          checked++;
          if (isFailed(thread.summary)) {
            // Clear summary and resolution so app re-analyzes it
            await kvSet(`thread:${id}`, {
              ...thread,
              summary: null,
              resolution: null,
              category: thread.category === "Other" ? null : thread.category,
            });
            cleared++;
          }
        } catch {}
      }));
      if (i + BATCH < ids.length) await new Promise(r => setTimeout(r, 100));
    }

    return res.status(200).json({ ok: true, cleared, checked, total: ids.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
