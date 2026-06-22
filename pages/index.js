import { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedThread, setSelectedThread] = useState(null);

  useEffect(() => {
    if (session) {
      fetchThreads();
    }
  }, [session]);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/threads");
      const data = await res.json();
      if (data.threads) {
        setThreads(data.threads);
        if (data.threads.length > 0) {
          setSelectedThread(data.threads[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load threads:", err);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case "Software": return "bg-blue-100 text-blue-800 border-blue-200";
      case "Hardware": return "bg-amber-100 text-amber-800 border-amber-200";
      case "Setup": return "bg-purple-100 text-purple-800 border-purple-200";
      case "Connectivity": return "bg-rose-100 text-rose-800 border-rose-200";
      case "Contact request": return "bg-teal-100 text-teal-800 border-teal-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 font-medium animate-pulse">Loading workspace...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">AI Support Tracker</h1>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            Connect your inbox to unlock structural categorization, automatic spam filtering, and smart AI resolutions powered by Gemini.
          </p>
          <button
            onClick={() => signIn("google")}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-all flex items-center justify-center gap-3 border border-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600"
          >
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm shadow-indigo-200">⌘</div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">AI Agent Dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold text-slate-900">{session.user?.name}</div>
            <div className="text-xs text-slate-400">{session.user?.email}</div>
          </div>
          <button
            onClick={() => signOut()}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Container Layout split into two panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Ticket Queue Scroll list */}
        <aside className="w-full md:w-[420px] bg-white border-r border-slate-200 flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 className="font-semibold text-slate-700 text-sm">Active Inquiries ({threads.length})</h2>
            <button 
              onClick={fetchThreads}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg bg-white border border-slate-200 shadow-sm transition-colors"
              title="Refresh Queue"
            >
              🔄
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm animate-pulse">Running semantic parsing...</div>
          ) : threads.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">No unresolved tickets found matching current parameters.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedThread(t)}
                  className={`w-full text-left p-4 transition-all flex flex-col gap-2 border-l-4 ${
                    selectedThread?.id === t.id
                      ? "bg-indigo-50/60 border-indigo-600"
                      : "border-transparent hover:bg-slate-50/80"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500 truncate max-w-[180px]">{t.customer}</span>
                    <span className="text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{t.date}</span>
                  </div>
                  <h3 className="font-medium text-slate-900 text-sm line-clamp-1">{t.subject}</h3>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{t.snippet}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getCategoryColor(t.category)}`}>
                      {t.category}
                    </span>
                    <span className={`text-[11px] font-medium ${t.status === 'Open' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      ● {t.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Right Side: Selected Ticket Detailed Content Grid */}
        <main className="flex-1 bg-slate-50 p-6 overflow-y-auto hidden md:block">
          {selectedThread ? (
            <div className="max-w-4xl mx-auto flex flex-col gap-6">
              {/* Main Ticket Header Card */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
                  <div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border uppercase tracking-wider ${getCategoryColor(selectedThread.category)}`}>
                      {selectedThread.category}
                    </span>
                    <h2 className="text-xl font-bold text-slate-900 mt-2 leading-tight">{selectedThread.subject}</h2>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold text-slate-900">{selectedThread.customer}</div>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono">ID: {selectedThread.id}</div>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Original Context Block</h4>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                    {selectedThread.snippet}...
                  </div>
                </div>
              </div>

              {/* Gemini Interactive Analysis Insights Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* AI Executive Summary Panel */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-indigo-600">
                    <span className="text-lg">✨</span>
                    <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">AI Intent Summary</h3>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed bg-indigo-50/30 rounded-xl p-4 border border-indigo-50/50 flex-1">
                    {selectedThread.inquirySummary}
                  </p>
                </div>

                {/* AI Resolution Recommendations Card */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <span className="text-lg">💡</span>
                    <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">Recommended Resolution</h3>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed bg-emerald-50/30 rounded-xl p-4 border border-emerald-50/50 flex-1">
                    {selectedThread.recommendedFix}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              Select an active thread item from the queue list to inspect intelligence matrices.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
