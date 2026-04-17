// src/components/ShoppingCart.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import Navbar from "../../components/Navbar";
import useCart from "./ShoppingCart.Utils+/useCart";
import CartItemRow from "./ShoppingCart.Utils+/CartItemRow";
import CartSummary from "./ShoppingCart.Utils+/CartSummary";
import ConfirmRemoveModal from "./ShoppingCart.Utils+/ConfirmRemoveModal";
import { useToastService } from "./ShoppingCart.Utils+/useToastService";
import { groupItemsByStatus } from "./ShoppingCart.Utils+/ShoppingCart.Utils";

import PaymentDeliveryForm from './ShoppingCart.Utils+/PaymentDeliveryForm';

import { useAuth } from "../../contexts/AuthContext";
import { useOpsContext } from "../../contexts/OpsContext";
import "./ShoppingCart.Utils+/ShoppingCart.css";

/**
 * ShoppingCart
 *
 * - OpsContext-first: reads draft order from OpsContext (orders.items / draftOrder).
 * - Cart tab: editable rows + payment & delivery form in main column; right-column receipt summary.
 * - Checkout tab: confirm/edit payment & delivery + right-column receipt; action row: Back | Submit intent | Continue shopping.
 * - Single bottom CTA on Cart: Continue shopping.
 *
 * Notes:
 * - This component expects the OpsContext to already contain the draft order JSON.
 * - Network helpers in the cart hook are optional; persistence is handled by useCart.
 */

