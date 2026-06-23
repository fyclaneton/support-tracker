import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { google } from "googleapis";
import { kvGet, kvSet } from "../../lib/kv";

const SHEET_KEY = "shared:spreadsheet";
const HEADER = ["Thread ID","Date","Customer","Subject","Category","Status","Flags","AI Summary","Resolution","Has Reply","Last Updated By","Last Updated At"];

function threadToRow(t, updatedBy = "") {
  return [
    t.id||"", t.date||"", t.customer||"", t.subject||"",
    t.category||"", t.status||"",
    (t.flags||[]).join(", "),
    t.summary||"", t.resolution||"",
    t.hasSent?"Yes":"No",
    updatedBy,
    new Date().toLocaleString(),
  ];
}

async function getSheetsClient(accessToken) {
  const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth: oauth2Client });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const sheets = await getSheetsClient(session.accessToken);
  const { action, threads, thread, customer } = req.body;

  // ── INFO ──
  if (action === "info") {
    try {
      const stored = await kvGet(SHEET_KEY);
      if (!stored) return res.status(200).json({ exists: false });
      return res.status(200).json({ exists: true, ...stored });
    } catch {
      return res.status(200).json({ exists: false });
    }
  }

  // ── CREATE ──
  if (action === "create") {
    try {
      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: "i2R Support Tracker — Live" },
          sheets: [{ properties: { title: "Threads" } }],
        },
      });
      const spreadsheetId = spreadsheet.data.spreadsheetId;
      const sheetId = spreadsheet.data.sheets[0].properties.sheetId;

      const rows = (threads||[]).map(t => threadToRow(t, session.user?.email));
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: "Threads!A1", valueInputOption: "RAW",
        requestBody: { values: [HEADER, ...rows] },
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.92, green: 0.92, blue: 0.92 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
            { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: HEADER.length } } },
            { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
          ],
        },
      });

      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      const info = { spreadsheetId, url, createdBy: session.user?.email, createdAt: new Date().toISOString() };
      await kvSet(SHEET_KEY, info);
      return res.status(200).json({ spreadsheetId, url });
    } catch (err) {
      console.error("Sheet create error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── UPDATE single row ──
  if (action === "update") {
    try {
      const stored = await kvGet(SHEET_KEY);
      if (!stored) return res.status(404).json({ error: "No shared sheet exists yet." });
      const { spreadsheetId } = stored;

      const readRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Threads!A:A" });
      const ids = (readRes.data.values||[]).map(r=>r[0]);
      const rowIndex = ids.indexOf(thread.id);
      const newRow = threadToRow(thread, session.user?.email);

      if (rowIndex > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId, range: `Threads!A${rowIndex+1}:L${rowIndex+1}`,
          valueInputOption: "RAW", requestBody: { values: [newRow] },
        });
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId, range: "Threads!A:L",
          valueInputOption: "RAW", requestBody: { values: [newRow] },
        });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Sheet update error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── REMOVE all rows by a sender (on block) ──
  if (action === "remove-sender") {
    try {
      const stored = await kvGet(SHEET_KEY);
      if (!stored) return res.status(200).json({ ok: true, removed: 0 });
      const { spreadsheetId } = stored;

      // Read all rows
      const readRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Threads!A:D" });
      const rows = readRes.data.values || [];

      // Find rows matching this customer (col C = index 2), skip header (row 0)
      const rowsToDelete = [];
      rows.forEach((row, i) => {
        if (i === 0) return; // skip header
        if (row[2] === customer) rowsToDelete.push(i + 1); // 1-based row number
      });

      if (rowsToDelete.length === 0) return res.status(200).json({ ok: true, removed: 0 });

      // Delete rows in reverse order so indices don't shift
      const sheetId = 0;
      const deleteRequests = rowsToDelete.reverse().map(rowNum => ({
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: rowNum - 1, endIndex: rowNum },
        },
      }));

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: deleteRequests },
      });

      return res.status(200).json({ ok: true, removed: rowsToDelete.length });
    } catch (err) {
      console.error("Sheet remove-sender error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── RE-ADD all rows for an unblocked sender ──
  if (action === "restore-sender") {
    try {
      const stored = await kvGet(SHEET_KEY);
      if (!stored) return res.status(200).json({ ok: true });
      const { spreadsheetId } = stored;

      const rows = (threads||[]).map(t => threadToRow(t, session.user?.email));
      if (!rows.length) return res.status(200).json({ ok: true });

      await sheets.spreadsheets.values.append({
        spreadsheetId, range: "Threads!A:L",
        valueInputOption: "RAW", requestBody: { values: rows },
      });

      return res.status(200).json({ ok: true, restored: rows.length });
    } catch (err) {
      console.error("Sheet restore-sender error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: "Unknown action" });
}
