import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import AdminSummaryCard from "../../components/admin/AdminSummaryCard";

const alerts = [
  {
    title: "Pending supplier quotes",
    description: "3 supplier submissions are waiting for review.",
  },
  {
    title: "Low inventory warning",
    description: "2 catalog items may need restocking soon.",
  },
  {
    title: "Aggregation window ending soon",
    description: "The Toronto dairy bulk order closes in 6 hours.",
  },
];

const quickActions = [
  "Review supplier submissions",
  "Check bulk order requests",
  "Update pricing brackets",
  "View system settings",
];

const recentActivity = [
  "A new supplier quote was submitted this morning.",
  "One pricing bracket was updated for produce items.",
  "A bulk order was approved by the admin team.",
];

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-background-light text-text-main">
      <div className="flex min-h-screen">
        <AdminSidebar />

        <div className="flex min-h-screen flex-1 flex-col">
          <AdminTopbar title="Admin Dashboard" />

          <main className="flex-1 px-6 py-8 md:px-8 lg:px-10">
            <div className="mx-auto flex max-w-7xl flex-col gap-8">
              {/* Welcome Section */}
              <section className="rounded-2xl border border-neutral-light bg-white p-8 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Admin Overview
                </p>
                <h2 className="mt-3 text-3xl font-bold text-text-main">
                  Welcome back to the BulkBuy admin dashboard
                </h2>
                <p className="mt-3 max-w-3xl text-base text-text-muted">
                  Monitor supplier activity, product availability, active
                  aggregation windows, and system alerts from one place.
                </p>
              </section>

              {/* Summary Cards */}
              <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <AdminSummaryCard
                  label="Pending Quotes"
                  value="12"
                  extra="+3 today"
                />
                <AdminSummaryCard
                  label="Active Windows"
                  value="8"
                  badge="Live"
                />
                <AdminSummaryCard
                  label="Catalog Items"
                  value="146"
                  extra="Updated"
                />
                <AdminSummaryCard
                  label="System Alerts"
                  value="4"
                  badge="Attention"
                />
              </section>

              {/* Main Dashboard Grid */}
              <section className="grid gap-6 xl:grid-cols-3">
                {/* Alerts Panel */}
                <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm xl:col-span-2">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-xl font-bold text-text-main">
                      System Alerts
                    </h3>
                    <span className="rounded-md bg-neutral-light px-3 py-1 text-sm font-semibold text-text-muted">
                      {alerts.length} active
                    </span>
                  </div>

                  <div className="mt-5 space-y-4">
                    {alerts.map((alert, index) => (
                      <div
                        key={index}
                        className="rounded-xl border border-neutral-light bg-background-light p-4"
                      >
                        <h4 className="font-semibold text-text-main">
                          {alert.title}
                        </h4>
                        <p className="mt-2 text-sm text-text-muted">
                          {alert.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                  <h3 className="text-xl font-bold text-text-main">
                    Quick Actions
                  </h3>

                  <div className="mt-5 flex flex-col gap-3">
                    {quickActions.map((action, index) => (
                      <button
                        key={index}
                        type="button"
                        className="rounded-xl bg-neutral-light px-4 py-3 text-left font-semibold text-text-main transition hover:bg-primary/15"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Bottom Section */}
              <section className="grid gap-6 lg:grid-cols-2">
                {/* Recent Activity */}
                <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                  <h3 className="text-xl font-bold text-text-main">
                    Recent Activity
                  </h3>

                  <div className="mt-5 space-y-4">
                    {recentActivity.map((item, index) => (
                      <div
                        key={index}
                        className="rounded-xl border border-neutral-light p-4"
                      >
                        <p className="text-sm text-text-main">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Admin Notes / Placeholder Widget */}
                <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                  <h3 className="text-xl font-bold text-text-main">
                    Dashboard Notes
                  </h3>
                  <p className="mt-4 text-sm leading-7 text-text-muted">
                    This section can later be connected to live dashboard
                    metrics, notifications, or internal admin reminders. For
                    now, it completes the dashboard layout and keeps the admin
                    overview organized.
                  </p>

                  <div className="mt-6 rounded-xl bg-background-light p-4">
                    <p className="text-sm font-semibold text-text-main">
                      Current status
                    </p>
                    <p className="mt-2 text-sm text-text-muted">
                      Layout completed and ready for future API integration.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}