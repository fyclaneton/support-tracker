import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet, kvKeys } from "../../lib/kv";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  // GET — load all saved overrides
  if (req.method === "GET") {
    try {
      const keys = await kvKeys("override:*");
      if (!keys.length) return res.status(200).json({ overrides: {} });
      const overrides = {};
      await Promise.all(keys.map(async (key) => {
        const threadId = key.replace("override:", "");
        const value = await kvGet(key);
        if (value) overrides[threadId] = typeof value === "object" ? value : {};
      }));
      return res.status(200).json({ overrides });
    } catch (err) {
      console.error("overrides GET error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — save one override field
  if (req.method === "POST") {
    const { id, field, value } = req.body;
    if (!id || !field) return res.status(400).json({ error: "Missing id or field" });
    try {
      const key = `override:${id}`;
      const existing = (await kvGet(key)) || {};
      const updated = {
        ...existing,
        [field]: value,
        updatedAt: new Date().toISOString(),
        updatedBy: session.user?.email || "unknown",
      };
      await kvSet(key, updated);
      return res.status(200).json({ ok: true, override: updated });
    } catch (err) {
      console.error("overrides POST error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
