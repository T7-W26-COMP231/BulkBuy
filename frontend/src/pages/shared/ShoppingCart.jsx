// src/components/ShoppingCart.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
    // applyRealtimeUpdate,
    backendUrl
  } = useOpsContext() ?? {};

  const userId = user?.userId ?? null;
  const cart = useCart({ userId });


  const [activeTab, setActiveTab] = useState(1); // 1 = Cart, 2 = Checkout
  const [query, setQuery] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [confirmModal, setConfirmModal] = useState({ open: false, itemId: null, onConfirm: null });
  const [cartItems, setCartItems] = useState([]);
  const [activeCartTab, setActiveCartTab] = useState('active'); // 'active' or 'saved'


  /* --------------------------------------------------------------------------
     Load draft from OpsContext (idempotent)
  -------------------------------------------------------------------------- */

  // ORDERS: ensure fetch runs only when auth is available (user._id AND accessToken)
  // This guarantees the request includes auth headers and runs immediately after sign-in.
  // Orders loader: busy while loop that yields to the event loop each iteration


  // Add this ref at the top of your component
  const hasLoadedDraft = useRef([]);

  // useEffect(() => {
  //   const controller = new AbortController();
  //   let mounted = true;
  //   const run = async () => {
  //     try {
  //       // If there's no user at all, clear ops and exit early.
  //       if (!user || !user.userId || !accessToken) {
  //         restoreAccessTokenFromStorage()
  //         if (!accessToken) {
  //           clearOpsState();
  //           return;
  //         }
  //       }
  //       if (!mounted || controller.signal.aborted) return;

  //       const region = "north-america:ca-on" || productsMeta?.region;
  //       setOps_region(region);
  //       await fetchAndSetEnrichedOrders({
  //         userId: user.userId, //user._id, --- careful this : endpoint expects the users public ID
  //         ops_region,
  //         page: 1,
  //         limit: 25,
  //         requireAuth: true,
  //         signal: controller.signal,
  //         jwtAccessToken: accessToken
  //       }).then(() => {
  //         // eslint-disable-next-line no-console
  //         const cartDraft = orders.items.find((o) => o && o.status === "draft" && (String(o.userId) === (String(userId) || String(user._id)))) ?? null;

  //         const draft = cartDraft || OpsCart;
  //         if (!draft) return;

  //         // 2. Set the state
  //         setCart(draft);
  //         setCartItems(draft?.items);

  //         // 3. Mark as loaded so it NEVER runs again
  //         hasLoadedDraft.current = draft.items;

  //         const currentOrderId = cart?.orderId ?? cart?.order?._id ?? null;
  //         if (currentOrderId && draft._id && String(currentOrderId) === String(draft._id)) {
  //           return;
  //         }

  //         cart.loadDraft?.({ draftOrder: draft }).catch(() => { });

  //         console.log("02 | orders ->", orders /* JSON.stringify(orders) */); //------------
  //       });

  //     } catch (err) {
  //       if (err && err.name === "AbortError") return;
  //       // eslint-disable-next-line no-console
  //       console.warn("[HomePage] orders fetch failed or was skipped:", err);
  //     }
  //   };

  //   run();

  //   setTimeout(() => {
  //     return () => { mounted = false; controller.abort(); };
  //   }, 2000);

  // }, [
  //   user?.userId,
  //   accessToken,
  //   wsuorders,
  //   productsMeta?.region,
  //   ops_region,
  //   fetchAndSetEnrichedOrders,
  //   clearOpsState,
  //   orders
  // ]);

  //Sahil code below ->
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

        const userOrders = payload.items.filter((o) =>
          o && ['draft', 'submitted'].includes(o.status)
          && String(o.userId) === String(userId || user._id)
        );

        console.log("🛒 filtered orders:", userOrders.length);

        if (userOrders.length === 0) return;

        const allOrderItems = userOrders.flatMap(o => o.items ?? []);

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
                ItemSysInfo: {
                  title: itemDoc.title,
                  sku: itemDoc.sku,
                  brand: itemDoc.brand,
                  image: itemDoc.images?.[0] || itemDoc.metadata?.imageUrl,
                  images: itemDoc.images,
                  shortDescription: itemDoc.shortDescription,
                  inventory: itemDoc.inventory,
                },
              };
            } catch {
              return { ...orderItem, ItemSysInfo: {} };
            }
          })
        );

        if (!mounted) return;

        const draft = { ...userOrders[0], items: enrichedItems };
        setCart(draft);
        setCartItems(enrichedItems);
        //cart.loadDraft?.({ draftOrder: draft }).catch(() => { });
        cart.loadDraft?.({ draftOrder: draft }).catch(() => { }); // ← this should populate cart.items
        console.log("🛒 cart.items:", cart.items?.length);

        console.log("🛒 cartItems:", cartItems?.length);

        console.log("🛒 first order items:", userOrders[0]?.items?.length);

        console.log("✅ set enrichedItems:", enrichedItems.length);
        console.log("✅ draft items:", draft.items.length);

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

  }, [user?.userId, accessToken]); // ← ONLY these two


  /* --------------------------------------------------------------------------
     Derived lists and filters
  -------------------------------------------------------------------------- */
  //const { active = [], savedForLater = [] } = useMemo(() => groupItemsByStatus(cart.items ?? []), [cart.items]);
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
    const { itemId, onConfirm } = confirmModal;
    setConfirmModal({ open: false, itemId: null, onConfirm: null });
    try {
      if (typeof onConfirm === "function") await onConfirm(itemId);
      await cart.refresh?.();
    } catch {
      toast.showError("Could not remove item.");
    }
  }, [confirmModal, cart, toast]);

  const handleCancelRemove = useCallback(() => {
    setConfirmModal({ open: false, itemId: null, onConfirm: null });
  }, []);

  const requestRemoveWithConfirm = useCallback(
    (itemId) => {
      const onConfirm = async (id) => {
        await cart.removeItem?.({ orderId: cart.orderId, itemId: id });
        toast.showSuccess("Item removed.");
      };
      showConfirmRemove(itemId, onConfirm);
    },
    [cart, showConfirmRemove, toast]
  );

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
      await cart.submitOrder?.({ orderId: cart.orderId, paymentPayload: { intent: "submit_intent" } });
      toast.showSuccess("Submit intent recorded.");
    } catch {
      toast.showError("Could not submit intent. Try again.");
    }
  }, [cart, toast]);

  //---------------------------------------------------------------------------

  /*const summaryProps = {
    itemsList: cartItems || OpsCart.items || cart.items,
    isCheckout: activeTab == 2,
    onProceedToCheckout: () => handleProceedToCheckout(),
    onSubmitIntent: handleSubmitIntent,
    onBackToCart: () => handleBackToCart(),
    // onContinueShopping,
    taxRate: 0.13,
    shippingEstimator: null,
  }*/

  //Sahil code for summaryprops 
  const summaryProps = {
    itemsList: cartItems?.length > 0 ? cartItems : (OpsCart?.items || cart.items || []),
    isCheckout: activeTab == 2,
    onProceedToCheckout: () => handleProceedToCheckout(),
    onSubmitIntent: handleSubmitIntent,
    onBackToCart: () => handleBackToCart(),
    taxRate: 0.13,
    shippingEstimator: null,
  }

  /* --------------------------------------------------------------------------
     Payment & Delivery form (reused in Cart main and Checkout)
     - Prepopulated from cart.order when available
  -------------------------------------------------------------------------- */
  // ---?? moved to another to a standalone module

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
                          filteredActive.map((it) => <CartItemRow key={it.itemId} item={it} requestRemoveWithConfirm={requestRemoveWithConfirm} />)
                        )}
                      </div>
                    ) : (
                      <div className="no-scrollbar" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', maxHeight: '2000px' }}>
                        <hr style={{ height: '0.25em', border: 'none', borderRadius: '5px', backgroundColor: 'orangered', margin: '1em 0' }} />
                        {filteredSaved.length === 0 ? (
                          <div className="empty-row">No items saved for later.</div>
                        ) : (
                          filteredSaved.map((it) => <CartItemRow key={it.itemId} item={it} requestRemoveWithConfirm={requestRemoveWithConfirm} />)
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
                Draft order status: <strong>{cart.order?.status ?? "—"}</strong>
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
