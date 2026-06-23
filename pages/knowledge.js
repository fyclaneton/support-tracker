import { useSession, signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "../styles/Home.module.css";
import kbStyles from "../styles/Knowledge.module.css";

const CATEGORIES = ["Hardware", "Software", "Setup", "Connectivity", "Warranty/Repair", "Sales inquiry", "Contact request", "Other"];
const MODEL_ALIASES = { "B.22": "i2R 4", "B.23": "i2R 6", "B.24": "i2R 8" };

function formatModel(m) {
  if (!m) return null;
  return MODEL_ALIASES[m] ? `${m} (${MODEL_ALIASES[m]})` : m;
}

function CatBadge({ cat }) {
  const colors = {
    Hardware: { bg:"#FAECE7", text:"#993C1D" }, Software: { bg:"#EEEDFE", text:"#534AB7" },
    Setup: { bg:"#E1F5EE", text:"#0F6E56" }, Connectivity: { bg:"#FBEAF0", text:"#993556" },
    "Warranty/Repair": { bg:"#FEF0EE", text:"#993C1D" }, Other: { bg:"#F1EFE8", text:"#5F5E5A" },
  };
  const c = colors[cat] || colors.Other;
  return <span style={{ background: c.bg, color: c.text, padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:500 }}>{cat}</span>;
}

export default function Knowledge() {
  const { data: session, status } = useSession();
  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [total, setTotal]         = useState(0);
  const [expanded, setExpanded]   = useState(null);
  const [deleting, setDeleting]   = useState(null);
  const [toast, setToast]         = useState(null);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterCat) params.set("category", filterCat);
      const res = await fetch(`/api/knowledge?${params}`);
      const data = await res.json();
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (session) load(); }, [session, filterCat]);

  async function deleteEntry(id) {
    setDeleting(id);
    try {
      await fetch("/api/knowledge", { method:"DELETE", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ id }) });
      setEntries(prev => prev.filter(e => e.id !== id));
      showToast("Entry removed from knowledge base.");
    } catch(e) { console.error(e); }
    finally { setDeleting(null); }
  }

  if (status === "loading") return <div className={styles.centered}><div className={styles.spinner}/></div>;
  if (!session) return (
    <div className={styles.loginWrap}>
      <div className={styles.loginCard}>
        <div className={styles.logo}>📚</div>
        <h1 className={styles.loginTitle}>Knowledge Base</h1>
        <p className={styles.loginSub}>Sign in to access the i2R CNC support knowledge base.</p>
        <button className={styles.signInBtn} onClick={() => signIn("google")}>Sign in with Google</button>
      </div>
    </div>
  );

  return (
    <div className={styles.wrap}>
      {toast && <div className={styles.toast}>{toast}</div>}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}>📚</span>
          <span className={styles.headerTitle}>Knowledge Base</span>
          {total > 0 && <span style={{fontSize:12,color:"var(--text-secondary)"}}>{total} entries</span>}
        </div>
        <div className={styles.headerRight}>
          <Link href="/" style={{fontSize:13,color:"var(--text-secondary)",textDecoration:"none"}}>← Dashboard</Link>
        </div>
      </header>

      <main className={styles.main}>
        {/* Search & filter */}
        <div className={styles.controls} style={{marginBottom:"1.5rem"}}>
          <input
            className={styles.searchInput}
            placeholder="Search problems, solutions, customers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load()}
          />
          <select className={styles.select} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className={styles.btn} onClick={load}>Search</button>
        </div>

        {loading ? (
          <div style={{textAlign:"center",padding:"3rem",color:"var(--text-secondary)"}}>
            <div className={styles.spinner} style={{display:"inline-block",marginRight:8}}/>Loading knowledge base…
          </div>
        ) : entries.length === 0 ? (
          <div className={kbStyles.emptyState}>
            <p style={{fontSize:32,marginBottom:12}}>📭</p>
            <p style={{fontWeight:500,marginBottom:6}}>No entries yet</p>
            <p style={{fontSize:13,color:"var(--text-secondary)"}}>
              Knowledge base entries are added automatically when threads are marked as Resolved on the dashboard.
            </p>
          </div>
        ) : (
          <div className={kbStyles.entryList}>
            {entries.map(e => (
              <div key={e.id} className={kbStyles.entry}>
                <div className={kbStyles.entryHeader} onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                  <div style={{flex:1,minWidth:0}}>
                    <div className={kbStyles.entryTitle}>{e.problem}</div>
                    <div className={kbStyles.entryMeta}>
                      <CatBadge cat={e.category}/>
                      {e.machineModel && <span style={{fontSize:11,background:"#E6F1FB",color:"#185FA5",padding:"2px 8px",borderRadius:20,fontWeight:500}}>🔧 {formatModel(e.machineModel)}</span>}
                      <span style={{fontSize:11,color:"var(--text-secondary)"}}>{e.customer}</span>
                      <span style={{fontSize:11,color:"var(--text-secondary)"}}>{e.date}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                    <button
                      className={kbStyles.deleteBtn}
                      onClick={ev => { ev.stopPropagation(); deleteEntry(e.id); }}
                      disabled={deleting === e.id}
                      title="Remove from knowledge base"
                    >
                      {deleting === e.id ? "…" : "✕"}
                    </button>
                    <span style={{fontSize:12,color:"var(--text-secondary)"}}>{expanded === e.id ? "▲" : "▼"}</span>
                  </div>
                </div>

                {expanded === e.id && (
                  <div className={kbStyles.entryBody}>
                    <div className={kbStyles.kbSection}>
                      <p className={kbStyles.kbLabel}>🔍 Problem</p>
                      <p className={kbStyles.kbText}>{e.problem}</p>
                    </div>
                    <div className={kbStyles.kbSection}>
                      <p className={kbStyles.kbLabel}>✅ Resolution</p>
                      <p className={kbStyles.kbText}>{e.solution}</p>
                    </div>
                    <div style={{marginTop:8,fontSize:11,color:"var(--text-secondary)"}}>
                      Added {new Date(e.createdAt).toLocaleDateString()} by {e.addedBy}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
