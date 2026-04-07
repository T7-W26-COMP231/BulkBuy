import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

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

// ── Hard-coded data ────────────────────────────────────────────────────────
const STAT_CARDS = [
  {
    label: "Pending Quote Reviews",
    value: "1,482",
    extra: "+12% vs last week",
    icon: "description",
    accent: "text-primary",
    extraColor: "text-text-muted",
  },
  {
    label: "Active Aggregation Windows",
    value: "42",
    extra: "Active",
    icon: "schedule",
    accent: "text-emerald-600",
    extraColor: "text-emerald-600",
  },
  {
    label: "Critical Alerts",
    value: "03",
    extra: "Critical",
    icon: "error",
    accent: "text-red-500",
    extraColor: "text-red-500",
  },
];

const STATUS_STYLES = {
  TRENDING: "bg-emerald-100 text-emerald-700",
  "NEAR TARGET": "bg-amber-100 text-amber-700",
  STABLE: "bg-sky-100 text-sky-700",
};

const WINDOW_CLOSURES = [
  {
    id: 1,
    city: "New York City",
    code: "US-EAST-01",
    status: "TRENDING",
    participants: "4,281 users",
    timeRemaining: "04h 21m",
    target: "$840,000",
  },
  {
    id: 2,
    city: "San Francisco",
    code: "US-WEST-02",
    status: "NEAR TARGET",
    participants: "2,104 users",
    timeRemaining: "01h 15m",
    target: "$1,200,000",
  },
  {
    id: 3,
    city: "Chicago",
    code: "US-MID-04",
    status: "STABLE",
    participants: "942 users",
    timeRemaining: "12h 44m",
    target: "$320,000",
  },
];

// ── Dashboard ──────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { accessToken } = useAuth();

  const [stats, setStats] = useState({
    pendingQuotes: 0,
    activeWindows: 0,
    criticalAlerts: 0,
  });

  useEffect(() => {
    const fetchDashboardMetrics = async () => {
      try {
        console.log("ADMIN TOKEN:", accessToken);
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

  return (
    <div className="min-h-screen bg-background-light text-text-main">
      <div className="flex min-h-screen">
        <AdminSidebar />

        <div className="flex min-h-screen flex-1 flex-col">
          <AdminTopbar title="Admin Dashboard" />

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
                      className="w-full rounded-2xl bg-primary px-6 py-4 text-base font-bold text-text-main transition hover:opacity-90 lg:max-w-[230px]"
                    >
                      View Full Status
                    </button>
                    <button
                      type="button"
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
                      {WINDOW_CLOSURES.map((row) => (
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
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

            </div>
          </main>
        </div>
      </div>
    </div>
  );
}