export default function ShoppingCart({ onContinueShopping }) {
  const toast = useToastService();
  // Add this with your other state declarations at the top:
  const [orderStatus, setOrderStatus] = useState(null);
  // Auth + Ops contexts
  const { user, accessToken, restoreAccessTokenFromStorage } = useAuth() ?? {};
  const {
    orders,
    wsuorders, wsuproducts,
    productsMeta,
    ops_region, setOps_region,
    fetchAndSetEnrichedOrders,
    clearState: clearOpsState,
    cart: OpsCart,
    setCart,
    backendUrl
  } = useOpsContext() ?? {};

  const userId = user?.userId ?? null;
  const cart = useCart({ userId });
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(1); // 1 = Cart, 2 = Checkout
  const [query, setQuery] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [confirmModal, setConfirmModal] = useState({ open: false, itemId: null, onConfirm: null });
  const [cartItems, setCartItems] = useState([]);
  const [activeCartTab, setActiveCartTab] = useState('active'); // 'active' or 'saved'
  const hasHydratedFromLocation = useRef(false);


  /* --------------------------------------------------------------------------
    Load draft from OpsContext (idempotent)
  -------------------------------------------------------------------------- */

  // ORDERS: ensure fetch runs only when auth is available (user._id AND accessToken)
  // This guarantees the request includes auth headers and runs immediately after sign-in.
  // Orders loader: busy while loop that yields to the event loop each iteration


  // Add this ref at the top of your component
  const hasLoadedDraft = useRef([]);

  useEffect(() => {
    if (hasHydratedFromLocation.current) return;

    const incoming = location.state?.cartItems;
    if (!Array.isArray(incoming) || incoming.length === 0) return;

    hasHydratedFromLocation.current = true;

    const inferredOrderId = incoming[0]?.intentId ?? null;
    const hydratedDraft = {
      _id: inferredOrderId,
      orderId: inferredOrderId,
      items: incoming,
      updatedAt: Date.now(),
    };

    setCartItems(incoming);
    setCart((prev) => (prev ? { ...prev, ...hydratedDraft } : hydratedDraft));
    cart.loadDraft?.({ draftOrder: hydratedDraft }).catch(() => { });

    // clear one-time router state so it doesn't get replayed
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, setCart]);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    const run = async () => {
      try {
        if (!user?.userId || !accessToken) return;
        if (!mounted || controller.signal.aborted) return;

        const region = "north-america:ca-on";
        setOps_region(region);

        const payload = await fetchAndSetEnrichedOrders({
          userId: user.userId,
          ops_region: region,
          page: 1,
          limit: 25,
          requireAuth: true,
          signal: controller.signal,
          jwtAccessToken: accessToken,
          force: true,
        });

        if (!mounted) return;
        if (!payload?.items?.length) return;

        console.log("🛒 userOrders found:", payload.items.length);

        // Return the single latest draft order for a user (prefers updatedAt, falls back to createdAt)
        function latestDraftFromPayload(payload = {}, userId) {
          const items = Array.isArray(payload.items) ? payload.items : [];
          const drafts = items.filter(o =>
            o && String(o.status) === 'draft' && String(o.userId) === String(userId)
          );
          if (drafts.length === 0) return null;

          drafts.sort((a, b) => {
            const aTs = Number(a.updatedAt ?? a.createdAt ?? 0);
            const bTs = Number(b.updatedAt ?? b.createdAt ?? 0);
            return bTs - aTs; // newest first
          });

          return drafts[0];
        }

        const latestDraft = latestDraftFromPayload(payload, userId);
        if (!latestDraft && !OpsCart) return;

        const localTs = Number(OpsCart?.updatedAt ?? OpsCart?.createdAt ?? 0);
        const remoteTs = Number(latestDraft?.updatedAt ?? latestDraft?.createdAt ?? 0);

        const selectedDraft =
          OpsCart && String(OpsCart?._id || OpsCart?.orderId) === String(latestDraft?._id || latestDraft?.orderId)
            ? (localTs >= remoteTs ? OpsCart : latestDraft)
            : (OpsCart?.items?.length ? OpsCart : latestDraft);

        if (!selectedDraft) return;

        const allOrderItems = selectedDraft.items ?? [];

        const enrichedItems = await Promise.all(
          allOrderItems.map(async (orderItem) => {
            try {
              const r = await fetch(
                `${import.meta.env.VITE_API_URL}/api/items/${orderItem.itemId}`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );

              const d = await r.json();
              console.log("🔍 item response:", d); // ← ADD
              const itemDoc = d.data ?? d;
              const snap = Array.isArray(orderItem.pricingSnapshot)
                ? orderItem.pricingSnapshot[0]
                : orderItem.pricingSnapshot;

              return {
                ...orderItem,
                pricingSnapshot: snap,
                pricingTiers: orderItem.pricingTiers ?? orderItem.pricing_tiers ?? [],
                ItemSysInfo: {
                  title: itemDoc.title,
                  sku: itemDoc.sku,
                  brand: itemDoc.brand,
                  image: itemDoc.images?.[0] || itemDoc.metadata?.imageUrl,
                  images: itemDoc.images,
                  shortDescription: itemDoc.shortDescription,
                  inventory: itemDoc.inventory,
                  pricingTiers: itemDoc.pricingTiers ?? itemDoc.pricing_tiers ?? [],
                },
              };
            } catch {
              return { ...orderItem, ItemSysInfo: {} };
            }
          })
        );

        if (!mounted) return;

        const draft = { ...selectedDraft, items: enrichedItems };

        setCart(draft);
        setCartItems(enrichedItems);
        cart.loadDraft?.({ draftOrder: draft }).catch(() => { });
        console.log("🛒 cart.items:", cart.items?.length);

        console.log("🛒 cartItems:", cartItems?.length);

        console.log("🛒 first order items:", selectedDraft?.items?.length);

        console.log("✅ set enrichedItems:", enrichedItems.length);
        console.log("✅ draft items:", draft.items.length);

        const draftOrders = (payload.items || []).filter(
          (o) => o && String(o.status) === "draft" && String(o.userId) === String(userId)
        );

        console.log(
          "🧾 draft orders:",
          draftOrders.map((o) => ({
            id: o._id,
            updatedAt: o.updatedAt,
            createdAt: o.createdAt,
            itemCount: Array.isArray(o.items) ? o.items.length : 0,
            itemIds: Array.isArray(o.items) ? o.items.map((it) => it.itemId) : [],
          }))
        );

      } catch (err) {
        if (err?.name === "AbortError") return;
        console.warn("[ShoppingCart] orders fetch failed:", err);
      }
    };

    run();

    return () => {
      mounted = false;
      controller.abort();
    };

  }, [user?.userId, accessToken, location.state]);

  useEffect(() => {
    if (!cart.order) return;

    const sourceItems = Array.isArray(cart.items) ? cart.items : [];

    setCartItems((prev) => {
      const prevById = new Map(prev.map((it) => [it.itemId, it]));

      const merged = sourceItems.map((it) => {
        const prevItem = prevById.get(it.itemId);
        return prevItem
          ? {
            ...it,
            ItemSysInfo: it.ItemSysInfo ?? prevItem.ItemSysInfo,
            pricingSnapshot: it.pricingSnapshot ?? prevItem.pricingSnapshot,
            pricingTiers: it.pricingTiers ?? prevItem.pricingTiers,
          }
          : it;
      });

      const same =
        prev.length === merged.length &&
        prev.every((it, idx) =>
          it.itemId === merged[idx]?.itemId &&
          Number(it.quantity ?? 0) === Number(merged[idx]?.quantity ?? 0) &&
          Boolean(it.saveForLater) === Boolean(merged[idx]?.saveForLater) &&
          String(it.status ?? "") === String(merged[idx]?.status ?? "")
        );

      return same ? prev : merged;
    });
  }, [cart.orderId, cart.lastUpdatedAt, cart.items, cart.order]);


  /* --------------------------------------------------------------------------
    Derived lists and filters
  -------------------------------------------------------------------------- */
  // ✅ NEW - reads from cartItems state which you control
  const { active = [], savedForLater = [] } = useMemo(() =>
    groupItemsByStatus(cartItems ?? []), [cartItems]
  );

  const filteredActive = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    return (active || []).filter((it) => {
      const info = it?.ItemSysInfo ?? {};
      const matchesQuery =
        !q ||
        (info.title || "").toLowerCase().includes(q) ||
        (info.sku || "").toLowerCase().includes(q) ||
        (info.brand?.name || "").toLowerCase().includes(q);
      const matchesBrand = !filterBrand || (info.brand?.name || "").toLowerCase() === filterBrand.toLowerCase();
      return matchesQuery && matchesBrand;
    });
  }, [active, query, filterBrand]);

  const filteredSaved = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    return (savedForLater || []).filter((it) => {
      const info = it?.ItemSysInfo ?? {};
      const matchesQuery =
        !q ||
        (info.title || "").toLowerCase().includes(q) ||
        (info.sku || "").toLowerCase().includes(q) ||
        (info.brand?.name || "").toLowerCase().includes(q);
      const matchesBrand = !filterBrand || (info.brand?.name || "").toLowerCase() === filterBrand.toLowerCase();
      return matchesQuery && matchesBrand;
    });
  }, [savedForLater, query, filterBrand]);

  const brandOptions = useMemo(() => {
    const set = new Set();
    (cart.items || []).forEach((it) => {
      const name = it?.ItemSysInfo?.brand?.name;
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [cart.items]);

  const opsRegion = useMemo(() => cart.order?.ops_region ?? (cart.items?.[0]?.ItemSysInfo?.ops_region ?? ops_region ?? "—"), [
    cart.order,
    cart.items,
  ]);

  /* --------------------------------------------------------------------------
    Confirm remove modal flow
  -------------------------------------------------------------------------- */
  const showConfirmRemove = useCallback((itemId, onConfirm) => {
    setConfirmModal({ open: true, itemId, onConfirm });
  }, []);

  const handleConfirmRemove = useCallback(async () => {
    const { onConfirm } = confirmModal;
    setConfirmModal({ open: false, itemId: null, onConfirm: null });

    try {
      if (typeof onConfirm === "function") {
        await onConfirm();
      }
    } catch {
      toast.showError("Could not remove item.");
    }
  }, [confirmModal, toast]);

  const handleCancelRemove = useCallback(() => {
    setConfirmModal({ open: false, itemId: null, onConfirm: null });
  }, []);

  const requestRemoveWithConfirm = useCallback(
    (item) => {
      const onConfirm = async () => {
        const resolvedOrderId =
          item?.intentId ||
          cart.orderId ||
          cart.order?._id ||
          OpsCart?._id ||
          OpsCart?.orderId;
        const resolvedItemId = item?.itemId;

        // 1. Await backend removal fully before doing anything else
        await cart.removeItem?.({
          orderId: resolvedOrderId,
          itemId: resolvedItemId,
        });

        // 2. Optimistic local removal immediately after confirmed delete
        setCartItems((prev) => prev.filter((it) => it.itemId !== resolvedItemId));
        setCart((prev) =>
          prev
            ? {
              ...prev,
              items: (prev.items || []).filter((it) => it.itemId !== resolvedItemId),
            }
            : prev
        );

        // 3. Wait for backend to settle before re-fetching
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // 4. Re-sync from backend
        const region = ops_region || "north-america:ca-on";
        const payload = await fetchAndSetEnrichedOrders({
          userId: user?.userId,
          ops_region: region,
          page: 1,
          limit: 25,
          requireAuth: true,
          jwtAccessToken: accessToken,
          force: true,
        });

        const items = Array.isArray(payload?.items) ? payload.items : [];
        const drafts = items
          .filter(
            (o) =>
              o &&
              String(o.status) === "draft" &&
              String(o.userId) === String(user?.userId)
          )
          .sort(
            (a, b) =>
              Number(b.updatedAt ?? b.createdAt ?? 0) -
              Number(a.updatedAt ?? a.createdAt ?? 0)
          );

        const latestDraft = drafts[0] ?? null;

        if (!latestDraft) {
          setCartItems([]);
          setCart((prev) => (prev ? { ...prev, items: [] } : prev));
          return;
        }

        // 5. Enrich items AND filter out the removed item as a safety net
        const enrichedItems = (
          await Promise.all(
            (latestDraft.items || [])
              .filter((orderItem) => orderItem.itemId !== resolvedItemId) // safety net
              .map(async (orderItem) => {
                try {
                  const r = await fetch(
                    `${import.meta.env.VITE_API_URL}/api/items/${orderItem.itemId}`,
                    {
                      headers: { Authorization: `Bearer ${accessToken}` },
                    }
                  );
                  const d = await r.json();
                  const itemDoc = d.data ?? d;
                  const snap = Array.isArray(orderItem.pricingSnapshot)
                    ? orderItem.pricingSnapshot[0]
                    : orderItem.pricingSnapshot;
                  return {
                    ...orderItem,
                    pricingSnapshot: snap,
                    pricingTiers: orderItem.pricingTiers ?? orderItem.pricing_tiers ?? [],
                    ItemSysInfo: {
                      title: itemDoc.title,
                      sku: itemDoc.sku,
                      brand: itemDoc.brand,
                      image: itemDoc.images?.[0] || itemDoc.metadata?.imageUrl,
                      images: itemDoc.images,
                      shortDescription: itemDoc.shortDescription,
                      inventory: itemDoc.inventory,
                      pricingTiers: itemDoc.pricingTiers ?? itemDoc.pricing_tiers ?? [],
                    },
                  };
                } catch {
                  return { ...orderItem, ItemSysInfo: {} };
                }
              })
          )
        ).filter((it) => it.itemId !== resolvedItemId); // second guard after enrichment

        const syncedDraft = { ...latestDraft, items: enrichedItems };
        setCart(syncedDraft);
        setCartItems(enrichedItems);
        cart.loadDraft?.({ draftOrder: syncedDraft }).catch(() => { });
      };

      setConfirmModal({ open: true, itemId: item?.itemId ?? null, onConfirm });
    },
    [cart, OpsCart, setCart, fetchAndSetEnrichedOrders, user?.userId, accessToken, ops_region]
  );

  const handleLocalItemUpdate = useCallback((updatedItem) => {
    setCartItems((prev) =>
      prev.map((it) =>
        it.itemId === updatedItem.itemId ? { ...it, ...updatedItem } : it
      )
    );

    setCart((prev) =>
      prev
        ? {
          ...prev,
          items: (prev.items || []).map((it) =>
            it.itemId === updatedItem.itemId ? { ...it, ...updatedItem } : it
          ),
        }
        : prev
    );
  }, [setCart]);

  /* --------------------------------------------------------------------------
    Navigation / actions
  -------------------------------------------------------------------------- */
  const handleProceedToCheckout = useCallback(() => {
    setActiveTab(2);
    window?.scrollTo?.({ top: 0, behavior: "smooth" });
  }, []);

  const handleBackToCart = useCallback(() => {
    setActiveTab(1);
    window?.scrollTo?.({ top: 0, behavior: "smooth" });
  }, []);

  const handleContinueShopping = useCallback(() => {
    if (typeof onContinueShopping === "function") {
      onContinueShopping();
      return;
    }
    if (typeof window !== "undefined") window.location.href = "/";
  }, [onContinueShopping]);

  const handleSubmitIntent = useCallback(async () => {
    try {
      await cart.submitOrder?.({
        orderId: cart.orderId,
        paymentPayload: { intent: "submit_intent" }
      });

      // ✅ Update local cart status immediately
      setCart(prev => prev ? { ...prev, status: 'submitted' } : prev);
      setOrderStatus('submitted');
      toast.showSuccess("Order submitted successfully! 🎉");

      // ✅ Reload the page after 2 seconds so cart shows fresh state
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);

    } catch (err) {
      if (err?.status === 409 || err?.message?.includes('draft')) {
        toast.showSuccess("Order already submitted.");
        return;
      }
      toast.showError("Could not submit intent. Try again.");
    }
  }, [cart, toast, setCart]);

  //---------------------------------------------------------------------------

  const summaryProps = {
    itemsList: cartItems,
    isCheckout: activeTab == 2,
    onProceedToCheckout: () => handleProceedToCheckout(),
    onSubmitIntent: handleSubmitIntent,
    onBackToCart: () => handleBackToCart(),
    taxRate: 0.13,
    shippingEstimator: null,
  };

  /* --------------------------------------------------------------------------
    Render
  -------------------------------------------------------------------------- */
  return (
    <>
      <Navbar detectedCity={ops_region} onCityChange={setOps_region} />
      <div className="shopping-cart" role="region" aria-labelledby="shopping-cart-heading">
        <div className="cart-header">
          <h1 id="shopping-cart-heading" className="cart-title">
            Shopping Cart
          </h1>

          <div className="cart-header-right">
            <div className="ops-region">
              Region : [ <strong>{ops_region || opsRegion}</strong> ]
            </div>

            <div className="cart-tabs" role="tablist" aria-label="Cart tabs" style={{ borderBottom: '1px solid black' }}>
              <button role="tab" aria-selected={activeTab === 1} className={`tab-btn ${activeTab === 1 ? "active" : ""}`} onClick={() => setActiveTab(1)}>
                Cart
              </button>
              <button role="tab" aria-selected={activeTab === 2} disabled={filteredActive.length === 0} className={`tab-btn ${activeTab === 2 ? "active" : ""}`} onClick={() => setActiveTab(2)}>
                Checkout
              </button>
            </div>

          </div>
        </div>
        <div className="cart-body">
          <div className="cart-main">
            {/* Search & filter */}
            <div className="cart-controls">
              <div className="search-filter">
                <input type="search" className="search-input" placeholder="Search by title, SKU, brand..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search cart items" />
                <select className="brand-filter" value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} aria-label="Filter by brand">
                  <option value="">All brands</option>
                  {brandOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cart-actions">
                <button type="button" className="btn btn-ghost" onClick={() => cart.refresh?.().catch(() => toast.showError("Refresh failed."))}>
                  Refresh
                </button>
              </div>
            </div>

            {/* Tab content */}
            {activeTab === 1 && (
              <>
                <section className="cart-table">
                  {/* THE FLAPS (TABS) */}
                  <div style={{ display: 'flex', gap: '5px', marginBottom: '-1px', position: 'relative', zIndex: 1 }}>
                    <button
                      onClick={() => setActiveCartTab('active')}
                      style={{
                        padding: '10px 20px',
                        border: '1px solid #ccc',
                        borderBottom: activeCartTab === 'active' ? '1px solid white' : '1px solid #ccc',
                        backgroundColor: activeCartTab === 'active' ? 'white' : '#f0f0f0',
                        borderRadius: '8px 8px 0 0',
                        cursor: 'pointer',
                        fontWeight: activeCartTab === 'active' ? 'bold' : 'normal',
                        color: activeCartTab === 'active' ? '#048748' : '#666'
                      }}
                    >
                      Active Items ({filteredActive.length})
                    </button>
                    <button
                      onClick={() => setActiveCartTab('saved')}
                      style={{
                        padding: '10px 20px',
                        border: '1px solid #ccc',
                        borderBottom: activeCartTab === 'saved' ? '1px solid white' : '1px solid #ccc',
                        backgroundColor: activeCartTab === 'saved' ? 'white' : '#f0f0f0',
                        borderRadius: '8px 8px 0 0',
                        cursor: 'pointer',
                        fontWeight: activeCartTab === 'saved' ? 'bold' : 'normal',
                        color: activeCartTab === 'saved' ? 'orangered' : '#666'
                      }}
                    >
                      Saved for Later ({filteredSaved.length})
                    </button>
                  </div>

                  {/* THE FOLDER BODY */}
                  <div style={{ border: '1px solid #ccc', padding: '1em', backgroundColor: 'white', borderRadius: '0 8px 8px 8px' }}>

                    {/* Table Head stays visible for both tabs */}
                    <div className="table-head"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        textAlign: "center",
                        borderBottom: '1px solid #eee',
                        paddingBottom: '10px',
                        fontWeight: 'bold',
                        fontSize: '0.9em',
                        color: '#666'
                      }}>
                      {/* Adjust these flex values to match your CartItemRow column widths */}
                      <div className="col col-thumb" style={{ flex: '0 0 80px' }}>Item</div>
                      <div className="col col-product" style={{ flex: '2', paddingLeft: '10px' }}>Product</div>
                      <div className="col col-pricing" style={{ flex: '1' }}>Price</div>
                      <div className="col col-qty" style={{ flex: '1' }}>Qty</div>
                      <div className="col col-line-total" style={{ flex: '1' }}>Total</div>
                      <div className="col col-actions" style={{ flex: '1' }}>Actions</div>
                    </div>


                    {/* CONDITIONAL CONTENT */}
                    {activeCartTab === 'active' ? (
                      <div className="no-scrollbar" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', maxHeight: '2000px' }}>
                        <hr style={{ height: '0.25em', border: 'none', borderRadius: '5px', backgroundColor: '#048748', margin: '1em 0' }} />
                        {filteredActive.length === 0 ? (
                          <div className="empty-row">No active items in your cart.</div>
                        ) : (
                          filteredActive.map((it) => (
                            <CartItemRow
                              key={it.itemId}
                              item={it}
                              cart={cart}
                              requestRemoveWithConfirm={requestRemoveWithConfirm}
                              onLocalItemUpdate={handleLocalItemUpdate}
                            />
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="no-scrollbar" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', maxHeight: '2000px' }}>
                        <hr style={{ height: '0.25em', border: 'none', borderRadius: '5px', backgroundColor: 'orangered', margin: '1em 0' }} />
                        {filteredSaved.length === 0 ? (
                          <div className="empty-row">No items saved for later.</div>
                        ) : (
                          filteredSaved.map((it) => (
                            <CartItemRow
                              key={it.itemId}
                              item={it}
                              cart={cart}
                              requestRemoveWithConfirm={requestRemoveWithConfirm}
                              onLocalItemUpdate={handleLocalItemUpdate}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </section>


                {/* Cart main: payment & delivery form (prepopulated) */}
                <div className="summary-panel">
                  <PaymentDeliveryForm
                    onSave={async (payload) => {
                      // Minimal local save: show toast. Persisting into OpsContext or backend is optional.
                      try {
                        toast.showInfo("Payment and delivery saved (local).");
                      } catch {
                        toast.showError("Could not save payment/delivery.");
                      }
                    }}
                  />
                </div>

                {/* Single bottom CTA */}
                <div className="cart-bottom-cta " style={{ marginTop: 18 }}>
                  <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleContinueShopping}>
                    Continue shopping
                  </button>
                </div>
              </>
            )}

            {activeTab === 2 && (
              <section className="checkout-review" aria-label="Checkout review" >
                <h2 className="checkout-title">Checkout Review</h2>
                <div className="checkout-note">Confirm payment and delivery options, then submit intent.</div>
                <hr style={{ height: '0.25em', border: '1px solid black', borderRadius: '5px', backgroundColor: 'azure' }} />
                <br style={{ height: '1em' }} />
                <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <div style={{ width: '75%' }}>
                    <PaymentDeliveryForm
                      onSave={async (payload) => {
                        toast.showInfo("Payment and delivery saved (local).");
                      }} opts={{ backToCart: () => setActiveTab(1) }} />
                  </div>
                </div>


              </section>
            )}
          </div>

          {/* Right column: receipt summary */}
          <aside className="cart-side">
            <CartSummary {...summaryProps} />
            <div className="side-ops">
              <small className="muted">
                Order status: <strong style={{
                  color: (orderStatus || cart.order?.status) === 'submitted' ? '#048748' : 'inherit'
                }}>
                  {(orderStatus || cart.order?.status) === 'submitted'
                    ? '✅ submitted'
                    : (orderStatus || cart.order?.status) ?? "—"}
                </strong>
              </small>

              <small className="muted">Last updated: {cart.lastUpdatedAt ? new Date(cart.lastUpdatedAt).toLocaleString() : "—"}</small>
            </div>
          </aside>
        </div>

        {/* Confirm remove modal */}
        <ConfirmRemoveModal
          open={confirmModal.open}
          title="Remove item?"
          description="Removing this item will delete it from your cart. Do you want to continue?"
          confirmLabel="Remove"
          cancelLabel="Keep item"
          onConfirm={handleConfirmRemove}
          onCancel={handleCancelRemove}
          isDestructive
        />
      </div>
    </>
  );
}

ShoppingCart.propTypes = {
  onContinueShopping: PropTypes.func,
};
