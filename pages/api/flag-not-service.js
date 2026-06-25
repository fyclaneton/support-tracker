import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet, kvDel } from "../../lib/kv";
import { google } from "googleapis";

export const config = { maxDuration: 30 };

// POST /api/flag-not-service { threadId, action }
// action: "mark"   — marks as Unrelated in KV (keeps it, just re-categorizes)
// action: "remove" — fully removes from KV index + thread store + Sheet

async function removeFromSheet(threadId, accessToken) {
  try {
    const sheetInfo = await kvGet("shared:spreadsheet");
    if (!sheetInfo?.spreadsheetId) return;

    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    const { spreadsheetId } = sheetInfo;

    const readRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Threads!A:A" });
    const ids = (readRes.data.values || []).map(r => r[0]);
    const rowIndex = ids.indexOf(threadId);
    if (rowIndex <= 0) return; // not found or is header

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetId = meta.data.sheets?.[0]?.properties?.sheetId ?? 0;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 } } }] },
    });
  } catch (err) {
    console.error("Sheet remove error:", err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { threadId, action = "remove" } = req.body;
  if (!threadId) return res.status(400).json({ error: "Missing threadId" });

  try {
    if (action === "mark") {
      // Just update the category in KV — keep the thread
      const thread = await kvGet(`thread:${threadId}`);
      if (thread) {
        await kvSet(`thread:${threadId}`, { ...thread, category: "Unrelated", updatedAt: new Date().toISOString() });
      }
      return res.status(200).json({ ok: true, action: "marked" });
    }

    if (action === "remove") {
      // 1. Remove thread data from KV
      await kvDel(`thread:${threadId}`);

      // 2. Remove from saved ID index
      const savedIds = await kvGet("shared:saved-thread-ids");
      if (Array.isArray(savedIds)) {
        await kvSet("shared:saved-thread-ids", savedIds.filter(id => id !== threadId));
      }

      // 3. Remove from sheet
      await removeFromSheet(threadId, session.accessToken);

      return res.status(200).json({ ok: true, action: "removed" });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("flag-not-service error:", err);
    return res.status(500).json({ error: err.message });
  }
}
