import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getMyIntents, updateIntentItem, removeIntentItem } from "../../api/intentApi";
import { useAuth } from "../../contexts/AuthContext";
import api from "../../api/api";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Sidebar from "../../components/Sidebar";

export default function ReviewModifyIntentPage() {
  const { user } = useAuth();
  const location = useLocation();

  const cartItems = (() => {
    if (location.state?.cartItems?.length) return location.state.cartItems;
    try {
      const storedUser = JSON.parse(localStorage.getItem("user") || "null");
      const key = storedUser?._id ? `cartItems_${storedUser._id}` : "cartItems_guest";
      return JSON.parse(sessionStorage.getItem(key) || "[]");
    } catch { return []; }
  })();

  const [intents, setIntents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editedQtys, setEditedQtys] = useState({});
  const [saving, setSaving] = useState({});
  const [windowLocked, setWindowLocked] = useState(false);
  const [windowLockedReason, setWindowLockedReason] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [itemDataMap, setItemDataMap] = useState({});

  useEffect(() => {
    const fetchIntents = async () => {
      if (!user?._id) { setLoading(false); return; }
      try {
        setFetchError(null);
        const data = await getMyIntents(user._id);
        const all = data.items || [];

        const latest = all
          .filter((o) => o.status === "submitted" || !o.status)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        setIntents(latest);

        // ✅ Task #61 — Check window status from order's salesWindow field (no admin API needed)
        const salesWindow = latest[0]?.salesWindow;
        console.log(salesWindow);
        const now = Date.now();

        if (!salesWindow) {
          setWindowLocked(false);
          setWindowLockedReason(null);
        } else {
          const isOpen = now >= salesWindow.fromEpoch && now <= salesWindow.toEpoch;
          setWindowLocked(!isOpen);
          setWindowLockedReason(
            isOpen
              ? null
              : `This aggregation window closed on ${new Date(salesWindow.toEpoch).toLocaleDateString()}.`
          );
        }

        // ✅ Fetch full item data for each unique itemId
        const uniqueItemIds = [...new Set(
          latest.flatMap(intent =>
            intent.items.map(i => i.itemId?._id || i.itemId)
          ).filter(Boolean)
        )];

        const itemResponses = await Promise.all(
          uniqueItemIds.map(itemId =>
            api.get(`/api/items/${itemId}`).then(r => r.data)
          )
        );

        const itemMap = {};
        itemResponses.forEach((res, i) => {
          const itemData = res.data ?? res;
          if (itemData?._id) {
            itemMap[uniqueItemIds[i]] = itemData;
          }
        });

        setItemDataMap(itemMap);

        const initialQtys = {};
        latest.forEach((intent) => {
          (intent.items || []).forEach((item) => {
            const itemId = item.itemId?._id || item.itemId;
            initialQtys[`${intent._id}::${itemId}`] = item.quantity;
          });
        });
        setEditedQtys(initialQtys);
      } catch (error) {
        console.error("Error fetching intents:", error);
        setFetchError("Could not load your intents. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchIntents();
  }, [user]);

  const allItems = intents.flatMap((intent) =>
    (intent.items || []).map((item) => ({
      ...item,
      intentId: intent._id,
      itemId: item.itemId?._id || item.itemId,
    }))
  );

  function getDisplayData(item) {
    const itemDoc = itemDataMap[item.itemId] ?? {};
    const cartMatch = cartItems.find(
      (c) => c.itemId === item.itemId || c.id === item.itemId
    );

    const snapshot = Array.isArray(item.pricingSnapshot)
      ? item.pricingSnapshot[0]
      : item.pricingSnapshot || {};

    const unitPrice = snapshot?.atInstantPrice || cartMatch?.unitPrice || 0;

    const rawTiers = itemDoc.pricingTiers || cartMatch?.pricingTiers || [];
    const pricingTiers = rawTiers.map((t) => ({
      minQty: t.minQty,
      price: t.price ?? +(unitPrice * (1 - (t.discountPct || 0) / 100)).toFixed(2),
    }));

    return {
      name: itemDoc.title || itemDoc.name || cartMatch?.name || "Item",
      image: itemDoc.images?.[0] || itemDoc.metadata?.imageUrl || cartMatch?.image || null,
      description: itemDoc.description || itemDoc.shortDescription || cartMatch?.description || "",
      city: itemDoc.ops_region || cartMatch?.city || "",
      unitPrice,
      pricingTiers,
      activeTier: item.activeTier || itemDoc.activeTier || cartMatch?.activeTier || null,
      aggregatedDemand: item.aggregatedDemand ?? itemDoc.aggregatedDemand ?? 0,
      nextThresholdQty: item.nextThresholdQty ?? itemDoc.nextThresholdQty ?? 0,
      nextTierPrice: item.nextTier?.price ?? itemDoc.nextTier?.price ?? null,
    };
  }

  const handleQtyChange = (intentId, itemId, value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1) return;
    setEditedQtys((prev) => ({ ...prev, [`${intentId}::${itemId}`]: num }));
  };

  const handleSaveChanges = async (intentId, itemId) => {
    const key = `${intentId}::${itemId}`;
    const qty = editedQtys[key];
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      await updateIntentItem(intentId, itemId, qty);
      setIntents((prev) =>
        prev.map((intent) =>
          intent._id !== intentId ? intent : {
            ...intent,
            items: intent.items.map((i) => {
              const iId = i.itemId?._id || i.itemId;
              return iId === itemId ? { ...i, quantity: qty } : i;
            }),
          }
        )
      );
      alert("Intent changes saved.");
    } catch (err) {
      if (err.locked) { setWindowLocked(true); alert("🔒 This window is locked. No changes are allowed after the window closes."); }
      else { alert("Could not save changes. Please try again."); }
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleCancelIntent = async (intentId, itemId) => {
    try {
      await removeIntentItem(intentId, itemId);
      setIntents((prev) =>
        prev
          .map((intent) =>
            intent._id !== intentId ? intent : {
              ...intent,
              items: intent.items.filter((i) => {
                const iId = i.itemId?._id || i.itemId;
                return iId !== itemId;
              }),
            }
          )
          .filter((intent) => intent.items.length > 0)
      );
      alert("Intent cancelled.");
    } catch (err) {
      if (err.locked) { setWindowLocked(true); alert("🔒 This window is locked. Items cannot be removed after the window closes."); }
      else { alert("Could not cancel intent. Please try again."); }
    }
  };

  const totalQty = allItems.reduce((sum, item) => {
    const key = `${item.intentId}::${item.itemId}`;
    return sum + (editedQtys[key] ?? item.quantity ?? 0);
  }, 0);

  const totalSubtotal = allItems.reduce((sum, item) => {
    const key = `${item.intentId}::${item.itemId}`;
    const qty = editedQtys[key] ?? item.quantity ?? 0;
    const { unitPrice } = getDisplayData(item);
    return sum + qty * unitPrice;
  }, 0);

  const totalSavings = allItems.reduce((sum, item) => {
    const key = `${item.intentId}::${item.itemId}`;
    const qty = editedQtys[key] ?? item.quantity ?? 0;
    const snap = Array.isArray(item.pricingSnapshot)
      ? item.pricingSnapshot[0]
      : item.pricingSnapshot || {};
    const initial = snap.discountBracket?.initial ?? snap.atInstantPrice ?? 0;
    const final = snap.atInstantPrice ?? 0;
    return sum + (initial - final) * qty;
  }, 0);

  const platformFeeRate = 0.02;
  const platformFee = totalSubtotal * platformFeeRate;
  const grandTotal = totalSubtotal - totalSavings + platformFee;
  const firstItem = allItems[0];

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light font-display text-text-main">
      <Navbar />

      <main className="flex flex-1 flex-col gap-8 rounded-2xl border border-neutral-light px-4 py-8 md:flex-row md:px-20 lg:px-40">
        <Sidebar />

        <section className="flex flex-1 flex-col gap-6">

          {/* ✅ Task #62 + #63 — Locked banner with reason */}
          {windowLocked && (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-5 py-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-xl">
                  🔒
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-800">
                    Aggregation Window Closed
                  </h3>
                  <p className="mt-1 text-sm font-medium text-red-700">
                    {windowLockedReason || "This aggregation window is closed. No further changes can be made."}
                  </p>
                  <p className="mt-2 text-xs text-red-500">
                    Your intent has been recorded. Final pricing will be confirmed once the group order is processed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!user && !loading && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 font-medium text-amber-800">
              Please sign in to view your submitted intents.
            </div>
          )}

          {fetchError && (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-5 py-4 font-medium text-red-800">
              ❌ {fetchError}
            </div>
          )}

          {loading && <p className="py-10 text-center text-text-muted">Loading your intents…</p>}

          {!loading && user && !fetchError && allItems.length === 0 && (
            <p className="py-10 text-center text-text-muted">No active intents found.</p>
          )}

          {allItems.map((item, index) => {
            const key = `${item.intentId}::${item.itemId}`;
            const qty = editedQtys[key] ?? item.quantity;
            const isSaving = saving[key];
            const display = getDisplayData(item);

            const itemTiers = display.pricingTiers ?? [];
            const itemActiveTier = display.activeTier ?? null;
            const itemProgressUnits = display.aggregatedDemand ?? 0;
            const itemGoalUnits = display.nextThresholdQty ?? 0;
            const itemProgressPercent = itemGoalUnits > 0
              ? Math.min((itemProgressUnits / itemGoalUnits) * 100, 100)
              : 0;
            const itemNextTierPrice = display.nextTierPrice ?? null;

            return (
              <div key={index} className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-8 lg:flex-row">

                  {/* ── IMAGE ── */}
                  <div className="w-full lg:w-[48%]">
                    <div className="overflow-hidden rounded-2xl bg-neutral-light">
                      {display.image ? (
                        <img src={display.image} alt={display.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-48 items-center justify-center text-5xl">🛒</div>
                      )}
                    </div>
                  </div>

                  {/* ── CONTENT ── */}
                  <div className="flex flex-1 flex-col gap-4">

                    <div className="flex items-start justify-between gap-4">
                      <h1 className="text-2xl md:text-3xl font-black leading-tight text-text-main">
                        {display.name}
                      </h1>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary">${display.unitPrice.toFixed(2)}</p>
                        <p className="text-sm text-text-muted">/ unit</p>
                      </div>
                    </div>

                    {display.description && (
                      <p className="text-base leading-relaxed text-text-muted">
                        {display.city ? `${display.city} Bulk Purchase Group. ` : ""}
                        {display.description}
                      </p>
                    )}

                    {/* Pricing Tiers */}
                    {itemTiers.length > 0 && (
                      <div className="rounded-xl border border-neutral-light bg-background-light p-4">
                        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">
                          Bulk Pricing Tiers
                        </p>
                        <div className="flex flex-col gap-1">
                          {itemTiers.map((tier, i) => {
                            const next = itemTiers[i + 1];
                            const label = next
                              ? `Tier ${i + 1} (${tier.minQty}–${next.minQty - 1} units)`
                              : `Tier ${i + 1} (${tier.minQty}+ units)`;
                            const isActive = itemActiveTier?.minQty === tier.minQty;
                            return (
                              <div
                                key={i}
                                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isActive ? "bg-primary/10 font-bold text-text-main" : "text-text-muted"}`}
                              >
                                <span className="flex items-center gap-2">
                                  {label}
                                  {isActive && (
                                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-black text-text-main">
                                      ACTIVE
                                    </span>
                                  )}
                                </span>
                                <span className="font-bold">${tier.price.toFixed(2)}/unit</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Community Progress */}
                    <div className="rounded-xl border border-neutral-light bg-background-light p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
                          Community Progress
                        </p>
                        <span className="text-xs font-semibold text-text-muted">
                          {itemProgressUnits} / {itemGoalUnits} units
                        </span>
                      </div>
                      <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-light">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${itemProgressPercent}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs italic text-text-muted">
                        {itemGoalUnits > itemProgressUnits
                          ? `${itemGoalUnits - itemProgressUnits} more units needed to unlock ${itemNextTierPrice ? `$${itemNextTierPrice.toFixed(2)}` : "next"} pricing. Share with your neighbors!`
                          : "🎉 Group goal reached! Best pricing unlocked."}
                      </p>
                    </div>

                    {/* Qty controls */}
                    <div>
                      <div className="mb-2 text-sm font-bold uppercase tracking-wide text-text-muted">
                        Order Quantity (Boxes)
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleQtyChange(item.intentId, item.itemId, qty - 1)}
                          disabled={windowLocked || isSaving || qty <= 1}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-light bg-white text-xl font-bold text-text-muted transition hover:bg-neutral-light disabled:opacity-40"
                        >−</button>
                        <input
                          type="number" min="1" step="1" value={qty}
                          disabled={windowLocked || isSaving}
                          onChange={(e) => handleQtyChange(item.intentId, item.itemId, e.target.value)}
                          className="w-16 rounded-lg border border-neutral-light bg-white px-2 py-1.5 text-center text-lg font-bold outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:bg-neutral-light"
                        />
                        <button
                          onClick={() => handleQtyChange(item.intentId, item.itemId, qty + 1)}
                          disabled={windowLocked || isSaving}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-light bg-white text-xl font-bold text-text-muted transition hover:bg-neutral-light disabled:opacity-40"
                        >+</button>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleSaveChanges(item.intentId, item.itemId)}
                        disabled={windowLocked || isSaving}
                        className="rounded-xl bg-primary px-5 py-2.5 font-bold text-text-main disabled:opacity-50"
                      >
                        {isSaving ? "Saving…" : "Save Changes"}
                      </button>
                      <button
                        onClick={() => handleCancelIntent(item.intentId, item.itemId)}
                        disabled={windowLocked}
                        className="rounded-xl border border-neutral-light bg-white px-5 py-2.5 font-semibold text-text-main disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* ✅ Task #62 — Window status badge per item */}
                    <div className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${windowLocked
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                      }`}>
                      {windowLocked ? "🔒 Window closed — editing disabled" : "✅ Aggregation window open"}
                    </div>

                  </div>
                </div>
              </div>
            );
          })}

        </section>

        {/* ── Sidebar ── */}
        <aside className="mt-6 w-full lg:mt-0 lg:w-[340px]">
          <div className="sticky top-24 rounded-2xl bg-[#071d1b] p-6 text-white shadow-xl">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-white/10 p-3">
                <span className="material-symbols-outlined text-primary">inventory</span>
              </div>
              <div>
                <h2 className="text-xl font-bold">Active Intent</h2>
                <p className="text-sm text-primary/80">{totalQty} units selected</p>
              </div>
            </div>

            <div className="space-y-4 border-b border-white/10 pb-6">
              <div className="flex justify-between text-sm">
                <span className="text-white/70">Subtotal (Base Price)</span>
                <span>${totalSubtotal.toFixed(2)}</span>
              </div>
              {totalSavings > 0 && (
                <div className="flex justify-between text-sm text-primary">
                  <span>↓ Tier Savings</span>
                  <span>-${totalSavings.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-white/70">Platform Fee (2%)</span>
                <span>${platformFee.toFixed(2)}</span>
              </div>
            </div>

            <div className="my-6 flex items-center justify-between">
              <span className="text-lg font-bold">Total Estimate</span>
              <span className="text-3xl font-black text-primary">${grandTotal.toFixed(2)}</span>
            </div>

            <button
              onClick={() => firstItem && handleSaveChanges(firstItem.intentId, firstItem.itemId)}
              disabled={windowLocked || !firstItem}
              className="w-full rounded-xl bg-primary px-5 py-3 font-bold text-text-main transition hover:opacity-90 disabled:opacity-50"
            >
              Confirm Intent →
            </button>

            <p className="mt-4 text-center text-xs uppercase tracking-widest text-white/40">
              Final price adjusted upon group closure based on final tier achieved.
            </p>
          </div>
        </aside>
      </main>

      <Footer />
    </div>
  );
}