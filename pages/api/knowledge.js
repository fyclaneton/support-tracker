// GET  /api/knowledge?search=&category=&model=  — list KB entries
// POST /api/knowledge { threadId, problem, solution, category, machineModel, customer, date } — add entry
// DELETE /api/knowledge { id } — remove entry

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet, kvKeys } from "../../lib/kv";

const INDEX_KEY = "shared:kb-index";

async function getIndex() {
  const raw = await kvGet(INDEX_KEY);
  return Array.isArray(raw) ? raw : [];
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  // GET — list entries with optional search/filter
  if (req.method === "GET") {
    try {
      const { search = "", category = "", model = "" } = req.query;
      const index = await getIndex();
      if (!index.length) return res.status(200).json({ entries: [] });

      // Fetch all entries
      const entries = (await Promise.all(
        index.map(id => kvGet(`kb:${id}`).catch(() => null))
      )).filter(Boolean);

      // Filter
      const filtered = entries.filter(e => {
        const q = search.toLowerCase();
        const matchQ = !q || e.problem?.toLowerCase().includes(q) || e.solution?.toLowerCase().includes(q) || e.customer?.toLowerCase().includes(q);
        const matchCat = !category || e.category === category;
        const matchModel = !model || e.machineModel === model;
        return matchQ && matchCat && matchModel;
      });

      // Sort newest first
      filtered.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      return res.status(200).json({ entries: filtered, total: filtered.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — add entry
  if (req.method === "POST") {
    const { threadId, problem, solution, category, machineModel, customer, date } = req.body;
    if (!problem || !solution) return res.status(400).json({ error: "Missing problem or solution" });
    try {
      const id = threadId || `kb_${Date.now()}`;
      const index = await getIndex();

      // Don't duplicate
      if (index.includes(id)) {
        // Update existing entry
        const existing = await kvGet(`kb:${id}`) || {};
        const updated = { ...existing, problem, solution, category, machineModel, customer, date, updatedAt: new Date().toISOString() };
        await kvSet(`kb:${id}`, updated);
        return res.status(200).json({ ok: true, entry: updated });
      }

      const entry = {
        id, problem, solution, category: category || "Other",
        machineModel: machineModel || null, customer: customer || "Unknown",
        date: date || new Date().toISOString().split("T")[0],
        createdAt: new Date().toISOString(),
        addedBy: session.user?.email,
      };
      await kvSet(`kb:${id}`, entry);
      await kvSet(INDEX_KEY, [...index, id]);
      return res.status(200).json({ ok: true, entry });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE — remove entry
  if (req.method === "DELETE") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Missing id" });
    try {
      const index = await getIndex();
      await kvSet(INDEX_KEY, index.filter(i => i !== id));
      // Keep the KB entry data but remove from index (soft delete)
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
