import SupplierLayout from "../../components/supplier/SupplierLayout";

const summaryCards = [
  {
    label: "Active Quotes",
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

const activityRows = [
  {
    id: 1,
    title: "Quote Submitted",
    subtitle: "#QT-2948",
    status: "Trending",
    statusClasses: "bg-emerald-100 text-emerald-700",
    users: "4,281 users",
    timestamp: "04h 21m ago",
    value: "$840,000",
    icon: "receipt_long",
  },
  {
    id: 2,
    title: "Order Approved",
    subtitle: "#ORD-9921",
    status: "Processing",
    statusClasses: "bg-orange-100 text-orange-700",
    users: "2,104 users",
    timestamp: "01h 15m ago",
    value: "$1,200,000",
    icon: "check_box",
  },
  {
    id: 3,
    title: "Window Extension",
    subtitle: "Chicago Region",
    status: "Stable",
    statusClasses: "bg-slate-200 text-slate-700",
    users: "942 users",
    timestamp: "12h 44m ago",
    value: "$320,000",
    icon: "history",
  },
];

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

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {summaryCards.map((card) => (
            <SupplierStatCard key={card.label} {...card} />
          ))}
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
                {activityRows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition hover:bg-neutral-light/40"
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-neutral-light text-text-muted">
                          <span className="material-symbols-outlined text-[20px]">
                            {row.icon}
                          </span>
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-text-main">
                            {row.title}
                          </p>
                          <p className="mt-1 text-xs text-text-muted">
                            {row.subtitle}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <span
                        className={`inline-flex rounded-lg px-3 py-1 text-xs font-bold ${row.statusClasses}`}
                      >
                        {row.status}
                      </span>
                    </td>

                    <td className="px-6 py-5 text-sm font-medium text-text-main">
                      {row.users}
                    </td>

                    <td className="px-6 py-5 text-sm text-text-muted">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">
                          schedule
                        </span>
                        {row.timestamp}
                      </div>
                    </td>

                    <td className="px-6 py-5 text-right text-sm font-bold text-text-main">
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </SupplierLayout>
  );
}