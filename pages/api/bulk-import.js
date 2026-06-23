import { isDefiniteJunk } from "../../lib/junk-filter";
// POST /api/bulk-import { action: "start"|"next", pageToken, existingIds }
// Fetches one page of historical emails, filters, analyzes, saves to KV + Sheet
// Returns { threads, nextPageToken, totalEstimate, saved, skipped }

export const config = { maxDuration: 60 };

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { google } from "googleapis";
import { detectMachineModel } from "../../lib/models";
import { kvGet, kvSet, kvKeys } from "../../lib/kv";

function extractCustomer(messages) {
  for (const msg of messages) {
    const from = msg.payload?.headers?.find(h => h.name === "From")?.value || "";
    const fl = from.toLowerCase();
    if (from && !fl.includes("i2rcnc") && !fl.includes("noreply") && !fl.includes("no-reply") && !fl.includes("do-not-reply") && !fl.includes("mailer")) {
      const match = from.match(/^([^<]+)</);
      if (match) return match[1].trim();
      const em = from.match(/([^@\s]+@[^\s>]+)/);
      if (em) return em[1];
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
  try { return Buffer.from(data.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf-8"); } catch { return ""; }
}

function stripHtml(html) {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<script[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim().slice(0,800);
}

function extractText(part, depth=0) {
  if (!part||depth>6) return "";
  if (part.mimeType==="text/plain"&&part.body?.data) { const t=decodeBase64(part.body.data).trim(); if(t.length>20) return t.slice(0,800); }
  if (part.mimeType==="text/html"&&part.body?.data) { const t=stripHtml(decodeBase64(part.body.data)); if(t.length>20) return t; }
  if (part.parts?.length) {
    for (const p of part.parts) { if(p.mimeType==="text/plain"){const t=extractText(p,depth+1);if(t)return t;} }
    for (const p of part.parts) { if(p.mimeType==="text/html"){const t=extractText(p,depth+1);if(t)return t;} }
    for (const p of part.parts) { const t=extractText(p,depth+1);if(t)return t; }
  }
  return "";
}

function cleanSnippet(s) { return (s||"").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/\s+/g," ").trim().slice(0,300); }

function buildContent(messages) {
  const cMsg = messages.find(m=>{ const f=m.payload?.headers?.find(h=>h.name==="From")?.value||""; return !f.toLowerCase().includes("i2rcnc")&&!f.toLowerCase().includes("noreply"); })||messages[0];
  const b1 = extractText(cMsg?.payload)||cleanSnippet(cMsg?.snippet);
  const last = messages[messages.length-1];
  const isUs = (last?.payload?.headers?.find(h=>h.name==="From")?.value||"").toLowerCase().includes("i2rcnc");
  const b2 = last&&last!==cMsg ? extractText(last.payload) : "";
  return [b1, b2?(isUs?"Our reply: ":"")+b2.slice(0,300):""].filter(Boolean).join(" | ").slice(0,1200)||"No content";
}

function deriveStatus(messages) {
  const lastFrom = (messages[messages.length-1]?.payload?.headers?.find(h=>h.name==="From")?.value||"").toLowerCase();
  const labels = messages.flatMap(m=>m.labelIds||[]);
  return (lastFrom.includes("i2rcnc")||labels.includes("SENT")) ? "Resolved" : "Open";
}

async function aiAnalyze(thread) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { isSpam: false, category:"Other", summary:"No API key set.", resolution: thread.hasSent?"Reply sent.":"Unresolved.", flags:[], machineModel:null };

  const prompt = `Classify this email for i2R CNC (CNC router manufacturer — sells machines only, does NOT offer cutting/engraving/woodworking services).

From: ${thread.customer} ${thread.customerEmail?"<"+thread.customerEmail+">":""}
Subject: ${thread.subject}
Content: ${(thread.content||"").slice(0,500)}
Has our reply: ${thread.hasSent}

Return JSON only — no markdown:
{
  "isSpam": true if junk/marketing/automated/newsletter/cold-outreach (not from a real customer),
  "category": one of: Hardware|Software|Setup|Connectivity|Warranty/Repair|Sales inquiry|Contact request|Unrelated|Other
    Use "Unrelated" if: customer wants cutting/engraving/woodworking SERVICES, completely off-topic, or not related to CNC machines at all,
  "summary": "1-2 sentences on what the customer needs",
  "resolution": "1-2 sentences on how it was resolved, or Unresolved — no reply sent yet.",
  "flags": array — include no-reply if hasSent=false, urgent if angry/urgent language,
  "machineModel": "detected i2R model like B.24 or D.22, or null"
}

If spam: {"isSpam":true}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},
      body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:300, messages:[{role:"user",content:prompt}] }),
    });
    const data = await resp.json();
    if (!resp.ok||data.error) return { isSpam:false, category:"Other", summary:`API error: ${data.error?.message||resp.status}`, resolution:"Unresolved.", flags:[], machineModel:null };
    const text = (data.content?.[0]?.text||"{}").trim();
    try { return JSON.parse(text); } catch {
      const m = text.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : { isSpam:false };
    }
  } catch(err) { return { isSpam:false, category:"Other", summary:`Network error: ${err.message}`, resolution:"Unresolved.", flags:[], machineModel:null }; }
}

async function getSavedIds() {
  try { const raw = await kvGet("shared:saved-thread-ids"); return new Set(Array.isArray(raw)?raw:[]); } catch { return new Set(); }
}

async function saveThreads(threads) {
  if (!threads.length) return 0;
  const savedIds = await getSavedIds();
  const newOnes = threads.filter(t => t.id && !savedIds.has(t.id));
  if (!newOnes.length) return 0;
  // Save each thread individually
  for (const t of newOnes) {
    try { await kvSet(`thread:${t.id}`, t); } catch(e) { console.error("KV save error for", t.id, e.message); }
  }
  // Update the ID index
  newOnes.forEach(t => savedIds.add(t.id));
  await kvSet("shared:saved-thread-ids", [...savedIds]);
  return newOnes.length;
}

async function syncToSheet(threads, accessToken) {
  try {
    const sheetInfo = await kvGet("shared:spreadsheet");
    if (!sheetInfo?.spreadsheetId) return;
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version:"v4", auth:oauth2Client });
    const { spreadsheetId } = sheetInfo;

    const existingRes = await sheets.spreadsheets.values.get({ spreadsheetId, range:"Threads!A:A" });
    const existingIds = new Set((existingRes.data.values||[]).map(r=>r[0]));
    const toAppend = threads.filter(t => !existingIds.has(t.id));
    if (!toAppend.length) return;

    const HEADER = ["Thread ID","Date","Customer","Subject","Category","Status","Machine Model","Flags","AI Summary","Resolution","Has Reply","Saved At"];
    const checkRes = await sheets.spreadsheets.values.get({ spreadsheetId, range:"Threads!A1:A1" });
    if (!checkRes.data.values?.length) {
      await sheets.spreadsheets.values.update({ spreadsheetId, range:"Threads!A1", valueInputOption:"RAW", requestBody:{ values:[HEADER] } });
    }
    await sheets.spreadsheets.values.append({
      spreadsheetId, range:"Threads!A:L", valueInputOption:"RAW",
      requestBody:{ values: toAppend.map(t=>[t.id||"",t.date||"",t.customer||"",t.subject||"",t.category||"",t.status||"",t.machineModel||"",(t.flags||[]).join(", "),t.summary||"",t.resolution||"",t.hasSent?"Yes":"No",new Date().toLocaleString()]) },
    });
  } catch(err) { console.error("Sheet sync error:", err.message); }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error:"Unauthorized" });

  const { pageToken } = req.body || {};

  try {
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials({ access_token: session.accessToken });
    const gmail = google.gmail({ version:"v1", auth:oauth2Client });

    // 2 years back
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear()-2);
    const dateStr = `${cutoff.getFullYear()}/${String(cutoff.getMonth()+1).padStart(2,"0")}/${String(cutoff.getDate()).padStart(2,"0")}`;

    // Get already-saved IDs to skip duplicates
    const savedIds = await getSavedIds();

    const listRes = await gmail.users.threads.list({
      userId:"me",
      q:`in:anywhere -in:spam -in:trash -in:draft (category:primary OR category:forums) -category:promotions -category:updates -category:social after:${dateStr}`,
      maxResults:10, // smaller batch so we don't timeout
      pageToken: pageToken||undefined,
    });

    const threads = listRes.data.threads||[];
    const nextPageToken = listRes.data.nextPageToken||null;
    const totalEstimate = listRes.data.resultCountEstimate||0;

    // Filter out already-saved threads
    const unseen = threads.filter(t => !savedIds.has(t.id));

    // Fetch full content for unseen threads
    const processed = [];
    for (const t of unseen) {
      try {
        const threadRes = await gmail.users.threads.get({ userId:"me", id:t.id, format:"full" });
        const messages = threadRes.data.messages||[];
        const subject = extractSubject(messages);
        const fromHeader = messages[0]?.payload?.headers?.find(h=>h.name==="From")?.value||"";

        if (isDefiniteJunk(fromHeader, subject, extractCustomer(messages) || "")) continue;
        const customer = extractCustomer(messages);
        if (!customer) continue;

        const content = buildContent(messages);
        const labels = messages.flatMap(m=>m.labelIds||[]);
        const hasSentReply = labels.includes("SENT");

        processed.push({
          id:t.id, date:extractDate(messages), customer,
          customerEmail:extractCustomerEmail(messages),
          subject, content, snippet:cleanSnippet(messages[0]?.snippet)||content.slice(0,200),
          status:deriveStatus(messages), hasSent:hasSentReply,
          messageCount:messages.length, machineModel:detectMachineModel(subject+" "+content),
          isHistorical:true,
        });
      } catch { continue; }
    }

    // AI analyze each one
    const analyzed = [];
    for (const thread of processed) {
      const result = await aiAnalyze(thread);
      if (result.isSpam || result.isNotOurService) continue;
      analyzed.push({
        ...thread,
        ...result,
        machineModel: result.machineModel||thread.machineModel||null,
        status: thread.status, // keep auto-derived status
      });
      await new Promise(r=>setTimeout(r,150)); // rate limit buffer
    }

    // Save to Upstash + Sheet
    const savedCount = await saveThreads(analyzed);
    await syncToSheet(analyzed, session.accessToken);

    return res.status(200).json({
      threads: analyzed,
      nextPageToken,
      totalEstimate,
      processed: processed.length,
      saved: savedCount,
      skipped: threads.length - unseen.length,
    });
  } catch(err) {
    console.error("Bulk import error:", err);
    return res.status(500).json({ error:err.message });
  }
}
