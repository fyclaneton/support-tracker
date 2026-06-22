import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { google } from "googleapis";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { threads } = req.body;
  if (!threads?.length) return res.status(400).json({ error: "No threads" });

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: session.accessToken });

    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Create a new spreadsheet
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: `Support Tracker Export — ${new Date().toLocaleDateString()}` },
        sheets: [{ properties: { title: "Threads" } }],
      },
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;

    // Build rows
    const header = ["Date", "Customer", "Subject", "Category", "Status", "Flags", "Summary", "Resolution", "Has Reply", "Messages"];
    const rows = threads.map((t) => [
      t.date || "",
      t.customer || "",
      t.subject || "",
      t.category || "",
      t.status || "",
      (t.flags || []).join(", "),
      t.summary || "",
      t.resolution || "",
      t.hasSent ? "Yes" : "No",
      t.messageCount || 1,
    ]);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Threads!A1",
      valueInputOption: "RAW",
      requestBody: { values: [header, ...rows] },
    });

    // Bold header row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
          { autoResizeDimensions: { dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: 10 } } },
        ],
      },
    });

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    return res.status(200).json({ url: sheetUrl });
  } catch (err) {
    console.error("Sheets export error:", err);
    return res.status(500).json({ error: err.message });
  }
}
