// GET  /api/overrides        → returns all saved overrides
// POST /api/overrides        → saves one override { id, field, value }
// Requires VERCEL KV env vars: KV_URL, KV_REST_API_URL, KV_REST_API_TOKEN

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  const res = await fetch(`${KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
  });
  const data = await res.json();
  return data.result ?? null;
}

async function kvSet(key, value) {
  await fetch(`${KV_REST_API_URL}/set/${key}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

async function kvKeys(pattern) {
  const res = await fetch(`${KV_REST_API_URL}/keys/${pattern}`, {
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
  });
  const data = await res.json();
  return data.result ?? [];
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    try {
      const keys = await kvKeys("override:*");
      if (!keys.length) return res.status(200).json({ overrides: {} });

      const overrides = {};
      await Promise.all(
        keys.map(async (key) => {
          const threadId = key.replace("override:", "");
          const value = await kvGet(key);
          if (value) {
            try {
              overrides[threadId] = typeof value === "string" ? JSON.parse(value) : value;
            } catch {
              overrides[threadId] = value;
            }
          }
        })
      );
      return res.status(200).json({ overrides });
    } catch (err) {
      console.error("KV GET error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { id, field, value } = req.body;
    if (!id || !field) return res.status(400).json({ error: "Missing id or field" });

    try {
      const key = `override:${id}`;
      const existing = await kvGet(key);
      let current = {};
      if (existing) {
        try { current = typeof existing === "string" ? JSON.parse(existing) : existing; } catch {}
      }
      current[field] = value;
      current.updatedAt = new Date().toISOString();
      current.updatedBy = session.user?.email;
      await kvSet(key, JSON.stringify(current));
      return res.status(200).json({ ok: true, override: current });
    } catch (err) {
      console.error("KV SET error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
