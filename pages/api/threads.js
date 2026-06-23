import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { google } from "googleapis";

import { detectMachineModel } from "../../lib/models";

function extractCustomer(messages) {
  for (const msg of messages) {
    const headers = msg.payload?.headers || [];
    const from = headers.find(h => h.name === "From")?.value || "";
    if (from && !from.includes("i2rcnc") && !from.includes("noreply") && !from.includes("no-reply") && !from.includes("do-not-reply")) {
      const match = from.match(/^([^<]+)</);
      if (match) return match[1].trim();
      const emailMatch = from.match(/([^@\s]+@[^\s>]+)/);
      if (emailMatch) return emailMatch[1];
    }
  }
  return "Unknown";
}

function extractCustomerEmail(messages) {
  for (const msg of messages) {
    const headers = msg.payload?.headers || [];
    const from = headers.find(h => h.name === "From")?.value || "";
    if (from && !from.includes("i2rcnc") && !from.includes("noreply") && !from.includes("no-reply") && !from.includes("do-not-reply")) {
      const emailMatch = from.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) return emailMatch[0];
    }
  }
  return null;
}

function extractDate(messages) {
  if (!messages.length) return null;
  const headers = messages[0].payload?.headers || [];
  const date = headers.find(h => h.name === "Date")?.value;
  if (!date) return null;
  try { return new Date(date).toISOString().split("T")[0]; } catch { return null; }
}

function extractLastCustomerMessageDate(messages) {
  // Find the most recent message FROM the customer (not from us)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const headers = msg.payload?.headers || [];
    const from = headers.find(h => h.name === "From")?.value || "";
    if (!from.includes("i2rcnc") && !from.includes("noreply")) {
      const date = headers.find(h => h.name === "Date")?.value;
      if (date) {
        try { return new Date(date).toISOString(); } catch {}
      }
    }
  }
  return null;
}

function extractSubject(messages) {
  const headers = messages[0]?.payload?.headers || [];
  return headers.find(h => h.name === "Subject")?.value || "(no subject)";
}

function decodeBase64(data) {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  } catch { return ""; }
}

function extractTextFromPart(part) {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64(part.body.data).slice(0, 800);
  }
  if (part.parts) {
    for (const p of part.parts) {
      const text = extractTextFromPart(p);
      if (text) return text;
    }
  }
  return "";
}

function getSnippetAndBody(message) {
  const snippet = (message.snippet || "")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").slice(0, 300);
  const body = extractTextFromPart(message.payload).slice(0, 600);
  return { snippet, body };
}

function buildThreadContent(messages) {
  const customerMsg = messages.find(m => {
    const from = m.payload?.headers?.find(h => h.name === "From")?.value || "";
    return !from.includes("i2rcnc") && !from.includes("noreply");
  });
  const { snippet: s1, body: b1 } = customerMsg ? getSnippetAndBody(customerMsg) : { snippet: "", body: "" };
  const lastMsg = messages[messages.length - 1];
  const { snippet: s2, body: b2 } = lastMsg ? getSnippetAndBody(lastMsg) : { snippet: "", body: "" };
  return [b1 || s1, b2 || s2].filter(Boolean).join(" | reply: ").slice(0, 1000) || "No content available";
}

function hoursSince(isoDate) {
  if (!isoDate) return null;
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.round(diff / (1000 * 60 * 60));
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { pageToken, query } = req.query;

  try {
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ access_token: session.accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Broad query: anything not from ourselves, not newsletters
    const searchQuery = query || 'in:inbox -from:me -label:sent';

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
            format: "full",
          });

          const messages = threadRes.data.messages || [];
          const labels = messages.flatMap(m => m.labelIds || []);
          const hasSentReply = labels.includes("SENT");
          const subject = extractSubject(messages);
          const content = buildThreadContent(messages);
          const { snippet } = getSnippetAndBody(messages[0]);
          const lastCustomerMsgDate = extractLastCustomerMessageDate(messages);
          const hoursWaiting = hasSentReply ? null : hoursSince(lastCustomerMsgDate);
          const machineModel = detectMachineModel(subject + " " + content);

          return {
            id: t.id,
            date: extractDate(messages),
            customer: extractCustomer(messages),
            customerEmail: extractCustomerEmail(messages),
            subject,
            snippet: snippet || content.slice(0, 200),
            content,
            status: hasSentReply ? "Pending" : "Open",
            hasSent: hasSentReply,
            messageCount: messages.length,
            lastCustomerMsgDate,
            hoursWaiting,      // hours since last customer message with no reply
            machineModel,      // detected CNC model or null
          };
        } catch {
          return null;
        }
      })
    );

    return res.status(200).json({ threads: detailed.filter(Boolean), nextPageToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
