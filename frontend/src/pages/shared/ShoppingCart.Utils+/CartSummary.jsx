// src/components/CartSummary.jsx
import React, { useMemo, useState, useCallback, useEffect } from "react";
import PropTypes from "prop-types";
import useCart from "./useCart";
import { formatCurrency, calcLineTotal } from "./ShoppingCart.Utils";
import { useToastService } from "./useToastService";

import { useOpsContext } from "../../../contexts/OpsContext";
import "./CartSummary.css";

/**
 * CartSummary
 *
 * Compact, grocery-receipt style order summary used in both Cart and Checkout.
 *
 * Props:
 * - isCheckout (bool) : render checkout actions (Submit intent / Back / Continue shopping)
 * - onProceedToCheckout (func) : called when user clicks "Proceed to Checkout" (Cart view)
 * - onSubmitIntent (func) : called when user clicks "Submit intent" (Checkout view)
 * - onBackToCart (func) : called when user clicks back from Checkout to Cart
 * - onContinueShopping (func) : called when user clicks Continue shopping
 * - taxRate (number) : e.g., 0.13
 * - shippingEstimator (func) : (items) => { method, amount }
 */
export default function CartSummary({
  itemsList = [],
  isCheckout = false,
  onProceedToCheckout,
  onSubmitIntent,
  onBackToCart,
  onContinueShopping,
  taxRate = 0.13,
  shippingEstimator = null,
}) {
  const cart = useCart();
  const toast = useToastService();
  // const items = useMemo(() => ( itemsList || cart.items || []).filter((it) => !it?.saveForLater && it?.status !== "savedForLater"), [cart.items]);

  // 1. Define items as state so React tracks changes
  const [items, setItems] = useState([]);

  useEffect(() => {
    // 2. Define an async function inside the effect
    const fetchItems = async () => {
      const filtered = (itemsList || cart.items || []).filter(
        (it) => !it?.saveForLater && it?.status !== "savedForLater"
      );

      // 3. Wait for the values and update state
      const resolvedItems = await Promise.all(filtered);
      setItems(resolvedItems);
    };

    fetchItems();
    // 4. Depend on the source data, not the result's length
  }, [itemsList, cart.items]);

  const currency = useMemo(() => {
    const first = items.find((it) => it?.pricingSnapshot?.meta?.currency);
    return first?.pricingSnapshot?.meta?.currency ?? "CAD";
  }, [items]);

  // Receipt lines
  const lineItems = useMemo(
    () =>
      items.map((it) => ({
        key: it.itemId,
        title: it.ItemSysInfo?.title ?? it.ItemSysInfo?.sku ?? "Item",
        qty: Number(it.quantity ?? 0),
        unit: Number(it?.pricingSnapshot?.atInstantPrice ?? 0),
        lineTotal: calcLineTotal(it),
      })),
    [items]
  );

  const subtotal = useMemo(() => lineItems.reduce((s, l) => s + l.lineTotal, 0), [lineItems]);

  // Promo (local example only)
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null);

  const discountAmount = useMemo(() => {
    if (!appliedPromo) return 0;
    if (appliedPromo.type === "percent") return Number((subtotal * appliedPromo.value).toFixed(2));
    if (appliedPromo.type === "fixed") return Math.min(subtotal, Number(appliedPromo.value));
    return 0;
  }, [appliedPromo, subtotal]);

  const subtotalAfterDiscount = Math.max(0, Number((subtotal - discountAmount).toFixed(2)));

  const tax = useMemo(() => Number((subtotalAfterDiscount * taxRate).toFixed(2)), [subtotalAfterDiscount, taxRate]);

  const shipping = useMemo(() => {
    if (typeof shippingEstimator === "function") {
      try {
        const est = shippingEstimator(items);
        return Number(est?.amount ?? 0);
      } catch {
        return 0;
      }
    }
    return subtotalAfterDiscount >= 200 ? 0 : 12.5;
  }, [items, shippingEstimator, subtotalAfterDiscount]);

  const total = useMemo(() => Number((subtotalAfterDiscount + tax + shipping).toFixed(2)), [
    subtotalAfterDiscount,
    tax,
    shipping,
  ]);

  const applyPromo = useCallback(() => {
    const code = (promoCode || "").trim().toUpperCase();
    if (!code) {
      toast.showInfo("Enter a promo code.");
      return;
    }
    if (code === "SAVE10") {
      setAppliedPromo({ code, type: "percent", value: 0.1 });
      toast.showSuccess("Promo applied: 10% off");
    } else if (code === "TAKE20") {
      setAppliedPromo({ code, type: "fixed", value: 20 });
      toast.showSuccess("Promo applied: $20 off");
    } else {
      toast.showError("Invalid promo code.");
    }
  }, [promoCode, toast]);

  const removePromo = useCallback(() => {
    setAppliedPromo(null);
    setPromoCode("");
    toast.showInfo("Promo removed.");
  }, [toast]);

  // Actions
  const handleProceed = useCallback(
    (ev) => {
      ev?.preventDefault?.();
      if (typeof onProceedToCheckout === "function") {
        onProceedToCheckout();
        return;
      }
      toast.showInfo("Proceeding to checkout");
    },
    [onProceedToCheckout, toast]
  );

  const handleSubmit = useCallback(
    async (ev) => {
      ev?.preventDefault?.();
      if (typeof onSubmitIntent === "function") {
        await onSubmitIntent();
        return;
      }
      // fallback: call cart.submitOrder as a best-effort submit intent
      try {
        //await cart.submitOrder?.({ orderId: cart.orderId, paymentPayload: { intent: "submit_intent" } });
        toast.showSuccess("Submit intent recorded.");
      } catch {
        toast.showError("Could not submit intent.");
      }
    },
    [onSubmitIntent, cart, toast]
  );

  const handleBack = useCallback(() => {
    if (typeof onBackToCart === "function") onBackToCart();
  }, [onBackToCart]);

  const handleContinue = useCallback(() => {
    if (typeof onContinueShopping === "function") onContinueShopping();
    else window.location && (window.location.href = "/");
  }, [onContinueShopping]);

  /* -------------------------
     Render: grocery receipt style
     ------------------------- */
  return (
    <aside className="cart-summary" aria-labelledby="cart-summary-heading">
      <h3 id="cart-summary-heading" className="summary-title">
        Order summary
      </h3>

      <div className="receipt">
        <div className="receipt-items" aria-hidden={lineItems.length === 0}>
          {lineItems.length === 0 ? (
            <div className="empty-row">No items in your cart.</div>
          ) : (
            lineItems.map((li) => (
              <div key={li.key} className="receipt-line" style={{ fontStyle: 'italic' }}>
                <div className="rl-left">
                  <div className="rl-title">{li.title}</div>
                  <div className="rl-meta small muted">Qty {li.qty} × {formatCurrency(li.unit, currency)}</div>
                </div>
                <div className="rl-right">
                  <div className="rl-total">{formatCurrency(li.lineTotal, currency)}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="receipt-totals">
          <div className="summary-row">
            <span className="label">Subtotal</span>
            <span className="value">{formatCurrency(subtotal, currency)}</span>
          </div>

          {appliedPromo ? (
            <div className="summary-row promo-row">
              <span className="label">
                Discount <small className="promo-code">({appliedPromo.code})</small>
              </span>
              <div className="value-and-action">
                <span className="value">−{formatCurrency(discountAmount, currency)}</span>
                <button type="button" className="btn btn-link small" onClick={removePromo} aria-label="Remove promo code">
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="promo-input-row" role="group" aria-label="Promo code">
              <input
                type="text"
                className="promo-input"
                placeholder="Promo code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                aria-label="Promo code"
              />
              <button type="button" className="btn btn-secondary" onClick={applyPromo}>
                Apply
              </button>
            </div>
          )}

          <div className="summary-row">
            <span className="label">Estimated tax</span>
            <span className="value">{formatCurrency(tax, currency)}</span>
          </div>

          <div className="summary-row">
            <span className="label">Estimated shipping</span>
            <span className="value">{shipping === 0 ? "Free" : formatCurrency(shipping, currency)}</span>
          </div>

          <div className="summary-total" aria-live="polite">
            <span className="total-label">Total</span>
            <span className="total-value">{formatCurrency(total, currency)}</span>
          </div>
        </div>
      </div>

      <div className="summary-actions">
        {!isCheckout ? (
          <>
            <button
              type="button"
              className="btn btn-primary btn-checkout"
              onClick={handleProceed}
              disabled={lineItems.length === 0}
              aria-disabled={lineItems.length === 0}
            >
              Checkout
            </button>

            <button type="button" className="btn btn-outline btn-continue" onClick={handleContinue}>
              Continue shopping
            </button>
          </>
        ) : (
          <div className="checkout-action-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="btn btn-ghost" onClick={handleBack}>
              ← Back to cart
            </button>

            <div style={{ flex: 1 }} />

            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={lineItems.length === 0}>
              Submit intent
            </button>

            <button type="button" className="btn btn-ghost" onClick={handleContinue}>
              Continue shopping
            </button>
          </div>
        )}
      </div>

      <div className="summary-footnote">
        <small>
          Receipt-style summary. Prices are at checkout and may change before submission. Taxes and shipping are estimates.
        </small>
      </div>
    </aside>
  );
}

CartSummary.propTypes = {
  isCheckout: PropTypes.bool,
  onProceedToCheckout: PropTypes.func,
  onSubmitIntent: PropTypes.func,
  onBackToCart: PropTypes.func,
  onContinueShopping: PropTypes.func,
  taxRate: PropTypes.number,
  shippingEstimator: PropTypes.func,
};
