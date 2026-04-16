import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Navbar from "../../components/Navbar";

// ── Stat Card ──────────────────────────────────────────────────────────────
function AdminStatCard({ icon, label, value, extra, extraColor, accent }) {
  return (
    <article className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div
          className={`flex size-11 items-center justify-center rounded-2xl bg-neutral-light ${accent}`}
        >
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
        <span className={`text-xs font-bold ${extraColor}`}>{extra}</span>
      </div>

      <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
        {label}
      </p>
      <p className="mt-3 text-4xl font-bold tracking-tight text-text-main">
        {value}
      </p>
    </article>
    
  );
}


const STATUS_STYLES = {
  TRENDING: "bg-emerald-100 text-emerald-700",
  "NEAR TARGET": "bg-amber-100 text-amber-700",
  STABLE: "bg-sky-100 text-sky-700",
};



// ── Dashboard ──────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false); // ← add this
  const navigate = useNavigate();

  const { accessToken } = useAuth();

  const [stats, setStats] = useState({
    pendingQuotes: 0,
    activeWindows: 0,
    criticalAlerts: 0,
  });
  const [windowClosures, setWindowClosures] = useState([]);

  useEffect(() => {
    const fetchDashboardMetrics = async () => {
      try {
        //console.log("ADMIN TOKEN:", accessToken);
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/orders/dashboard-metrics`,
          {
            method: "GET",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              ...(accessToken
                ? { Authorization: `Bearer ${accessToken}` }
                : {}),
            },
          }
        );

        const result = await response.json();

        if (result?.success) {
          setStats(result.data);
        }
      } catch (error) {
        console.error("Failed to load dashboard metrics:", error);
      }
    };

    if (accessToken) {
      fetchDashboardMetrics();
    }
  }, [accessToken]);

  useEffect(() => {
    const fetchWindowClosures = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/swnds`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        });
        const result = await res.json();
        console.log("API RESPONSE:", result);        // ← add this

        const data = Array.isArray(result.items)
          ? result.items
          : Array.isArray(result.data)
            ? result.data
            : Array.isArray(result)
              ? result
              : [];
        console.log("PARSED DATA LENGTH:", data.length);  // ← add this

        const now = Date.now();

        const upcoming = data
          .filter((w) => {
            const passes = w.window.toEpoch > now;
            console.log(w._id, w.window.toEpoch, now, passes);
            return passes;
          })
          .map((w) => {
            let totalQtySold = 0, totalQtyAvailable = 0, target = 0;

            for (const p of w.products || []) {
              for (const it of p.items || []) {
                totalQtySold += it.qtySold || 0;
                totalQtyAvailable += it.qtyAvailable || 0;
                const snaps = it.pricing_snapshots || [];
                const latest = snaps[snaps.length - 1];
                if (latest) target += (latest.atInstantPrice || 0) * (it.qtyAvailable || 0);
              }
            }

            const msRemaining = w.window.toEpoch - now;
            const hoursRemaining = msRemaining / 3600000;
            const totalStock = totalQtySold + totalQtyAvailable;
            const sellThrough = totalStock > 0 ? totalQtySold / totalStock : 0;

            let status = "STABLE";
            if (sellThrough >= 0.6 || hoursRemaining <= 2) status = "NEAR TARGET";
            else if (sellThrough >= 0.3 || hoursRemaining <= 6) status = "TRENDING";

            const h = Math.floor(msRemaining / 3600000);
            const m = Math.floor((msRemaining % 3600000) / 60000);

            return {
              id: w._id,
              msRemaining,
              city: w.ops_region,
              code: w.ops_region.toUpperCase(),
              status,
              participants: `${totalQtySold.toLocaleString()} users`,
              timeRemaining: `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`,
              target: `$${Math.round(target).toLocaleString()}`,
            };
          })
          .sort((a, b) => a.msRemaining - b.msRemaining);

        setWindowClosures(upcoming);
      } catch (err) {
        console.error("Failed to load window closures:", err);
      }
    };

    if (accessToken) fetchWindowClosures();
  }, [accessToken]);

  return (
    <>
    {/* <Navbar/>  */}
    <AdminTopbar
            title="Admin Dashboard"
            onMenuClick={() => setSidebarOpen(true)}    // ← add this
    />
   
    <div className="min-h-screen bg-background-light text-text-main">
      <div className="flex min-h-screen">
        <AdminSidebar
          isMobileOpen={sidebarOpen}                    // ← add this
          onClose={() => setSidebarOpen(false)}         // ← add this
        />

        <div className="flex min-h-screen flex-1 flex-col">
          

          <main className="flex-1 px-6 py-8 md:px-8 lg:px-10">
            <div className="mx-auto flex max-w-7xl flex-col gap-5">

              {/* ── Hero banner ───────────────────────────────────────── */}
              <section className="overflow-hidden rounded-3xl bg-[#083b2d] px-6 py-7 text-white shadow-lg md:px-8 md:py-8">
                <div className="grid gap-8 lg:grid-cols-[1.4fr_320px] lg:items-center">
                  <div>
                    <h1 className="text-4xl font-bold tracking-tight">
                      Admin System Overview
                    </h1>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-white/75 md:text-base">
                      Monitor quotes, aggregation windows, and system alerts
                      across all active US sectors.
                    </p>

                    <div className="mt-10 max-w-xl">
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <span className="text-sm font-semibold text-white/80">
                          System Processing Load
                        </span>
                        <span className="text-3xl font-bold">75%</span>
                      </div>

                      <div className="h-3 overflow-hidden rounded-full bg-white/15">
                        <div className="h-full w-[75%] rounded-full bg-primary" />
                      </div>

                      <p className="mt-3 text-xs text-white/60">
                        Status: Optimal operating efficiency. Next automated
                        sync in 12m 45s.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 lg:items-end">
                    <button
                      type="button"
                      onClick={() => navigate("/admin/monitor-quotes")}
                      className="w-full rounded-2xl bg-primary px-6 py-4 text-base font-bold text-text-main transition hover:opacity-90 lg:max-w-[230px]"
                    >
                      View Full Status
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate("/admin/monitor-quotes")}
                      className="w-full rounded-2xl border border-white/20 bg-white/10 px-6 py-4 text-base font-bold text-white transition hover:bg-white/15 lg:max-w-[230px]"
                    >
                      System Diagnostics
                    </button>
                  </div>
                </div>
              </section>

              {/* ── Stat cards ────────────────────────────────────────── */}
              <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <AdminStatCard
                  label="Pending Supplier Quotes"
                  value={stats.pendingQuotes}
                  extra={
                    stats.pendingQuotes > 0
                      ? `${stats.pendingQuotes} awaiting supplier action`
                      : "No pending quotes"
                  }
                  icon="request_quote"
                  accent="text-primary"
                  extraColor={
                    stats.pendingQuotes > 0
                      ? "text-amber-600"
                      : "text-text-muted"
                  }
                />

                <AdminStatCard
                  label="Active Aggregation Windows"
                  value={stats.activeWindows}
                  extra={
                    stats.activeWindows > 0
                      ? `${stats.activeWindows} live windows running`
                      : "No active windows"
                  }
                  icon="schedule"
                  accent="text-primary"
                  extraColor={
                    stats.activeWindows > 0
                      ? "text-green-600"
                      : "text-text-muted"
                  }
                />

                <AdminStatCard
                  label="Critical Alerts"
                  value={stats.criticalAlerts}
                  extra="Critical"
                  icon="warning"
                  accent="text-primary"
                  extraColor="text-red-500"
                />
              </section>

              {/* ── System Alerts Widget ─────────────────────────────── */}
              <section className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-text-main">
                      System Alerts Widget
                    </h2>
                    <p className="mt-1 text-sm text-text-muted">
                      Live monitoring of critical platform alerts and failed workflows
                    </p>
                  </div>

                  <span
                    className={`inline-flex rounded-xl px-4 py-2 text-sm font-bold ${stats.criticalAlerts > 0
                      ? "bg-red-100 text-red-600"
                      : "bg-emerald-100 text-emerald-600"
                      }`}
                  >
                    {stats.criticalAlerts > 0
                      ? `${stats.criticalAlerts} active alerts`
                      : "System stable"}
                  </span>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-2xl bg-neutral-light/40 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                      Critical Alerts
                    </p>
                    <p className="mt-3 text-3xl font-bold text-red-500">
                      {stats.criticalAlerts}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-neutral-light/40 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                      Alert Severity
                    </p>
                    <p className="mt-3 text-lg font-bold text-text-main">
                      {stats.criticalAlerts === 0
                        ? "Stable"
                        : stats.criticalAlerts > 3
                          ? "High"
                          : "Moderate"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-neutral-light/40 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                      Recommended Action
                    </p>
                    <p className="mt-3 text-sm font-semibold text-text-main">
                      {stats.criticalAlerts > 0
                        ? "Review declined and cancelled supply orders"
                        : "No action required"}
                    </p>
                  </div>
                </div>
              </section>

              {/* ── Upcoming Window Closures ──────────────────────────── */}
              <section className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-neutral-light px-6 py-5 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-text-main">
                      Upcoming Window Closures
                    </h2>
                    <p className="mt-1 text-sm text-text-muted">
                      Real-time status of regional bulk buy sessions
                    </p>
                  </div>

                  <button
                    type="button"
                    className="text-sm font-bold text-primary transition hover:opacity-80"
                  >
                    View All Windows
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left">
                    <thead className="border-b border-neutral-light bg-neutral-light/40">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Region / City
                        </th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Status
                        </th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Participants
                        </th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Time Remaining
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Target (USD)
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-neutral-light">
                      {windowClosures.length > 0 ? (
                        windowClosures.map((row) => (
                          <tr
                            key={row.id}
                            className="transition hover:bg-neutral-light/40"
                          >
                            {/* Region / City */}
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <div className="flex size-10 items-center justify-center rounded-xl bg-neutral-light text-text-muted">
                                  <span className="material-symbols-outlined text-[20px]">
                                    map
                                  </span>
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-text-main">
                                    {row.city}
                                  </p>
                                  <p className="mt-0.5 text-xs text-text-muted">
                                    {row.code}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-6 py-5">
                              <span
                                className={`inline-flex rounded-lg px-3 py-1 text-xs font-bold ${STATUS_STYLES[row.status] ??
                                  "bg-slate-100 text-slate-700"
                                  }`}
                              >
                                {row.status}
                              </span>
                            </td>

                            {/* Participants */}
                            <td className="px-6 py-5 text-sm font-medium text-text-main">
                              {row.participants}
                            </td>

                            {/* Time Remaining */}
                            <td className="px-6 py-5 text-sm text-text-muted">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px]">
                                  schedule
                                </span>
                                {row.timeRemaining}
                              </div>
                            </td>

                            {/* Target */}
                            <td className="px-6 py-5 text-right text-sm font-bold text-text-main">
                              {row.target}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-6 py-10 text-center text-sm text-text-muted"
                          >
                            No upcoming window closures
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

            </div>
          </main>
        </div>
      </div>
    </div>
     </>
  );
}