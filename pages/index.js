import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import styles from "../styles/Home.module.css";

const CATEGORIES = ["Software", "Hardware", "Setup", "Connectivity", "Contact request", "Other"];
const STATUSES = ["Open", "Pending", "Resolved"];
const FLAG_LABELS = {
  "no-reply": { label: "No reply", emoji: "🔴" },
  urgent:     { label: "Urgent",   emoji: "⚠️" },
  repeat:     { label: "Repeat",   emoji: "🔁" },
};
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

function generatePDF(threads) {
  const date = new Date().toLocaleDateString();
  const rows = threads.map(t => `<tr>
    <td>${t.date||"—"}</td><td>${t.customer||"—"}</td><td>${t.subject||"—"}</td>
    <td>${t.category||"—"}</td><td>${t.status||"—"}</td>
    <td>${(t.flags||[]).map(f=>FLAG_LABELS[f]?.emoji+" "+FLAG_LABELS[f]?.label).join(", ")||"—"}</td>
    <td>${t.summary||"—"}</td><td>${t.resolution||"—"}</td>
  </tr>`).join("");
  const html = `<!DOCTYPE html><html><head><title>Support Tracker — ${date}</title>
  <style>body{font-family:sans-serif;font-size:12px;padding:2rem}h1{font-size:18px;margin-bottom:4px}
  p{color:#666;margin-bottom:1.5rem}table{width:100%;border-collapse:collapse}
  th{background:#f5f5f3;text-align:left;padding:6px 8px;font-size:11px;border-bottom:1px solid #ddd}
  td{padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}</style></head>
  <body><h1>📬 Support Tracker Report</h1><p>Generated ${date} · ${threads.length} threads</p>
  <table><thead><tr><th>Date</th><th>Customer</th><th>Subject</th><th>Category</th><th>Status</th><th>Flags</th><th>Summary</th><th>Resolution</th></tr></thead>
  <tbody>${rows}</tbody></table></body></html>`;
  const win = window.open("", "_blank");
  win.document.write(html); win.document.close(); win.print();
}

