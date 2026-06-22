// Handles creating and syncing the shared Google Sheet
// POST /api/sheet-sync { action: "create", threads } → creates sheet, saves ID to KV, returns url
// POST /api/sheet-sync { action: "update", thread }  → updates or inserts a single row

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { google } from "googleapis";

const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
const SHEET_KEY = "shared:spreadsheet";

async function kvGet(key) {
  const res = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
  });
  const data = await res.json();
  return data.result ?? null;
}

async function kvSet(key, value) {
  await fetch(`${KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

const HEADER = ["Thread ID", "Date", "Customer", "Subject", "Category", "Status", "Flags", "AI Summary", "Resolution", "Has Reply", "Last Updated By", "Last Updated At"];

function threadToRow(t, updatedBy = "") {
  return [
    t.id || "",
    t.date || "",
    t.customer || "",
    t.subject || "",
    t.category || "",
    t.status || "",
    (t.flags || []).join(", "),
    t.summary || "",
    t.resolution || "",
    t.hasSent ? "Yes" : "No",
    updatedBy,
    new Date().toLocaleString(),
  ];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ access_token: session.accessToken });
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });

  const { action, threads, thread } = req.body;

  // ── CREATE: initialise the shared sheet with all current threads ──
  if (action === "create") {
    try {
      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: "i2R Support Tracker — Live" },
          sheets: [{ properties: { title: "Threads" } }],
        },
      });
      const spreadsheetId = spreadsheet.data.spreadsheetId;

      // Write header + all rows
      const rows = (threads || []).map(t => threadToRow(t, session.user?.email));
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: "Threads!A1", valueInputOption: "RAW",
        requestBody: { values: [HEADER, ...rows] },
      });

      // Format header row
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
                cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.92, green: 0.92, blue: 0.92 } } },
                fields: "userEnteredFormat(textFormat,backgroundColor)",
              },
            },
            { autoResizeDimensions: { dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: HEADER.length } } },
            { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
          ],
        },
      });

      // Save the spreadsheet ID to KV so all users share it
      await kvSet(SHEET_KEY, JSON.stringify({ spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`, createdBy: session.user?.email, createdAt: new Date().toISOString() }));

      return res.status(200).json({ spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` });
    } catch (err) {
      console.error("Sheet create error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── UPDATE: upsert a single thread row ──
  if (action === "update") {
    try {
      const stored = await kvGet(SHEET_KEY);
      if (!stored) return res.status(404).json({ error: "No shared sheet exists yet. Have the sheet owner create it first." });

      const { spreadsheetId } = JSON.parse(stored);

      // Read all rows to find the row index by thread ID
      const readRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Threads!A:A" });
      const ids = (readRes.data.values || []).map(r => r[0]);
      const rowIndex = ids.indexOf(thread.id); // 0-based; row 0 is header

      const newRow = threadToRow(thread, session.user?.email);

      if (rowIndex > 0) {
        // Row exists — update it
        const range = `Threads!A${rowIndex + 1}:L${rowIndex + 1}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId, range, valueInputOption: "RAW",
          requestBody: { values: [newRow] },
        });
      } else {
        // New thread — append it
        await sheets.spreadsheets.values.append({
          spreadsheetId, range: "Threads!A:L", valueInputOption: "RAW",
          requestBody: { values: [newRow] },
        });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Sheet update error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET SHEET INFO ──
  if (action === "info") {
    try {
      const stored = await kvGet(SHEET_KEY);
      if (!stored) return res.status(200).json({ exists: false });
      return res.status(200).json({ exists: true, ...JSON.parse(stored) });
    } catch {
      return res.status(200).json({ exists: false });
    }
  }

  return res.status(400).json({ error: "Unknown action" });
}
