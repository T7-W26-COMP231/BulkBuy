import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";
import { useAuth } from "../../contexts/AuthContext";
import api from "../../api/api";

const tabs = [
  { id: "active-intents", label: "Active Intents" },
  { id: "order-history", label: "Order History" },
];

export default function OrdersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("active-intents");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [itemDataMap, setItemDataMap] = useState({});

  useEffect(() => {
    const fetchOrders = async () => {
      if (!user?._id) { setLoading(false); return; }
      try {
        setError(null);
        const res = await api.get(`/api/ordrs/user/${user._id}`);
        const all = res.data?.items || [];

        const relevantOrders = all
          .filter(o => ["submitted", "confirmed", "dispatched", "fulfilled", "cancelled"].includes(o.status))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        setOrders(relevantOrders);

        const uniqueItemIds = [...new Set(
          relevantOrders.flatMap(o => o.items.map(i => i.itemId?._id || i.itemId)).filter(Boolean)
        )];

        const itemResponses = await Promise.all(
          uniqueItemIds.map(id => api.get(`/api/items/${id}`).then(r => r.data).catch(() => null))
        );

        const itemMap = {};
        itemResponses.forEach((res, i) => {
          if (!res) return;
          const d = res.data ?? res;
          if (d?._id) itemMap[uniqueItemIds[i]] = d;
        });

        setItemDataMap(itemMap);
      } catch (err) {
        setError("Could not load your orders. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [user]);

  const activeIntents = orders.filter(o => o.status === "submitted");
  const pastOrders = orders.filter(o => ["confirmed", "dispatched", "fulfilled", "cancelled"].includes(o.status));

  function getItemDoc(itemId) {
    const id = itemId?._id || itemId;
    return itemDataMap[id] ?? {};
  }

  function getSnap(item) {
    return Array.isArray(item.pricingSnapshot)
      ? item.pricingSnapshot[item.pricingSnapshot.length - 1]
      : item.pricingSnapshot || {};
  }

  function getStatusBadge(status) {
    const map = {
      submitted: { label: "In Progress", color: "bg-amber-100 text-amber-700" },
      confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-700" },
      dispatched: { label: "Dispatched", color: "bg-purple-100 text-purple-700" },
      fulfilled: { label: "Delivered", color: "bg-green-100 text-green-700" },
      cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
    };
    return map[status] || { label: status, color: "bg-gray-100 text-gray-700" };
  }

  function getOrderTotals(order) {
    let totalQty = 0;
    let totalPrice = 0;
    let unitPrice = 0;
    order.items?.forEach(item => {
      const snap = getSnap(item);
      const price = snap?.atInstantPrice ?? 0;
      const qty = item.quantity ?? 1;
      totalQty += qty;
      totalPrice += price * qty;
      unitPrice = price; // last item price
    });
    return { totalQty, totalPrice, unitPrice };
  }

  return (
    <div className="min-h-screen bg-background-light font-display text-text-main">
      <Navbar showLocation={false} />

      <main className="px-6 py-8 md:px-10 lg:px-16 xl:px-20">
        <div className="mx-auto flex max-w-7xl flex-col gap-8">

          {/* Header */}
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-5xl">My Intents & Orders</h1>
              <p className="mt-2 max-w-2xl text-sm text-text-muted md:text-base">
                Manage your active bulk commitments and view past savings in Toronto.
              </p>
            </div>

          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <Sidebar showSummary={true} />

            <div className="flex flex-col gap-8">

              {/* Tabs */}
              <section className="rounded-2xl border border-neutral-light bg-white p-3 shadow-sm">
                <div className="flex flex-wrap gap-2">
                  {tabs.map((tab) => (
                    <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                      className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${activeTab === tab.id
                        ? "bg-primary text-text-main"
                        : "bg-neutral-light text-text-muted hover:bg-primary/15"
                        }`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </section>

              {loading && <p className="py-10 text-center text-text-muted">Loading your orders…</p>}
              {error && <div className="rounded-2xl border border-red-300 bg-red-50 px-5 py-4 font-medium text-red-800">❌ {error}</div>}

              {!loading && !error && (
                <>
                  {/* ── Active Intents ── */}
                  {activeTab === "active-intents" && (
                    <section className="flex flex-col gap-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold">Active Intent</h2>
                        <button onClick={() => navigate("/review-modify-intent")}
                          className="text-sm font-semibold text-primary hover:underline">
                          Manage Intents
                        </button>
                      </div>

                      {activeIntents.length === 0 ? (
                        <div className="rounded-2xl border border-neutral-light bg-white p-10 text-center text-text-muted">
                          No active intents.{" "}
                          <button onClick={() => navigate("/")} className="text-primary underline">Browse items</button>
                        </div>
                      ) : (
                        activeIntents.map(order => {
                          const { label, color } = getStatusBadge(order.status);
                          const { totalQty, totalPrice, unitPrice } = getOrderTotals(order);
                          const firstItem = order.items?.[0];
                          const itemDoc = getItemDoc(firstItem?.itemId);
                          const image = itemDoc.images?.[0] || itemDoc.metadata?.imageUrl || null;
                          const name = itemDoc.title || itemDoc.name || "Item";
                          const activeTier = firstItem?.activeTier || itemDoc.activeTier;
                          const nextThresholdQty = firstItem?.nextThresholdQty ?? itemDoc.nextThresholdQty ?? 0;
                          const aggregatedDemand = firstItem?.aggregatedDemand ?? itemDoc.aggregatedDemand ?? 0;
                          const progress = nextThresholdQty > 0
                            ? Math.min((aggregatedDemand / nextThresholdQty) * 100, 100)
                            : 100;
                          const nextTierPrice = firstItem?.nextTierPrice ?? itemDoc.nextTier?.price ?? null;
                          const tierLabel = activeTier
                            ? `Tier ${activeTier.minQty >= 50 ? 2 : 1}`
                            : "Tier 1";

                          return (
                            <div key={order._id} className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
                              {/* Status badge top right */}
                              <div className="flex items-center justify-between border-b border-neutral-light px-6 py-3">
                                <span className="text-sm font-semibold text-text-muted">Order #{order._id?.slice(-8).toUpperCase()}</span>
                                <span className={`rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wide ${color}`}>
                                  {label}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
                                {/* Image */}
                                <div className="relative h-64 lg:h-full">
                                  {image ? (
                                    <img src={image} alt={name} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex h-full min-h-[200px] items-center justify-center bg-neutral-light text-6xl">🛒</div>
                                  )}
                                  {itemDoc.badge && (
                                    <div className="absolute bottom-4 left-4">
                                      <span className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-text-main shadow">
                                        {itemDoc.badge}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Content */}
                                <div className="flex flex-col gap-5 p-6">
                                  <div className="flex items-start justify-between gap-4">
                                    <h3 className="text-2xl font-bold leading-tight">{name}</h3>
                                    <div className="text-right">
                                      <p className="text-3xl font-bold text-primary">
                                        ${unitPrice.toFixed(2)}
                                        <span className="ml-1 text-sm font-medium text-text-muted">/unit</span>
                                      </p>
                                    </div>
                                  </div>

                                  {/* Stats row */}
                                  <div className="flex flex-wrap gap-4 text-sm text-text-muted">
                                    <div className="flex items-center gap-2">
                                      <span className="material-symbols-outlined text-base">inventory_2</span>
                                      {totalQty} units
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="material-symbols-outlined text-base">leaderboard</span>
                                      Current Tier: {tierLabel}
                                    </div>
                                    {totalSavings(order) > 0 && (
                                      <div className="flex items-center gap-2 font-semibold text-primary">
                                        <span className="material-symbols-outlined text-base">savings</span>
                                        Est. Savings: ${totalSavings(order).toFixed(2)}
                                      </div>
                                    )}
                                  </div>

                                  {/* Progress bar */}
                                  {nextThresholdQty > 0 && (
                                    <div>
                                      <div className="mb-2 flex items-center justify-between text-sm">
                                        <span className="font-semibold text-text-muted">
                                          Progress to next tier
                                          {nextTierPrice ? ` ($${nextTierPrice.toFixed(2)}/unit)` : ""}
                                        </span>
                                        <span className="font-bold text-primary">{Math.round(progress)}%</span>
                                      </div>
                                      <div className="h-3 w-full rounded-full bg-neutral-light">
                                        <div
                                          className="h-3 rounded-full bg-primary transition-all duration-500"
                                          style={{ width: `${progress}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Action buttons */}
                                  <div className="flex flex-col gap-3 border-t border-neutral-light pt-4 sm:flex-row">
                                    <button
                                      onClick={() => navigate("/review-modify-intent")}
                                      className="flex-1 rounded-xl bg-primary px-5 py-3 font-bold text-text-main transition hover:opacity-90">
                                      View Batch Progress
                                    </button>
                                    <button
                                      onClick={() => navigate("/review-modify-intent")}
                                      className="rounded-xl border border-neutral-light bg-white px-5 py-3 font-bold text-text-main transition hover:bg-neutral-light">
                                      Edit Intent
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}

                    </section>
                  )}

                  {/* ── Order History ── */}
                  {activeTab === "order-history" && (
                    <section className="flex flex-col gap-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold">Past Orders</h2>
                        <span className="text-sm text-text-muted">{pastOrders.length} orders</span>
                      </div>

                      {pastOrders.length === 0 ? (
                        <div className="rounded-2xl border border-neutral-light bg-white p-10 text-center text-text-muted">
                          No past orders yet.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          {pastOrders.map(order => {
                            const { label, color } = getStatusBadge(order.status);
                            const { totalPrice } = getOrderTotals(order);

                            return (
                              <div key={order._id} className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
                                {order.items?.map((item, i) => {
                                  const itemDoc = getItemDoc(item.itemId);
                                  const snap = getSnap(item);
                                  const price = snap?.atInstantPrice ?? 0;
                                  const image = itemDoc.images?.[0] || itemDoc.metadata?.imageUrl || null;
                                  const name = itemDoc.title || itemDoc.name || "Item";

                                  return (
                                    <div key={i} className="flex flex-col gap-5 border-b border-neutral-light p-6 last:border-0 md:flex-row md:items-center md:justify-between">
                                      <div className="flex min-w-0 items-center gap-4">
                                        {/* Image */}
                                        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-neutral-light">
                                          {image
                                            ? <img src={image} alt={name} className="h-full w-full object-cover" />
                                            : <div className="flex h-full items-center justify-center text-3xl">🛒</div>
                                          }
                                        </div>

                                        {/* Info */}
                                        <div className="min-w-0">
                                          <h3 className="truncate text-xl font-bold">{name}</h3>
                                          <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <span className={`rounded-md px-2 py-1 text-xs font-bold uppercase ${color}`}>
                                              {label}
                                            </span>
                                            <span className="text-sm text-text-muted">
                                              {new Date(order.createdAt).toLocaleDateString()} · {order.ops_region || ""}
                                            </span>
                                          </div>
                                          <div className="mt-1 flex flex-wrap gap-3 text-sm text-text-muted">
                                            <span className="flex items-center gap-1">
                                              <span className="material-symbols-outlined text-base">inventory_2</span>
                                              Qty: {item.quantity}
                                            </span>
                                            <span className="flex items-center gap-1">
                                              <span className="material-symbols-outlined text-base">payments</span>
                                              ${price.toFixed(2)}/unit
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Total + Invoice */}
                                      <div className="flex flex-col items-end gap-2">
                                        <div className="text-right">
                                          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Total Paid</p>
                                          <p className="text-2xl font-bold">
                                            ${(price * item.quantity).toFixed(2)}
                                            <span className="ml-2 text-sm font-medium text-text-muted">(${price.toFixed(2)}/unit)</span>
                                          </p>
                                        </div>
                                        <button className="inline-flex items-center gap-2 text-sm font-semibold text-text-main hover:text-primary">
                                          <span className="material-symbols-outlined text-base">receipt_long</span>
                                          Invoice
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}

                                {/* Footer */}
                                <div className="flex flex-col gap-3 border-t border-neutral-light bg-neutral-light/40 px-6 py-4 text-sm md:flex-row md:items-center md:justify-between">
                                  <p className="text-text-muted">Order Ref: <span className="font-mono font-semibold">#{order._id?.slice(-8).toUpperCase()}</span></p>
                                  <button onClick={() => navigate("/")}
                                    className="inline-flex items-center gap-2 font-semibold text-primary hover:underline">
                                    <span className="material-symbols-outlined text-base">refresh</span>
                                    Buy Again at Best Price
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function totalSavings(order) {
  return (order.items || []).reduce((sum, item) => {
    const snap = Array.isArray(item.pricingSnapshot)
      ? item.pricingSnapshot[item.pricingSnapshot.length - 1]
      : item.pricingSnapshot || {};
    const initial = snap?.discountBracket?.initial ?? snap?.atInstantPrice ?? 0;
    const final = snap?.atInstantPrice ?? 0;
    return sum + (initial - final) * (item.quantity ?? 1);
  }, 0);
}