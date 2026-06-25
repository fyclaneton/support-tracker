import { useSession, signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "../styles/Home.module.css";

const CATEGORIES = ["Hardware","Software","Setup","Connectivity","Warranty/Repair","Sales inquiry","Contact request","Other"];
const CAT_COLORS = { Hardware:"#D85A30",Software:"#7F77DD",Setup:"#1D9E75",Connectivity:"#D4537E","Warranty/Repair":"#E67E22","Sales inquiry":"#185FA5","Contact request":"#888780",Other:"#BBBBBB" };
const MODEL_ALIASES = { "B.22":"i2R 4","B.23":"i2R 6","B.24":"i2R 8" };

function fmt(m) { return MODEL_ALIASES[m] ? `${m} (${MODEL_ALIASES[m]})` : m; }

function Bar({ label, value, max, color, pct }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
      <span style={{width:140,fontSize:12,color:"var(--text-secondary)",textAlign:"right",flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
      <div style={{flex:1,background:"var(--bg-secondary)",borderRadius:4,height:18,overflow:"hidden"}}>
        <div style={{width:`${Math.round((value/(max||1))*100)}%`,height:"100%",background:color||"#185FA5",borderRadius:4,transition:"width 0.5s",display:"flex",alignItems:"center",paddingLeft:6}}>
          {value > 0 && <span style={{fontSize:10,color:"#fff",fontWeight:600,whiteSpace:"nowrap"}}>{value}</span>}
        </div>
      </div>
      {pct !== undefined && <span style={{fontSize:11,color:"var(--text-secondary)",width:36,flexShrink:0}}>{pct}%</span>}
    </div>
  );
}

function Card({ title, value, sub, color }) {
  return (
    <div style={{background:"var(--bg)",border:"0.5px solid var(--border)",borderRadius:"var(--radius)",padding:"16px 20px",flex:1,minWidth:140}}>
      <p style={{fontSize:12,color:"var(--text-secondary)",margin:"0 0 6px"}}>{title}</p>
      <p style={{fontSize:28,fontWeight:700,margin:"0 0 4px",color:color||"var(--text-primary)"}}>{value}</p>
      {sub && <p style={{fontSize:11,color:"var(--text-secondary)",margin:0}}>{sub}</p>}
    </div>
  );
}

export default function Analytics() {
  const { data: session, status } = useSession();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState("all"); // all | 90 | 30

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    fetch("/api/saved-threads")
      .then(r => r.json())
      .then(d => { if (d.threads) setThreads(d.threads); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session]);

  if (status === "loading") return <div className={styles.centered}><div className={styles.spinner}/></div>;
  if (!session) return (
    <div className={styles.loginWrap}>
      <div className={styles.loginCard}>
        <div className={styles.logo}>📊</div>
        <h1 className={styles.loginTitle}>Analytics</h1>
        <button className={styles.signInBtn} onClick={() => signIn("google")}>Sign in with Google</button>
      </div>
    </div>
  );

  // Date filter
  const cutoff = range === "all" ? null : new Date(Date.now() - parseInt(range) * 24 * 60 * 60 * 1000);
  const data = cutoff ? threads.filter(t => t.date && new Date(t.date) >= cutoff) : threads;
  const resolved = data.filter(t => t.status === "Resolved");
  const open = data.filter(t => t.status === "Open");
  const resolutionRate = data.length ? Math.round((resolved.length / data.length) * 100) : 0;

  // Category breakdown
  const byCat = {};
  data.forEach(t => { const c = t.category || "Other"; byCat[c] = (byCat[c]||0) + 1; });
  const sortedCats = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const maxCat = Math.max(...Object.values(byCat), 1);

  // Model breakdown
  const byModel = {};
  data.forEach(t => { if (t.machineModel) { byModel[t.machineModel] = (byModel[t.machineModel]||0)+1; } });
  const sortedModels = Object.entries(byModel).sort((a,b)=>b[1]-a[1]);
  const maxModel = Math.max(...Object.values(byModel), 1);

  // Issues by model + category (top hardware/software issues per model)
  const modelCatMap = {};
  data.forEach(t => {
    if (!t.machineModel) return;
    if (!modelCatMap[t.machineModel]) modelCatMap[t.machineModel] = {};
    const c = t.category || "Other";
    modelCatMap[t.machineModel][c] = (modelCatMap[t.machineModel][c]||0)+1;
  });

  // Month over month volume
  const byMonth = {};
  data.forEach(t => {
    if (!t.date) return;
    const m = t.date.slice(0,7); // YYYY-MM
    byMonth[m] = (byMonth[m]||0)+1;
  });
  const months = Object.entries(byMonth).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
  const maxMonth = Math.max(...months.map(m=>m[1]), 1);

  // Avg resolution time (rough — we don't store timestamps reliably, skip for now)
  // Top unresolved issues
  const unresolvedByCategory = {};
  open.forEach(t => { const c = t.category||"Other"; unresolvedByCategory[c]=(unresolvedByCategory[c]||0)+1; });
  const topUnresolved = Object.entries(unresolvedByCategory).sort((a,b)=>b[1]-a[1]).slice(0,5);

  // Repeat customers
  const customerCounts = {};
  data.forEach(t => { if(t.customer) customerCounts[t.customer]=(customerCounts[t.customer]||0)+1; });
  const repeatCustomers = Object.entries(customerCounts).filter(([,c])=>c>1).sort((a,b)=>b[1]-a[1]).slice(0,10);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}>📊</span>
          <span className={styles.headerTitle}>Analytics</span>
          <span style={{fontSize:12,color:"var(--text-secondary)"}}>{data.length} threads</span>
        </div>
        <div className={styles.headerRight}>
          <Link href="/" style={{fontSize:13,color:"var(--text-secondary)",textDecoration:"none"}}>← Dashboard</Link>
        </div>
      </header>

      <main className={styles.main}>
        {loading ? (
          <div style={{textAlign:"center",padding:"3rem"}}><div className={styles.spinner} style={{display:"inline-block"}}/></div>
        ) : (
          <>
            {/* Date range toggle */}
            <div style={{display:"flex",gap:6,marginBottom:"1.5rem"}}>
              {[["all","All time"],["90","Last 90 days"],["30","Last 30 days"]].map(([v,l])=>(
                <button key={v} className={styles.btn}
                  style={range===v?{background:"#185FA5",color:"#fff",borderColor:"#185FA5"}:{}}
                  onClick={()=>setRange(v)}>{l}</button>
              ))}
            </div>

            {/* KPI cards */}
            <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:"1.5rem"}}>
              <Card title="Total inquiries" value={data.length}/>
              <Card title="Resolved" value={resolved.length} color="#1D9E75" sub={`${resolutionRate}% resolution rate`}/>
              <Card title="Open" value={open.length} color="#BA7517" sub="Needs response"/>
              <Card title="Unique customers" value={Object.keys(customerCounts).length}/>
              <Card title="Repeat customers" value={repeatCustomers.length} sub="2+ threads"/>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.5rem",marginBottom:"1.5rem"}}>
              {/* Issues by category */}
              <div style={{background:"var(--bg)",border:"0.5px solid var(--border)",borderRadius:"var(--radius)",padding:"16px 20px"}}>
                <p style={{fontSize:13,fontWeight:600,marginBottom:14}}>Issues by category</p>
                {sortedCats.map(([cat,count])=>(
                  <Bar key={cat} label={cat} value={count} max={maxCat} color={CAT_COLORS[cat]} pct={Math.round(count/data.length*100)||0}/>
                ))}
                {sortedCats.length===0 && <p style={{fontSize:12,color:"var(--text-secondary)"}}>No data yet.</p>}
              </div>

              {/* Issues by model */}
              <div style={{background:"var(--bg)",border:"0.5px solid var(--border)",borderRadius:"var(--radius)",padding:"16px 20px"}}>
                <p style={{fontSize:13,fontWeight:600,marginBottom:14}}>Tickets by machine model</p>
                {sortedModels.map(([model,count])=>(
                  <Bar key={model} label={fmt(model)} value={count} max={maxModel} color="#185FA5" pct={Math.round(count/data.length*100)||0}/>
                ))}
                {sortedModels.length===0 && <p style={{fontSize:12,color:"var(--text-secondary)"}}>No model data yet.</p>}
              </div>
            </div>

            {/* Volume over time */}
            {months.length > 1 && (
              <div style={{background:"var(--bg)",border:"0.5px solid var(--border)",borderRadius:"var(--radius)",padding:"16px 20px",marginBottom:"1.5rem"}}>
                <p style={{fontSize:13,fontWeight:600,marginBottom:14}}>Monthly inquiry volume</p>
                {months.map(([month,count])=>(
                  <Bar key={month} label={month} value={count} max={maxMonth} color="#7F77DD"/>
                ))}
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.5rem",marginBottom:"1.5rem"}}>
              {/* Issues by model + type — useful for machine improvement */}
              <div style={{background:"var(--bg)",border:"0.5px solid var(--border)",borderRadius:"var(--radius)",padding:"16px 20px"}}>
                <p style={{fontSize:13,fontWeight:600,marginBottom:4}}>Issue type by machine model</p>
                <p style={{fontSize:11,color:"var(--text-secondary)",marginBottom:14}}>Helps identify which machines have recurring problems</p>
                {Object.entries(modelCatMap).sort((a,b)=>Object.values(b[1]).reduce((s,v)=>s+v,0)-Object.values(a[1]).reduce((s,v)=>s+v,0)).slice(0,6).map(([model,cats])=>(
                  <div key={model} style={{marginBottom:12}}>
                    <p style={{fontSize:12,fontWeight:600,marginBottom:4}}>🔧 {fmt(model)}</p>
                    {Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([cat,count])=>(
                      <div key={cat} style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--text-secondary)",padding:"2px 0 2px 12px"}}>
                        <span>{cat}</span><span style={{fontWeight:500,color:CAT_COLORS[cat]||"inherit"}}>{count}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {Object.keys(modelCatMap).length===0 && <p style={{fontSize:12,color:"var(--text-secondary)"}}>No model data yet.</p>}
              </div>

              {/* Repeat customers */}
              <div style={{background:"var(--bg)",border:"0.5px solid var(--border)",borderRadius:"var(--radius)",padding:"16px 20px"}}>
                <p style={{fontSize:13,fontWeight:600,marginBottom:4}}>Repeat customers</p>
                <p style={{fontSize:11,color:"var(--text-secondary)",marginBottom:14}}>Customers with multiple support threads</p>
                {repeatCustomers.length === 0
                  ? <p style={{fontSize:12,color:"var(--text-secondary)"}}>No repeat customers yet.</p>
                  : repeatCustomers.map(([customer, count]) => (
                    <div key={customer} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"0.5px solid var(--border)",fontSize:13}}>
                      <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{customer}</span>
                      <span style={{fontWeight:600,color:"#185FA5",flexShrink:0,marginLeft:8}}>{count} threads</span>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Open issues by category */}
            {topUnresolved.length > 0 && (
              <div style={{background:"#FAEEDA",border:"0.5px solid #E59866",borderRadius:"var(--radius)",padding:"16px 20px",marginBottom:"1.5rem"}}>
                <p style={{fontSize:13,fontWeight:600,marginBottom:12,color:"#854F0B"}}>⏳ Open issues by category</p>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  {topUnresolved.map(([cat,count])=>(
                    <div key={cat} style={{background:"var(--bg)",border:"0.5px solid var(--border)",borderRadius:8,padding:"8px 14px",textAlign:"center"}}>
                      <p style={{fontSize:20,fontWeight:700,margin:"0 0 2px",color:CAT_COLORS[cat]||"inherit"}}>{count}</p>
                      <p style={{fontSize:11,color:"var(--text-secondary)",margin:0}}>{cat}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
