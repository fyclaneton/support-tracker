import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import styles from "../styles/Home.module.css";

const CATEGORIES = ["Software", "Hardware", "Setup", "Connectivity", "Contact request", "Other"];
const STATUSES = ["Open", "Pending", "Resolved"];

const CAT_COLORS = {
  Software: "#7F77DD",
  Hardware: "#D85A30",
  Setup: "#1D9E75",
  Connectivity: "#D4537E",
  "Contact request": "#888780",
  Other: "#888780",
};

const STATUS_COLORS = {
  Open: { bg: "#FAEEDA", text: "#854F0B" },
  Pending: { bg: "#E6F1FB", text: "#185FA5" },
  Resolved: { bg: "#EAF3DE", text: "#3B6D11" },
};

const CAT_BG = {
  Software: { bg: "#EEEDFE", text: "#534AB7" },
  Hardware: { bg: "#FAECE7", text: "#993C1D" },
  Setup: { bg: "#E1F5EE", text: "#0F6E56" },
  Connectivity: { bg: "#FBEAF0", text: "#993556" },
  "Contact request": { bg: "#F1EFE8", text: "#5F5E5A" },
  Other: { bg: "#F1EFE8", text: "#5F5E5A" },
};

function Badge({ label, colorMap }) {
  const c = colorMap[label] || { bg: "#F1EFE8", text: "#5F5E5A" };
  return (
    <span style={{ background: c.bg, color: c.text, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className={styles.statCard}>
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.statValue} style={accent ? { color: accent } : {}}>{value ?? "—"}</p>
    </div>
  );
}

function MiniBar({ label, value, max, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12 }}>
      <span style={{ width: 110, color: "var(--text-secondary)", textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, background: "var(--bg-secondary)", borderRadius: 4, height: 14, overflow: "hidden" }}>
        <div style={{ width: `${Math.round((value / max) * 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s" }} />
      </div>
      <span style={{ width: 20, color: "var(--text-secondary)", flexShrink: 0 }}>{value}</span>
    </div>
  );
}

export default function Home() {
  const { data: session, status } = useSession();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [overrides, setOverrides] = useState({});
  const PAGE_SIZE = 10;

  const fetchThreads = useCallback(async (token = null, replace = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (token) params.set("pageToken", token);
      const res = await fetch(`/api/threads?${params}`);
      const data = await res.json();
      setThreads((prev) => replace ? data.threads : [...prev, ...data.threads]);
      setNextPageToken(data.nextPageToken || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) fetchThreads(null, true);
  }, [session, fetchThreads]);

  const allRows = threads.map((t) => ({
    ...t,
    status: overrides[t.id]?.status || t.status,
    category: overrides[t.id]?.category || t.category,
  }));

  const filtered = allRows.filter((r) => {
    const q = search.toLowerCase();
    const matchQ = !q || r.customer?.toLowerCase().includes(q) || r.snippet?.toLowerCase().includes(q) || r.subject?.toLowerCase().includes(q);
    const matchCat = !filterCat || r.category === filterCat;
    const matchStatus = !filterStatus || r.status === filterStatus;
    return matchQ && matchCat && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const catCounts = {};
  allRows.forEach((r) => { catCounts[r.category] = (catCounts[r.category] || 0) + 1; });
  const maxCat = Math.max(...Object.values(catCounts), 1);

  const statusCounts = { Open: 0, Pending: 0, Resolved: 0 };
  allRows.forEach((r) => { if (statusCounts[r.status] !== undefined) statusCounts[r.status]++; });

  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

  function exportCSV() {
    const header = ["Date", "Customer", "Subject", "Category", "Status", "Has reply", "Snippet"];
    const rows = allRows.map((r) => [r.date, r.customer, `"${(r.subject || "").replace(/"/g, '""')}"`, r.category, r.status, r.hasSent ? "Yes" : "No", `"${(r.snippet || "").replace(/"/g, '""')}"`]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "support-tracker.csv";
    a.click();
  }

  function setOverride(id, field, value) {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  if (status === "loading") return <div className={styles.centered}><div className={styles.spinner} /></div>;

  if (!session) {
    return (
      <div className={styles.loginWrap}>
        <div className={styles.loginCard}>
          <div className={styles.logo}>📬</div>
          <h1 className={styles.loginTitle}>Support Tracker</h1>
          <p className={styles.loginSub}>Compile, organize, and analyze customer support emails from Gmail.</p>
          <button className={styles.signInBtn} onClick={() => signIn("google")}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}>📬</span>
          <span className={styles.headerTitle}>Support Tracker</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.userEmail}>{session.user?.email}</span>
          <button className={styles.signOutBtn} onClick={() => signOut()}>Sign out</button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.statGrid}>
          <StatCard label="Total threads" value={allRows.length} />
          <StatCard label="Open — needs reply" value={statusCounts.Open} accent="#BA7517" />
          <StatCard label="Pending" value={statusCounts.Pending} accent="#185FA5" />
          <StatCard label="Top issue type" value={topCat} />
        </div>

        <div className={styles.chartRow}>
          <div className={styles.chartCard}>
            <p className={styles.chartTitle}>Issues by category</p>
            {CATEGORIES.map((c) => (
              <MiniBar key={c} label={c} value={catCounts[c] || 0} max={maxCat} color={CAT_COLORS[c]} />
            ))}
          </div>
          <div className={styles.chartCard}>
            <p className={styles.chartTitle}>Status breakdown</p>
            {STATUSES.map((s) => (
              <MiniBar key={s} label={s} value={statusCounts[s] || 0} max={allRows.length || 1} color={STATUS_COLORS[s]?.bg.replace("FE", "77").replace("FB", "77")} />
            ))}
          </div>
        </div>

        <div className={styles.controls}>
          <input className={styles.searchInput} placeholder="Search customer, subject, keyword…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          <select className={styles.select} value={filterCat} onChange={(e) => { setFilterCat(e.target.value); setPage(0); }}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={styles.select} value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className={styles.btn} onClick={exportCSV}>↓ Export CSV</button>
          {nextPageToken && (
            <button className={styles.btn} onClick={() => fetchThreads(nextPageToken)} disabled={loading}>
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Date</th>
                <th style={{ width: 130 }}>Customer</th>
                <th>Subject / snippet</th>
                <th style={{ width: 130 }}>Category</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 50, textAlign: "center" }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && threads.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}><div className={styles.spinner} style={{ display: "inline-block", marginRight: 8 }} />Loading threads…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>No threads match your filters.</td></tr>
              ) : pageRows.map((r) => (
                <>
                  <tr key={r.id} className={styles.tableRow} onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{r.date || "—"}</td>
                    <td style={{ fontWeight: 500 }}>{r.customer}</td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2 }}>{r.subject}</div>
                      <div style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.4 }}>{r.snippet?.slice(0, 120)}{r.snippet?.length > 120 ? "…" : ""}</div>
                    </td>
                    <td><Badge label={r.category} colorMap={CAT_BG} /></td>
                    <td><Badge label={r.status} colorMap={STATUS_COLORS} /></td>
                    <td style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 12 }}>{expandedId === r.id ? "▲" : "▼"}</td>
                  </tr>
                  {expandedId === r.id && (
                    <tr key={r.id + "-detail"}>
                      <td colSpan={6} style={{ padding: "0 12px 12px", background: "var(--bg-secondary)" }}>
                        <div className={styles.detailPanel}>
                          <div className={styles.detailGrid}>
                            <div>
                              <p className={styles.detailLabel}>Customer</p>
                              <p className={styles.detailValue}>{r.customer}</p>
                            </div>
                            <div>
                              <p className={styles.detailLabel}>Date</p>
                              <p className={styles.detailValue}>{r.date || "—"}</p>
                            </div>
                            <div>
                              <p className={styles.detailLabel}>Messages in thread</p>
                              <p className={styles.detailValue}>{r.messageCount}</p>
                            </div>
                            <div>
                              <p className={styles.detailLabel}>Has our reply</p>
                              <p className={styles.detailValue}>{r.hasSent ? "Yes" : "No"}</p>
                            </div>
                          </div>
                          <div style={{ marginTop: 12 }}>
                            <p className={styles.detailLabel}>Full snippet</p>
                            <p style={{ fontSize: 13, lineHeight: 1.6, margin: "4px 0 12px" }}>{r.snippet}</p>
                          </div>
                          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                            <div>
                              <p className={styles.detailLabel} style={{ marginBottom: 4 }}>Override category</p>
                              <select className={styles.select} value={r.category} onChange={(e) => setOverride(r.id, "category", e.target.value)}>
                                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <p className={styles.detailLabel} style={{ marginBottom: 4 }}>Override status</p>
                              <select className={styles.select} value={r.status} onChange={(e) => setOverride(r.id, "status", e.target.value)}>
                                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
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
          <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
            {filtered.length > 0 ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}` : "0 results"}
          </span>
          <button className={styles.btn} onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>‹ Prev</button>
          <button className={styles.btn} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next ›</button>
        </div>
      </main>
    </div>
  );
}
