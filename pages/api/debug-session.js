// GET /api/debug-session - shows session info and tests Gmail access
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { google } from "googleapis";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Not signed in" });

  const result = {
    email: session.user?.email,
    hasAccessToken: !!session.accessToken,
    tokenPrefix: session.accessToken?.slice(0, 20) + "...",
    sessionError: session.error || null,
  };

  // Test Gmail access
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: session.accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    result.gmailEmail = profile.data.emailAddress;
    result.gmailWorks = true;
    result.totalMessages = profile.data.messagesTotal;

    // Try a simple inbox list
    const list = await gmail.users.threads.list({ userId: "me", q: "in:inbox", maxResults: 3 });
    result.inboxThreadCount = list.data.resultCountEstimate;
    result.sampleThreads = (list.data.threads || []).map(t => t.id);
  } catch(err) {
    result.gmailWorks = false;
    result.gmailError = err.message;
    result.gmailErrorCode = err.code;
  }

  return res.status(200).json(result);
}
