// POST /api/flag-not-service { threadId }
// Marks a thread as "not our service", removes from KV index and sheet

export const config = { maxDuration: 30 };

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet, kvDel } from "../../lib/kv";
import { google } from "googleapis";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error:"Unauthorized" });

  const { threadId } = req.body;
  if (!threadId) return res.status(400).json({ error:"Missing threadId" });

  try {
    // 1. Remove from KV thread store
    await kvDel(`thread:${threadId}`);

    // 2. Remove from saved ID index
    const savedIds = await kvGet("shared:saved-thread-ids");
    if (Array.isArray(savedIds)) {
      const updated = savedIds.filter(id => id !== threadId);
      await kvSet("shared:saved-thread-ids", updated);
    }

    // 3. Remove from sheet
    try {
      const sheetInfo = await kvGet("shared:spreadsheet");
      if (sheetInfo?.spreadsheetId) {
        const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        oauth2Client.setCredentials({ access_token: session.accessToken });
        const sheets = google.sheets({ version:"v4", auth:oauth2Client });
        const { spreadsheetId } = sheetInfo;

        // Find the row with this thread ID
        const readRes = await sheets.spreadsheets.values.get({ spreadsheetId, range:"Threads!A:A" });
        const ids = (readRes.data.values||[]).map(r=>r[0]);
        const rowIndex = ids.indexOf(threadId);

        if (rowIndex > 0) {
          // Get actual sheet ID
          const meta = await sheets.spreadsheets.get({ spreadsheetId });
          const sheetId = meta.data.sheets?.[0]?.properties?.sheetId ?? 0;
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody:{ requests:[{ deleteDimension:{ range:{ sheetId, dimension:"ROWS", startIndex:rowIndex, endIndex:rowIndex+1 } } }] },
          });
        }
      }
    } catch(sheetErr) { console.error("Sheet remove error:", sheetErr.message); }

    return res.status(200).json({ ok:true });
  } catch(err) {
    console.error("Flag not-service error:", err);
    return res.status(500).json({ error:err.message });
  }
}
