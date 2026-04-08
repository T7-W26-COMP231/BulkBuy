// src/components/PaymentDeliveryForm.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import useCart from "./useCart";
import { useOpsContext } from "../../../contexts/OpsContext";
import { useToastService } from "./useToastService";
import "./PaymentDeliveryForm.css";

/* Helpers */
const maskCard = (num = "") => {
  const s = String(num || "");
  return s.length <= 4 ? s : "**** **** **** " + s.slice(-4);
};
const luhnValid = (num = "") => {
  const s = String(num).replace(/\D/g, "");
  if (!s) return false;
  let sum = 0;
  let dbl = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = parseInt(s[i], 10);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
};

export default function PaymentDeliveryForm({ onSave, persistToOps = true, opts={}}) {
  const toast = useToastService();
  const cart = useCart();
  const ops = useOpsContext?.() ?? {};
  const setOrders = ops?.setOrders;

  const draft = cart.order ?? ops?.orders?.draftOrder ?? null;

  // Mock fallbacks so component runs even if draft lacks lists
  const mockPayments = [
    { id: "pm_1", brand: "Visa", last4: "4242" },
    { id: "pm_2", brand: "Mastercard", last4: "4444" },
  ];
  const mockAddresses = [
    { id: "addr_1", line1: "123 Main St", city: "Brampton", region: "ON", postal: "L6T 0A1", country: "CA" },
    { id: "addr_2", line1: "456 Queen St", city: "Toronto", region: "ON", postal: "M5V 2B6", country: "CA" },
  ];

  const existingPayments = useMemo(() => draft?.paymentMethods ?? draft?.payments ?? mockPayments, [draft]);
  const existingAddresses = useMemo(() => draft?.addresses ?? mockAddresses, [draft]);

  const initializedForOrder = useRef(null);

  // Payment state
  const [useSavedPayment, setUseSavedPayment] = useState(Boolean(existingPayments && existingPayments.length > 0));
  const [selectedPaymentId, setSelectedPaymentId] = useState(existingPayments[0]?.id ?? null);
  const [newCard, setNewCard] = useState({ number: "", name: "", exp: "", cvc: "" });
  const [billingAddress, setBillingAddress] = useState({ line1: "", line2: "", city: "", region: "", postal: "", country: "CA" });
  const [billingSameAsDelivery, setBillingSameAsDelivery] = useState(false);

  // Delivery state
  const [selectedAddressId, setSelectedAddressId] = useState(existingAddresses[0]?.id ?? null);
  const [usePaymentAddress, setUsePaymentAddress] = useState(false);
  const [newDeliveryAddress, setNewDeliveryAddress] = useState({ line1: "", line2: "", city: "", region: "", postal: "", country: "CA" });
  const [deliveryMethod, setDeliveryMethod] = useState(draft?.delivery?.method ?? "standard");

  // Debounce persistence
  const saveTimer = useRef(null);
  const pending = useRef(null);

  /* Seed initial values once per order id */
  useEffect(() => {
    const orderId = draft?._id ?? draft?.orderId ?? null;
    if (!orderId) return;
    if (initializedForOrder.current === orderId) return;

    setUseSavedPayment(Boolean(draft?.payment?.saved) || (existingPayments && existingPayments.length > 0));
    setSelectedPaymentId(draft?.payment?.paymentId ?? existingPayments[0]?.id ?? null);
    setNewCard((s) => ({ ...s, name: draft?.payment?.card?.name ?? s.name }));

    if (draft?.payment?.billingAddress) {
      setBillingAddress((s) => ({ ...s, ...draft.payment.billingAddress }));
    }

    setSelectedAddressId(draft?.delivery?.addressId ?? existingAddresses[0]?.id ?? null);
    setNewDeliveryAddress((s) => ({ ...s, ...(draft?.delivery?.address ?? {}) }));
    setDeliveryMethod(draft?.delivery?.method ?? "standard");

    initializedForOrder.current = orderId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  /* Build payload */
  const buildPayload = useCallback(() => {
    const payment = useSavedPayment
      ? { saved: true, paymentId: selectedPaymentId }
      : { saved: false, card: { ...newCard }, billingAddress: billingSameAsDelivery ? { ...newDeliveryAddress } : { ...billingAddress } };

    const delivery = usePaymentAddress
      ? { method: deliveryMethod, addressFromPayment: true }
      : selectedAddressId
      ? { method: deliveryMethod, addressId: selectedAddressId }
      : { method: deliveryMethod, address: { ...newDeliveryAddress } };

    return { payment, delivery };
  }, [useSavedPayment, selectedPaymentId, newCard, billingAddress, billingSameAsDelivery, newDeliveryAddress, usePaymentAddress, selectedAddressId, deliveryMethod]);

  /* Persist (debounced) */
  const schedulePersist = useCallback(
    (payload) => {
      pending.current = payload;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        const toSave = pending.current;
        pending.current = null;
        if (!toSave) return;

        if (persistToOps && typeof setOrders === "function") {
          try {
            setOrders((prev = {}) => {
              const prevDraft = prev?.draftOrder ?? prev?.order ?? {};
              const merged = {
                ...prevDraft,
                payment: toSave.payment.saved
                  ? { saved: true, paymentId: toSave.payment.paymentId }
                  : { saved: false, billingAddress: toSave.payment.billingAddress ?? null, cardLast4: String(toSave.payment.card?.number ?? "").slice(-4) },
                delivery: toSave.delivery.addressId ? { addressId: toSave.delivery.addressId, method: toSave.delivery.method } : { address: toSave.delivery.address, method: toSave.delivery.method },
              };
              return { ...prev, draftOrder: merged, order: merged };
            });
            toast.showInfo("Saved payment & delivery (local).");
          } catch (err) {
            console.warn("persist error", err);
            toast.showError("Could not persist form locally.");
          }
        } else {
          try {
            const key = `cart:${draft?._id ?? "anon"}:checkout`;
            localStorage.setItem(key, JSON.stringify(toSave));
            toast.showInfo("Saved payment & delivery (localStorage).");
          } catch {
            /* ignore */
          }
        }
      }, 700);
    },
    [persistToOps, setOrders, draft, toast]
  );

  /* Immediate save handler */
  const handleSave = useCallback(
    async (ev) => {
      ev?.preventDefault?.();
      const payload = buildPayload();

      if (!payload.payment.saved) {
        const num = String(payload.payment.card.number || "").replace(/\s+/g, "");
        if (!luhnValid(num)) {
          toast.showError("Card number appears invalid.");
          return;
        }
        if (!payload.payment.card.exp || !payload.payment.card.cvc) {
          toast.showError("Enter card expiry and CVC.");
          return;
        }
      }

      if (!payload.delivery.addressId && !payload.delivery.address && !payload.delivery.addressFromPayment) {
        toast.showError("Enter a delivery address or choose an existing one.");
        return;
      }

      if (persistToOps && typeof setOrders === "function") {
        try {
          setOrders((prev = {}) => {
            const prevDraft = prev?.draftOrder ?? prev?.order ?? {};
            const merged = {
              ...prevDraft,
              payment: payload.payment.saved
                ? { saved: true, paymentId: payload.payment.paymentId }
                : { saved: false, billingAddress: payload.payment.billingAddress ?? null, cardLast4: String(payload.payment.card?.number ?? "").slice(-4) },
              delivery: payload.delivery.addressId ? { addressId: payload.delivery.addressId, method: payload.delivery.method } : { address: payload.delivery.address, method: payload.delivery.method },
            };
            return { ...prev, draftOrder: merged, order: merged };
          });
          toast.showSuccess("Payment & delivery saved.");
        } catch (err) {
          toast.showError("Could not save to draft.");
        }
      } else {
        try {
          const key = `cart:${draft?._id ?? "anon"}:checkout`;
          localStorage.setItem(key, JSON.stringify(payload));
          toast.showSuccess("Saved locally.");
        } catch {
          toast.showError("Could not save locally.");
        }
      }

      if (typeof onSave === "function") {
        try {
          await onSave(payload);
        } catch (err) {
          console.warn("onSave error", err);
        }
      }
    },
    [buildPayload, persistToOps, setOrders, draft, onSave, toast]
  );

  /* schedule persist on changes */
  useEffect(() => {
    const payload = buildPayload();
    // schedulePersist(payload);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [buildPayload, /*schedulePersist*/]);

  /* Rehydrate from localStorage if no draft present (mount) */
  useEffect(() => {
    if (draft) return;
    try {
      const key = `cart:${draft?._id ?? "anon"}:checkout`;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved?.payment) {
        if (saved.payment.saved) {
          setUseSavedPayment(true);
          setSelectedPaymentId(saved.payment.paymentId ?? null);
        } else {
          setUseSavedPayment(false);
          setNewCard((s) => ({ ...s, number: saved.payment.card?.number ?? "", exp: saved.payment.card?.exp ?? "", cvc: saved.payment.card?.cvc ?? "" }));
          if (saved.payment.billingAddress) setBillingAddress(saved.payment.billingAddress);
        }
      }
      if (saved?.delivery) {
        if (saved.delivery.addressId) setSelectedAddressId(saved.delivery.addressId);
        else if (saved.delivery.address) setNewDeliveryAddress(saved.delivery.address);
      }
    } catch {
      /* ignore */
    }
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmitIntent = useCallback(async () => {
    try {
      const payload = buildPayload();
      await cart.submitOrder?.({ orderId: cart.orderId, paymentPayload: payload.payment });
      toast.showSuccess("Submit intent recorded.");
    } catch (err) {
      toast.showError("Could not submit intent.");
    }
  }, [cart, buildPayload, toast]);

  /* UI */
  return (
    <form className="payment-delivery-form" onSubmit={handleSave} aria-label="Payment and delivery form" style={{ width: "100%" }}>
      <fieldset style={{padding: '2em'}}>
        <legend>Payment</legend>

        {/* Dropdown for saved payments */}
        {existingPayments.length > 0 && (
          <div className="saved-payments">
            <label htmlFor="saved-payments-select" className="label">Choose Pyment Method</label>
            <hr style={{border: '1px solid azure'}}/><br />
            <select
              id="saved-payments-select"
              value={useSavedPayment ? (selectedPaymentId ?? "") : "new"}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "new") {
                  setUseSavedPayment(false);
                  setSelectedPaymentId(null);
                } else {
                  setUseSavedPayment(true);
                  setSelectedPaymentId(v);
                }
              }}
              aria-label="Choose saved payment method or enter new"
            >
              {existingPayments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand ?? "Card"} • {maskCard(p.last4 ?? p.number)}
                </option>
              ))}
              <option value="new">Enter a new card</option>
            </select>
          </div>
        )}

        {/* If no saved payments exist, show new card entry by default */}
        {!useSavedPayment && (
          <div className="card-entry">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Card number"
              value={newCard.number}
              onChange={(e) => setNewCard((s) => ({ ...s, number: e.target.value }))}
              aria-label="Card number"
            />
            <input
              type="text"
              placeholder="Name on card"
              value={newCard.name}
              onChange={(e) => setNewCard((s) => ({ ...s, name: e.target.value }))}
              aria-label="Name on card"
            />
            <div className="card-row">
              <input
                type="text"
                placeholder="MM/YY"
                value={newCard.exp}
                onChange={(e) => setNewCard((s) => ({ ...s, exp: e.target.value }))}
                aria-label="Expiry"
              />
              <input
                type="text"
                placeholder="CVC"
                value={newCard.cvc}
                onChange={(e) => setNewCard((s) => ({ ...s, cvc: e.target.value }))}
                aria-label="CVC"
              />
            </div>

            <label className="checkbox-row">
              <input type="checkbox" checked={billingSameAsDelivery} onChange={(e) => setBillingSameAsDelivery(e.target.checked)} />
              Use delivery address as billing address
            </label>

            {!billingSameAsDelivery && (
              <div className="billing-entry">
                <div className="label small muted">Billing address</div>
                <input type="text" placeholder="Address line 1" value={billingAddress.line1} onChange={(e) => setBillingAddress((s) => ({ ...s, line1: e.target.value }))} aria-label="Billing address line 1" />
                <input type="text" placeholder="City" value={billingAddress.city} onChange={(e) => setBillingAddress((s) => ({ ...s, city: e.target.value }))} aria-label="Billing city" />
                <div className="address-row">
                  <input type="text" placeholder="Region" value={billingAddress.region} onChange={(e) => setBillingAddress((s) => ({ ...s, region: e.target.value }))} aria-label="Billing region" />
                  <input type="text" placeholder="Postal code" value={billingAddress.postal} onChange={(e) => setBillingAddress((s) => ({ ...s, postal: e.target.value }))} aria-label="Billing postal code" />
                </div>
                <select value={billingAddress.country} onChange={(e) => setBillingAddress((s) => ({ ...s, country: e.target.value }))} aria-label="Billing country">
                  <option value="CA">Canada</option>
                  <option value="US">United States</option>
                </select>
              </div>
            )}
          </div>
        )}
      </fieldset>
      <br />
      <fieldset style={{padding: '2em'}}>
        <legend>Delivery address</legend>

        {/* Dropdown for saved addresses */}
        {existingAddresses.length > 0 && (
          <div className="saved-addresses">
            <label htmlFor="saved-addresses-select" className="label">Choose delivery address</label>
            <hr style={{border: '1px solid azure'}}/><br />
            <select
              id="saved-addresses-select"
              value={usePaymentAddress ? "usePayment" : (selectedAddressId ?? "new")}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "usePayment") {
                  setUsePaymentAddress(true);
                  setSelectedAddressId(null);
                } else if (v === "new") {
                  setUsePaymentAddress(false);
                  setSelectedAddressId(null);
                } else {
                  setUsePaymentAddress(false);
                  setSelectedAddressId(v);
                }
              }}
              aria-label="Choose saved address, use billing address, or enter new"
            >
              {existingAddresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.line1} • {a.city} {a.postal}
                </option>
              ))}
              <option value="usePayment">Use billing / payment address</option>
              <option value="new">Enter a new address</option>
            </select>
          </div>
        )}

        {/* New address inputs */}
        {!usePaymentAddress && !selectedAddressId && (
          <div className="address-entry">
            <input type="text" placeholder="Address line 1" value={newDeliveryAddress.line1} onChange={(e) => setNewDeliveryAddress((s) => ({ ...s, line1: e.target.value }))} aria-label="Delivery address line 1" />
            <input type="text" placeholder="Address line 2" value={newDeliveryAddress.line2} onChange={(e) => setNewDeliveryAddress((s) => ({ ...s, line2: e.target.value }))} aria-label="Delivery address line 2" />
            <div className="address-row">
              <input type="text" placeholder="City" value={newDeliveryAddress.city} onChange={(e) => setNewDeliveryAddress((s) => ({ ...s, city: e.target.value }))} aria-label="Delivery city" />
              <input type="text" placeholder="Region" value={newDeliveryAddress.region} onChange={(e) => setNewDeliveryAddress((s) => ({ ...s, region: e.target.value }))} aria-label="Delivery region" />
            </div>
            <div className="address-row">
              <input type="text" placeholder="Postal code" value={newDeliveryAddress.postal} onChange={(e) => setNewDeliveryAddress((s) => ({ ...s, postal: e.target.value }))} aria-label="Delivery postal code" />
              <select value={newDeliveryAddress.country} onChange={(e) => setNewDeliveryAddress((s) => ({ ...s, country: e.target.value }))} aria-label="Delivery country">
                <option value="CA">Canada</option>
                <option value="US">United States</option>
              </select>
            </div>
          </div>
        )}

        <div className="delivery-method">
          <label className="radio-row">
            <input type="radio" name="delivery-method" value="standard" checked={deliveryMethod === "standard"} onChange={() => setDeliveryMethod("standard")} />
            Standard delivery
          </label>
          <label className="radio-row">
            <input type="radio" name="delivery-method" value="express" checked={deliveryMethod === "express"} onChange={() => setDeliveryMethod("express")} />
            Express delivery
          </label>
        </div>
      </fieldset>

      <div className="form-actions" style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" className="btn btn-ghost" onClick={() => opts?.backToCart()}>
          ← Back
        </button>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            await handleSave(new Event("submit"));
            await handleSubmitIntent();
          }}
        >
          Submit intent
        </button>

        <button type="button" className="btn btn-ghost" onClick={() => (window.location.href = "/")}>
          Continue shopping
        </button>
      </div>
    </form>
  );
}

PaymentDeliveryForm.propTypes = {
  onSave: PropTypes.func,
  persistToOps: PropTypes.bool,
};
