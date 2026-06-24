import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { google } from "googleapis";
import { detectMachineModel, normalizeModel } from "../../lib/models";
import { kvGet, kvSet } from "../../lib/kv";
import { isDefiniteJunk } from "../../lib/junk-filter";

export const config = { maxDuration: 60 };

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractCustomer(messages) {
  for (const msg of messages) {
    const headers = msg.payload?.headers || [];
    const from = headers.find(h => h.name === "From")?.value || "";
    const fl = from.toLowerCase();
    if (fl.includes("mailer@shopify.com")) {
      const replyTo = headers.find(h => h.name === "Reply-To")?.value || "";
      if (replyTo) { const m = replyTo.match(/^([^<]+)</); if (m) return m[1].trim(); }
      return "Shopify Contact Form";
    }
    if (from && !fl.includes("i2rcnc") && !fl.includes("noreply") && !fl.includes("no-reply") && !fl.includes("do-not-reply") && !fl.includes("mailer")) {
      const m = from.match(/^([^<]+)</); if (m) return m[1].trim();
      const em = from.match(/([^@\s]+@[^\s>]+)/); if (em) return em[1];
    }
  }
  return null;
}

function extractCustomerEmail(messages) {
  for (const msg of messages) {
    const from = msg.payload?.headers?.find(h => h.name === "From")?.value || "";
    if (from && !from.toLowerCase().includes("i2rcnc") && !from.toLowerCase().includes("noreply")) {
      const em = from.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (em) return em[0];
    }
  }
  return null;
}

function extractDate(messages) {
  const date = messages[0]?.payload?.headers?.find(h => h.name === "Date")?.value;
  if (!date) return null;
  try { return new Date(date).toISOString().split("T")[0]; } catch { return null; }
}

function extractSubject(messages) {
  return messages[0]?.payload?.headers?.find(h => h.name === "Subject")?.value || "(no subject)";
}

