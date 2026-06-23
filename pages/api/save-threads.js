// POST /api/save-threads { threads: [...] }
// Saves new threads to Upstash and syncs to shared sheet
// Skips any thread ID already saved

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";
import { google } from "googleapis";

const SAVED_INDEX_KEY = "shared:saved-thread-ids";
const HEADER = ["Thread ID","Date","Customer","Subject","Category","Status","Machine Model","Flags","AI Summary","Resolution","Has Reply","Saved At"];

function threadToRow(t) {
  return [
    t.id||"", t.date||"", t.customer||"", t.subject||"",
    t.category||"Other", t.status||"Open",
    t.machineModel||"",
    (t.flags||[]).join(", "),
    t.summary||"", t.resolution||"",
    t.hasSent?"Yes":"No",
    new Date().toLocaleString(),
  ];
}

async function getSavedIds() {
  const raw = await kvGet(SAVED_INDEX_KEY);
  if (!raw) return new Set();
  return new Set(Array.isArray(raw) ? raw : []);
}

async function addSavedIds(newIds) {
  const existing = await getSavedIds();
  newIds.forEach(id => existing.add(id));
  await kvSet(SAVED_INDEX_KEY, [...existing]);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { threads } = req.body;
  if (!threads?.length) return res.status(200).json({ saved: 0, skipped: 0 });

  try {
    // 1. Get already-saved IDs to avoid duplicates
    const savedIds = await getSavedIds();
    const newThreads = threads.filter(t => !savedIds.has(t.id));

    if (!newThreads.length) return res.status(200).json({ saved: 0, skipped: threads.length });

    // 2. Save each thread to Upstash individually (sequential to avoid rate limits)
    for (const t of newThreads) {
      try { await kvSet(`thread:${t.id}`, t); } catch(e) { console.error("KV save error:", t.id, e.message); }
    }

    // 3. Update saved ID index
    await addSavedIds(newThreads.map(t => t.id));

    // 4. Sync to shared sheet if one exists
    let sheetSynced = 0;
    try {
      const sheetInfo = await kvGet("shared:spreadsheet");
      if (sheetInfo?.spreadsheetId) {
        const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        oauth2Client.setCredentials({ access_token: session.accessToken });
        const sheets = google.sheets({ version: "v4", auth: oauth2Client });
        const { spreadsheetId } = sheetInfo;

        // Check if sheet has header, add if not
        const checkRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Threads!A1:A1" });
        if (!checkRes.data.values?.length) {
          await sheets.spreadsheets.values.update({ spreadsheetId, range: "Threads!A1", valueInputOption: "RAW", requestBody: { values: [HEADER] } });
        }

        // Get existing thread IDs in sheet (col A)
        const existingRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Threads!A:A" });
        const existingSheetIds = new Set((existingRes.data.values || []).map(r => r[0]));

        // Only append threads not already in sheet
        const toAppend = newThreads.filter(t => !existingSheetIds.has(t.id));
        if (toAppend.length) {
          await sheets.spreadsheets.values.append({
            spreadsheetId, range: "Threads!A:L",
            valueInputOption: "RAW",
            requestBody: { values: toAppend.map(threadToRow) },
          });
          sheetSynced = toAppend.length;
        }
      }
    } catch (sheetErr) {
      console.error("Sheet sync error (non-fatal):", sheetErr.message);
    }

    return res.status(200).json({ saved: newThreads.length, skipped: threads.length - newThreads.length, sheetSynced });
  } catch (err) {
    console.error("Save threads error:", err);
    return res.status(500).json({ error: err.message });
  }
}
