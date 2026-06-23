// GET  /api/notes?threadId=xxx  → get notes for a thread
// POST /api/notes { threadId, note } → save a note

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const { threadId } = req.query;
    if (!threadId) return res.status(400).json({ error: "Missing threadId" });
    try {
      const notes = (await kvGet(`notes:${threadId}`)) || [];
      return res.status(200).json({ notes: Array.isArray(notes) ? notes : [] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { threadId, note } = req.body;
    if (!threadId || !note?.trim()) return res.status(400).json({ error: "Missing threadId or note" });
    try {
      const existing = (await kvGet(`notes:${threadId}`)) || [];
      const notes = Array.isArray(existing) ? existing : [];
      const newNote = {
        id: Date.now().toString(),
        text: note.trim(),
        author: session.user?.email || "unknown",
        authorName: session.user?.name || session.user?.email || "unknown",
        createdAt: new Date().toISOString(),
      };
      notes.push(newNote);
      await kvSet(`notes:${threadId}`, notes);
      return res.status(200).json({ ok: true, notes });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "DELETE") {
    const { threadId, noteId } = req.body;
    if (!threadId || !noteId) return res.status(400).json({ error: "Missing threadId or noteId" });
    try {
      const existing = (await kvGet(`notes:${threadId}`)) || [];
      const notes = (Array.isArray(existing) ? existing : []).filter(n => n.id !== noteId);
      await kvSet(`notes:${threadId}`, notes);
      return res.status(200).json({ ok: true, notes });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
