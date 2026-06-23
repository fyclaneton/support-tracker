// GET  /api/filter-rules         → get custom filter rules
// POST /api/filter-rules { rule } → add a rule
// DELETE /api/filter-rules { id } → remove a rule

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";

const RULES_KEY = "shared:filter-rules";

async function getRules() {
  const raw = await kvGet(RULES_KEY);
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [];
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    try {
      const rules = await getRules();
      return res.status(200).json({ rules });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { type, value } = req.body; // type: "sender" | "keyword" | "domain"
    if (!type || !value?.trim()) return res.status(400).json({ error: "Missing type or value" });
    try {
      const rules = await getRules();
      const newRule = {
        id: Date.now().toString(),
        type,
        value: value.trim().toLowerCase(),
        createdBy: session.user?.email,
        createdAt: new Date().toISOString(),
      };
      rules.push(newRule);
      await kvSet(RULES_KEY, rules);
      return res.status(200).json({ ok: true, rules });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "DELETE") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Missing id" });
    try {
      const rules = await getRules();
      const updated = rules.filter(r => r.id !== id);
      await kvSet(RULES_KEY, updated);
      return res.status(200).json({ ok: true, rules: updated });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
