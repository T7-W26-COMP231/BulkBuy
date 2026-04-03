import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useEffect, useState } from "react";
import SupplierLayout from "../../components/supplier/SupplierLayout";
import { fetchSupplierDashboardSummary, fetchSupplierAggregations, fetchSupplierSuppliesByStatus, fetchSupplierRecentSupplies } from "../../api/supplyApi";


function SupplierStatCard({ icon, label, value, extra, accent, extraColor }) {
  return (
    <article className="rounded-2xl border border-neutral-light bg-white p-5 shadow-sm">
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

export default function SupplierDashboard() {
  const { user, accessToken } = useAuth();
  const [recentSupplies, setRecentSupplies] = useState([]);
  const [dashboardSummary, setDashboardSummary] = useState({
    activeQuotes: "0",
    activeAggregationWindows: "0",
    orderRequests: "0",
    criticalAlerts: "0",
  });
  const [demandSummary, setDemandSummary] = useState({
    quote: 0,
    received: 0,
    accepted: 0,
    dispatched: 0,
    delivered: 0,
    cancelled: 0,
  });

  useEffect(() => {
    const loadDashboardSummary = async () => {
      try {
        const [summaryRes, aggrRes, quoteRes, receivedRes, acceptedRes, dispatchedRes, deliveredRes, cancelledRes, recentRes] = await Promise.all([
          fetchSupplierDashboardSummary(),
          fetchSupplierAggregations(user._id),
          fetchSupplierSuppliesByStatus(user._id, "quote"),
          fetchSupplierSuppliesByStatus(user._id, "received"),
          fetchSupplierSuppliesByStatus(user._id, "accepted"),
          fetchSupplierSuppliesByStatus(user._id, "dispatched"),
          fetchSupplierSuppliesByStatus(user._id, "delivered"),
          fetchSupplierSuppliesByStatus(user._id, "cancelled"),
          fetchSupplierRecentSupplies(), // 👈 add this

        ]);

        const summary = summaryRes?.data || {};
        const activeAggregationWindows = aggrRes?.items?.filter(
          (a) => a.status === "in_process" || a.status === "pending"
        ).length ?? 0;

        setDashboardSummary({
          activeQuotes: String(summary.activeQuotes ?? 0),
          activeAggregationWindows: String(activeAggregationWindows),
          orderRequests: String(summary.orderRequests ?? 0),
          criticalAlerts: String(summary.criticalAlerts ?? 0),
        });

        setDemandSummary({
          quote: quoteRes?.total ?? 0,
          received: receivedRes?.total ?? 0,
          accepted: acceptedRes?.total ?? 0,
          dispatched: dispatchedRes?.total ?? 0,
          delivered: deliveredRes?.total ?? 0,
          cancelled: cancelledRes?.total ?? 0,
        });
        setRecentSupplies(recentRes?.items || []);
        console.log("recentRes:", recentRes); // 👈 add this

        console.log("user._id:", user._id);
        console.log("quoteRes:", quoteRes);
      } catch (error) {
        console.error("Failed to load supplier dashboard summary:", error);
      }
    };

    if (accessToken && user?.role === "supplier") {
      loadDashboardSummary();
    }
  }, [accessToken, user]);

  if (!accessToken || !user) {
    return <Navigate to="/" replace />;
  }

  if (user.role !== "supplier") {
    return <Navigate to="/" replace />;
  }

  const summaryCards = [// this is need to change
    {
      label: "Active Quotes",
      value: dashboardSummary.activeQuotes,
      extra: "Current total",
      icon: "description",
      accent: "text-primary",
      extraColor: "text-text-muted",
    },
    {
      label: "Active Aggregation Windows",
      value: dashboardSummary.activeAggregationWindows,
      extra: "Active",
      icon: "schedule",
      accent: "text-emerald-600",
      extraColor: "text-emerald-600",
    },
    {
      label: "Total Order Requests",
      value: dashboardSummary.orderRequests,
      extra: "Pending + current",
      icon: "shopping_cart",
      accent: "text-sky-600",
      extraColor: "text-sky-600",
    },
    {
      label: "Critical Alerts",
      value: dashboardSummary.criticalAlerts,
      extra: "Critical",
      icon: "error",
      accent: "text-red-500",
      extraColor: "text-red-500",
    },
  ];

  return (
    <SupplierLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <section className="overflow-hidden rounded-3xl bg-[#083b2d] px-6 py-7 text-white shadow-lg md:px-8 md:py-8">
          <div className="grid gap-8 lg:grid-cols-[1.4fr_320px] lg:items-center">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">
                Supplier System Overview
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/75 md:text-base">
                Monitor your active quotes, manage aggregation windows, and
                track critical system alerts across all your active regions.
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
                  Status: Optimal operating efficiency. Next automated sync in
                  12m 45s.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <button
                type="button"
                className="w-full rounded-2xl bg-primary px-6 py-4 text-base font-bold text-text-main transition hover:opacity-90 lg:max-w-[230px]"
              >
                View Status
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

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <SupplierStatCard key={card.label} {...card} />
          ))}
        </section>

        {/* 👇 ADD THIS SECTION HERE */}
        <section className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-text-main">Demand Monitoring Summary</h2>
            <p className="mt-1 text-sm text-text-muted">Breakdown of supply requests by status</p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Quote", key: "quote", color: "bg-blue-50 text-blue-700" },
              { label: "Received", key: "received", color: "bg-emerald-50 text-emerald-700" },
              { label: "Accepted", key: "accepted", color: "bg-green-50 text-green-700" },
              { label: "Dispatched", key: "dispatched", color: "bg-orange-50 text-orange-700" },
              { label: "Delivered", key: "delivered", color: "bg-purple-50 text-purple-700" },
              { label: "Cancelled", key: "cancelled", color: "bg-red-50 text-red-700" },
            ].map(({ label, key, color }) => (
              <div key={key} className={`rounded-2xl p-4 ${color}`}>
                <p className="text-xs font-bold uppercase tracking-widest opacity-70">{label}</p>
                <p className="mt-2 text-4xl font-bold">{demandSummary[key]}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-neutral-light px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-text-main">
                Recent Activity
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Real-time feed of supplier actions and window closures
              </p>
            </div>

            <button
              type="button"
              className="text-sm font-bold text-primary transition hover:opacity-80"
            >
              View All Activity
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b border-neutral-light bg-neutral-light/40">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                    Activity / Entity
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                    Involved Users
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                    Timestamp
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                    Value (USD)
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-light">

                {recentSupplies.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-text-muted">
                      No recent activity found.
                    </td>
                  </tr>
                ) : (
                  recentSupplies.map((supply) => {
                    const statusColors = {
                      quote: "bg-blue-50 text-blue-700",
                      received: "bg-emerald-100 text-emerald-700",
                      accepted: "bg-green-100 text-green-700",
                      dispatched: "bg-orange-100 text-orange-700",
                      delivered: "bg-purple-100 text-purple-700",
                      cancelled: "bg-red-100 text-red-700",
                    };
                    return (
                      <tr key={supply._id} className="transition hover:bg-neutral-light/40">
                        <td className="px-6 py-5">
                          <div className="flex items-start gap-3">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-neutral-light text-text-muted">
                              <span className="material-symbols-outlined text-[20px]">receipt_long</span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-text-main">Supply Request</p>
                              <p className="mt-1 text-xs text-text-muted">#{supply._id.slice(-6)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex rounded-lg px-3 py-1 text-xs font-bold ${statusColors[supply.status] ?? "bg-slate-100 text-slate-700"}`}>
                            {supply.status}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-sm font-medium text-text-main">
                          {supply.items?.length ?? 0} item(s)
                        </td>
                        <td className="px-6 py-5 text-sm text-text-muted">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px]">schedule</span>
                            {new Date(supply.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right text-sm font-bold text-text-main">
                          ${supply.items?.[0]?.quotes?.[0]?.pricePerBulkUnit ?? 0}
                        </td>
                      </tr>
                    );
                  })
                )}

              </tbody>
            </table>
          </div>
        </section>
      </div>
    </SupplierLayout>
  );
}