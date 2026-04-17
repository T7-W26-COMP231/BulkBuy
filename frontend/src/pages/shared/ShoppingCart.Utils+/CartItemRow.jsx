// src/components/CartItemRow.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { formatCurrency, calcLineTotal } from "./ShoppingCart.Utils";
import { useToastService } from "./useToastService";
import "./CartItemRow.css";

/**
 * CartItemRow
 *
 * Accessible, production-ready row for a single cart item.
 * - Thumbnail opens full item toast (toast service)
 * - Save for later / Remove actions (supports parent confirm flow)
 * - Defensive: respects inventory, avoids state updates after unmount
 */
export default function CartItemRow({ item, cart, requestRemoveWithConfirm, onLocalItemUpdate }) {
  const toast = useToastService();
  const mountedRef = useRef(true);

  const [localQty, setLocalQty] = useState(() => Number(item?.quantity ?? 1));
  const [busy, setBusy] = useState(false);
  const [inputDirty, setInputDirty] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Derived values
  const itemInfo = item?.ItemSysInfo ?? {};
  const currency = item?.pricingSnapshot?.meta?.currency ?? "CAD";
  const snap = Array.isArray(item?.pricingSnapshot)
    ? item.pricingSnapshot[0]
    : item?.pricingSnapshot;
  const unitPrice = Number(snap?.atInstantPrice ?? 0);

  const inventoryAvailable = useMemo(() => {
    const inv = itemInfo?.inventory;
    if (!inv) return Infinity;
    return Math.max(0, Number(inv.stock ?? 0) - Number(inv.reserved ?? 0));
  }, [itemInfo]);

  const lineTotal = useMemo(
    () => calcLineTotal({ pricingSnapshot: item?.pricingSnapshot, quantity: Number(localQty || 0) }),
    [item, localQty]
  );

  // Keep localQty in sync with external updates
  useEffect(() => {
    setLocalQty(Number(item?.quantity ?? 1));
    setInputDirty(false);
  }, [item?.quantity]);

  // Open full item view via toast service (if available)
  const openFullView = useCallback(() => {
    try {
      toast.showItemDetailToast?.(item, { duration: null, blurBg: true });
    } catch {
      toast.showInfo?.("Item details unavailable.");
    }
  }, [toast, item]);

  // Persist quantity change (hook handles optimistic/rollback)
  const persistQty = useCallback(
    async (nextQty) => {
      if (!cart?.orderId) {
        toast.showError("Cart not available.");
        setLocalQty(Number(item?.quantity ?? 1));
        return;
      }

      let qty = Number(nextQty || 0);
      if (Number.isNaN(qty) || qty < 0) qty = 0;
      if (inventoryAvailable !== Infinity && qty > inventoryAvailable) {
        toast.showInfo(`Only ${inventoryAvailable} available.`);
        qty = inventoryAvailable;
      }

      // No-op if unchanged
      if (qty === Number(item?.quantity ?? 0)) {
        setLocalQty(qty);
        setInputDirty(false);
        return;
      }

      setBusy(true);
      try {
        await cart.updateItemQty?.({ orderId: cart.orderId, itemId: item.itemId, quantity: qty });
      } catch (err) {
        toast.showError("Could not update quantity. Changes may be reverted.");
      } finally {
        if (mountedRef.current) {
          setBusy(false);
          setInputDirty(false);
          // ensure local reflects authoritative value (hook will update item prop shortly)
          setLocalQty(Number(item?.quantity ?? qty));
        }
      }
    },
    [cart, item, inventoryAvailable, toast]
  );

  // Handlers
  const handleIncrement = useCallback(() => {
    const next = inventoryAvailable === Infinity ? Number(localQty || 0) + 1 : Math.min(inventoryAvailable, Number(localQty || 0) + 1);
    setLocalQty(next);
    persistQty(next);
  }, [localQty, persistQty, inventoryAvailable]);

  const handleDecrement = useCallback(() => {
    const next = Math.max(0, Number(localQty || 0) - 1);
    if (next === 0) {
      if (typeof requestRemoveWithConfirm === "function") {
        requestRemoveWithConfirm(item);
        return;
      }
      const confirmed = window.confirm("Quantity set to 0 will remove this item from your cart. Continue?");
      if (!confirmed) {
        setLocalQty(Number(item?.quantity ?? 1));
        return;
      }
    }
    setLocalQty(next);
    persistQty(next);
  }, [localQty, persistQty, item, requestRemoveWithConfirm]);

  const handleQtyInput = useCallback((e) => {
    const raw = e.target.value;
    const sanitized = raw.replace(/[^\d]/g, "");
    setLocalQty(sanitized === "" ? "" : Number(sanitized));
    setInputDirty(true);
  }, []);

  const handleQtyBlur = useCallback(() => {
    let v = Number(localQty || 0);
    if (Number.isNaN(v)) v = Number(item?.quantity ?? 1);
    if (inventoryAvailable !== Infinity && v > inventoryAvailable) v = inventoryAvailable;
    setLocalQty(v);
    persistQty(v);
  }, [localQty, persistQty, inventoryAvailable, item]);

  const handleSaveForLater = useCallback(async () => {
    if (!cart?.orderId) return toast.showError("Cart not available.");
    setBusy(true);
    try {
      await cart.toggleSaveForLater?.({
        orderId: cart.orderId,
        itemId: item.itemId,
        saveForLater: true,
      });

      onLocalItemUpdate?.({
        ...item,
        saveForLater: true,
        status: "savedForLater",
      });
    } catch {
      toast.showError("Could not save item for later.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [cart, item, toast, onLocalItemUpdate]);

  const handleMoveToActive = useCallback(async () => {
    if (!cart?.orderId) {
      toast.showError("Cart not available.");
      return;
    }
    setBusy(true);
    try {
      await cart.toggleSaveForLater?.({
        orderId: cart.orderId,
        itemId: item.itemId,
        saveForLater: false,
      });

      onLocalItemUpdate?.({
        ...item,
        saveForLater: false,
        status: "active",
      });
    } catch {
      toast.showError("Could not move item to cart.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [cart, item, toast, onLocalItemUpdate]);


  const handleRemove = useCallback(async () => {
    if (typeof requestRemoveWithConfirm === "function") {
      requestRemoveWithConfirm(item);
      return;
    }

    if (!cart?.orderId) {
      toast.showError("Cart not available.");
      return;
    }

    const confirmed = window.confirm("Remove this item from your cart?");
    if (!confirmed) return;

    setBusy(true);
    try {
      await cart.removeItem?.({ orderId: cart.orderId, itemId: item.itemId });
      toast.showSuccess("Item removed.");
    } catch {
      toast.showError("Could not remove item.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [cart, item, toast, requestRemoveWithConfirm]);

  const ariaLabelTitle = `${itemInfo.title ?? "Product"}${itemInfo.sku ? ` — ${itemInfo.sku}` : ""}`;

  return (
    <div className="cart-item-row" role="row" aria-rowindex={1} style={{ border: '1px dashed black' }}>
      <div className="col col-thumb" role="gridcell">
        <button
          type="button"
          className="thumb-btn"
          onClick={openFullView}
          style={{ border: '1px solid green' }}
          aria-label={`Open details for ${ariaLabelTitle}`}
          disabled={busy}
        >
          <img
            src={itemInfo.image ?? (Array.isArray(itemInfo.images) ? itemInfo.images[0] : undefined)}
            alt={itemInfo.title ?? "product image"}
            className="thumb-img"
            loading="lazy"
          />
        </button>
      </div>

      <div className="col col-product" role="gridcell">
        <div className="product-title" title={itemInfo.title}>
          {itemInfo.title}
        </div>

        <div className="product-meta small">
          <span className="sku">SKU: {itemInfo.sku ?? "—"}</span>
          {itemInfo.brand?.name && <span className="brand"> • {itemInfo.brand.name}</span>}
        </div>

        {itemInfo.shortDescription && (
          <div className="short-desc" aria-hidden="true">
            {itemInfo.shortDescription}
          </div>
        )}
      </div>

      <div className="col col-pricing" role="gridcell">
        <div className="price-now">{formatCurrency(unitPrice, currency)}</div>
        <div className="price-note small">At time of checkout</div>
      </div>

      <div className="col col-qty" role="gridcell" aria-label="Quantity controls">
        <div className="qty-control" aria-live="polite">
          <button
            type="button"
            className="qty-btn"
            onClick={handleDecrement}
            aria-label="Decrease quantity"
            disabled={busy || Number(localQty || 0) <= 0}
          >
            −
          </button>

          <input
            className="qty-input"
            value={inputDirty && localQty === "" ? "" : String(localQty)}
            onChange={handleQtyInput}
            onBlur={handleQtyBlur}
            aria-label={`Quantity for ${itemInfo.title ?? "item"}`}
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={busy}
          />

          <button
            type="button"
            className="qty-btn"
            onClick={handleIncrement}
            aria-label="Increase quantity"
            disabled={busy || (inventoryAvailable !== Infinity && Number(localQty || 0) >= inventoryAvailable)}
          >
            +
          </button>
        </div>

        <div className="availability small" aria-live="polite">
          {inventoryAvailable === Infinity ? (
            <span className="in-stock">In stock</span>
          ) : inventoryAvailable > 0 ? (
            <span className="in-stock">{inventoryAvailable} available</span>
          ) : (
            <span className="out-of-stock">Out of stock</span>
          )}
        </div>
      </div>

      <div className="col col-line-total" role="gridcell" style={{ justifyContent: "center" }}>
        <div className="line-total">{formatCurrency(lineTotal, currency)}</div>
      </div>

      <div className="col col-actions" role="gridcell">

        <div className="action-buttons" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-evenly' }}>
          <button
            type="button"
            className="btn btn-link"
            style={{ width: '4rem', border: '1px solid orangered', fontSize: '0.5em', }}
            onClick={item?.saveForLater ? handleMoveToActive : handleSaveForLater}
            disabled={busy || (item?.saveForLater ? false : Boolean(item?.saveForLater))}
            aria-disabled={busy || (item?.saveForLater ? false : Boolean(item?.saveForLater))}
          >
            {item?.saveForLater ? "Move to Cart" : "Save for later"}
          </button>

          <button
            type="button"
            className="btn btn-link danger"
            style={{ border: '1px solid red' }}
            onClick={handleRemove}
            disabled={busy}
            aria-disabled={busy}
          >
            Remove
          </button>
        </div>

      </div>
    </div>
  );
}

CartItemRow.propTypes = {
  item: PropTypes.shape({
    itemId: PropTypes.string.isRequired,
    quantity: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    pricingSnapshot: PropTypes.object,
    saveForLater: PropTypes.bool,
    status: PropTypes.string,
    ItemSysInfo: PropTypes.object,
  }).isRequired,
  cart: PropTypes.shape({
    orderId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    updateItemQty: PropTypes.func,
    toggleSaveForLater: PropTypes.func,
    removeItem: PropTypes.func,
  }).isRequired,
  requestRemoveWithConfirm: PropTypes.func,
  onLocalItemUpdate: PropTypes.func,
};