function decodeBase64(data) {
  if (!data) return "";
  try { return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"); } catch { return ""; }
}

function stripHtml(html) {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
}

function extractText(part, depth = 0) {
  if (!part || depth > 5) return "";
  if (part.mimeType === "text/plain" && part.body?.data) { const t = decodeBase64(part.body.data).trim(); if (t.length > 20) return t.slice(0, 600); }
  if (part.mimeType === "text/html" && part.body?.data) { const t = stripHtml(decodeBase64(part.body.data)); if (t.length > 20) return t; }
  if (part.parts?.length) {
    for (const p of part.parts) { if (p.mimeType === "text/plain") { const t = extractText(p, depth+1); if (t) return t; } }
    for (const p of part.parts) { if (p.mimeType === "text/html") { const t = extractText(p, depth+1); if (t) return t; } }
    for (const p of part.parts) { const t = extractText(p, depth+1); if (t) return t; }
  }
  return "";
}

function cleanSnippet(s) {
  return (s || "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 200);
}

function buildContent(messages) {
  const cMsg = messages.find(m => { const f = m.payload?.headers?.find(h => h.name === "From")?.value || ""; return !f.toLowerCase().includes("i2rcnc") && !f.toLowerCase().includes("noreply"); }) || messages[0];
  const b1 = extractText(cMsg?.payload) || cleanSnippet(cMsg?.snippet);
  const last = messages[messages.length - 1];
  const isUs = (last?.payload?.headers?.find(h => h.name === "From")?.value || "").toLowerCase().includes("i2rcnc");
  const b2 = last && last !== cMsg ? extractText(last.payload) : "";
  return [b1, b2 ? (isUs ? "Our reply: " : "") + b2.slice(0, 200) : ""].filter(Boolean).join(" | ").slice(0, 800) || "No content";
}

function deriveStatus(messages) {
  const lastFrom = (messages[messages.length - 1]?.payload?.headers?.find(h => h.name === "From")?.value || "").toLowerCase();
  const labels = messages.flatMap(m => m.labelIds || []);
  return (lastFrom.includes("i2rcnc") || labels.includes("SENT")) ? "Resolved" : "Open";
}

async function aiAnalyze(thread) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { isSpam: false, category: "Other", summary: "No API key.", resolution: thread.hasSent ? "Reply sent." : "Unresolved — no reply sent yet.", flags: [], machineModel: null };

  const prompt = `Classify this email for i2R CNC (CNC router manufacturer — sells machines only).

From: ${thread.customer} ${thread.customerEmail ? "<" + thread.customerEmail + ">" : ""}
Subject: ${thread.subject}
Content: ${(thread.content || "").slice(0, 400)}
Has our reply: ${thread.hasSent}

JSON only:
{"isSpam":false,"category":"Hardware|Software|Setup|Connectivity|Warranty/Repair|Sales inquiry|Contact request|Unrelated|Other","summary":"1-2 sentences","resolution":"1-2 sentences or Unresolved — no reply sent yet.","flags":[],"machineModel":"B.24 or null"}
If spam: {"isSpam":true}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 250, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) return { isSpam: false, category: "Other", summary: "AI error.", resolution: "Unresolved.", flags: [], machineModel: null };
    const text = (data.content?.[0]?.text || "{}").trim();
    try { const p = JSON.parse(text); if (p.machineModel) p.machineModel = normalizeModel(p.machineModel); return p; }
    catch { const m = text.match(/\{[\s\S]*\}/); const p = m ? JSON.parse(m[0]) : { isSpam: false }; if (p.machineModel) p.machineModel = normalizeModel(p.machineModel); return p; }
  } catch { return { isSpam: false, category: "Other", summary: "Network error.", resolution: "Unresolved.", flags: [], machineModel: null }; }
}

async function getSavedIds() {
  try { const raw = await kvGet("shared:saved-thread-ids"); return new Set(Array.isArray(raw) ? raw : []); } catch { return new Set(); }
}

async function saveThreadBatch(threads, savedIds) {
  if (!threads.length) return 0;
  const newOnes = threads.filter(t => t.id && !savedIds.has(t.id));
  if (!newOnes.length) return 0;
  for (const t of newOnes) {
    try { await kvSet(`thread:${t.id}`, t); savedIds.add(t.id); } catch (e) { console.error("KV save error:", t.id, e.message); }
  }
  await kvSet("shared:saved-thread-ids", [...savedIds]);
  return newOnes.length;
}

async function syncToSheet(threads, accessToken) {
  try {
    const sheetInfo = await kvGet("shared:spreadsheet");
    if (!sheetInfo?.spreadsheetId) return;
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    const { spreadsheetId } = sheetInfo;
    const existingRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Threads!A:A" });
    const existingIds = new Set((existingRes.data.values || []).map(r => r[0]));
    const toAppend = threads.filter(t => !existingIds.has(t.id));
    if (!toAppend.length) return;
    const checkRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Threads!A1:A1" });
    const HEADER = ["Thread ID","Date","Customer","Subject","Category","Status","Machine Model","Flags","AI Summary","Resolution","Has Reply","Saved At"];
    if (!checkRes.data.values?.length) {
      await sheets.spreadsheets.values.update({ spreadsheetId, range: "Threads!A1", valueInputOption: "RAW", requestBody: { values: [HEADER] } });
    }
    await sheets.spreadsheets.values.append({
      spreadsheetId, range: "Threads!A:L", valueInputOption: "RAW",
      requestBody: { values: toAppend.map(t => [t.id||"",t.date||"",t.customer||"",t.subject||"",t.category||"",t.status||"",t.machineModel||"",(t.flags||[]).join(", "),t.summary||"",t.resolution||"",t.hasSent?"Yes":"No",new Date().toLocaleString()]) },
    });
  } catch (err) { console.error("Sheet sync error:", err.message); }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { pageToken } = req.body || {};

  try {
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ access_token: session.accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 2);
    const dateStr = `${cutoff.getFullYear()}/${String(cutoff.getMonth()+1).padStart(2,"0")}/${String(cutoff.getDate()).padStart(2,"0")}`;

    // Load saved IDs once
    const savedIds = await getSavedIds();

    // List threads — use metadata format first (fast) to pre-filter
    // Try with category filter first (cleaner for tabbed inbox accounts)
    const categoryQuery = `in:anywhere -in:spam -in:trash -in:draft (category:primary OR category:forums) -category:promotions -category:updates -category:social after:${dateStr}`;
    const plainQuery = `in:anywhere -in:spam -in:trash -in:draft after:${dateStr}`;

    let listRes = await gmail.users.threads.list({
      userId: "me",
      q: pageToken ? plainQuery : categoryQuery,
      maxResults: 15,
      pageToken: pageToken || undefined,
      fields: "threads/id,nextPageToken,resultCountEstimate",
    });

    // Fall back to plain query if category returns nothing (account without tabbed inbox)
    if (!pageToken && (!listRes.data.threads || listRes.data.threads.length === 0)) {
      listRes = await gmail.users.threads.list({
        userId: "me",
        q: plainQuery,
        maxResults: 15,
        fields: "threads/id,nextPageToken,resultCountEstimate",
      });
    }

    const threads = listRes.data.threads || [];
    const nextPageToken = listRes.data.nextPageToken || null;
    const totalEstimate = listRes.data.resultCountEstimate || 0;

    // Pre-filter: skip already saved
    const unseen = threads.filter(t => !savedIds.has(t.id));
    const skippedDupes = threads.length - unseen.length;

    if (!unseen.length) {
      return res.status(200).json({ threads: [], nextPageToken, totalEstimate, processed: 0, saved: 0, skipped: threads.length });
    }

    // Fetch full content — use metadata format first to check sender/subject before fetching full
    const prefiltered = [];
    for (const t of unseen) {
      try {
        // Fetch metadata only first — much faster than full
        const meta = await gmail.users.threads.get({
          userId: "me", id: t.id, format: "metadata",
          metadataHeaders: ["From", "Subject", "Reply-To", "Date"],
        });
        const messages = meta.data.messages || [];
        const subject = extractSubject(messages);
        const fromHeader = messages[0]?.payload?.headers?.find(h => h.name === "From")?.value || "";
        const customer = extractCustomer(messages);

        // Quick junk check on metadata only — skip full fetch if junk
        if (isDefiniteJunk(fromHeader, subject, customer || "")) continue;
        if (!customer) continue;

        prefiltered.push({ t, messages, subject, fromHeader, customer });
      } catch { continue; }
    }

    if (!prefiltered.length) {
      return res.status(200).json({ threads: [], nextPageToken, totalEstimate, processed: 0, saved: 0, skipped: threads.length });
    }

    // Now fetch full content only for threads that passed metadata filter
    const processed = [];
    for (const { t, subject, fromHeader, customer } of prefiltered) {
      try {
        const full = await gmail.users.threads.get({ userId: "me", id: t.id, format: "full" });
        const messages = full.data.messages || [];
        const labels = messages.flatMap(m => m.labelIds || []);
        const hasSentReply = labels.includes("SENT");
        const content = buildContent(messages);

        // Apply custom rules
        let customRules = [];
        try { const raw = await kvGet("shared:filter-rules"); customRules = Array.isArray(raw) ? raw : []; } catch {}
        const fl = fromHeader.toLowerCase(), sl = subject.toLowerCase();
        let blocked = false;
        for (const rule of customRules) {
          const v = rule.value.toLowerCase();
          if ((rule.type === "sender" || rule.type === "domain") && fl.includes(v)) { blocked = true; break; }
          if (rule.type === "keyword" && sl.includes(v)) { blocked = true; break; }
        }
        if (blocked) continue;

        processed.push({
          id: t.id,
          date: extractDate(messages),
          customer,
          customerEmail: extractCustomerEmail(messages),
          subject,
          content,
          snippet: cleanSnippet(messages[0]?.snippet) || content.slice(0, 150),
          status: deriveStatus(messages),
          hasSent: hasSentReply,
          messageCount: messages.length,
          hoursWaiting: null,
          machineModel: normalizeModel(detectMachineModel(subject + " " + content)),
          isHistorical: true,
        });
      } catch { continue; }
    }

    // AI analyze in batches of 5 — one API call per batch instead of per thread
    const analyzed = [];
    const BATCH = 5;
    for (let i = 0; i < processed.length; i += BATCH) {
      const batch = processed.slice(i, i + BATCH);
      // Call analyze endpoint which handles batching internally
      try {
        const analyzeRes = await fetch(`${process.env.NEXTAUTH_URL || "https://support-tracker-theta.vercel.app"}/api/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threads: batch }),
        });
        const analyzeData = await analyzeRes.json();
        const map = {};
        (analyzeData.results || []).forEach(r => { map[r.id] = r; });
        for (const thread of batch) {
          const result = map[thread.id];
          if (!result || result.isSpam || result.isNotOurService) continue;
          analyzed.push({
            ...thread, ...result,
            machineModel: normalizeModel(result.machineModel || thread.machineModel || null),
            status: thread.status,
          });
        }
      } catch(e) {
        console.error("Batch analyze error:", e.message);
        // On error, include threads without AI summary rather than losing them
        batch.forEach(t => analyzed.push({ ...t, summary: "Analysis failed.", resolution: t.hasSent ? "Reply sent." : "Unresolved.", category: "Other", flags: [] }));
      }
      await new Promise(r => setTimeout(r, 200));
    }

    // Save to Upstash
    const savedCount = await saveThreadBatch(analyzed, savedIds);

    // Sync to sheet (non-blocking)
    if (analyzed.length > 0) {
      syncToSheet(analyzed, session.accessToken).catch(e => console.error("Sheet sync error:", e));
    }

    return res.status(200).json({
      threads: analyzed,
      nextPageToken,
      totalEstimate,
      processed: processed.length,
      fetched: unseen.length,
      saved: savedCount,
      skipped: skippedDupes + (unseen.length - processed.length),
    });
  } catch (err) {
    console.error("Bulk import error:", err);
    return res.status(500).json({ error: err.message });
  }
}
