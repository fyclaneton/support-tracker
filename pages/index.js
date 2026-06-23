import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import styles from "../styles/Home.module.css";

const CATEGORIES = ["Software", "Hardware", "Setup", "Connectivity", "Contact request", "Other"];
const STATUSES = ["Open", "Pending", "Resolved"];
// Full i2R model list
const MACHINE_MODELS = [
  "A.22","A.23","A.24","A.42","A.44",
  "W.42",
  "B.22","B.23","B.24",
  "C.22","C.24","C.44","C.48",
  "D.11","D.21","D.22","D.24","D.44",
  "E.24","E.44","E.55",
  "G.48",
  "M.22",
  "M+450P","M+350",
];
const MODEL_SERIES = ["A","W","B","C","D","E","G","M","M+"];
const FLAG_LABELS = {
  "no-reply": { label: "No reply", emoji: "🔴" },
  urgent:     { label: "Urgent",   emoji: "⚠️" },
  repeat:     { label: "Repeat",   emoji: "🔁" },
};

const TEMPLATES = [
  { label: "UCCNC Soft Limit Fix", text: "Hi,\n\nThank you for reaching out. To resolve the soft limit issue in UCCNC:\n1. Open UCCNC and go to Settings → Axes\n2. Increase the soft limit values or disable them temporarily\n3. Home your machine and try running the program again\n\nPlease let us know if this resolves the issue." },
  { label: "Connectivity Checklist", text: "Hi,\n\nThank you for contacting us. Please try the following steps to resolve the connectivity issue:\n1. Check that the USB cable is firmly connected at both ends\n2. Try a different USB port on your computer\n3. Restart both the controller and your computer\n4. Reinstall the UCCNC driver from our website\n\nLet us know how it goes!" },
  { label: "Schedule a Call", text: "Hi,\n\nThank you for getting in touch. We'd be happy to assist you over a call. Please reply with your availability and we'll get back to you to schedule a time.\n\nAlternatively, you can reach us at our support line during business hours." },
  { label: "Request More Info", text: "Hi,\n\nThank you for reaching out. To help you more effectively, could you please provide:\n1. Your machine model (i2R-4, i2R-8, etc.)\n2. A description of the issue\n3. Any error messages you're seeing\n4. Screenshots if possible\n\nWe look forward to helping you resolve this!" },
  { label: "Issue Resolved Confirmation", text: "Hi,\n\nWe're glad to hear the issue has been resolved! If you experience any further problems or have any questions, please don't hesitate to reach out.\n\nThank you for choosing i2R CNC!" },
  { label: "X-Axis / Y-Axis Issue", text: "Hi,\n\nThank you for reporting this. For axis issues, please try:\n1. Check all motor cable connections\n2. Verify the steps/mm setting in UCCNC matches your machine spec\n3. Test the axis movement at slow speed first\n4. Check for any mechanical obstructions along the axis\n\nPlease let us know the results and we'll assist further." },
];

const CAT_BG = {
  Software: { bg: "#EEEDFE", text: "#534AB7" }, Hardware: { bg: "#FAECE7", text: "#993C1D" },
  Setup: { bg: "#E1F5EE", text: "#0F6E56" }, Connectivity: { bg: "#FBEAF0", text: "#993556" },
  "Contact request": { bg: "#F1EFE8", text: "#5F5E5A" }, Other: { bg: "#F1EFE8", text: "#5F5E5A" },
};
const STATUS_COLORS = {
  Open:     { bg: "#FAEEDA", text: "#854F0B" },
  Pending:  { bg: "#E6F1FB", text: "#185FA5" },
  Resolved: { bg: "#EAF3DE", text: "#3B6D11" },
};
const CAT_CHART_COLORS = {
  Software: "#7F77DD", Hardware: "#D85A30", Setup: "#1D9E75",
  Connectivity: "#D4537E", "Contact request": "#888780", Other: "#BBBBBB",
};

function Badge({ label, colorMap }) {
  const c = colorMap[label] || { bg: "#F1EFE8", text: "#5F5E5A" };
  return <span style={{ background: c.bg, color: c.text, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }}>{label}</span>;
}

