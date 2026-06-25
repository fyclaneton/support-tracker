// GET  /api/distributors              — list all distributors
// POST /api/distributors { email, name, company } — add distributor
// DELETE /api/distributors { email }  — remove distributor

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";

const KEY = "shared:distributors";

async function getList() {
  const raw = await kvGet(KEY);
  return Array.isArray(raw) ? raw : [];
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    try {
      return res.status(200).json({ distributors: await getList() });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  if (req.method === "POST") {
    const { email, name, company } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email" });
    try {
      const list = await getList();
      const existing = list.findIndex(d => d.email.toLowerCase() === email.toLowerCase());
      const { region } = req.body;
      const entry = { email: email.toLowerCase(), name: name || email, company: company || "", region: region || "", addedBy: session.user?.email, addedAt: new Date().toISOString() };
      if (existing >= 0) list[existing] = entry;
      else list.push(entry);
      await kvSet(KEY, list);
      return res.status(200).json({ ok: true, distributors: list });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  if (req.method === "DELETE") {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email" });
    try {
      const list = await getList();
      const updated = list.filter(d => d.email.toLowerCase() !== email.toLowerCase());
      await kvSet(KEY, updated);
      return res.status(200).json({ ok: true, distributors: updated });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  return res.status(405).end();
}
