// src/components/FullItemView.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { formatCurrency, calcLineTotal } from "./ShoppingCart.Utils";
import useCart from "./useCart";
import { useToastService } from "./useToastService";
import "./FullItemView.css";

/**
 * FullItemView
 *
 * - Polished, compact, and defensive full-item card with a horizontal carousel.
 * - Thumbnails row includes left/right chevrons on the same row (left/right).
 * - Click main viewport to advance slides when inside a toast host; otherwise delegate to toast service.
 * - Thumbnails and chevrons scroll the track to the selected slide.
 * - Keyboard: ArrowLeft/ArrowRight to navigate, Enter/Space to open or advance.
 */

export default function FullItemView({ item, toastControls = {} }) {
  const { dismiss, bringToFront, update: updateToast } = toastControls;
  const cart = useCart();
  const ts = useToastService();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const itemInfo = item?.ItemSysInfo ?? item ?? {};
  const currency = item?.pricingSnapshot?.meta?.currency ?? "CAD";
  const price = Number(item?.pricingSnapshot?.atInstantPrice ?? 0);

  const [localQty, setLocalQty] = useState(() => Number(item?.quantity ?? 1));
  const [busy, setBusy] = useState(false);

  useEffect(() => setLocalQty(Number(item?.quantity ?? 1)), [item?.quantity]);

  const inventoryAvailable = useMemo(() => {
    const inv = itemInfo?.inventory;
    if (!inv) return Infinity;
    const totalStock = Number(inv.stock ?? 0);
    const reserved = Number(inv.reserved ?? 0);
    return Math.max(0, totalStock - reserved);
  }, [itemInfo]);

  const lineTotal = useMemo(
    () => calcLineTotal({ pricingSnapshot: item?.pricingSnapshot, quantity: Number(localQty || 0) }),
    [item, localQty]
  );

  const onClose = useCallback(() => typeof dismiss === "function" && dismiss(), [dismiss]);
  const onBringToFront = useCallback(() => typeof bringToFront === "function" && bringToFront(), [bringToFront]);

  /* ---------- Carousel state ---------- */
  const images = useMemo(() => {
    if (Array.isArray(itemInfo?.images) && itemInfo.images.length) return itemInfo.images;
    if (itemInfo?.image) return [itemInfo.image];
    return [];
  }, [itemInfo]);

  const trackRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
    if (trackRef.current) trackRef.current.scrollLeft = 0;
  }, [images]);

  const scrollToIndex = useCallback((idx) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(idx, track.children.length - 1));
    const child = track.children[clamped];
    if (!child) return;
    // center the slide
    const trackRect = track.getBoundingClientRect();
    const childRect = child.getBoundingClientRect();
    const offset = child.offsetLeft - (trackRect.width - childRect.width) / 2;
    track.scrollTo({ left: offset, behavior: "smooth" });
    setCurrentIndex(clamped);
  }, []);

  const handleThumbClick = useCallback(
    (idx, e) => {
      e.stopPropagation();
      scrollToIndex(idx);
      const slide = trackRef.current?.children[idx];
      if (slide) slide.focus?.();
    },
    [scrollToIndex]
  );

  const handleViewportClick = useCallback(
    (e) => {
      // inside toast host: advance slide; otherwise open gallery via toast service
      if (toastControls && typeof toastControls.dismiss === "function") {
        const next = (currentIndex + 1) % Math.max(1, images.length);
        scrollToIndex(next);
        return;
      }
      if (typeof ts.showItemDetailToast === "function") ts.showItemDetailToast(item);
    },
    [toastControls, currentIndex, images.length, scrollToIndex, ts, item]
  );

  const handleKeyDownOnViewport = useCallback(
    (e) => {
      if (e.key === "ArrowRight") scrollToIndex(currentIndex + 1);
      else if (e.key === "ArrowLeft") scrollToIndex(currentIndex - 1);
      else if (e.key === "Enter" || e.key === " ") handleViewportClick(e);
    },
    [currentIndex, scrollToIndex, handleViewportClick]
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = null;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const children = Array.from(track.children);
        if (!children.length) return;
        const trackRect = track.getBoundingClientRect();
        const trackCenter = trackRect.left + trackRect.width / 2;
        let bestIdx = 0;
        let bestDist = Infinity;
        children.forEach((c, i) => {
          const r = c.getBoundingClientRect();
          const center = r.left + r.width / 2;
          const dist = Math.abs(center - trackCenter);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        });
        setCurrentIndex(bestIdx);
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* ---------- Cart actions (kept compact) ---------- */
  const changeQty = useCallback(
    async (nextQty) => {
      if (nextQty < 0) return;
      if (inventoryAvailable !== Infinity && nextQty > inventoryAvailable) {
        ts.showInfo(`Only ${inventoryAvailable} available in stock.`);
        setLocalQty(inventoryAvailable);
        return;
      }
      if (nextQty === 0) {
        const confirmed = window.confirm("Quantity set to 0 will remove this item from your cart. Continue?");
        if (!confirmed) {
          setLocalQty(Number(item?.quantity ?? 1));
          return;
        }
      }
      setLocalQty(nextQty);
      setBusy(true);
      try {
        if (cart?.orderId) {
          await cart.updateItemQty?.({ orderId: cart.orderId, itemId: item.itemId, quantity: Number(nextQty) });
          await cart.refresh?.();
          ts.showSuccess("Cart updated.");
        } else ts.showError("Cart not available.");
      } catch {
        setLocalQty(Number(item?.quantity ?? 1));
        ts.showError("Could not update quantity. Try again.");
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [cart, item, inventoryAvailable, ts]
  );

  const handleIncrement = useCallback(() => changeQty(Number(localQty || 0) + 1), [localQty, changeQty]);
  const handleDecrement = useCallback(() => changeQty(Math.max(0, Number(localQty || 0) - 1)), [localQty, changeQty]);

  const handleSaveForLater = useCallback(async () => {
    if (!cart?.orderId) return ts.showError("Cart not available.");
    setBusy(true);
    try {
      await cart.toggleSaveForLater?.({ orderId: cart.orderId, itemId: item.itemId, saveForLater: true });
      await cart.refresh?.();
      ts.showSuccess("Moved to Saved for Later.");
      if (typeof dismiss === "function") dismiss();
    } catch {
      ts.showError("Could not move item. Try again.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [cart, item, ts, dismiss]);

  const handleRemove = useCallback(async () => {
    if (!cart?.orderId) return ts.showError("Cart not available.");
    const confirmed = window.confirm("Remove this item from your cart?");
    if (!confirmed) return;
    setBusy(true);
    try {
      await cart.removeItem?.({ orderId: cart.orderId, itemId: item.itemId });
      await cart.refresh?.();
      ts.showSuccess("Item removed.");
      if (typeof dismiss === "function") dismiss();
    } catch {
      ts.showError("Could not remove item. Try again.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [cart, item, ts, dismiss]);

  const handleAddToCart = useCallback(async () => {
    if (!cart?.orderId) return ts.showError("Cart not available.");
    setBusy(true);
    try {
      if (item?.saveForLater || item?.status === "savedForLater") {
        await cart.toggleSaveForLater?.({ orderId: cart.orderId, itemId: item.itemId, saveForLater: false });
        await cart.updateItemQty?.({ orderId: cart.orderId, itemId: item.itemId, quantity: Number(localQty || 1) });
        await cart.refresh?.();
      } else {
        await changeQty(Number(localQty || 1));
      }
      ts.showSuccess("Item added to cart.");
      if (typeof dismiss === "function") dismiss();
    } catch {
      ts.showError("Could not add item. Try again.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [cart, item, localQty, changeQty, ts, dismiss]);

  const descriptionHtml = itemInfo?.shortDescription ?? itemInfo?.description ?? "";

  /* Chevrons for thumbnail row */
  const prevSlide = useCallback(() => scrollToIndex(currentIndex - 1), [currentIndex, scrollToIndex]);
  const nextSlide = useCallback(() => scrollToIndex(currentIndex + 1), [currentIndex, scrollToIndex]);

  return (
    <div
      className="full-item-view"
      role="dialog"
      aria-modal="false"
      aria-label={`Details for ${itemInfo?.title ?? "item"}`}
      onMouseEnter={onBringToFront}
      onFocus={onBringToFront}
      tabIndex={-1}
    >
      <header className="full-item-header">
        <div className="title-block">
          <h2 className="item-title">{itemInfo?.title}</h2>
          <div className="meta-row">
            <span className="sku">SKU: <strong>{itemInfo?.sku ?? "-"}</strong></span>
            {itemInfo?.brand?.name && <span className="brand"> • {itemInfo.brand.name}</span>}
            {itemInfo?.ratings?.avg != null && <span className="ratings"> • {itemInfo.ratings.avg}★ ({itemInfo.ratings.count ?? 0})</span>}
          </div>
        </div>

        <div className="header-actions">
          <button type="button" className="btn btn-ghost btn-close" aria-label="Close item details" onClick={onClose} disabled={busy}>✕</button>
        </div>
      </header>

      <div className="full-item-body">
        <div className="left-col" style={{ position: "relative" }}>
          <div
            className="image-viewport"
            role="region"
            aria-label="Product images"
            tabIndex={0}
            onClick={handleViewportClick}
            onKeyDown={handleKeyDownOnViewport}
          >
            <div className="image-track" ref={trackRef} style={{ display: "flex", height: "100%", alignItems: "center" }}>
              {images.length === 0 ? (
                <div className="image-slide" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div className="primary-image" aria-hidden="true">No image</div>
                </div>
              ) : (
                images.map((src, i) => (
                  <div key={i} className="image-slide" style={{ flex: "0 0 100%", height: "100%", scrollSnapAlign: "center" }} tabIndex={0} onFocus={() => setCurrentIndex(i)}>
                    <img src={src} alt={itemInfo?.title ?? "product image"} className="primary-image" loading="lazy" draggable={false} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Thumbnails row with chevrons on same row */}
          {images.length > 0 && (
            <div className="thumb-row" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <button type="button" className="chevron chevron-left" aria-label="Previous image" onClick={prevSlide} disabled={currentIndex === 0}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" /></svg>
              </button>

              <div className="thumb-strip" style={{ display: "flex", gap: 8, overflowX: "auto", flex: 1 }}>
                {images.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`Thumbnail ${i + 1}`}
                    className={`thumb ${i === currentIndex ? "active" : ""}`}
                    onClick={(e) => handleThumbClick(i, e)}
                    loading="lazy"
                    style={{ flex: "0 0 auto" }}
                  />
                ))}
              </div>

              <button type="button" className="chevron chevron-right" aria-label="Next image" onClick={nextSlide} disabled={currentIndex === images.length - 1}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" /></svg>
              </button>
            </div>
          )}
        </div>

        <div className="right-col">
          <div className="pricing-row">
            <div className="price">
              <div className="price-now">{formatCurrency(price, currency)}</div>
              <div className="price-meta">At time of checkout</div>
            </div>

            <div className="availability" aria-live="polite">
              {inventoryAvailable === Infinity ? <span className="in-stock">In stock</span> : inventoryAvailable > 0 ? <span className="in-stock">{inventoryAvailable} available</span> : <span className="out-of-stock">Out of stock</span>}
            </div>
          </div>

          <div className="description" dangerouslySetInnerHTML={{ __html: descriptionHtml }} aria-label="Product description" />

          <div className="qty-controls" aria-label="Quantity controls" >
            <label htmlFor={`qty-${item?.itemId}`} className="visually-hidden">Quantity</label>
            <div className="qty-btns" style={{width:'12.5em', justifyContent: 'center', alignSelf: 'center'}}>
              <button type="button" className="btn btn-sm" onClick={handleDecrement} aria-label="Decrease quantity" disabled={busy || Number(localQty || 0) <= 0}>−</button>
              <input id={`qty-${item?.itemId}`} className="qty-input" value={String(localQty ?? "")} onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setLocalQty(v === "" ? "" : Number(v)); }} onBlur={() => { let v = Number(localQty || 0); if (Number.isNaN(v)) v = Number(item?.quantity ?? 1); if (inventoryAvailable !== Infinity && v > inventoryAvailable) v = inventoryAvailable; changeQty(v); }} aria-live="polite" aria-label="Quantity" inputMode="numeric" disabled={busy} />
              <button type="button" className="btn btn-sm" onClick={handleIncrement} aria-label="Increase quantity" disabled={busy || (inventoryAvailable !== Infinity && Number(localQty || 0) >= inventoryAvailable)}>+</button>
            </div>
            <div className="line-total">{formatCurrency(lineTotal, currency)}</div>
          </div>

          <div className="action-row" 
            style={{
              // width:'10em' ,
              display: 'flex', 
              flexDirection: 'row', 
              justifyContent: 'flex-start', // Standard left alignment
              alignItems: 'flex-end', 
              fontSize: '0.25em',
              gap: '10px' // <--- This adds even spacing between the buttons
            }}>
            <button 
              type="button" 
              className="btn btn-outline" 
              onClick={handleSaveForLater} 
              disabled={busy} 
              style={{height: '3em', border: '1px solid green'}}>
              Save for later
            </button>

            {/* Removed the empty div; 'gap' handles the spacing now */}

            <button 
              type="button" 
              className="btn btn-link danger" 
              onClick={handleRemove} 
              disabled={busy} 
              style={{height: '3em', border: '1px solid green'}}>
              Remove
            </button>
          </div>


          <div className="extra-meta">
            {itemInfo?.weight && <div className="meta">Weight: {itemInfo.weight.value} {itemInfo.weight.unit}</div>}
            {itemInfo?.dimensions && <div className="meta">Dimensions: {itemInfo.dimensions.length}×{itemInfo.dimensions.width}×{itemInfo.dimensions.height} {itemInfo.dimensions.unit}</div>}
            {Array.isArray(itemInfo?.tags) && <div className="meta">Tags: {itemInfo.tags.join(", ")}</div>}
          </div>
        </div>
      </div>

      <footer className="full-item-footer">
        <div className="footer-left"><small className="muted">Item ID: {item?.itemId ?? "-"} · Order draft: {cart?.orderId ?? "-"}</small></div>
        <div className="footer-right">
          <button type="button" className="btn btn-ghost" onClick={() => { if (typeof updateToast === "function") updateToast({ content: "Saving..." }); onClose(); }}>Done</button>
        </div>
      </footer>
    </div>
  );
}

FullItemView.propTypes = {
  item: PropTypes.shape({
    itemId: PropTypes.string,
    quantity: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    saveForLater: PropTypes.bool,
    status: PropTypes.string,
    pricingSnapshot: PropTypes.object,
    ItemSysInfo: PropTypes.object,
  }).isRequired,
  toastControls: PropTypes.shape({
    dismiss: PropTypes.func,
    bringToFront: PropTypes.func,
    update: PropTypes.func,
  }),
};
