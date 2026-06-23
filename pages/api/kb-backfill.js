// POST /api/kb-backfill
// One-time: reads all saved resolved threads and adds them to the knowledge base

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";

export const config = { maxDuration: 60 };

const INDEX_KEY = "shared:kb-index";

async function getKBIndex() {
  const raw = await kvGet(INDEX_KEY);
  return Array.isArray(raw) ? raw : [];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  try {
    // Load all saved thread IDs
    const savedIds = await kvGet("shared:saved-thread-ids");
    const ids = Array.isArray(savedIds) ? savedIds : [];
    if (!ids.length) return res.status(200).json({ ok: true, added: 0, skipped: 0 });

    // Load existing KB index to avoid duplicates
    const kbIndex = await getKBIndex();
    const kbSet = new Set(kbIndex);

    let added = 0;
    let skipped = 0;
    const newKBIds = [...kbIndex];

    // Process in batches of 20
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      const threads = (await Promise.all(
        batch.map(id => kvGet(`thread:${id}`).catch(() => null))
      )).filter(Boolean);

      for (const thread of threads) {
        // Skip if already in KB
        if (kbSet.has(thread.id)) { skipped++; continue; }

        // Only add resolved threads with meaningful summary and resolution
        const status = thread.status || "Open";
        const summary = thread.summary || "";
        const resolution = thread.resolution || "";

        if (
          status !== "Resolved" ||
          !summary || summary === "Summary unavailable." || summary.includes("API error") ||
          !resolution || resolution === "Unresolved — no reply sent yet." || resolution.includes("unavailable")
        ) {
          skipped++;
          continue;
        }

        const entry = {
          id: thread.id,
          problem: summary,
          solution: resolution,
          category: thread.category || "Other",
          machineModel: thread.machineModel || null,
          customer: thread.customer || "Unknown",
          date: thread.date || "",
          createdAt: new Date().toISOString(),
          addedBy: "backfill",
        };

        await kvSet(`kb:${thread.id}`, entry);
        kbSet.add(thread.id);
        newKBIds.push(thread.id);
        added++;
      }

      // Small pause between batches
      if (i + 20 < ids.length) await new Promise(r => setTimeout(r, 200));
    }

    // Save updated KB index
    await kvSet(INDEX_KEY, newKBIds);

    return res.status(200).json({ ok: true, added, skipped, total: ids.length });
  } catch (err) {
    console.error("kb-backfill error:", err);
    return res.status(500).json({ error: err.message });
  }
}
