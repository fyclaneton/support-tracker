// GET /api/debug-threads - tests the threads fetch pipeline step by step
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { google } from "googleapis";
import { isDefiniteJunk } from "../../lib/junk-filter";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Not signed in" });

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: session.accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Step 1: what does the threads query return?
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const dateStr = `${threeMonthsAgo.getFullYear()}/${String(threeMonthsAgo.getMonth()+1).padStart(2,"0")}/${String(threeMonthsAgo.getDate()).padStart(2,"0")}`;
    const query = `in:inbox after:${dateStr}`;

    const listRes = await gmail.users.threads.list({
      userId: "me", q: query, maxResults: 5,
    });

    const threads = listRes.data.threads || [];
    const results = [];

    // Step 2: for each, get metadata and check junk filter
    for (const t of threads.slice(0, 5)) {
      const meta = await gmail.users.threads.get({
        userId: "me", id: t.id, format: "metadata",
        metadataHeaders: ["From", "Subject"],
      });
      const msgs = meta.data.messages || [];
      const from = msgs[0]?.payload?.headers?.find(h => h.name === "From")?.value || "";
      const subject = msgs[0]?.payload?.headers?.find(h => h.name === "Subject")?.value || "";
      const junk = isDefiniteJunk(from, subject, "");
      results.push({ id: t.id, from, subject, isJunk: junk });
    }

    return res.status(200).json({
      email: session.user?.email,
      query,
      totalEstimate: listRes.data.resultCountEstimate,
      threadsReturned: threads.length,
      sample: results,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.slice(0, 500) });
  }
}
