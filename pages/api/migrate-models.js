// POST /api/migrate-models
// One-time migration: fixes old model tags (i2R 4/6/8) to new format (B.22/B.23/B.24)
// Safe to run multiple times — only updates threads that need it

export const config = { maxDuration: 60 };

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";

const MODEL_MIGRATIONS = {
  // Old tag → New display
  "i2R-4":  "B.22",
  "i2r-4":  "B.22",
  "i2R 4":  "B.22",
  "i2r4":   "B.22",
  "i2R4":   "B.22",
  "i2R-6":  "B.23",
  "i2r-6":  "B.23",
  "i2R 6":  "B.23",
  "i2r6":   "B.23",
  "i2R6":   "B.23",
  "i2R-8":  "B.24",
  "i2r-8":  "B.24",
  "i2R 8":  "B.24",
  "i2r8":   "B.24",
  "i2R8":   "B.24",
  "i2R8S":  "B.24",
  "i2R 8S": "B.24",
  "i2R-8S": "B.24",
  "B24":    "B.24",
  "b24":    "B.24",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  try {
    const savedIds = await kvGet("shared:saved-thread-ids");
    const ids = Array.isArray(savedIds) ? savedIds : [];

    let updated = 0;
    let skipped = 0;

    for (const id of ids) {
      try {
        const thread = await kvGet(`thread:${id}`);
        if (!thread) { skipped++; continue; }

        const oldModel = thread.machineModel;
        const newModel = MODEL_MIGRATIONS[oldModel];

        if (!newModel) { skipped++; continue; }

        // Update the thread with new model tag
        await kvSet(`thread:${id}`, { ...thread, machineModel: newModel });
        updated++;
      } catch(e) {
        console.error("Migration error for", id, e.message);
        skipped++;
      }
    }

    // Mark migration as permanently done in KV
    await kvSet("shared:migration-models-v1", true);
    return res.status(200).json({ ok: true, updated, skipped, total: ids.length });
  } catch (err) {
    console.error("migrate-models error:", err);
    return res.status(500).json({ error: err.message });
  }
}
