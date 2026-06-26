import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";
import { normalizeModel } from "../../lib/models";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  try {
    const savedIds = await kvGet("shared:saved-thread-ids");
    const ids = Array.isArray(savedIds) ? savedIds : [];
    let updated = 0;
    let skipped = 0;

    const BATCH = 10;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      await Promise.all(batch.map(async id => {
        try {
          const thread = await kvGet(`thread:${id}`);
          if (!thread) { skipped++; return; }
          const oldModel = thread.machineModel;
          if (!oldModel) { skipped++; return; }
          const newModel = normalizeModel(oldModel);
          if (!newModel || newModel === oldModel) { skipped++; return; }
          await kvSet(`thread:${id}`, { ...thread, machineModel: newModel });
          updated++;
        } catch { skipped++; }
      }));
      if (i + BATCH < ids.length) await new Promise(r => setTimeout(r, 100));
    }

    // Mark migration done
    await kvSet("shared:migration-models-v1", true);
    return res.status(200).json({ ok: true, updated, skipped, total: ids.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