function exportCSV(threads) {
  const header = ["Date","Customer","Subject","Category","Status","Flags","AI Summary","Resolution","Has Reply"];
  const rows = threads.map(t => [
    t.date, t.customer,
    `"${(t.subject||"").replace(/"/g,'""')}"`,
    t.category, t.status,
    `"${(t.flags||[]).join(", ")}"`,
    `"${(t.summary||"").replace(/"/g,'""')}"`,
    `"${(t.resolution||"").replace(/"/g,'""')}"`,
    t.hasSent?"Yes":"No",
  ]);
  const csv = [header,...rows].map(r=>r.join(",")).join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
  a.download = `support-tracker-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
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
  const syncTimer = useRef(null);
  const PAGE_SIZE = 10;

  // Load KV overrides
  useEffect(() => {
    if (!session) return;
    fetch("/api/overrides").then(r=>r.json()).then(d=>{ if(d.overrides) setOverrides(d.overrides); }).catch(console.error);
  }, [session]);

  // Load shared sheet info
  useEffect(() => {
    if (!session) return;
    fetch("/api/sheet-sync", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"info" }) })
      .then(r=>r.json()).then(d=>setSheetInfo(d)).catch(console.error);
  }, [session]);

  // Load spam senders list
  useEffect(() => {
    if (!session) return;
    fetch("/api/spam-senders").then(r=>r.json()).then(d=>{ if(d.senders) setSpamSenders(Array.isArray(d.senders) ? d.senders : []); }).catch(console.error);
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
    setOverrides(prev=>({ ...prev, [id]: { ...prev[id], [field]:value } }));
    setSavingId(id);
    try {
      await fetch("/api/overrides", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ id, field, value }) });
      if (sheetInfo?.exists) {
        setSheetSyncing(true);
        const thread = allRows.find(t=>t.id===id);
        if (thread) {
          const updated = { ...thread, [field]: value };
          await fetch("/api/sheet-sync", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"update", thread: updated }) });
        }
      }
    } catch(e) { console.error(e); }
    finally { setSavingId(null); setSheetSyncing(false); }
  }

  async function createSharedSheet() {
    setSheetCreating(true);
    setSheetError(null);
    try {
      const res = await fetch("/api/sheet-sync", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"create", threads: allRows }) });
      const data = await res.json();
      if (data.error) { setSheetError(data.error); return; }
      if (data.url) setSheetInfo({ exists:true, url:data.url, spreadsheetId:data.spreadsheetId, createdBy: session.user?.email });
    } catch(e) {
      setSheetError("Failed to create sheet. Make sure Google Sheets API and Drive API are enabled in Google Cloud.");
    } finally { setSheetCreating(false); }
  }

  // Flag a sender as spam — hides all their threads
  async function flagSenderAsSpam(customerEmail) {
    if (!customerEmail || customerEmail === "Unknown") return;
    try {
      const res = await fetch("/api/spam-senders", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email: customerEmail }) });
      const data = await res.json();
      if (data.senders) {
        setSpamSenders(data.senders);
        setExpandedId(null);
        setSpamToast(`"${customerEmail}" flagged as spam — their threads are now hidden.`);
        setTimeout(() => setSpamToast(null), 4000);
      }
    } catch(e) { console.error(e); }
  }

  async function removeFromSpam(email) {
    try {
      const res = await fetch("/api/spam-senders", { method:"DELETE", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (data.senders) setSpamSenders(data.senders);
    } catch(e) { console.error(e); }
  }

  const allRows = threads
    .filter(t => !Array.isArray(spamSenders) || !spamSenders.includes(t.customer))
    .map(t=>({
      ...t,
      status:   overrides[t.id]?.status   || t.status,
      category: overrides[t.id]?.category || t.category,
    }));

  const filtered = allRows.filter(r=>{
    const q = search.toLowerCase();
    return (!q || r.customer?.toLowerCase().includes(q) || r.snippet?.toLowerCase().includes(q) || r.subject?.toLowerCase().includes(q) || r.summary?.toLowerCase().includes(q))
      && (!filterCat    || r.category===filterCat)
      && (!filterStatus || r.status===filterStatus)
      && (!filterFlag   || (r.flags||[]).includes(filterFlag));
  });

  const totalPages = Math.ceil(filtered.length/PAGE_SIZE);
  const pageRows   = filtered.slice(page*PAGE_SIZE, (page+1)*PAGE_SIZE);
  const catCounts  = {};
  allRows.forEach(r=>{ catCounts[r.category]=(catCounts[r.category]||0)+1; });
  const maxCat = Math.max(...Object.values(catCounts),1);
  const statusCounts = { Open:0, Pending:0, Resolved:0 };
  allRows.forEach(r=>{ if(statusCounts[r.status]!==undefined) statusCounts[r.status]++; });
  const flaggedCount = allRows.filter(r=>r.flags?.length>0).length;
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
      {/* Toast notification */}
      {spamToast && <div className={styles.toast}>{spamToast}</div>}

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
          {spamSenders.length>0 && (
            <button className={styles.spamListBtn} onClick={()=>setShowSpamList(v=>!v)}>
              🚫 {spamSenders.length} blocked sender{spamSenders.length>1?"s":""}
            </button>
          )}
          {lastSync && <span className={styles.syncTime}>Synced {lastSync.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
          <span className={styles.userEmail}>{session.user?.email}</span>
          <button className={styles.signOutBtn} onClick={()=>signOut()}>Sign out</button>
        </div>
      </header>

      {/* Spam senders panel */}
      {showSpamList && (
        <div className={styles.spamPanel}>
          <p className={styles.spamPanelTitle}>🚫 Blocked senders — their threads are hidden from the dashboard</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
            {spamSenders.map(email=>(
              <div key={email} className={styles.spamChip}>
                <span>{email}</span>
                <button onClick={()=>removeFromSpam(email)} title="Unblock" style={{background:"none",border:"none",cursor:"pointer",color:"inherit",padding:"0 2px",fontSize:14}}>×</button>
              </div>
            ))}
          </div>
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
                <span style={{fontSize:11,color:"var(--text-secondary)"}}>Created by {sheetInfo.createdBy}</span>
              </div>
            </div>
          ) : (
            <div className={styles.sheetSetup}>
              <div>
                <span>📊 No shared sheet yet. The sheet owner should create it once.</span>
                {sheetError && <p style={{color:"#C0392B",fontSize:12,marginTop:4}}>⚠️ {sheetError}</p>}
              </div>
              <button className={styles.btn} onClick={createSharedSheet} disabled={sheetCreating||allRows.length===0}>
                {sheetCreating ? "Creating… (this may take 10–15 sec)" : "Create shared sheet"}
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className={styles.statGrid}>
          <div className={styles.statCard}><p className={styles.statLabel}>Total threads</p><p className={styles.statValue}>{allRows.length}</p></div>
          <div className={styles.statCard}><p className={styles.statLabel}>Open — needs reply</p><p className={styles.statValue} style={{color:"#BA7517"}}>{statusCounts.Open}</p></div>
          <div className={styles.statCard}><p className={styles.statLabel}>⚠️ Flagged</p><p className={styles.statValue} style={{color:flaggedCount>0?"#C0392B":undefined}}>{flaggedCount}</p></div>
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
            {flaggedCount>0 && <div style={{marginTop:16,padding:"10px 12px",background:"#FEF0EE",borderRadius:8,fontSize:12,color:"#993C1D"}}>⚠️ <strong>{flaggedCount}</strong> thread{flaggedCount>1?"s":""} need attention</div>}
          </div>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <input className={styles.searchInput} placeholder="Search customer, subject, summary…" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/>
          <select className={styles.select} value={filterCat} onChange={e=>{setFilterCat(e.target.value);setPage(0);}}>
            <option value="">All categories</option>
            {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
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
          {nextPageToken && <button className={styles.btn} onClick={()=>fetchThreads(nextPageToken)} disabled={loading} style={{marginLeft:"auto"}}>{loading?"Loading…":"Load more emails"}</button>}
        </div>

        {/* Table */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{width:85}}>Date</th>
                <th style={{width:120}}>Customer</th>
                <th>Subject &amp; AI summary</th>
                <th style={{width:120}}>Category</th>
                <th style={{width:95}}>Status</th>
                <th style={{width:90}}>Flags</th>
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
                    <td style={{fontWeight:500,fontSize:13}}>{r.customer}</td>
                    <td>
                      <div style={{fontWeight:500,fontSize:13,marginBottom:2}}>{r.subject}</div>
                      {r.summary
                        ? <div style={{color:"var(--text-secondary)",fontSize:12,lineHeight:1.4}}>🤖 {r.summary}</div>
                        : <div style={{color:"var(--text-secondary)",fontSize:12}}>{r.snippet?.slice(0,100)}…</div>}
                    </td>
                    <td><Badge label={r.category||"Other"} colorMap={CAT_BG}/></td>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <Badge label={r.status||"Open"} colorMap={STATUS_COLORS}/>
                        {overrides[r.id]?.status && <span title="Manually set" style={{fontSize:10,color:"var(--text-secondary)"}}>✎</span>}
                      </div>
                    </td>
                    <td><div style={{display:"flex",flexWrap:"wrap",gap:3}}>{(r.flags||[]).map(f=><span key={f} title={FLAG_LABELS[f]?.label} style={{fontSize:15}}>{FLAG_LABELS[f]?.emoji}</span>)}</div></td>
                    <td style={{textAlign:"center",color:"var(--text-secondary)",fontSize:12}}>{expandedId===r.id?"▲":"▼"}</td>
                  </tr>
                  {expandedId===r.id && (
                    <tr key={r.id+"-detail"}>
                      <td colSpan={7} style={{padding:"0 12px 14px",background:"var(--bg-secondary)"}}>
                        <div className={styles.detailPanel}>
                          <div className={styles.detailGrid}>
                            <div><p className={styles.detailLabel}>Customer</p><p className={styles.detailValue}>{r.customer}</p></div>
                            <div><p className={styles.detailLabel}>Date</p><p className={styles.detailValue}>{r.date||"—"}</p></div>
                            <div><p className={styles.detailLabel}>Messages</p><p className={styles.detailValue}>{r.messageCount}</p></div>
                            <div><p className={styles.detailLabel}>Has reply</p><p className={styles.detailValue}>{r.hasSent?"Yes ✅":"No ❌"}</p></div>
                          </div>
                          {overrides[r.id]?.updatedAt && (
                            <div style={{fontSize:11,color:"var(--text-secondary)",marginBottom:10}}>
                              💾 Last saved {new Date(overrides[r.id].updatedAt).toLocaleString()} by {overrides[r.id].updatedBy}
                            </div>
                          )}
                          {r.flags?.length>0 && (
                            <div className={styles.flagBanner}>
                              {r.flags.map(f=><span key={f} className={styles.flagChip}>{FLAG_LABELS[f]?.emoji} {FLAG_LABELS[f]?.label}</span>)}
                            </div>
                          )}
                          <div className={styles.aiBlock}>
                            <div className={styles.aiSection}>
                              <p className={styles.detailLabel}>🤖 AI — Issue summary</p>
                              <p style={{fontSize:13,lineHeight:1.6,marginTop:4}}>{r.summary||"—"}</p>
                            </div>
                            <div className={styles.aiSection}>
                              <p className={styles.detailLabel}>🔧 AI — Resolution</p>
                              <p style={{fontSize:13,lineHeight:1.6,marginTop:4}}>{r.resolution||"—"}</p>
                            </div>
                          </div>
                          <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap",marginTop:12}}>
                            <div>
                              <p className={styles.detailLabel} style={{marginBottom:4}}>Override category</p>
                              <select className={styles.select} value={r.category||"Other"} onChange={e=>setOverride(r.id,"category",e.target.value)}>
                                {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <p className={styles.detailLabel} style={{marginBottom:4}}>Mark as</p>
                              <select className={styles.select} value={r.status||"Open"} onChange={e=>setOverride(r.id,"status",e.target.value)}>
                                {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div style={{paddingBottom:2}}>
                              <p className={styles.detailLabel} style={{marginBottom:4}}>Sender</p>
                              <button
                                className={styles.spamBtn}
                                onClick={e=>{e.stopPropagation();flagSenderAsSpam(r.customer);}}
                                disabled={Array.isArray(spamSenders) && spamSenders.includes(r.customer)||r.customer==="Unknown"}
                                title="Hide all threads from this sender"
                              >
                                🚫 {Array.isArray(spamSenders) && spamSenders.includes(r.customer)?"Blocked":"Block sender"}
                              </button>
                            </div>
                            {savingId===r.id && <span style={{fontSize:12,color:"var(--text-secondary)",paddingBottom:8}}>💾 Saving…</span>}
                            {savingId!==r.id && overrides[r.id] && <span style={{fontSize:12,color:"#1D9E75",paddingBottom:8}}>✓ Saved{sheetInfo?.exists?" & synced":""}</span>}
                          </div>
                        </div>
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
