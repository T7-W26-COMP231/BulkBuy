import { useState } from "react";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";

const tabs = [
  { id: "active-intents", label: "Active Intents" },
  { id: "order-history", label: "Order History" },
];

const activeIntent = {
  id: 1,
  name: "Premium Organic Avocados (Box of 12)",
  image:
    "https://images.unsplash.com/photo-1519162808019-7de1683fa2ad?auto=format&fit=crop&w=900&q=80",
  units: 12,
  currentTier: 2,
  nextTierLabel: "Tier 3",
  nextTierPrice: "$1.10/unit",
  pricePerUnit: "$1.25",
  estimatedSavings: "$4.20",
  progress: 85,
  status: "In Progress",
  badge: "Organic Certified",
};

const pastOrders = [
  {
    id: 1,
    name: "Premium Organic Avocados (Box of 12)",
    image:
      "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=500&q=80",
    status: "Tier 3 Achieved",
    deliveredDate: "Delivered Oct 12, 2023",
    city: "Toronto",
    totalPaid: "$13.20",
    unitPrice: "$1.10/unit",
    orderRef: "#BB-TOR-48291",
  },
  {
    id: 2,
    name: "Organic Roma Tomatoes (Crate of 10)",
    image:
      "https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=500&q=80",
    status: "Tier 2 Achieved",
    deliveredDate: "Delivered Sep 30, 2023",
    city: "Toronto",
    totalPaid: "$18.50",
    unitPrice: "$1.85/unit",
    orderRef: "#BB-TOR-48212",
  },
];

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState("active-intents");

  return (
    <div className="min-h-screen bg-background-light text-text-main">
      <Navbar showLocation={false} />

      <main className="px-6 py-8 md:px-10 lg:px-16 xl:px-20">
        <div className="mx-auto flex max-w-7xl flex-col gap-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
                My Intents & Orders
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-text-muted md:text-base">
                Manage your active bulk commitments and view past savings in Toronto.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 self-start rounded-xl bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
              <span className="material-symbols-outlined text-base">
                location_on
              </span>
              Toronto, ON
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div>
              <Sidebar showSummary={true} />
            </div>

            <div className="flex flex-col gap-8">
              <section className="rounded-2xl border border-neutral-light bg-white p-3 shadow-sm">
                <div className="flex flex-wrap gap-2">
                  {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                          isActive
                            ? "bg-primary text-text-main"
                            : "bg-neutral-light text-text-muted hover:bg-primary/15"
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Active Intent</h2>
                  <span className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700">
                    {activeIntent.status}
                  </span>
                </div>

                <div className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
                  <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="relative h-64 lg:h-full">
                      <img
                        src={activeIntent.image}
                        alt={activeIntent.name}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 flex items-end p-4">
                        <span className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-text-main shadow">
                          {activeIntent.badge}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-6 p-6">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <h3 className="text-2xl font-bold">{activeIntent.name}</h3>
                          </div>

                          <div className="text-left md:text-right">
                            <p className="text-3xl font-bold text-primary">
                              {activeIntent.pricePerUnit}
                              <span className="ml-1 text-sm font-medium text-text-muted">
                                /unit
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-text-muted">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">
                              inventory_2
                            </span>
                            {activeIntent.units} units
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">
                              leaderboard
                            </span>
                            Current Tier: {activeIntent.currentTier}
                          </div>

                          <div className="flex items-center gap-2 font-semibold text-primary">
                            <span className="material-symbols-outlined text-base">
                              savings
                            </span>
                            Est. Savings: {activeIntent.estimatedSavings}
                          </div>
                        </div>

                        <div>
                          <div className="mb-2 flex items-center justify-between text-sm">
                            <span className="font-semibold text-text-muted">
                              Progress to {activeIntent.nextTierLabel} ({activeIntent.nextTierPrice})
                            </span>
                            <span className="font-bold text-primary">
                              {activeIntent.progress}%
                            </span>
                          </div>

                          <div className="h-3 w-full rounded-full bg-neutral-light">
                            <div
                              className="h-3 rounded-full bg-primary transition-all"
                              style={{ width: `${activeIntent.progress}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 border-t border-neutral-light pt-4 sm:flex-row">
                        <button className="flex-1 rounded-xl bg-primary px-5 py-3 font-bold text-text-main transition hover:opacity-90">
                          View Batch Progress
                        </button>
                        <button className="rounded-xl bg-neutral-light px-5 py-3 font-bold text-text-main transition hover:bg-primary/15">
                          Edit Intent
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Past Orders</h2>
                  <button className="text-sm font-semibold text-primary hover:underline">
                    View All
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  {pastOrders.map((order) => (
                    <div
                      key={order.id}
                      className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm"
                    >
                      <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="h-20 w-20 overflow-hidden rounded-xl bg-neutral-light">
                            <img
                              src={order.image}
                              alt={order.name}
                              className="h-full w-full object-cover"
                            />
                          </div>

                          <div className="min-w-0">
                            <h3 className="truncate text-xl font-bold">{order.name}</h3>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-green-100 px-2 py-1 text-xs font-bold uppercase text-green-700">
                                {order.status}
                              </span>
                              <span className="text-sm text-text-muted">
                                {order.deliveredDate} • {order.city}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 md:items-end">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                              Total Paid
                            </p>
                            <p className="text-2xl font-bold">
                              {order.totalPaid}
                              <span className="ml-2 text-sm font-medium text-text-muted">
                                ({order.unitPrice})
                              </span>
                            </p>
                          </div>

                          <button className="inline-flex items-center gap-2 text-sm font-semibold text-text-main hover:text-primary">
                            <span className="material-symbols-outlined text-base">
                              receipt_long
                            </span>
                            Invoice
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 border-t border-neutral-light bg-neutral-light/40 px-6 py-4 text-sm md:flex-row md:items-center md:justify-between">
                        <p className="text-text-muted">Order Ref: {order.orderRef}</p>

                        <button className="inline-flex items-center gap-2 font-semibold text-primary hover:underline">
                          <span className="material-symbols-outlined text-base">
                            refresh
                          </span>
                          Buy Again at Best Price
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 text-primary">
                    <span className="material-symbols-outlined">
                      tips_and_updates
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold">Toronto Demand Alert</h3>
                    <p className="mt-1 text-sm leading-7 text-text-muted">
                      There are 24 other customers in your Toronto neighborhood
                      currently watching organic produce. Increase your intent
                      units to help everyone unlock Tier 3 pricing faster.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}