function MiniBar({ label, value, max, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12 }}>
      <span style={{ width: 110, color: "var(--text-secondary)", textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, background: "var(--bg-secondary)", borderRadius: 4, height: 14, overflow: "hidden" }}>
        <div style={{ width: `${Math.round((value / (max || 1)) * 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s" }} />
      </div>
      <span style={{ width: 20, color: "var(--text-secondary)", flexShrink: 0 }}>{value}</span>
    </div>
  );
}

function TimeChip({ hours }) {
  if (hours === null || hours === undefined) return null;
  const color = hours > 72 ? "#C0392B" : hours > 24 ? "#E67E22" : "#27AE60";
  const label = hours < 1 ? "<1h" : hours < 24 ? `${hours}h` : `${Math.floor(hours/24)}d ${hours%24}h`;
  return <span style={{ fontSize: 11, color, fontWeight: 600, background: color + "18", padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap" }}>⏱ {label} waiting</span>;
}

function ModelTag({ model }) {
  if (!model) return null;
  return <span style={{ fontSize: 11, background: "#E6F1FB", color: "#185FA5", padding: "2px 8px", borderRadius: 20, fontWeight: 500, whiteSpace: "nowrap" }}>🔧 {model}</span>;
}

function generatePDF(threads) {
  const date = new Date().toLocaleDateString();
  const rows = threads.map(t => `<tr>
    <td>${t.date||"—"}</td><td>${t.customer||"—"}</td><td>${t.subject||"—"}</td>
    <td>${t.machineModel||"—"}</td><td>${t.category||"—"}</td><td>${t.status||"—"}</td>
    <td>${(t.flags||[]).map(f=>FLAG_LABELS[f]?.emoji+" "+FLAG_LABELS[f]?.label).join(", ")||"—"}</td>
    <td>${t.summary||"—"}</td><td>${t.resolution||"—"}</td>
  </tr>`).join("");
  const html = `<!DOCTYPE html><html><head><title>Support Tracker — ${date}</title>
  <style>body{font-family:sans-serif;font-size:11px;padding:2rem}h1{font-size:18px;margin-bottom:4px}
  p{color:#666;margin-bottom:1.5rem}table{width:100%;border-collapse:collapse}
  th{background:#f5f5f3;text-align:left;padding:5px 7px;font-size:10px;border-bottom:1px solid #ddd}
  td{padding:5px 7px;border-bottom:1px solid #eee;vertical-align:top}</style></head>
  <body><h1>📬 Support Tracker Report</h1><p>Generated ${date} · ${threads.length} threads</p>
  <table><thead><tr><th>Date</th><th>Customer</th><th>Subject</th><th>Model</th><th>Category</th><th>Status</th><th>Flags</th><th>Summary</th><th>Resolution</th></tr></thead>
  <tbody>${rows}</tbody></table></body></html>`;
  const win = window.open("", "_blank");
  win.document.write(html); win.document.close(); win.print();
}

function exportCSV(threads) {
  const header = ["Date","Customer","Subject","Machine Model","Category","Status","Flags","AI Summary","Resolution","Hours Waiting","Has Reply"];
  const rows = threads.map(t => [
    t.date, t.customer,
    `"${(t.subject||"").replace(/"/g,'""')}"`,
    t.machineModel||"",
    t.category, t.status,
    `"${(t.flags||[]).join(", ")}"`,
    `"${(t.summary||"").replace(/"/g,'""')}"`,
    `"${(t.resolution||"").replace(/"/g,'""')}"`,
    t.hoursWaiting||"",
    t.hasSent?"Yes":"No",
  ]);
  const csv = [header,...rows].map(r=>r.join(",")).join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
  a.download = `support-tracker-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
}

// ── Customer History Modal ──
function CustomerHistoryModal({ customer, threads, onClose }) {
  const customerThreads = threads.filter(t => t.customer === customer);
  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>👤 {customer}</h2>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0" }}>{customerThreads.length} thread{customerThreads.length !== 1 ? "s" : ""} total</p>
          </div>
          <button onClick={onClose} className={styles.modalClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          {customerThreads.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>No threads found.</p>
          ) : customerThreads.map(t => (
            <div key={t.id} className={styles.historyItem}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 3px" }}>{t.subject}</p>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{t.summary || t.snippet?.slice(0, 120) || "—"}</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t.date}</span>
                  <Badge label={t.status || "Open"} colorMap={STATUS_COLORS} />
                  {t.machineModel && <ModelTag model={t.machineModel} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Thread Detail Panel ──
function ThreadDetail({ r, overrides, savingId, sheetInfo, threads, session, onOverride, onBlock, spamSenders, modelSeries, allModels }) {
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(null);

  useEffect(() => {
    fetch(`/api/notes?threadId=${r.id}`)
      .then(res => res.json())
      .then(d => setNotes(Array.isArray(d.notes) ? d.notes : []))
      .catch(console.error);
  }, [r.id]);

  async function saveNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: r.id, note: noteText }) });
      const d = await res.json();
      if (d.notes) setNotes(d.notes);
      setNoteText("");
    } catch(e) { console.error(e); }
    finally { setSavingNote(false); }
  }

  async function deleteNote(noteId) {
    try {
      const res = await fetch("/api/notes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: r.id, noteId }) });
      const d = await res.json();
      if (d.notes) setNotes(d.notes);
    } catch(e) { console.error(e); }
  }

  function copyTemplate(template) {
    navigator.clipboard.writeText(template.text).catch(() => {});
    setCopiedTemplate(template.label);
    setTimeout(() => { setCopiedTemplate(null); setShowTemplates(false); }, 1500);
  }

  return (
    <div className={styles.detailPanel}>
      {/* Meta row */}
      <div className={styles.detailGrid}>
        <div><p className={styles.detailLabel}>Customer</p><p className={styles.detailValue}>{r.customer}</p></div>
        <div><p className={styles.detailLabel}>Date</p><p className={styles.detailValue}>{r.date||"—"}</p></div>
        <div><p className={styles.detailLabel}>Messages</p><p className={styles.detailValue}>{r.messageCount}</p></div>
        <div><p className={styles.detailLabel}>Has reply</p><p className={styles.detailValue}>{r.hasSent?"Yes ✅":"No ❌"}</p></div>
      </div>

      {/* Tags row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {r.machineModel && <ModelTag model={r.machineModel} />}
        {r.hoursWaiting !== null && r.hoursWaiting !== undefined && !r.hasSent && <TimeChip hours={r.hoursWaiting} />}
        {overrides[r.id]?.updatedAt && <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>💾 Saved {new Date(overrides[r.id].updatedAt).toLocaleString()} by {overrides[r.id].updatedBy}</span>}
      </div>

      {/* Flags */}
      {r.flags?.length > 0 && (
        <div className={styles.flagBanner}>
          {r.flags.map(f => <span key={f} className={styles.flagChip}>{FLAG_LABELS[f]?.emoji} {FLAG_LABELS[f]?.label}</span>)}
        </div>
      )}

      {/* AI summaries */}
      <div className={styles.aiBlock}>
        <div className={styles.aiSection}>
          <p className={styles.detailLabel}>🤖 AI — Issue summary</p>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 4 }}>{r.summary || "—"}</p>
        </div>
        <div className={styles.aiSection}>
          <p className={styles.detailLabel}>🔧 AI — Resolution</p>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 4 }}>{r.resolution || "—"}</p>
        </div>
      </div>

      {/* Internal notes */}
      <div className={styles.notesSection}>
        <p className={styles.detailLabel} style={{ marginBottom: 8 }}>📝 Internal notes</p>
        {notes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {notes.map(n => (
              <div key={n.id} className={styles.noteItem}>
                <p style={{ fontSize: 13, margin: "0 0 3px" }}>{n.text}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{n.authorName} · {new Date(n.createdAt).toLocaleString()}</span>
                  <button onClick={() => deleteNote(n.id)} style={{ fontSize: 11, color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer" }}>delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className={styles.noteInput}
            placeholder="Add an internal note…"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveNote(); } }}
          />
          <button className={styles.btn} onClick={saveNote} disabled={savingNote || !noteText.trim()}>
            {savingNote ? "Saving…" : "Add"}
          </button>
        </div>
      </div>

      {/* Response templates */}
      <div style={{ marginTop: 12 }}>
        <button className={styles.templateToggle} onClick={() => setShowTemplates(v => !v)}>
          📋 {showTemplates ? "Hide" : "Show"} response templates
        </button>
        {showTemplates && (
          <div className={styles.templateGrid}>
            {TEMPLATES.map(t => (
              <button key={t.label} className={styles.templateBtn} onClick={() => copyTemplate(t)}>
                {copiedTemplate === t.label ? "✓ Copied!" : t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Controls row */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
        <div>
          <p className={styles.detailLabel} style={{ marginBottom: 4 }}>Override category</p>
          <select className={styles.select} value={r.category || "Other"} onChange={e => onOverride(r.id, "category", e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <p className={styles.detailLabel} style={{ marginBottom: 4 }}>Override model</p>
          <select className={styles.select} value={r.machineModel || ""} onChange={e => onOverride(r.id, "machineModel", e.target.value)}>
            <option value="">Unknown</option>
            {MACHINE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <p className={styles.detailLabel} style={{ marginBottom: 4 }}>Mark as</p>
          <select className={styles.select} value={r.status || "Open"} onChange={e => onOverride(r.id, "status", e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ paddingBottom: 2 }}>
          <p className={styles.detailLabel} style={{ marginBottom: 4 }}>Sender</p>
          <button className={styles.spamBtn} onClick={e => { e.stopPropagation(); onBlock(r.customer); }}
            disabled={Array.isArray(spamSenders) && spamSenders.includes(r.customer) || r.customer === "Unknown"}>
            🚫 {Array.isArray(spamSenders) && spamSenders.includes(r.customer) ? "Blocked" : "Block sender"}
          </button>
        </div>
        {savingId === r.id && <span style={{ fontSize: 12, color: "var(--text-secondary)", paddingBottom: 8 }}>💾 Saving…</span>}
        {savingId !== r.id && overrides[r.id] && <span style={{ fontSize: 12, color: "#1D9E75", paddingBottom: 8 }}>✓ Saved{sheetInfo?.exists ? " & synced" : ""}</span>}
      </div>
    </div>
  );
}

export default function Home() {
  const { data: session, status } = useSession();
  const [threads, setThreads]             = useState([]);
  const [loading, setLoading]             = useState(false);
  const [analyzing, setAnalyzing]         = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [search, setSearch]               = useState("");
  const [filterCat, setFilterCat]         = useState("");
  const [filterStatus, setFilterStatus]   = useState("");
  const [filterFlag, setFilterFlag]       = useState("");
  const [filterModel, setFilterModel]     = useState("");
  const [page, setPage]                   = useState(0);
  const [expandedId, setExpandedId]       = useState(null);
  const [overrides, setOverrides]         = useState({});
  const [savingId, setSavingId]           = useState(null);
  const [lastSync, setLastSync]           = useState(null);
  const [syncing, setSyncing]             = useState(false);
  const [newCount, setNewCount]           = useState(0);
  const [sheetInfo, setSheetInfo]         = useState(null);
  const [sheetCreating, setSheetCreating] = useState(false);
  const [sheetError, setSheetError]       = useState(null);
  const [sheetSyncing, setSheetSyncing]   = useState(false);
  const [spamSenders, setSpamSenders]     = useState([]);
  const [spamToast, setSpamToast]         = useState(null);
  const [showSpamList, setShowSpamList]   = useState(false);
  const [customerHistory, setCustomerHistory] = useState(null);
  const syncTimer = useRef(null);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!session) return;
    fetch("/api/overrides").then(r=>r.json()).then(d=>{ if(d.overrides) setOverrides(d.overrides); }).catch(console.error);
    fetch("/api/sheet-sync", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"info" }) })
      .then(r=>r.json()).then(d=>setSheetInfo(d)).catch(console.error);
    fetch("/api/spam-senders").then(r=>r.json()).then(d=>{ if(d.senders) setSpamSenders(Array.isArray(d.senders)?d.senders:[]); }).catch(console.error);
  }, [session]);

  const analyzeThreads = useCallback(async (rawThreads) => {
    if (!rawThreads.length) return rawThreads;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ threads: rawThreads }) });
      const data = await res.json();
      const map = {};
      (data.results||[]).forEach(r=>{ map[r.id]=r; });
      return rawThreads.filter(t=>!map[t.id]?.isSpam).map(t=>({ ...t, ...map[t.id] }));
    } catch(e) { console.error(e); return rawThreads; }
    finally { setAnalyzing(false); }
  }, []);

  const fetchThreads = useCallback(async (token=null, isSync=false) => {
    if (isSync) setSyncing(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (token) params.set("pageToken", token);
      const res = await fetch(`/api/threads?${params}`);
      const data = await res.json();
      const analyzed = await analyzeThreads(data.threads||[]);
      if (isSync) {
        setThreads(prev => {
          const existing = new Set(prev.map(t=>t.id));
          const fresh = analyzed.filter(t=>!existing.has(t.id));
          if (fresh.length) setNewCount(n=>n+fresh.length);
          return fresh.length ? [...fresh,...prev] : prev;
        });
      } else {
        setThreads(prev => token ? [...prev,...analyzed] : analyzed);
      }
      setNextPageToken(data.nextPageToken||null);
      setLastSync(new Date());
    } catch(e) { console.error(e); }
    finally { if (isSync) setSyncing(false); else setLoading(false); }
  }, [analyzeThreads]);

  useEffect(() => { if (session) fetchThreads(null, false); }, [session]);
  useEffect(() => {
    if (!session) return;
    syncTimer.current = setInterval(()=>fetchThreads(null,true), 2*60*1000);
    return ()=>clearInterval(syncTimer.current);
  }, [session, fetchThreads]);

  async function setOverride(id, field, value) {
    setOverrides(prev => ({ ...prev, [id]: { ...prev[id], [field]: value, updatedAt: new Date().toISOString(), updatedBy: session.user?.email } }));
    setSavingId(id);
    try {
      let kvRes = await fetch("/api/overrides", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ id, field, value }) });
      if (!kvRes.ok) { await new Promise(r=>setTimeout(r,600)); kvRes = await fetch("/api/overrides", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ id, field, value }) }); }
      const kvData = kvRes.ok ? ((await kvRes.json())?.override||{}) : {};
      if (sheetInfo?.exists) {
        setSheetSyncing(true);
        const thread = threads.find(t=>t.id===id);
        if (thread) {
          const updatedThread = { ...thread, status: field==="status"?value:(kvData.status||overrides[id]?.status||thread.status), category: field==="category"?value:(kvData.category||overrides[id]?.category||thread.category), machineModel: field==="machineModel"?value:(kvData.machineModel||overrides[id]?.machineModel||thread.machineModel) };
          await fetch("/api/sheet-sync", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"update", thread: updatedThread }) });
        }
      }
    } catch(e) { console.error("Save failed:", e); }
    finally { setSavingId(null); setSheetSyncing(false); }
  }

  async function createSharedSheet() {
    setSheetCreating(true); setSheetError(null);
    try {
      const res = await fetch("/api/sheet-sync", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"create", threads: allRows }) });
      const data = await res.json();
      if (data.error) { setSheetError(data.error); return; }
      if (data.url) setSheetInfo({ exists:true, url:data.url, spreadsheetId:data.spreadsheetId, createdBy: session.user?.email });
    } catch(e) { setSheetError("Failed to create sheet. Make sure Google Sheets & Drive APIs are enabled."); }
    finally { setSheetCreating(false); }
  }

  async function flagSenderAsSpam(customerEmail) {
    if (!customerEmail || customerEmail === "Unknown") return;
    const senderThreads = threads.filter(t=>t.customer===customerEmail);
    setSpamSenders(prev=>Array.isArray(prev)&&!prev.includes(customerEmail)?[...prev,customerEmail]:prev);
    setExpandedId(null);
    setSpamToast(`"${customerEmail}" blocked — ${senderThreads.length} thread${senderThreads.length!==1?"s":""} removed.`);
    setTimeout(()=>setSpamToast(null), 5000);
    try {
      let res = await fetch("/api/spam-senders", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email: customerEmail }) });
      if (!res.ok) { await new Promise(r=>setTimeout(r,600)); res = await fetch("/api/spam-senders", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email: customerEmail }) }); }
      const data = await res.json();
      if (data.senders) setSpamSenders(Array.isArray(data.senders)?data.senders:[]);
      if (sheetInfo?.exists) await fetch("/api/sheet-sync", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"remove-sender", customer: customerEmail }) });
    } catch(e) { console.error("Block sender failed:", e); }
  }

  async function removeFromSpam(email) {
    const senderThreads = threads.filter(t=>t.customer===email);
    setSpamSenders(prev=>Array.isArray(prev)?prev.filter(e=>e!==email):[]);
    setSpamToast(`"${email}" unblocked — ${senderThreads.length} thread${senderThreads.length!==1?"s":""} restored.`);
    setTimeout(()=>setSpamToast(null), 5000);
    try {
      let res = await fetch("/api/spam-senders", { method:"DELETE", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email }) });
      if (!res.ok) { await new Promise(r=>setTimeout(r,600)); res = await fetch("/api/spam-senders", { method:"DELETE", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email }) }); }
      const data = await res.json();
      if (data.senders) setSpamSenders(Array.isArray(data.senders)?data.senders:[]);
      if (sheetInfo?.exists && senderThreads.length>0) await fetch("/api/sheet-sync", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"restore-sender", threads: senderThreads }) });
    } catch(e) { console.error("Unblock sender failed:", e); }
  }

  const allRows = threads
    .filter(t=>!Array.isArray(spamSenders)||!spamSenders.includes(t.customer))
    .map(t=>({
      ...t,
      status:       overrides[t.id]?.status       || t.status,
      category:     overrides[t.id]?.category     || t.category,
      machineModel: overrides[t.id]?.machineModel !== undefined ? overrides[t.id]?.machineModel : t.machineModel,
    }));

  const filtered = allRows.filter(r=>{
    const q = search.toLowerCase();
    return (!q || r.customer?.toLowerCase().includes(q)||r.snippet?.toLowerCase().includes(q)||r.subject?.toLowerCase().includes(q)||r.summary?.toLowerCase().includes(q)||r.machineModel?.toLowerCase().includes(q))
      && (!filterCat    || r.category===filterCat)
      && (!filterStatus || r.status===filterStatus)
      && (!filterFlag   || (r.flags||[]).includes(filterFlag))
      && (!filterModel  || r.machineModel===filterModel);
  });

  const totalPages = Math.ceil(filtered.length/PAGE_SIZE);
  const pageRows   = filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  const catCounts  = {};
  allRows.forEach(r=>{ catCounts[r.category]=(catCounts[r.category]||0)+1; });
  const maxCat = Math.max(...Object.values(catCounts),1);
  const statusCounts = { Open:0, Pending:0, Resolved:0 };
  allRows.forEach(r=>{ if(statusCounts[r.status]!==undefined) statusCounts[r.status]++; });
  const flaggedCount = allRows.filter(r=>r.flags?.length>0).length;
  const urgentWaiting = allRows.filter(r=>!r.hasSent && r.hoursWaiting>24).length;
  const topCat = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—";

  if (status==="loading") return <div className={styles.centered}><div className={styles.spinner}/></div>;

  if (!session) return (
    <div className={styles.loginWrap}>
      <div className={styles.loginCard}>
        <div className={styles.logo}>📬</div>
        <h1 className={styles.loginTitle}>Support Tracker</h1>
        <p className={styles.loginSub}>AI-powered customer support email dashboard. Sign in with Google to get started.</p>
        <button className={styles.signInBtn} onClick={()=>signIn("google")}>Sign in with Google</button>
      </div>
    </div>
  );

  return (
    <div className={styles.wrap}>
      {spamToast && <div className={styles.toast}>{spamToast}</div>}
      {customerHistory && <CustomerHistoryModal customer={customerHistory} threads={allRows} onClose={()=>setCustomerHistory(null)} />}

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}>📬</span>
          <span className={styles.headerTitle}>Support Tracker</span>
          {analyzing    && <span className={styles.aiPill}>🤖 AI analyzing…</span>}
          {syncing      && <span className={styles.syncPill}>↻ Syncing…</span>}
          {sheetSyncing && <span className={styles.syncPill}>📊 Updating sheet…</span>}
          {savingId     && <span className={styles.syncPill}>💾 Saving…</span>}
          {newCount>0   && <button className={styles.newBadge} onClick={()=>{setNewCount(0);setPage(0);}}>{newCount} new thread{newCount>1?"s":""} — click to view</button>}
        </div>
        <div className={styles.headerRight}>
          {spamSenders.length>0 && <button className={styles.spamListBtn} onClick={()=>setShowSpamList(v=>!v)}>🚫 {spamSenders.length} blocked</button>}
          {lastSync && <span className={styles.syncTime}>Synced {lastSync.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
          <span className={styles.userEmail}>{session.user?.email}</span>
          <button className={styles.signOutBtn} onClick={()=>signOut()}>Sign out</button>
        </div>
      </header>

      {showSpamList && (
        <div className={styles.spamPanel}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <p className={styles.spamPanelTitle}>🚫 Blocked senders — threads hidden from dashboard and removed from sheet</p>
            <button onClick={()=>setShowSpamList(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#993C1D",fontSize:18}}>×</button>
          </div>
          {spamSenders.length===0 ? <p style={{fontSize:12,color:"#993C1D",opacity:0.7}}>No blocked senders.</p> : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {spamSenders.map(email=>{
                const count=threads.filter(t=>t.customer===email).length;
                return (
                  <div key={email} className={styles.spamChip} style={{justifyContent:"space-between",borderRadius:8,padding:"8px 12px"}}>
                    <div><span style={{fontWeight:500}}>{email}</span><span style={{fontSize:11,marginLeft:8,opacity:0.7}}>{count} thread{count!==1?"s":""} hidden</span></div>
                    <button onClick={()=>removeFromSpam(email)} className={styles.unblockBtn}>↩ Unblock &amp; restore</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <main className={styles.main}>
        {/* Sheet banner */}
        <div className={styles.sheetBanner}>
          {sheetInfo?.exists ? (
            <div className={styles.sheetActive}>
              <span>📊 <strong>Live shared sheet active</strong> — all changes sync automatically.</span>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <a href={sheetInfo.url} target="_blank" rel="noreferrer" className={styles.sheetsLink}>Open Sheet ↗</a>
                <span style={{fontSize:11,color:"var(--text-secondary)"}}>by {sheetInfo.createdBy}</span>
              </div>
            </div>
          ) : (
            <div className={styles.sheetSetup}>
              <div><span>📊 No shared sheet yet.</span>{sheetError&&<p style={{color:"#C0392B",fontSize:12,marginTop:4}}>⚠️ {sheetError}</p>}</div>
              <button className={styles.btn} onClick={createSharedSheet} disabled={sheetCreating||allRows.length===0}>{sheetCreating?"Creating… (10–15 sec)":"Create shared sheet"}</button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className={styles.statGrid}>
          <div className={styles.statCard}><p className={styles.statLabel}>Total threads</p><p className={styles.statValue}>{allRows.length}</p></div>
          <div className={styles.statCard}><p className={styles.statLabel}>Open — needs reply</p><p className={styles.statValue} style={{color:"#BA7517"}}>{statusCounts.Open}</p></div>
          <div className={styles.statCard}><p className={styles.statLabel}>⏱ Waiting &gt;24h</p><p className={styles.statValue} style={{color:urgentWaiting>0?"#C0392B":undefined}}>{urgentWaiting}</p></div>
          <div className={styles.statCard}><p className={styles.statLabel}>Top issue</p><p className={styles.statValue} style={{fontSize:14,paddingTop:4}}>{topCat}</p></div>
        </div>

        {/* Charts */}
        <div className={styles.chartRow}>
          <div className={styles.chartCard}>
            <p className={styles.chartTitle}>Issues by category</p>
            {CATEGORIES.map(c=><MiniBar key={c} label={c} value={catCounts[c]||0} max={maxCat} color={CAT_CHART_COLORS[c]}/>)}
          </div>
          <div className={styles.chartCard}>
            <p className={styles.chartTitle}>Status breakdown</p>
            {STATUSES.map(s=><MiniBar key={s} label={s} value={statusCounts[s]||0} max={allRows.length||1} color={STATUS_COLORS[s]?.bg}/>)}
            {urgentWaiting>0&&<div style={{marginTop:12,padding:"8px 12px",background:"#FEF0EE",borderRadius:8,fontSize:12,color:"#993C1D"}}>⏱ <strong>{urgentWaiting}</strong> thread{urgentWaiting>1?"s":""} waiting over 24 hours without a reply</div>}
          </div>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <input className={styles.searchInput} placeholder="Search customer, subject, model, summary…" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/>
          <select className={styles.select} value={filterCat} onChange={e=>{setFilterCat(e.target.value);setPage(0);}}>
            <option value="">All categories</option>
            {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select className={styles.select} value={filterModel} onChange={e=>{setFilterModel(e.target.value);setPage(0);}}>
            <option value="">All models</option>
            {MODEL_SERIES.map(series => {
              const seriesModels = MACHINE_MODELS.filter(m => m.startsWith(series));
              return seriesModels.length > 0 ? (
                <optgroup key={series} label={`${series} Series`}>
                  {seriesModels.map(m => <option key={m} value={m}>{m}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
          <select className={styles.select} value={filterStatus} onChange={e=>{setFilterStatus(e.target.value);setPage(0);}}>
            <option value="">All statuses</option>
            {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <select className={styles.select} value={filterFlag} onChange={e=>{setFilterFlag(e.target.value);setPage(0);}}>
            <option value="">All flags</option>
            <option value="no-reply">🔴 No reply</option>
            <option value="urgent">⚠️ Urgent</option>
            <option value="repeat">🔁 Repeat customer</option>
          </select>
        </div>

        {/* Export bar */}
        <div className={styles.exportBar}>
          <span style={{fontSize:13,color:"var(--text-secondary)"}}>Export {allRows.length} threads:</span>
          <button className={styles.btn} onClick={()=>exportCSV(allRows)}>↓ CSV</button>
          <button className={styles.btn} onClick={()=>generatePDF(allRows)}>↓ PDF</button>
          {nextPageToken&&<button className={styles.btn} onClick={()=>fetchThreads(nextPageToken)} disabled={loading} style={{marginLeft:"auto"}}>{loading?"Loading…":"Load more emails"}</button>}
        </div>

        {/* Table */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{width:85}}>Date</th>
                <th style={{width:130}}>Customer</th>
                <th>Subject &amp; AI summary</th>
                <th style={{width:70}}>Model</th>
                <th style={{width:110}}>Category</th>
                <th style={{width:90}}>Status</th>
                <th style={{width:40,textAlign:"center"}}></th>
              </tr>
            </thead>
            <tbody>
              {(loading&&threads.length===0) ? (
                <tr><td colSpan={7} style={{textAlign:"center",padding:"2.5rem",color:"var(--text-secondary)"}}>
                  <div className={styles.spinner} style={{display:"inline-block",marginRight:8}}/>
                  {analyzing?"AI is analyzing threads…":"Loading threads…"}
                </td></tr>
              ) : pageRows.length===0 ? (
                <tr><td colSpan={7} style={{textAlign:"center",padding:"2rem",color:"var(--text-secondary)"}}>No threads match your filters.</td></tr>
              ) : pageRows.map(r=>(
                <>
                  <tr key={r.id} className={styles.tableRow} onClick={()=>setExpandedId(expandedId===r.id?null:r.id)}>
                    <td style={{color:"var(--text-secondary)",fontSize:12}}>{r.date||"—"}</td>
                    <td>
                      <button className={styles.customerLink} onClick={e=>{e.stopPropagation();setCustomerHistory(r.customer);}} title="View customer history">
                        {r.customer}
                      </button>
                      {!r.hasSent && r.hoursWaiting>24 && <div style={{marginTop:3}}><TimeChip hours={r.hoursWaiting}/></div>}
                    </td>
                    <td>
                      <div style={{fontWeight:500,fontSize:13,marginBottom:2}}>{r.subject}</div>
                      {r.summary
                        ?<div style={{color:"var(--text-secondary)",fontSize:12,lineHeight:1.4}}>🤖 {r.summary}</div>
                        :<div style={{color:"var(--text-secondary)",fontSize:12}}>{r.snippet?.slice(0,100)}…</div>}
                    </td>
                    <td>{r.machineModel ? <ModelTag model={r.machineModel}/> : <span style={{color:"var(--text-secondary)",fontSize:12}}>—</span>}</td>
                    <td><Badge label={r.category||"Other"} colorMap={CAT_BG}/></td>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        <Badge label={r.status||"Open"} colorMap={STATUS_COLORS}/>
                        {(r.flags||[]).map(f=><span key={f} title={FLAG_LABELS[f]?.label} style={{fontSize:14}}>{FLAG_LABELS[f]?.emoji}</span>)}
                      </div>
                    </td>
                    <td style={{textAlign:"center",color:"var(--text-secondary)",fontSize:12}}>{expandedId===r.id?"▲":"▼"}</td>
                  </tr>
                  {expandedId===r.id&&(
                    <tr key={r.id+"-detail"}>
                      <td colSpan={7} style={{padding:"0 12px 14px",background:"var(--bg-secondary)"}}>
                        <ThreadDetail r={r} overrides={overrides} savingId={savingId} sheetInfo={sheetInfo} threads={threads} session={session} onOverride={setOverride} onBlock={flagSenderAsSpam} spamSenders={spamSenders} modelSeries={MODEL_SERIES} allModels={MACHINE_MODELS}/>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.pagination}>
          <span style={{color:"var(--text-secondary)",fontSize:13}}>
            {filtered.length>0?`${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE,filtered.length)} of ${filtered.length}`:"0 results"}
          </span>
          <button className={styles.btn} onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}>‹ Prev</button>
          <button className={styles.btn} onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page>=totalPages-1}>Next ›</button>
        </div>
      </main>
    </div>
  );
}
