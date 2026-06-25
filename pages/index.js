import Link from 'next/link';
import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import styles from "../styles/Home.module.css";

const CATEGORIES = ["Software", "Hardware", "Setup", "Connectivity", "Warranty/Repair", "Sales inquiry", "Contact request", "Unrelated", "Other"];
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
const MODEL_SERIES = ["A","W","B","C","D","E","G","M+","M"];
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
  "Contact request": { bg: "#F1EFE8", text: "#5F5E5A" }, "Warranty/Repair": { bg: "#FEF0EE", text: "#993C1D" }, "Unrelated": { bg: "#F9ECEC", text: "#922B21" }, "Sales inquiry": { bg: "#E8F4FD", text: "#1A6B9E" }, Other: { bg: "#F1EFE8", text: "#5F5E5A" },
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

// MODEL_ALIASES maps display name to alias for B series
const REGIONS = ["Japan", "Korea", "Czech Republic", "United States", "Canada", "United Kingdom", "Other"];
const REGION_FLAGS = { "Japan":"🇯🇵","Korea":"🇰🇷","Czech Republic":"🇨🇿","United States":"🇺🇸","Canada":"🇨🇦","United Kingdom":"🇬🇧","Other":"🌍" };

const MODEL_ALIASES = {
  "B.22": "i2R 4", "B.23": "i2R 6", "B.24": "i2R 8",
};

function formatModelLabel(model) {
  if (!model) return null;
  const alias = MODEL_ALIASES[model];
  return alias ? `${model} (${alias})` : model;
}

