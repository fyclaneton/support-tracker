import { useSession, signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "../styles/Home.module.css";
import kbStyles from "../styles/Knowledge.module.css";

const REGIONS = ["Japan", "Korea", "Czech Republic", "United States", "Canada", "United Kingdom", "Other"];
const REGION_FLAGS = { "Japan": "🇯🇵", "Korea": "🇰🇷", "Czech Republic": "🇨🇿", "United States": "🇺🇸", "Canada": "🇨🇦", "United Kingdom": "🇬🇧", "Other": "🌍" };

export default function Distributors() {
  const { data: session, status } = useSession();
  const [distributors, setDistributors] = useState([]);
  const [threads, setThreads]           = useState([]);
  const [loading, setLoading]           = useState(false);
  const [filterRegion, setFilterRegion] = useState("");
  const [showAdd, setShowAdd]           = useState(false);
  const [toast, setToast]               = useState(null);
  const [editingId, setEditingId]       = useState(null);

  // Add form state
  const [form, setForm] = useState({ name:"", email:"", company:"", region:"" });

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  async function load() {
    setLoading(true);
    try {
      const [distRes, threadRes] = await Promise.all([
        fetch("/api/distributors").then(r=>r.json()),
        fetch("/api/saved-threads").then(r=>r.json()),
      ]);
      if (distRes.distributors) setDistributors(distRes.distributors);
      if (threadRes.threads) setThreads(threadRes.threads);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (session) load(); }, [session]);

  async function saveDistributor(e) {
    e.preventDefault();
    if (!form.email.trim()) return;
    try {
      const res = await fetch("/api/distributors", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.distributors) setDistributors(data.distributors);
      setForm({ name:"", email:"", company:"", region:"" });
      setShowAdd(false);
      showToast(`✓ ${form.name || form.email} added as distributor.`);
    } catch(e) { console.error(e); }
  }

  async function removeDistributor(email) {
    if (!window.confirm(`Remove ${email} as distributor?`)) return;
    try {
      const res = await fetch("/api/distributors", {
        method:"DELETE", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.distributors) setDistributors(data.distributors);
      showToast("Distributor removed.");
    } catch(e) { console.error(e); }
  }

  async function updateRegion(email, region) {
    try {
      const dist = distributors.find(d => d.email === email);
      if (!dist) return;
      const res = await fetch("/api/distributors", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ...dist, region }),
      });
      const data = await res.json();
      if (data.distributors) setDistributors(data.distributors);
      setEditingId(null);
    } catch(e) { console.error(e); }
  }

  const filtered = filterRegion
    ? distributors.filter(d => d.region === filterRegion)
    : distributors;

  // Get threads for a distributor
  function getDistThreads(email) {
    return threads.filter(t =>
      t.customerEmail?.toLowerCase() === email.toLowerCase() ||
      t.customer?.toLowerCase() === distributors.find(d=>d.email===email)?.name?.toLowerCase()
    );
  }

  // Group by region
  const byRegion = {};
  filtered.forEach(d => {
    const r = d.region || "Other";
    if (!byRegion[r]) byRegion[r] = [];
    byRegion[r].push(d);
  });

  if (status === "loading") return <div className={styles.centered}><div className={styles.spinner}/></div>;
  if (!session) return (
    <div className={styles.loginWrap}>
      <div className={styles.loginCard}>
        <div className={styles.logo}>🏢</div>
        <h1 className={styles.loginTitle}>Distributors</h1>
        <button className={styles.signInBtn} onClick={() => signIn("google")}>Sign in with Google</button>
      </div>
    </div>
  );

  return (
    <div className={styles.wrap}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}>🏢</span>
          <span className={styles.headerTitle}>Distributors & OEM Partners</span>
          <span style={{fontSize:12,color:"var(--text-secondary)"}}>{distributors.length} partners</span>
        </div>
        <div className={styles.headerRight}>
          <Link href="/" style={{fontSize:13,color:"var(--text-secondary)",textDecoration:"none"}}>← Dashboard</Link>
        </div>
      </header>

      <main className={styles.main}>
        {/* Controls */}
        <div style={{display:"flex",gap:8,marginBottom:"1.5rem",flexWrap:"wrap",alignItems:"center"}}>
          <select className={styles.select} value={filterRegion} onChange={e=>setFilterRegion(e.target.value)}>
            <option value="">All regions</option>
            {REGIONS.map(r=><option key={r} value={r}>{REGION_FLAGS[r]} {r}</option>)}
          </select>
          <button className={styles.btn} style={{marginLeft:"auto",background:"#E1F5EE",color:"#0F6E56",borderColor:"#0F6E56"}} onClick={()=>setShowAdd(v=>!v)}>
            {showAdd ? "Cancel" : "+ Add distributor"}
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <form onSubmit={saveDistributor} style={{background:"var(--bg)",border:"0.5px solid var(--border)",borderRadius:"var(--radius)",padding:"1rem 1.25rem",marginBottom:"1.5rem"}}>
            <p style={{fontSize:13,fontWeight:500,marginBottom:12}}>Add new distributor / OEM partner</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <p className={styles.detailLabel} style={{marginBottom:4}}>Contact name</p>
                <input className={styles.searchInput} style={{width:"100%"}} placeholder="Steve Stevenson" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} required/>
              </div>
              <div>
                <p className={styles.detailLabel} style={{marginBottom:4}}>Email address *</p>
                <input className={styles.searchInput} style={{width:"100%"}} placeholder="steve@simplytechnologies.xyz" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} required/>
              </div>
              <div>
                <p className={styles.detailLabel} style={{marginBottom:4}}>Company name</p>
                <input className={styles.searchInput} style={{width:"100%"}} placeholder="Simply Technologies" value={form.company} onChange={e=>setForm(f=>({...f,company:e.target.value}))}/>
              </div>
              <div>
                <p className={styles.detailLabel} style={{marginBottom:4}}>Region</p>
                <select className={styles.select} style={{width:"100%"}} value={form.region} onChange={e=>setForm(f=>({...f,region:e.target.value}))}>
                  <option value="">Select region</option>
                  {REGIONS.map(r=><option key={r} value={r}>{REGION_FLAGS[r]} {r}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" className={styles.btn} style={{background:"#E1F5EE",color:"#0F6E56",borderColor:"#0F6E56"}}>Save distributor</button>
          </form>
        )}

        {loading ? (
          <div style={{textAlign:"center",padding:"3rem",color:"var(--text-secondary)"}}>
            <div className={styles.spinner} style={{display:"inline-block",marginRight:8}}/>Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className={kbStyles.emptyState}>
            <p style={{fontSize:32,marginBottom:12}}>🏢</p>
            <p style={{fontWeight:500,marginBottom:6}}>No distributors yet</p>
            <p style={{fontSize:13,color:"var(--text-secondary)"}}>Add distributors above or flag them from the dashboard when you see their emails.</p>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:24}}>
            {Object.entries(byRegion).map(([region, dists]) => (
              <div key={region}>
                <h2 style={{fontSize:14,fontWeight:600,color:"var(--text-secondary)",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                  {REGION_FLAGS[region]} {region}
                  <span style={{fontSize:12,fontWeight:400}}>({dists.length})</span>
                </h2>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {dists.map(d => {
                    const distThreads = getDistThreads(d.email);
                    const open = distThreads.filter(t=>t.status==="Open").length;
                    const isEditing = editingId === d.email;
                    return (
                      <div key={d.email} style={{background:"var(--bg)",border:"0.5px solid var(--border)",borderRadius:"var(--radius)",padding:"12px 16px"}}>
                        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                              <span style={{fontWeight:500,fontSize:14}}>{d.name}</span>
                              {d.company && <span style={{fontSize:12,background:"#FEF3E2",color:"#935A00",padding:"1px 8px",borderRadius:20,fontWeight:500}}>🏢 {d.company}</span>}
                            </div>
                            <p style={{fontSize:12,color:"var(--text-secondary)",margin:"0 0 8px"}}>{d.email}</p>
                            <div style={{display:"flex",gap:12,fontSize:12,color:"var(--text-secondary)"}}>
                              <span>{distThreads.length} thread{distThreads.length!==1?"s":""}</span>
                              {open>0 && <span style={{color:"#BA7517",fontWeight:500}}>{open} open</span>}
                            </div>
                          </div>
                          <div style={{display:"flex",gap:8,alignItems:"flex-start",flexShrink:0}}>
                            {isEditing ? (
                              <select className={styles.select} defaultValue={d.region||""} onChange={e=>updateRegion(d.email,e.target.value)} autoFocus>
                                <option value="">No region</option>
                                {REGIONS.map(r=><option key={r} value={r}>{REGION_FLAGS[r]} {r}</option>)}
                              </select>
                            ) : (
                              <button className={styles.btn} style={{fontSize:11}} onClick={()=>setEditingId(d.email)}>
                                {d.region ? `${REGION_FLAGS[d.region]} ${d.region}` : "Set region"}
                              </button>
                            )}
                            <button onClick={()=>removeDistributor(d.email)} style={{fontSize:12,background:"none",border:"0.5px solid var(--border)",borderRadius:6,padding:"5px 10px",cursor:"pointer",color:"var(--text-secondary)"}}>Remove</button>
                          </div>
                        </div>
                        {/* Recent threads */}
                        {distThreads.length > 0 && (
                          <div style={{marginTop:10,borderTop:"0.5px solid var(--border)",paddingTop:10}}>
                            {distThreads.slice(0,3).map(t=>(
                              <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",fontSize:12}}>
                                <span style={{color:"var(--text-secondary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{t.subject}</span>
                                <span style={{color:"var(--text-secondary)",marginLeft:12,flexShrink:0}}>{t.date}</span>
                                <span style={{marginLeft:8,padding:"1px 8px",borderRadius:20,fontSize:11,flexShrink:0,
                                  background:t.status==="Resolved"?"#EAF3DE":t.status==="Pending"?"#E6F1FB":"#FAEEDA",
                                  color:t.status==="Resolved"?"#3B6D11":t.status==="Pending"?"#185FA5":"#854F0B"
                                }}>{t.status}</span>
                              </div>
                            ))}
                            {distThreads.length>3 && <p style={{fontSize:11,color:"var(--text-secondary)",margin:"4px 0 0"}}>+{distThreads.length-3} more threads</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
