import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { google } from "googleapis";

function categorize(text) {
  const s = text.toLowerCase();
  if (s.includes("connect") || s.includes("communicat") || s.includes("link"))
    return "Connectivity";
  if (
    s.includes("uccnc") ||
    s.includes("software") ||
    s.includes("program") ||
    s.includes("limit") ||
    s.includes("units") ||
    s.includes("post processor") ||
    s.includes("icon")
  )
    return "Software";
  if (
    s.includes("axis") ||
    s.includes("step") ||
    s.includes("motor") ||
    s.includes("controller") ||
    s.includes("spoiler") ||
    s.includes("spindle") ||
    s.includes("router")
  )
    return "Hardware";
  if (
    s.includes("set up") ||
    s.includes("setup") ||
    s.includes("install") ||
    s.includes("restart")
  )
    return "Setup";
  if (
    s.includes("phone") ||
    s.includes("contact") ||
    s.includes("call") ||
    s.includes("speak")
  )
    return "Contact request";
  return "Other";
}

function deriveStatus(labels, hasSentReply) {
  if (hasSentReply) return "Pending";
  return "Open";
}

function extractCustomer(messages) {
  for (const msg of messages) {
    const headers = msg.payload?.headers || [];
    const from = headers.find((h) => h.name === "From")?.value || "";
    if (
      from &&
      !from.includes("i2rcnc") &&
      !from.includes("noreply") &&
      !from.includes("no-reply")
    ) {
      const match = from.match(/^([^<]+)</);
      if (match) return match[1].trim();
      const emailMatch = from.match(/([^@\s]+@[^\s>]+)/);
      if (emailMatch) return emailMatch[1];
    }
  }
  return "Unknown";
}

function extractDate(messages) {
  if (!messages.length) return null;
  const headers = messages[0].payload?.headers || [];
  const date = headers.find((h) => h.name === "Date")?.value;
  if (!date) return null;
  try {
    return new Date(date).toISOString().split("T")[0];
  } catch {
    return null;
  }
}

function extractSubject(messages) {
  const headers = messages[0]?.payload?.headers || [];
  return (
    headers.find((h) => h.name === "Subject")?.value || "(no subject)"
  );
}

function decodeBody(part) {
  if (!part) return "";
  try {
    const data = part.body?.data || "";
    return Buffer.from(data, "base64").toString("utf-8").slice(0, 500);
  } catch {
    return "";
  }
}

function getSnippet(messages) {
  for (const msg of messages) {
    if (msg.snippet && msg.snippet.length > 20) {
      return msg.snippet.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").slice(0, 200);
    }
  }
  return "";
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { pageToken, query } = req.query;

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: session.accessToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const searchQuery =
      query ||
      'subject:(help OR "customer support" OR issue OR "not working" OR complaint OR problem OR setup OR error)';

    const listRes = await gmail.users.threads.list({
      userId: "me",
      q: searchQuery,
      maxResults: 20,
      pageToken: pageToken || undefined,
    });

    const threads = listRes.data.threads || [];
    const nextPageToken = listRes.data.nextPageToken || null;

    const detailed = await Promise.all(
      threads.map(async (t) => {
        try {
          const threadRes = await gmail.users.threads.get({
            userId: "me",
            id: t.id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"],
          });

          const messages = threadRes.data.messages || [];
          const labels = messages.flatMap((m) => m.labelIds || []);
          const hasSentReply = labels.includes("SENT");
          const snippet = getSnippet(messages);
          const category = categorize(snippet + " " + extractSubject(messages));

          return {
            id: t.id,
            date: extractDate(messages),
            customer: extractCustomer(messages),
            subject: extractSubject(messages),
            snippet,
            category,
            status: deriveStatus(labels, hasSentReply),
            hasSent: hasSentReply,
            messageCount: messages.length,
          };
        } catch {
          return null;
        }
      })
    );

    const valid = detailed.filter(Boolean);

    return res.status(200).json({ threads: valid, nextPageToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