function ModelTag({ model }) {
  if (!model) return null;
  const label = formatModelLabel(model);
  return (
    <span
      title={label}
      style={{ fontSize: 11, background: "#E6F1FB", color: "#185FA5", padding: "2px 8px", borderRadius: 20, fontWeight: 500, whiteSpace: "nowrap", display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}
    >
      🔧 {label}
    </span>
  );
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

function ThreadDetail({ r, overrides, savingId, sheetInfo, threads, session, onOverride, onBlock, onFlagNotService, onFlagDistributor, distributors, spamSenders, modelSeries, allModels }) {
  const [draft, setDraft]                     = useState(null);
  const [draftLoading, setDraftLoading]       = useState(false);
  const [draftKbUsed, setDraftKbUsed]         = useState(0);
  const [copied, setCopied]                   = useState(false);
  const [region, setRegion]                   = useState(r.region || null);
  const [detectingRegion, setDetectingRegion] = useState(false);

  async function detectRegion() {
    setDetectingRegion(true);
    try {
      const res = await fetch("/api/region-detect", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ threadId:r.id, content:r.content||r.snippet||"", customer:r.customer||"", subject:r.subject||"", customerEmail:r.customerEmail||"" }),
      });
      const data = await res.json();
      if (data.region) setRegion(data.region);
    } catch(e) { console.error(e); }
    finally { setDetectingRegion(false); }
  }

  async function saveRegion(val) {
    setRegion(val);
    try {
      await fetch("/api/region-detect", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ threadId:r.id, region:val }),
      });
    } catch(e) { console.error(e); }
  }

  async function generateDraft() {
    setDraftLoading(true);
    setDraft(null);
    try {
      const res = await fetch("/api/draft-reply", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ thread: r }),
      });
      const data = await res.json();
      setDraft(data.draft || "");
      setDraftKbUsed(data.kbUsed || 0);
    } catch(e) { console.error(e); setDraft("Failed to generate draft."); }
    finally { setDraftLoading(false); }
  }

  function copyDraft() {
    navigator.clipboard.writeText(draft || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
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

function DistributorModal({ thread, onSave, onClose }) {
  const [company, setCompany] = useState("");
  const [name, setName]       = useState(thread?.customer || "");
  const [email, setEmail]     = useState(thread?.customerEmail || "");
  const [region, setRegion]   = useState("");

  function handleSave() {
    if (!email.trim()) return;
    onSave(email.trim(), name.trim() || email.trim(), company.trim(), region);
  }

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>🏢 Flag as Distributor</h2>
            <p style={{fontSize:12,color:"var(--text-secondary)",margin:"2px 0 0"}}>Future emails from this sender will be tagged as Distributor</p>
          </div>
          <button onClick={onClose} className={styles.modalClose}>×</button>
        </div>
        <div className={styles.modalBody} style={{display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <p className={styles.detailLabel} style={{marginBottom:4}}>Contact name</p>
            <input className={styles.searchInput} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Steve Stevenson" style={{width:"100%"}}/>
          </div>
          <div>
            <p className={styles.detailLabel} style={{marginBottom:4}}>Email address</p>
            <input className={styles.searchInput} value={email} onChange={e=>setEmail(e.target.value)} placeholder="e.g. steve@simplytechnologies.xyz" style={{width:"100%"}}/>
          </div>
          <div>
            <p className={styles.detailLabel} style={{marginBottom:4}}>Company name</p>
            <input className={styles.searchInput} value={company} onChange={e=>setCompany(e.target.value)} placeholder="e.g. Simply Technologies" style={{width:"100%"}}/>
          </div>
          <div>
            <p className={styles.detailLabel} style={{marginBottom:4}}>Region</p>
            <select className={styles.select} style={{width:"100%"}} value={region} onChange={e=>setRegion(e.target.value)}>
              <option value="">Select region (optional)</option>
              {REGIONS.map(r=><option key={r} value={r}>{REGION_FLAGS[r]} {r}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:4}}>
            <button className={styles.btn} onClick={onClose}>Cancel</button>
            <button className={styles.btn} style={{background:"#FEF3E2",color:"#935A00",borderColor:"#935A00"}} onClick={handleSave} disabled={!email.trim()}>
              🏢 Save distributor
            </button>
          </div>
        </div>
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
  const [filterRegion, setFilterRegion]   = useState("");
  const [filterDistributor, setFilterDistributor] = useState(false);
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
  const [showFilters, setShowFilters]     = useState(false);
  const [filterRules, setFilterRules]     = useState([]);
  const [newRuleType, setNewRuleType]     = useState("sender");
  const [newRuleValue, setNewRuleValue]   = useState("");
  const [savingRule, setSavingRule]       = useState(false);
  const [customerHistory, setCustomerHistory] = useState(null);
  const [histPageToken, setHistPageToken]     = useState(null);
  const [bulkRunning, setBulkRunning]         = useState(false);
  const [bulkProgress, setBulkProgress]       = useState(null); // { loaded, total, saved }
  const [bulkDone, setBulkDone]               = useState(false);
  const [importPageToken, setImportPageToken] = useState(null); // persisted across sessions
  const [migrationDone, setMigrationDone]     = useState(false);
  const [isNewAccount, setIsNewAccount]       = useState(false);
  const [distributors, setDistributors]       = useState([]);
  const [showDistModal, setShowDistModal]     = useState(false);
  const [distThread, setDistThread]           = useState(null); // thread being flagged
  const [newAccountBanner, setNewAccountBanner] = useState(false);
  const [selectedIds, setSelectedIds]         = useState(new Set());
  const [bulkUpdating, setBulkUpdating]       = useState(false);
  const [savedLoading, setSavedLoading]       = useState(false);
  const [savedTotal, setSavedTotal]           = useState(0);
  const [histTotal, setHistTotal]             = useState(null);
  const [histLoading, setHistLoading]         = useState(false);
  const [histAnalyzing, setHistAnalyzing]     = useState(false);
  const [showHistorical, setShowHistorical]   = useState(false);
  const [historicalIds, setHistoricalIds]     = useState(new Set());
  const syncTimer = useRef(null);
  const PAGE_SIZE = 10;

  // If token refresh failed, force re-login
  useEffect(() => {
    if (session?.error === "RefreshTokenError") {
      signIn("google");
    }
  }, [session]);

  useEffect(() => {
    if (!session || session.error) return;
    fetch("/api/overrides").then(r=>r.json()).then(d=>{ if(d.overrides) setOverrides(d.overrides); }).catch(console.error);
    fetch("/api/sheet-sync", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"info" }) })
      .then(r=>r.json()).then(d=>setSheetInfo(d)).catch(console.error);
    fetch("/api/spam-senders").then(r=>r.json()).then(d=>{ if(d.senders) setSpamSenders(Array.isArray(d.senders)?d.senders:[]); }).catch(console.error);
    fetch("/api/distributors").then(r=>r.json()).then(d=>{ if(d.distributors) setDistributors(Array.isArray(d.distributors)?d.distributors:[]); }).catch(console.error);
    fetch("/api/filter-rules").then(r=>r.json()).then(d=>{ if(d.rules) setFilterRules(Array.isArray(d.rules)?d.rules:[]); }).catch(console.error);
    // Check if model migration has already been run
    fetch("/api/check-migration").then(r=>r.json()).then(d=>{ if(d.done) setMigrationDone(true); }).catch(console.error);

    // Load saved import progress for this account
    fetch("/api/import-progress").then(r=>r.json()).then(d=>{
      if (d.progress?.pageToken) {
        setImportPageToken(d.progress.pageToken);
        setBulkProgress({ loaded: d.progress.processed || 0, saved: d.progress.saved || 0, total: d.progress.total || 0 });
      }
    }).catch(console.error);

    // Check if this Google account has been seen before
    fetch("/api/account-seen").then(r=>r.json()).then(d=>{
      if (!d.seen) {
        // First time this account has signed in — show banner
        setIsNewAccount(true);
        setNewAccountBanner(true);
        // Mark as seen
        fetch("/api/account-seen", { method:"POST" }).catch(console.error);
      }
    }).catch(console.error);
  }, [session]);

  const analyzeThreads = useCallback(async (rawThreads) => {
    if (!rawThreads.length) return rawThreads;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ threads: rawThreads }) });
      const data = await res.json();
      const map = {};
      (data.results||[]).forEach(r=>{ map[r.id]=r; });

      // Only keep real support inquiries
      const MODEL_NORM = {
        "i2r-4":"B.22","i2r 4":"B.22","i2r4":"B.22","i2R-4":"B.22","i2R 4":"B.22","i2R4":"B.22",
        "i2r-6":"B.23","i2r 6":"B.23","i2r6":"B.23","i2R-6":"B.23","i2R 6":"B.23","i2R6":"B.23",
        "i2r-8":"B.24","i2r 8":"B.24","i2r8":"B.24","i2R-8":"B.24","i2R 8":"B.24","i2R8":"B.24",
        "i2R8S":"B.24","i2R 8S":"B.24","i2R-8S":"B.24","B24":"B.24","b24":"B.24","b22":"B.22","b23":"B.23",
      };
      const normalizeM = m => m ? (MODEL_NORM[m] || MODEL_NORM[m.toLowerCase()] || m) : null;

      const passing = rawThreads
        .filter(t => !map[t.id]?.isSpam)
        .map(t => ({
          ...t,
          ...map[t.id],
          machineModel: normalizeM(map[t.id]?.machineModel || t.machineModel || null),
        }));

      // Auto-save passing threads to Upstash + Sheet (fire and forget - don't block UI)
      if (passing.length > 0) {
        fetch("/api/save-threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threads: passing }),
        }).catch(e => console.error("Auto-save error:", e));
      }

      return passing;
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
        // Always merge — never wipe saved threads loaded from Upstash
        setThreads(prev => {
          const existing = new Set(prev.map(t=>t.id));
          const fresh = analyzed.filter(t=>!existing.has(t.id));
          return token ? [...prev,...analyzed] : [...fresh,...prev];
        });
      }
      setNextPageToken(data.nextPageToken||null);
      setLastSync(new Date());
    } catch(e) { console.error(e); }
    finally { if (isSync) setSyncing(false); else setLoading(false); }
  }, [analyzeThreads]);

  useEffect(() => {
    if (!session || session.error) return;

    // Step 1: Load shared database from Upstash instantly
    setSavedLoading(true);
    fetch("/api/saved-threads")
      .then(r => r.json())
      .then(data => {
        if (data.threads?.length) {
          setThreads(data.threads);
          setSavedTotal(data.total || 0);
        }
      })
      .catch(e => console.error("Load saved error:", e))
      .finally(() => setSavedLoading(false));

    // Step 2: Fetch last 3 months from this account's Gmail
    // New threads get auto-saved to shared database via save-threads API
    fetchThreads(null, false);

    // Step 3: After 10 seconds, reload from Upstash to show newly saved threads
    const reloadTimer = setTimeout(() => {
      fetch("/api/saved-threads")
        .then(r => r.json())
        .then(data => {
          if (data.threads?.length) {
            setThreads(data.threads);
            setSavedTotal(data.total || 0);
          }
        })
        .catch(e => console.error("Delayed reload error:", e));
    }, 10000);

    return () => clearTimeout(reloadTimer);
  }, [session]);
  useEffect(() => {
    if (!session) return;
    syncTimer.current = setInterval(()=>fetchThreads(null,true), 2*60*1000);
    return ()=>clearInterval(syncTimer.current);
  }, [session, fetchThreads]);

  async function setOverride(id, field, value) {
    // If marking as Resolved, also remove the no-reply flag
    const extraUpdates = {};
    if (field === "status" && value === "Resolved") {
      const thread = threads.find(t => t.id === id);
      const currentFlags = thread?.flags || [];
      if (currentFlags.includes("no-reply")) {
        extraUpdates.flags = currentFlags.filter(f => f !== "no-reply");
      }
    }
    setOverrides(prev => ({ ...prev, [id]: { ...prev[id], [field]: value, ...extraUpdates, updatedAt: new Date().toISOString(), updatedBy: session.user?.email } }));
    // Also update the thread flags in local state
    if (extraUpdates.flags) {
      setThreads(prev => prev.map(t => t.id === id ? { ...t, flags: extraUpdates.flags } : t));
    }
    setSavingId(id);
    try {
      // Save status/category/flags override
      let kvRes = await fetch("/api/overrides", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ id, field, value, ...extraUpdates }),
      });
      if (!kvRes.ok) {
        await new Promise(r=>setTimeout(r,600));
        kvRes = await fetch("/api/overrides", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ id, field, value, ...extraUpdates }),
        });
      }
      const kvData = kvRes.ok ? ((await kvRes.json())?.override||{}) : {};

      // Also update the saved thread record in Upstash so it persists on reload
      try {
        await fetch("/api/update-thread", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ id, updates: { [field]: value, ...extraUpdates } }),
        });
      } catch(e) { console.error("Thread update error:", e); }

      // Auto-add to knowledge base when marking Resolved
      if (field === "status" && value === "Resolved") {
        const thread = threads.find(t => t.id === id);
        if (thread?.summary && thread?.resolution && thread.resolution !== "Unresolved — no reply sent yet.") {
          fetch("/api/knowledge", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({
              threadId: id,
              problem: thread.summary,
              solution: thread.resolution,
              category: overrides[id]?.category || thread.category,
              machineModel: overrides[id]?.machineModel || thread.machineModel,
              customer: thread.customer,
              date: thread.date,
            }),
          }).catch(e => console.error("KB add error:", e));
        }
      }
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

  async function loadHistorical() {
    setHistLoading(true);
    try {
      const allIds = [...new Set([...threads.map(t => t.id), ...historicalIds])];
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageToken: histPageToken, existingIds: allIds }),
      });
      const data = await res.json();
      if (data.error) { console.error(data.error); return; }

      const newThreads = data.threads || [];
      setHistTotal(data.totalEstimate || null);
      setHistPageToken(data.nextPageToken || null);

      if (!newThreads.length) return;

      // AI analyze the historical batch
      setHistAnalyzing(true);
      try {
        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threads: newThreads }),
        });
        const analyzeData = await analyzeRes.json();
        const map = {};
        (analyzeData.results || []).forEach(r => { map[r.id] = r; });
        const analyzed = newThreads
          .filter(t => !map[t.id]?.isSpam)
          .map(t => ({ ...t, ...map[t.id], machineModel: map[t.id]?.machineModel || t.machineModel || null }));

        // Auto-save historical passing threads too
        if (analyzed.length > 0) {
          fetch("/api/save-threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ threads: analyzed }),
          }).catch(e => console.error("Historical auto-save error:", e));
        }

        setThreads(prev => {
          const existing = new Set(prev.map(t => t.id));
          const fresh = analyzed.filter(t => !existing.has(t.id));
          return [...prev, ...fresh];
        });
        setHistoricalIds(prev => {
          const next = new Set(prev);
          newThreads.forEach(t => next.add(t.id));
          return next;
        });
      } finally { setHistAnalyzing(false); }
    } catch(e) { console.error("History load error:", e); }
    finally { setHistLoading(false); }
  }

  const bulkStopRef = useRef(false);

  async function startBulkImport(token = null) {
    bulkStopRef.current = false;
    setBulkRunning(true);
    setBulkDone(false);

    let pageToken = token ?? importPageToken ?? null;
    let totalLoaded  = bulkProgress?.loaded  || 0;
    let totalSaved   = bulkProgress?.saved   || 0;
    let totalFetched = bulkProgress?.fetched || 0;
    let grandTotal   = bulkProgress?.total   || 0;

    while (true) {
      if (bulkStopRef.current) break;

      let data;
      try {
        const res = await fetch("/api/bulk-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageToken }),
        });
        data = await res.json();
      } catch(e) {
        console.error("Bulk import fetch error:", e);
        // Save progress and stop
        if (pageToken) {
          fetch("/api/import-progress", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ pageToken, processed: totalLoaded, saved: totalSaved, total: grandTotal }) }).catch(()=>{});
        }
        break;
      }

      if (data.error) {
        console.error("Bulk import API error:", data.error);
        break;
      }

      totalLoaded  += data.processed || 0;
      totalSaved   += data.saved     || 0;
      totalFetched += data.fetched   || 0;
      grandTotal    = data.totalEstimate || grandTotal;

      // Update progress UI
      setBulkProgress({ loaded: totalLoaded, saved: totalSaved, fetched: totalFetched, total: grandTotal });

      // Merge new threads into dashboard
      if (data.threads?.length) {
        setThreads(prev => {
          const existing = new Set(prev.map(t => t.id));
          const fresh = data.threads.filter(t => !existing.has(t.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      }

      if (!data.nextPageToken) {
        // All done
        setImportPageToken(null);
        fetch("/api/import-progress", { method:"DELETE" }).catch(()=>{});
        setBulkDone(true);
        // Reload full dataset
        try {
          const r2 = await fetch("/api/saved-threads");
          const d2 = await r2.json();
          if (d2.threads?.length) { setThreads(d2.threads); setSavedTotal(d2.total || 0); }
        } catch(e) { console.error("Reload error:", e); }
        break;
      }

      // More pages — save progress and continue
      pageToken = data.nextPageToken;
      setImportPageToken(pageToken);
      fetch("/api/import-progress", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ pageToken, processed: totalLoaded, saved: totalSaved, fetched: totalFetched, total: grandTotal }),
      }).catch(()=>{});

      // Yield to React for re-render before next batch
      await new Promise(r => setTimeout(r, 100));
    }

    setBulkRunning(false);
  }

  // Mark Unrelated — removes from dashboard, Upstash, and Sheet immediately
  async function flagNotOurService(threadId) {
    setThreads(prev => prev.filter(t => t.id !== threadId));
    setExpandedId(null);
    setSpamToast("Marked as Unrelated — removed from dashboard, database, and sheet.");
    setTimeout(() => setSpamToast(null), 4000);
    try {
      await fetch("/api/flag-not-service", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ threadId, action: "remove" }),
      });
    } catch(e) { console.error("Remove thread error:", e); }
  }

  async function reloadFromSaved() {
    setSavedLoading(true);
    try {
      const res = await fetch("/api/saved-threads");
      const data = await res.json();
      if (data.threads?.length) {
        setThreads(data.threads);
        setSavedTotal(data.total || 0);
        setSpamToast(`✓ Reloaded ${data.total} threads from database.`);
        setTimeout(() => setSpamToast(null), 3000);
      }
    } catch(e) { console.error(e); }
    finally { setSavedLoading(false); }
  }

  async function migrateModels() {
    setSpamToast("Migrating model tags…");
    try {
      const res = await fetch("/api/migrate-models", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        // Update local thread state with new model tags
        setThreads(prev => prev.map(t => {
          const migrations = {
            "i2R-4":"B.22","i2r-4":"B.22","i2R 4":"B.22","i2r4":"B.22","i2R4":"B.22",
            "i2R-6":"B.23","i2r-6":"B.23","i2R 6":"B.23","i2r6":"B.23","i2R6":"B.23",
            "i2R-8":"B.24","i2r-8":"B.24","i2R 8":"B.24","i2r8":"B.24","i2R8":"B.24",
            "i2R8S":"B.24","i2R 8S":"B.24","i2R-8S":"B.24","B24":"B.24","b24":"B.24",
          };
          const newModel = migrations[t.machineModel];
          return newModel ? { ...t, machineModel: newModel } : t;
        }));
        setSpamToast(`✓ Updated ${data.updated} thread model tags.`);
        setTimeout(() => setSpamToast(null), 4000);
        setMigrationDone(true);
      }
    } catch(e) {
      console.error(e);
      setSpamToast("Migration failed — check console.");
      setTimeout(() => setSpamToast(null), 4000);
    }
  }

  async function clearSavedData() {
    if (!window.confirm("This will clear all saved thread data from the database so you can re-import with better spam filtering. Continue?")) return;
    try {
      const res = await fetch("/api/clear-saved", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setThreads([]);
        setSavedTotal(0);
        setBulkProgress(null);
        setBulkDone(false);
        setSpamToast(`Cleared ${data.deleted} saved threads. Ready for fresh import.`);
        setTimeout(() => setSpamToast(null), 5000);
      }
    } catch(e) { console.error(e); }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === pageRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pageRows.map(r => r.id)));
    }
  }

  function selectAllFiltered() {
    setSelectedIds(new Set(filtered.map(r => r.id)));
  }

  async function bulkSetStatus(status) {
    if (!selectedIds.size) return;
    setBulkUpdating(true);
    const ids = [...selectedIds];
    try {
      for (const id of ids) {
        const thread = threads.find(t => t.id === id);
        const currentFlags = thread?.flags || [];
        const extraUpdates = status === "Resolved" && currentFlags.includes("no-reply")
          ? { flags: currentFlags.filter(f => f !== "no-reply") }
          : {};

        // Update local state
        setOverrides(prev => ({ ...prev, [id]: { ...prev[id], status, ...extraUpdates, updatedAt: new Date().toISOString(), updatedBy: session.user?.email } }));
        if (extraUpdates.flags) {
          setThreads(prev => prev.map(t => t.id === id ? { ...t, flags: extraUpdates.flags } : t));
        }

        // Save to Upstash
        await fetch("/api/overrides", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ id, field:"status", value: status, ...extraUpdates }) });
        await fetch("/api/update-thread", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ id, updates: { status, ...extraUpdates } }) });

        // Auto-add to KB if marking Resolved
        if (status === "Resolved") {
          const thread = threads.find(t => t.id === id);
          if (thread?.summary && thread?.resolution && thread.resolution !== "Unresolved — no reply sent yet.") {
            fetch("/api/knowledge", {
              method:"POST", headers:{"Content-Type":"application/json"},
              body: JSON.stringify({ threadId: id, problem: thread.summary, solution: thread.resolution, category: overrides[id]?.category || thread.category, machineModel: overrides[id]?.machineModel || thread.machineModel, customer: thread.customer, date: thread.date }),
            }).catch(() => {});
          }
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
      }
      setSelectedIds(new Set());
      setSpamToast(`✓ ${ids.length} thread${ids.length > 1 ? "s" : ""} marked as ${status}.`);
      setTimeout(() => setSpamToast(null), 3000);
    } catch(e) { console.error("Bulk update error:", e); }
    finally { setBulkUpdating(false); }
  }

  // Tag distributor — opens modal to enter company name
  function openDistributorModal(thread) {
    setDistThread(thread);
    setShowDistModal(true);
  }

  async function saveDistributor(email, name, company, region) {
    try {
      const res = await fetch("/api/distributors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, company, region }),
      });
      const data = await res.json();
      if (data.distributors) setDistributors(data.distributors);
      // Threads keep their real category — isDistributor flag is computed in allRows
      setSpamToast(`✓ ${name}${company ? " ("+company+")" : ""} flagged as distributor.`);
      setTimeout(() => setSpamToast(null), 4000);
    } catch(e) { console.error(e); }
    setShowDistModal(false);
    setDistThread(null);
  }

  async function removeDistributor(email) {
    try {
      const res = await fetch("/api/distributors", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.distributors) setDistributors(data.distributors);
    } catch(e) { console.error(e); }
  }

  async function addFilterRule() {
    if (!newRuleValue.trim()) return;
    setSavingRule(true);
    try {
      const res = await fetch("/api/filter-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: newRuleType, value: newRuleValue.trim() }) });
      const d = await res.json();
      if (d.rules) { setFilterRules(d.rules); setNewRuleValue(""); }
    } catch(e) { console.error(e); }
    finally { setSavingRule(false); }
  }

  async function deleteFilterRule(id) {
    try {
      const res = await fetch("/api/filter-rules", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const d = await res.json();
      if (d.rules) setFilterRules(d.rules);
    } catch(e) { console.error(e); }
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

  // Build distributor lookup map: email -> distributor entry
  const distMap = {};
  distributors.forEach(d => { distMap[d.email.toLowerCase()] = d; });

  const allRows = threads
    .filter(t=>!Array.isArray(spamSenders)||!spamSenders.includes(t.customer))
    .map(t=>{
      const distEntry = t.customerEmail ? distMap[t.customerEmail.toLowerCase()] : null;
      return {
        ...t,
        status:          overrides[t.id]?.status       || t.status,
        category:        overrides[t.id]?.category     || t.category,
        machineModel:    overrides[t.id]?.machineModel !== undefined ? overrides[t.id]?.machineModel : t.machineModel,
        isDistributor:   !!distEntry,
        distributorCompany: distEntry?.company || null,
        distributorRegion:  distEntry?.region  || null,
        region:          t.region || distEntry?.region || null,
      };
    });

  const filtered = allRows.filter(r=>{
    const q = search.toLowerCase();
    return (!q || r.customer?.toLowerCase().includes(q)||r.snippet?.toLowerCase().includes(q)||r.subject?.toLowerCase().includes(q)||r.summary?.toLowerCase().includes(q)||r.machineModel?.toLowerCase().includes(q))
      && (!filterCat    || r.category===filterCat)
      && (!filterStatus || r.status===filterStatus)
      && (!filterFlag   || (r.flags||[]).includes(filterFlag))
      && (!filterModel  || r.machineModel===filterModel)
      && (!filterRegion || r.region===filterRegion)
      && (!filterDistributor || r.isDistributor===true);
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
      {showDistModal && distThread && <DistributorModal thread={distThread} onSave={saveDistributor} onClose={()=>{setShowDistModal(false);setDistThread(null);}} />}

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}>📬</span>
          <span className={styles.headerTitle}>Support Tracker</span>
          {savedLoading  && <span className={styles.syncPill}>📂 Loading saved threads…</span>}
          {savedTotal > 0 && !savedLoading && <span style={{fontSize:12,color:"var(--text-secondary)"}}>📂 {savedTotal} saved</span>}
          {analyzing    && <span className={styles.aiPill}>🤖 AI analyzing…</span>}
          {syncing      && <span className={styles.syncPill}>↻ Syncing…</span>}
          {sheetSyncing && <span className={styles.syncPill}>📊 Updating sheet…</span>}
          {savingId     && <span className={styles.syncPill}>💾 Saving…</span>}
          {analyzing    && <span className={styles.syncPill} style={{background:"#E1F5EE",color:"#0F6E56"}}>✓ Auto-saving to sheet</span>}
          {newCount>0   && <button className={styles.newBadge} onClick={()=>{setNewCount(0);setPage(0);}}>{newCount} new thread{newCount>1?"s":""} — click to view</button>}
        </div>
        <div className={styles.headerRight}>
          {spamSenders.length>0 && <button className={styles.spamListBtn} onClick={()=>setShowSpamList(v=>!v)}>🚫 {spamSenders.length} blocked</button>}
          <a href="/distributors" style={{fontSize:12,color:"var(--text-secondary)",textDecoration:"none",padding:"4px 10px",border:"0.5px solid var(--border)",borderRadius:6}}>🏢 Distributors</a>
          <a href="/knowledge" style={{fontSize:12,color:"var(--text-secondary)",textDecoration:"none",padding:"4px 10px",border:"0.5px solid var(--border)",borderRadius:6}} title="Knowledge Base">📚 KB</a>
          <button className={styles.spamListBtn} onClick={()=>setShowFilters(v=>!v)}>⚙️ Filters {filterRules.length>0?`(${filterRules.length})`:""}</button>
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

      {showFilters && (
        <div className={styles.spamPanel}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div>
              <p className={styles.spamPanelTitle} style={{color:"var(--text-primary)"}}>⚙️ Email Filter Rules</p>
              <p style={{fontSize:11,color:"var(--text-secondary)",marginTop:2}}>Emails matching these rules are excluded before reaching the dashboard. Changes apply on next refresh.</p>
            </div>
            <button onClick={()=>setShowFilters(false)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-secondary)",fontSize:18}}>×</button>
          </div>

          {/* Add new rule */}
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            <select className={styles.select} value={newRuleType} onChange={e=>setNewRuleType(e.target.value)}>
              <option value="sender">Sender email/name</option>
              <option value="domain">Domain (e.g. shopify.com)</option>
              <option value="keyword">Subject keyword</option>
            </select>
            <input className={styles.searchInput} style={{maxWidth:280}} placeholder={newRuleType==="sender"?"e.g. johnny@hellorep.ai":newRuleType==="domain"?"e.g. quickbooks.com":"e.g. QuickBooks Connector"} value={newRuleValue} onChange={e=>setNewRuleValue(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addFilterRule();}}/>
            <button className={styles.btn} onClick={addFilterRule} disabled={savingRule||!newRuleValue.trim()}>{savingRule?"Adding…":"Add rule"}</button>
          </div>

          {/* Built-in rules info */}
          <div style={{marginBottom:12,padding:"8px 12px",background:"var(--bg-secondary)",borderRadius:8,fontSize:12,color:"var(--text-secondary)"}}>
            <strong>Built-in exclusions (always active):</strong> QuickBooks, Shopify notifications, no-reply addresses, HelloRep, Klaviyo, Mailchimp, shipping carriers, PayPal, Stripe
          </div>

          {/* Custom rules list */}
          {filterRules.length===0 ? (
            <p style={{fontSize:12,color:"var(--text-secondary)"}}>No custom rules yet — add one above.</p>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {filterRules.map(rule=>(
                <div key={rule.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--bg)",border:"0.5px solid var(--border)",borderRadius:8,padding:"7px 12px"}}>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:11,background:"var(--bg-secondary)",padding:"2px 8px",borderRadius:20,color:"var(--text-secondary)",textTransform:"capitalize"}}>{rule.type}</span>
                    <span style={{fontSize:13,fontWeight:500}}>{rule.value}</span>
                  </div>
                  <button onClick={()=>deleteFilterRule(rule.id)} style={{fontSize:12,color:"var(--text-secondary)",background:"none",border:"none",cursor:"pointer",padding:"2px 6px"}}>Remove</button>
                </div>
              ))}
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
                {sheetInfo.url
                  ? <a href={sheetInfo.url} target="_blank" rel="noreferrer" className={styles.sheetsLink}>Open Sheet ↗</a>
                  : <span style={{fontSize:12,color:"#0F6E56"}}>Sheet active (URL not stored — recreate to get link)</span>
                }
                <span style={{fontSize:11,color:"var(--text-secondary)"}}>by {sheetInfo.createdBy}</span>
                <button className={styles.btn} style={{fontSize:11,padding:"3px 8px"}} onClick={createSharedSheet} disabled={sheetCreating}>
                  {sheetCreating ? "Recreating…" : "↺ Recreate"}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.sheetSetup}>
              <div><span>📊 No shared sheet yet.</span>{sheetError&&<p style={{color:"#C0392B",fontSize:12,marginTop:4}}>⚠️ {sheetError}</p>}</div>
              <button className={styles.btn} onClick={createSharedSheet} disabled={sheetCreating||allRows.length===0}>{sheetCreating?"Creating… (10–15 sec)":"Create shared sheet"}</button>
            </div>
          )}
        </div>

        {/* New account banner */}
        {newAccountBanner && (
          <div className={styles.newAccountBanner}>
            <div>
              <p style={{fontSize:13,fontWeight:500,margin:"0 0 3px"}}>👋 Welcome! This is your first time signing in with {session.user?.email}</p>
              <p style={{fontSize:12,color:"var(--text-secondary)",margin:0}}>
                Your current inbox is loading automatically. To also import your past 2 years of emails, click Bulk Import below.
                All existing team data is already visible above.
              </p>
            </div>
            <button className={styles.btn} onClick={()=>setNewAccountBanner(false)} style={{flexShrink:0}}>Dismiss</button>
          </div>
        )}

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
              const seriesModels = MACHINE_MODELS.filter(m => m.startsWith(series + ".") || m.startsWith(series + "+"));
              return seriesModels.length > 0 ? (
                <optgroup key={series} label={`${series} Series`}>
                  {seriesModels.map(m => <option key={m} value={m}>{formatModelLabel(m)}</option>)}
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
          <select className={styles.select} value={filterRegion} onChange={e=>{setFilterRegion(e.target.value);setPage(0);}}>
            <option value="">All regions</option>
            {REGIONS.map(r=><option key={r} value={r}>{REGION_FLAGS[r]} {r}</option>)}
          </select>
          <button
            className={styles.btn}
            style={filterDistributor ? {background:"#FEF3E2",color:"#935A00",borderColor:"#935A00"} : {}}
            onClick={()=>{setFilterDistributor(v=>!v);setPage(0);}}
            title="Show only distributor threads"
          >
            🏢 {filterDistributor ? "Distributors only" : "All senders"}
          </button>
        </div>

        {/* Export bar */}
        <div className={styles.exportBar}>
          <span style={{fontSize:13,color:"var(--text-secondary)"}}>Export {allRows.length} threads:</span>
          <button className={styles.btn} onClick={()=>exportCSV(allRows)}>↓ CSV</button>
          <button className={styles.btn} onClick={()=>generatePDF(allRows)}>↓ PDF</button>
          {nextPageToken&&<button className={styles.btn} onClick={()=>fetchThreads(nextPageToken)} disabled={loading} style={{marginLeft:"auto"}}>{loading?"Loading…":"Load more emails"}</button>}
        </div>

        {/* Bulk import banner */}
        <div className={styles.histBanner}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",flex:1}}>
            <span style={{fontSize:13}}>📂 <strong>Bulk historical import</strong> — importing from <strong>{session.user?.email}</strong></span>
            {bulkProgress && !bulkDone && (
              <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:12,color:"var(--text-secondary)"}}>
                  📥 <strong>{bulkProgress.fetched||0}</strong> fetched
                </span>
                <span style={{fontSize:12,color:"var(--text-secondary)"}}>
                  🔍 <strong>{bulkProgress.loaded||0}</strong> passed filter
                </span>
                <span style={{fontSize:12,fontWeight:500,color:"#1D9E75"}}>
                  💾 <strong>{bulkProgress.saved||0}</strong> saved
                </span>
                {bulkProgress.total>0 && (
                  <span style={{fontSize:12,color:"var(--text-secondary)"}}>
                    ~{bulkProgress.total.toLocaleString()} total emails
                  </span>
                )}
              </div>
            )}
            {bulkDone && (
              <span style={{fontSize:12,color:"#1D9E75",fontWeight:500}}>
                ✓ Complete — {bulkProgress?.saved || 0} threads saved to database
              </span>
            )}
            {importPageToken && !bulkRunning && !bulkDone && (
              <span style={{fontSize:12,color:"#185FA5"}}>
                ⏸ Paused · {bulkProgress?.saved || 0} saved so far
              </span>
            )}
            {bulkRunning && <span className={styles.aiPill} style={{fontSize:11}}>🤖 Importing &amp; analyzing…</span>}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {bulkRunning
              ? <button className={styles.btn} onClick={()=>{ bulkStopRef.current = true; setBulkRunning(false); }}>⏸ Pause</button>
              : bulkDone
              ? <span style={{fontSize:12,color:"#1D9E75",fontWeight:500}}>✓ Import complete</span>
              : importPageToken
              ? (
                  <button className={styles.btn} style={{background:"#E1F5EE",color:"#0F6E56",borderColor:"#0F6E56"}} onClick={()=>startBulkImport()}>
                    ▶ Resume import
                  </button>
                )
              : (
                  <button className={styles.btn} onClick={()=>startBulkImport()}>
                    Start bulk import
                  </button>
                )
            }
            {!bulkRunning && (
              <>
                <button className={styles.btn} onClick={reloadFromSaved} disabled={savedLoading} title="Reload all threads from database">
                  {savedLoading ? "Loading…" : "↺ Reload"}
                </button>
                {savedTotal > 0 && !migrationDone && (
                  <button className={styles.btn} onClick={migrateModels} title="Fix old i2R 4/6/8 tags to B.22/B.23/B.24">
                    🔧 Fix model tags
                  </button>
                )}
                {savedTotal > 0 && (
                  <button className={styles.btn} style={{color:"#993C1D",borderColor:"#993C1D"}} onClick={clearSavedData}>
                    🗑 Clear &amp; re-import
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Bulk action bar — shows when threads are selected */}
        {selectedIds.size > 0 ? (
          <div className={styles.bulkBar}>
            <span style={{fontSize:13,fontWeight:500}}>{selectedIds.size} thread{selectedIds.size>1?"s":""} selected</span>
            {filtered.length > pageRows.length && selectedIds.size === pageRows.length && (
              <button className={styles.btn} style={{fontSize:12}} onClick={selectAllFiltered}>
                Select all {filtered.length} filtered threads
              </button>
            )}
            <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
              <button className={styles.btn} style={{background:"#EAF3DE",color:"#3B6D11",borderColor:"#3B6D11"}} onClick={()=>bulkSetStatus("Resolved")} disabled={bulkUpdating}>
                {bulkUpdating?"Saving…":"✓ Mark Resolved"}
              </button>
              <button className={styles.btn} style={{background:"#E6F1FB",color:"#185FA5",borderColor:"#185FA5"}} onClick={()=>bulkSetStatus("Pending")} disabled={bulkUpdating}>
                Mark Pending
              </button>
              <button className={styles.btn} style={{background:"#FAEEDA",color:"#854F0B",borderColor:"#854F0B"}} onClick={()=>bulkSetStatus("Open")} disabled={bulkUpdating}>
                Mark Open
              </button>
              <button className={styles.btn} onClick={()=>setSelectedIds(new Set())}>✕ Deselect</button>
            </div>
          </div>
        ) : null}

        {/* Table */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{width:36,textAlign:"center"}}>
                  <input
                    type="checkbox"
                    checked={pageRows.length > 0 && pageRows.every(r => selectedIds.has(r.id))}
                    onChange={toggleSelectAll}
                    title="Select all on this page"
                    style={{cursor:"pointer"}}
                  />
                </th>
                <th style={{width:85}}>Date</th>
                <th style={{width:130}}>Customer</th>
                <th>Subject &amp; AI summary</th>
                <th style={{width:130}}>Model</th>
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
                    <td style={{textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={()=>toggleSelect(r.id)}
                        style={{cursor:"pointer"}}
                      />
                    </td>
                    <td style={{color:"var(--text-secondary)",fontSize:12}}>{r.date||"—"}</td>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <button className={styles.customerLink} onClick={e=>{e.stopPropagation();setCustomerHistory(r.customer);}} title="View customer history">
                          {r.customer}
                        </button>
                        {r.region && REGION_FLAGS[r.region] && <span title={r.region} style={{fontSize:14}}>{REGION_FLAGS[r.region]}</span>}
                      </div>
                      {!r.hasSent && r.hoursWaiting>24 && <div style={{marginTop:3}}><TimeChip hours={r.hoursWaiting}/></div>}
                    </td>
                    <td>
                      <div style={{fontWeight:500,fontSize:13,marginBottom:2,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        {r.subject}
                        {r.isHistorical && <span style={{fontSize:10,background:"var(--bg-secondary)",color:"var(--text-secondary)",padding:"1px 6px",borderRadius:20,fontWeight:400,flexShrink:0}}>archived</span>}
                      </div>
                      {r.summary
                        ?<div style={{color:"var(--text-secondary)",fontSize:12,lineHeight:1.4}}>🤖 {r.summary}</div>
                        :<div style={{color:"var(--text-secondary)",fontSize:12}}>{r.snippet?.slice(0,100)}…</div>}
                    </td>
                    <td>
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        {r.machineModel ? <ModelTag model={r.machineModel}/> : <span style={{color:"var(--text-secondary)",fontSize:12}}>—</span>}
                        {r.distributorCompany && <span style={{fontSize:10,background:"#FEF3E2",color:"#935A00",padding:"1px 6px",borderRadius:20,fontWeight:500}}>🏢 {r.distributorCompany}</span>}
                      </div>
                    </td>
                    <td>
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        <Badge label={r.category||"Other"} colorMap={CAT_BG}/>
                        {r.isDistributor && (
                          <span style={{fontSize:10,background:"#FEF3E2",color:"#935A00",padding:"1px 7px",borderRadius:20,fontWeight:500,whiteSpace:"nowrap"}}>
                            🏢 {r.distributorCompany||"Distributor"}
                          </span>
                        )}
                      </div>
                    </td>
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
                        <ThreadDetail r={r} overrides={overrides} savingId={savingId} sheetInfo={sheetInfo} threads={threads} session={session} onOverride={setOverride} onBlock={flagSenderAsSpam} onFlagNotService={flagNotOurService} onFlagDistributor={openDistributorModal} distributors={distributors} spamSenders={spamSenders} modelSeries={MODEL_SERIES} allModels={MACHINE_MODELS}/>
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
