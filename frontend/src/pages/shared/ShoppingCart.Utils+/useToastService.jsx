// src/services/ToastService.js
/**
 * ToastService.js
 *
 * Thin, well-documented wrapper around the app's ToastProvider API
 * to centralize cart-specific toast behavior and the "thumbnail -> full-detail"
 * toast flow for cart item thumbnails.
 *
 * Responsibilities:
 * - Expose small, focused helpers: showItemDetailToast, showSuccess, showError,
 *   showInfo, dismissToast, updateToast.
 * - Render the full item detail inside a toast using a renderer function so the
 *   toast receives `toastControls` (dismiss/update/bringToFront).
 * - Default to non-stacking corner toasts for simple messages and HVC (card)
 *   toasts for full-detail item views so they appear above the blur overlay.
 *
 * Usage:
 * import ToastService from "src/services/ToastService";
 * ToastService.showItemDetailToast(item);
 *
 * NOTE: This file expects your ToastProvider to expose a hook `useToast()`
 * that returns an API with `showToast`, `dismissToast`, `updateToast`, etc.
 * Adjust the import path if your provider hook lives elsewhere.
 */

import React from "react";
import { createElement } from "react";
import { useToast } from "../../../contexts/ToastProvider"; // adjust path if needed
// FullItemView is the full-detail card component we'll render inside the toast.
// It should accept `item` prop and optionally `toastControls` for actions inside the toast.
import FullItemView from "./FullItemView";

/* -------------------------
   Internal renderer component
   ------------------------- */

/**
 * ItemDetailRenderer
 *
 * A renderer function passed to showToast. It receives { toastControls } and
 * returns a React element. We render FullItemView and inject toastControls so
 * the view can dismiss or update the toast (e.g., "Add to cart" inside toast).
 */
function ItemDetailRenderer({ item }) {
  return function renderer({ toastControls }) {
    // FullItemView should be a presentational component that accepts:
    // - item: the item object to display
    // - toastControls: { dismiss, bringToFront, update }
    return createElement(FullItemView, { item, toastControls });
  };
}

/* -------------------------
   Public API (hook wrapper)
   ------------------------- */

/**
 * useToastService
 *
 * Hook that returns the toast helpers. Use inside React components.
 *
 * Example:
 * const toast = useToastService();
 * toast.showItemDetailToast(item);
 */
export function useToastService() {
  const toastApi = useToast(); // { showToast, dismissToast, updateToast, bringToFront, ... }

  if (!toastApi) {
    // Defensive: if provider not mounted, return no-op functions to avoid runtime crashes.
    return {
      showItemDetailToast: () => null,
      showSuccess: () => null,
      showError: () => null,
      showInfo: () => null,
      dismissToast: () => null,
      updateToast: () => null,
      bringToFront: () => null,
    };
  }

  const {
    showToast,
    dismissToast,
    updateToast,
    bringToFront,
  } = toastApi;

  /**
   * showItemDetailToast
   *
   * Render a full-detail card for `item` inside an HVC/card toast.
   * - Uses a renderer function so FullItemView receives toastControls.
   * - Defaults: HVC (center card), non-stacking (so it appears above overlay),
   *   blurBg true to dim the background while the card is visible.
   *
   * Returns the toast id.
   */
  function showItemDetailToast(item, opts = {}) {
    if (!item) return null;
    const renderer = ItemDetailRenderer({ item });

    const toastOpts = {
      value: "HVC", // high-visibility card
      IsToStack: false,
      IsToStick: false,
      blurBg: true,
      duration: null, // keep until dismissed
      animate: "FT",
      ...opts,
    };

    return showToast(renderer, toastOpts);
  }

  /**
   * showSuccess / showError / showInfo
   *
   * Small corner toasts for quick feedback. These use the corner (TR) by default.
   */
  function showSuccess(message, opts = {}) {
    return showToast(message, {
      value: "TR",
      IsToStack: false,
      IsToStick: false,
      blurBg: false,
      duration: 3500,
      animate: "FT",
      ...opts,
    });
  }

  function showError(message, opts = {}) {
    return showToast(message, {
      value: "TR",
      IsToStack: false,
      IsToStick: false,
      blurBg: false,
      duration: 6000,
      animate: "FT",
      ...opts,
    });
  }

  function showInfo(message, opts = {}) {
    return showToast(message, {
      value: "TR",
      IsToStack: false,
      IsToStick: false,
      blurBg: false,
      duration: 4500,
      animate: "FT",
      ...opts,
    });
  }

  /**
   * dismissToast
   */
  function dismissToastById(id) {
    if (!id) return;
    dismissToast(id);
  }

  /**
   * updateToast
   */
  function updateToastById(id, patch = {}) {
    if (!id) return;
    updateToast(id, patch);
  }

  return {
    showItemDetailToast,
    showSuccess,
    showError,
    showInfo,
    dismissToast: dismissToastById,
    updateToast: updateToastById,
    bringToFront,
  };
}

/* -------------------------
   Convenience default export
   ------------------------- */

/**
 * Default export is a small object with a `hook` property for convenience in
 * non-hook contexts. Prefer `useToastService()` inside components.
 *
 * Example (non-hook usage inside event handler in a component):
 * const { showItemDetailToast } = useToastService();
 * showItemDetailToast(item);
 */
export default {
  useToastService,
};
