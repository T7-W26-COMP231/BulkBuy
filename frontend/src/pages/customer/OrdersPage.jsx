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
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("active-intents");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [itemDataMap, setItemDataMap] = useState({});

  useEffect(() => {
    const fetchOrders = async () => {
      //if (!user?._id) { setLoading(false); return; }
      if (!user?.userId && !user?._id) { setLoading(false); return; }


      try {
        setError(null);
        //const res = await api.get(`/ordrs/user/${user._id}`);

        const res = await api.get(`/ordrs/user/${user.userId || user._id}`);


        const all = res.data?.items || [];
        const relevantOrders = all
          .filter(o => ["submitted", "confirmed", "dispatched", "fulfilled", "cancelled"].includes(o.status))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setOrders(relevantOrders);
        const uniqueItemIds = [...new Set(
          relevantOrders.flatMap(o => o.items.map(i => i.itemId?._id || i.itemId)).filter(Boolean)
        )];
        const itemResponses = await Promise.all(
          uniqueItemIds.map(id => api.get(`/items/${id}`).then(r => r.data).catch(() => null))
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

  // ✅ Task #71 + #72 — date + status filter combined
  const filteredPastOrders = pastOrders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    const created = new Date(o.createdAt);
    if (dateFrom && created < new Date(dateFrom)) return false;
    if (dateTo && created > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

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
      unitPrice = price;
    });
    return { totalQty, totalPrice, unitPrice };
  }

  return (
    <div className="min-h-screen bg-background-light font-display text-text-main">
      <Navbar showLocation={false} />
      <main className="flex flex-1 flex-col gap-8 rounded-2xl border border-neutral-light px-4 py-8 md:flex-row md:px-20 lg:px-40">

        <Sidebar showSummary={true} />

        <section className="flex flex-1 flex-col gap-8">

          {/* Header */}
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              My Intents & Orders
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-text-muted md:text-base">
              Manage your active bulk commitments and view past savings in Toronto.
            </p>
          </div>

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

                  {/* ✅ Task #74 — Empty state active intents */}
                  {activeIntents.length === 0 ? (
                    <div className="flex flex-col items-center gap-4 rounded-2xl border border-neutral-light bg-white p-12 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                        <span className="material-symbols-outlined text-3xl text-primary">shopping_bag</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">No active intents yet</h3>
                        <p className="mt-1 text-sm text-text-muted">Browse the marketplace and join a group buy to get started.</p>
                      </div>
                      <button onClick={() => navigate("/")}
                        className="rounded-xl bg-primary px-6 py-2.5 font-bold text-text-main transition hover:opacity-90">
                        Browse Items
                      </button>
                    </div>
                  ) : (
                    activeIntents.map(order => {
                      const { label, color } = getStatusBadge(order.status);
                      const { totalQty, unitPrice } = getOrderTotals(order);
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
                      const tierLabel = activeTier ? `Tier ${activeTier.minQty >= 50 ? 2 : 1}` : "Tier 1";

                      return (
                        <div key={order._id} className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
                          <div className="flex items-center justify-between border-b border-neutral-light px-6 py-3">
                            <span className="text-sm font-semibold text-text-muted">Order #{order._id?.slice(-8).toUpperCase()}</span>
                            <span className={`rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wide ${color}`}>{label}</span>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
                            <div className="relative h-64 lg:h-full">
                              {image ? (
                                <img src={image} alt={name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full min-h-[200px] items-center justify-center bg-neutral-light text-6xl">🛒</div>
                              )}
                            </div>
                            <div className="flex flex-col gap-5 p-6">
                              <div className="flex items-start justify-between gap-4">
                                <h3 className="text-2xl font-bold leading-tight">{name}</h3>
                                <p className="text-3xl font-bold text-primary">
                                  ${unitPrice.toFixed(2)}
                                  <span className="ml-1 text-sm font-medium text-text-muted">/unit</span>
                                </p>
                              </div>
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
                              {nextThresholdQty > 0 && (
                                <div>
                                  <div className="mb-2 flex items-center justify-between text-sm">
                                    <span className="font-semibold text-text-muted">
                                      Progress to next tier{nextTierPrice ? ` ($${nextTierPrice.toFixed(2)}/unit)` : ""}
                                    </span>
                                    <span className="font-bold text-primary">{Math.round(progress)}%</span>
                                  </div>
                                  <div className="h-3 w-full rounded-full bg-neutral-light">
                                    <div className="h-3 rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
                                  </div>
                                </div>
                              )}
                              <div className="flex flex-col gap-3 border-t border-neutral-light pt-4 sm:flex-row">
                                <button onClick={() => navigate("/review-modify-intent")}
                                  className="flex-1 rounded-xl bg-primary px-5 py-3 font-bold text-text-main transition hover:opacity-90">
                                  View Batch Progress
                                </button>
                                <button onClick={() => navigate("/review-modify-intent")}
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
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold">Past Orders</h2>
                        <span className="text-sm text-text-muted">{filteredPastOrders.length} orders</span>
                      </div>

                      {/* ✅ Task #71 — Date range filter */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-xl border border-neutral-light bg-white px-3 py-2">
                          <span className="material-symbols-outlined text-base text-text-muted">calendar_today</span>
                          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="bg-transparent text-sm text-text-main outline-none" />
                        </div>
                        <span className="text-sm text-text-muted">to</span>
                        <div className="flex items-center gap-2 rounded-xl border border-neutral-light bg-white px-3 py-2">
                          <span className="material-symbols-outlined text-base text-text-muted">calendar_today</span>
                          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="bg-transparent text-sm text-text-main outline-none" />
                        </div>
                        {(dateFrom || dateTo) && (
                          <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                            className="rounded-xl bg-neutral-light px-3 py-2 text-xs font-semibold text-text-muted hover:bg-primary/10 hover:text-primary transition">
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ✅ Task #72 — Status filter pills */}
                    <div className="flex flex-wrap gap-2">
                      {["all", "confirmed", "dispatched", "fulfilled", "cancelled"].map(s => (
                        <button key={s} type="button" onClick={() => setStatusFilter(s)}
                          className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${statusFilter === s
                            ? "bg-primary text-text-main"
                            : "bg-neutral-light text-text-muted hover:bg-primary/15"
                            }`}>
                          {s === "all" ? "All" : s === "fulfilled" ? "Delivered" : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ✅ Task #74 — Empty states */}
                  {pastOrders.length === 0 ? (
                    <div className="flex flex-col items-center gap-4 rounded-2xl border border-neutral-light bg-white p-12 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                        <span className="material-symbols-outlined text-3xl text-primary">receipt_long</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">No past orders yet</h3>
                        <p className="mt-1 text-sm text-text-muted">Your completed orders will appear here once fulfilled.</p>
                      </div>
                      <button onClick={() => navigate("/")}
                        className="rounded-xl bg-primary px-6 py-2.5 font-bold text-text-main transition hover:opacity-90">
                        Browse Items
                      </button>
                    </div>
                  ) : filteredPastOrders.length === 0 ? (
                    <div className="rounded-2xl border border-neutral-light bg-white p-8 text-center text-text-muted">
                      No orders match your current filters.{" "}
                      <button onClick={() => { setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}
                        className="font-semibold text-primary hover:underline">
                        Clear filters
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {filteredPastOrders.map(order => {
                        const { label, color } = getStatusBadge(order.status);
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
                                    <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-neutral-light">
                                      {image
                                        ? <img src={image} alt={name} className="h-full w-full object-cover" />
                                        : <div className="flex h-full items-center justify-center text-3xl">🛒</div>
                                      }
                                    </div>
                                    <div className="min-w-0">
                                      <h3 className="truncate text-xl font-bold">{name}</h3>
                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className={`rounded-md px-2 py-1 text-xs font-bold uppercase ${color}`}>{label}</span>
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

                            {/* ✅ Task #73 — Navigate to order details */}
                            <div className="flex flex-col gap-3 border-t border-neutral-light bg-neutral-light/40 px-6 py-4 text-sm md:flex-row md:items-center md:justify-between">
                              <p className="text-text-muted">Order Ref: <span className="font-mono font-semibold">#{order._id?.slice(-8).toUpperCase()}</span></p>
                              <div className="flex items-center gap-4">
                                <button
                                  onClick={() => navigate(`/order-details/${order._id}`)}
                                  className="inline-flex items-center gap-1 font-semibold text-text-main hover:text-primary"
                                >
                                  <span className="material-symbols-outlined text-base">open_in_new</span>
                                  View Details
                                </button>
                                {/* ✅ Task #210 */}
                                <button
                                  onClick={() => navigate(`/order-tracking/${order._id}`)}
                                  className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                                >
                                  <span className="material-symbols-outlined text-base">location_searching</span>
                                  Track Order
                                </button>
                                <button onClick={() => navigate("/")}
                                  className="inline-flex items-center gap-2 font-semibold text-primary hover:underline">
                                  <span className="material-symbols-outlined text-base">refresh</span>
                                  Buy Again
                                </button>
                              </div>
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
        </section>
      </main>
      <Footer />
    </div >
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