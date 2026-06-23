import { isDefiniteJunk } from "../../lib/junk-filter";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { google } from "googleapis";
import { detectMachineModel } from "../../lib/models";
import { kvGet } from "../../lib/kv";

function extractCustomer(messages) {
  for (const msg of messages) {
    const headers = msg.payload?.headers || [];
    const from = headers.find(h => h.name === "From")?.value || "";
    const fromLower = from.toLowerCase();
    if (from && !fromLower.includes("i2rcnc") && !fromLower.includes("noreply") && !fromLower.includes("no-reply") && !fromLower.includes("do-not-reply") && !fromLower.includes("mailer")) {
      const match = from.match(/^([^<]+)</);
      if (match) return match[1].trim();
      const emailMatch = from.match(/([^@\s]+@[^\s>]+)/);
      if (emailMatch) return emailMatch[1];
    }
  }
  return null;
}

function extractCustomerEmail(messages) {
  for (const msg of messages) {
    const headers = msg.payload?.headers || [];
    const from = headers.find(h => h.name === "From")?.value || "";
    if (from && !from.toLowerCase().includes("i2rcnc") && !from.toLowerCase().includes("noreply")) {
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

function extractSubject(messages) {
  const headers = messages[0]?.payload?.headers || [];
  return headers.find(h => h.name === "Subject")?.value || "(no subject)";
}

function decodeBase64(data) {
  if (!data) return "";
  try { return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"); } catch { return ""; }
}

function stripHtml(html) {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
}

function extractTextFromPart(part, depth = 0) {
  if (!part || depth > 6) return "";
  if (part.mimeType === "text/plain" && part.body?.data) { const t = decodeBase64(part.body.data).trim(); if (t.length > 20) return t.slice(0, 800); }
  if (part.mimeType === "text/html" && part.body?.data) { const t = stripHtml(decodeBase64(part.body.data)); if (t.length > 20) return t; }
  if (part.parts?.length) {
    for (const p of part.parts) { if (p.mimeType === "text/plain") { const t = extractTextFromPart(p, depth+1); if (t) return t; } }
    for (const p of part.parts) { if (p.mimeType === "text/html") { const t = extractTextFromPart(p, depth+1); if (t) return t; } }
    for (const p of part.parts) { const t = extractTextFromPart(p, depth+1); if (t) return t; }
  }
  return "";
}

function cleanSnippet(s) {
  return (s||"").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/\s+/g," ").trim().slice(0,300);
}

function buildThreadContent(messages) {
  const customerMsg = messages.find(m => { const from = m.payload?.headers?.find(h=>h.name==="From")?.value||""; return !from.toLowerCase().includes("i2rcnc") && !from.toLowerCase().includes("noreply"); }) || messages[0];
  const body1 = extractTextFromPart(customerMsg?.payload) || cleanSnippet(customerMsg?.snippet);
  const lastMsg = messages[messages.length-1];
  const isLastFromUs = (lastMsg?.payload?.headers?.find(h=>h.name==="From")?.value||"").toLowerCase().includes("i2rcnc");
  const body2 = (lastMsg && lastMsg!==customerMsg) ? extractTextFromPart(lastMsg.payload) : "";
  return [body1, body2 ? (isLastFromUs?"Our reply: ":"")+body2.slice(0,300) : ""].filter(Boolean).join(" | ").slice(0,1200)||"No content available";
}

function deriveStatus(messages) {
  const lastFrom = (messages[messages.length-1]?.payload?.headers?.find(h=>h.name==="From")?.value||"").toLowerCase();
  const labels = messages.flatMap(m=>m.labelIds||[]);
  return (lastFrom.includes("i2rcnc") || labels.includes("SENT")) ? "Resolved" : "Open";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { pageToken, existingIds } = req.body || {};

  try {
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ access_token: session.accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    let customRules = [];
    try { const raw = await kvGet("shared:filter-rules"); customRules = Array.isArray(raw) ? raw : []; } catch {}

    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const dateStr = `${twoYearsAgo.getFullYear()}/${String(twoYearsAgo.getMonth()+1).padStart(2,"0")}/${String(twoYearsAgo.getDate()).padStart(2,"0")}`;

    // Use Gmail category filter for history too
    const listRes = await gmail.users.threads.list({
      userId: "me",
      q: `in:anywhere -in:spam -in:trash -in:draft (category:primary OR category:forums) -category:promotions -category:updates -category:social after:${dateStr}`,
      maxResults: 20,
      pageToken: pageToken || undefined,
    });

    const threads = listRes.data.threads || [];
    const nextPageToken = listRes.data.nextPageToken || null;
    const totalEstimate = listRes.data.resultCountEstimate || 0;

    const existingSet = new Set(Array.isArray(existingIds) ? existingIds : []);
    const newThreads = threads.filter(t => !existingSet.has(t.id));

    const detailed = await Promise.all(
      newThreads.map(async (t) => {
        try {
          const threadRes = await gmail.users.threads.get({ userId: "me", id: t.id, format: "full" });
          const messages = threadRes.data.messages || [];
          const subject = extractSubject(messages);
          const fromHeader = messages[0]?.payload?.headers?.find(h=>h.name==="From")?.value || "";

          if (isDefiniteJunk(fromHeader, subject, extractCustomer(messages) || "")) return null;
          const customer = extractCustomer(messages);
          if (!customer) return null;

          const fromLower = fromHeader.toLowerCase();
          const subjectLower = subject.toLowerCase();
          const snippetLower = cleanSnippet(messages[0]?.snippet).toLowerCase();
          for (const rule of customRules) {
            const v = rule.value.toLowerCase();
            if ((rule.type==="sender"||rule.type==="domain") && fromLower.includes(v)) return null;
            if (rule.type==="keyword" && (subjectLower.includes(v)||snippetLower.includes(v))) return null;
          }

          const content = buildThreadContent(messages);
          const labels = messages.flatMap(m=>m.labelIds||[]);
          const hasSentReply = labels.includes("SENT");
          const machineModel = detectMachineModel(subject+" "+content);

          return {
            id: t.id,
            date: extractDate(messages),
            customer,
            customerEmail: extractCustomerEmail(messages),
            subject,
            snippet: cleanSnippet(messages[0]?.snippet)||content.slice(0,200),
            content,
            status: deriveStatus(messages),
            hasSent: hasSentReply,
            messageCount: messages.length,
            hoursWaiting: null,
            machineModel,
            isHistorical: true,
          };
        } catch { return null; }
      })
    );

    return res.status(200).json({ threads: detailed.filter(Boolean), nextPageToken, totalEstimate });
  } catch (err) {
    console.error("History API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
