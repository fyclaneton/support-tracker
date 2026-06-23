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

function extractLastCustomerMessageDate(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const headers = msg.payload?.headers || [];
    const from = headers.find(h => h.name === "From")?.value || "";
    if (!from.toLowerCase().includes("i2rcnc") && !from.toLowerCase().includes("noreply")) {
      const date = headers.find(h => h.name === "Date")?.value;
      if (date) { try { return new Date(date).toISOString(); } catch {} }
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
  try { return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"); } catch { return ""; }
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim().slice(0, 800);
}

function extractTextFromPart(part, depth = 0) {
  if (!part || depth > 6) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    const text = decodeBase64(part.body.data).trim();
    if (text.length > 20) return text.slice(0, 800);
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    const stripped = stripHtml(decodeBase64(part.body.data));
    if (stripped.length > 20) return stripped;
  }
  if (part.parts?.length) {
    for (const p of part.parts) { if (p.mimeType === "text/plain") { const t = extractTextFromPart(p, depth+1); if (t) return t; } }
    for (const p of part.parts) { if (p.mimeType === "text/html") { const t = extractTextFromPart(p, depth+1); if (t) return t; } }
    for (const p of part.parts) { const t = extractTextFromPart(p, depth+1); if (t) return t; }
  }
  return "";
}

function cleanSnippet(snippet) {
  return (snippet || "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 300);
}

function buildThreadContent(messages) {
  const customerMsg = messages.find(m => {
    const from = m.payload?.headers?.find(h => h.name === "From")?.value || "";
    return !from.toLowerCase().includes("i2rcnc") && !from.toLowerCase().includes("noreply") && !from.toLowerCase().includes("no-reply");
  }) || messages[0];
  const body1 = extractTextFromPart(customerMsg?.payload) || cleanSnippet(customerMsg?.snippet);
  const lastMsg = messages[messages.length - 1];
  const isLastFromUs = (lastMsg?.payload?.headers?.find(h => h.name === "From")?.value || "").toLowerCase().includes("i2rcnc");
  const body2 = (lastMsg && lastMsg !== customerMsg) ? extractTextFromPart(lastMsg.payload) : "";
  const parts = [body1];
  if (body2) parts.push((isLastFromUs ? "Our reply: " : "") + body2.slice(0, 300));
  return parts.filter(Boolean).join(" | ").slice(0, 1200) || "No content available";
}

function hoursSince(isoDate) {
  if (!isoDate) return null;
  return Math.round((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60));
}

// Hard-coded sender patterns to drop before AI (saves tokens + time)
const JUNK_PATTERNS = [
  "quickbooks", "intuit.com", "qbo.intuit", "shopify", "myshopify",
  "noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon",
  "hellorep", "johnny", "klaviyo", "mailchimp", "sendgrid", "constantcontact",
  "squarespace", "wix.com", "paypal", "stripe.com", "square.com",
  "fedex", "ups.com", "usps.com", "dhl.com", "amazon.com", "ebay.com",
  "notifications@", "notification@", "alerts@", "newsletter", "unsubscribe",
  "billing@", "invoice@", "receipts@", "payments@", "bounces@",
  "campaigns@", "marketing@", "promo@", "deals@", "offers@",
  "support@shopify", "mail.shopify", "em.shopify",
];

const JUNK_SUBJECT_PATTERNS = [
  "unsubscribe", "click here", "special offer", "limited time",
  "% off", "free shipping", "act now", "expires soon",
  "quickbooks sync", "connector summary", "sync summary",
  "shopify store", "your order", "order confirmed", "order shipped",
  "password reset", "verify your email", "confirm your",
  "invoice #", "receipt for", "payment received", "payment confirmation",
  "out of office", "auto-reply", "automatic reply",
];

function isDefiniteJunk(fromHeader, subject) {
  const from = fromHeader.toLowerCase();
  const sub = subject.toLowerCase();
  if (JUNK_PATTERNS.some(p => from.includes(p))) return true;
  if (JUNK_SUBJECT_PATTERNS.some(p => sub.includes(p))) return true;
  return false;
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { pageToken, query } = req.query;

  try {
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ access_token: session.accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Load custom filter rules
    let customRules = [];
    try { const raw = await kvGet("shared:filter-rules"); customRules = Array.isArray(raw) ? raw : []; } catch {}

    // Smart Gmail query — use category:primary to get real emails, exclude promotions/updates/social
    const searchQuery = query || "in:inbox (category:primary OR category:forums) -category:promotions -category:updates -category:social";

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
          const threadRes = await gmail.users.threads.get({ userId: "me", id: t.id, format: "full" });
          const messages = threadRes.data.messages || [];
          const subject = extractSubject(messages);
          const fromHeader = messages[0]?.payload?.headers?.find(h => h.name === "From")?.value || "";

          // Hard filter before AI — drop obvious junk immediately
          if (isDefiniteJunk(fromHeader, subject)) return null;

          // Drop if no external customer found
          const customer = extractCustomer(messages);
          if (!customer) return null;

          // Apply custom rules
          const fromLower = fromHeader.toLowerCase();
          const subjectLower = subject.toLowerCase();
          const snippetLower = cleanSnippet(messages[0]?.snippet).toLowerCase();
          for (const rule of customRules) {
            const v = rule.value.toLowerCase();
            if ((rule.type === "sender" || rule.type === "domain") && fromLower.includes(v)) return null;
            if (rule.type === "keyword" && (subjectLower.includes(v) || snippetLower.includes(v))) return null;
          }

          const labels = messages.flatMap(m => m.labelIds || []);
          const hasSentReply = labels.includes("SENT");
          const content = buildThreadContent(messages);
          const snippet = cleanSnippet(messages[0]?.snippet);
          const lastCustomerMsgDate = extractLastCustomerMessageDate(messages);
          const hoursWaiting = hasSentReply ? null : hoursSince(lastCustomerMsgDate);
          const machineModel = detectMachineModel(subject + " " + content);

          return {
            id: t.id,
            date: extractDate(messages),
            customer,
            customerEmail: extractCustomerEmail(messages),
            subject,
            snippet: snippet || content.slice(0, 200),
            content,
            status: hasSentReply ? "Pending" : "Open",
            hasSent: hasSentReply,
            messageCount: messages.length,
            lastCustomerMsgDate,
            hoursWaiting,
            machineModel,
          };
        } catch { return null; }
      })
    );

    return res.status(200).json({ threads: detailed.filter(Boolean), nextPageToken });
  } catch (err) {
    console.error("Threads API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
