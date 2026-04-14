// src/hooks/useCart.js
/**
 * useCart.js
 *
 * OpsContext-first cart hook with two persistence strategies:
 *  - "batch"  : local edits update OpsContext.orders via setOrders and a debounced patch persists the draft.
 *  - "atomic" : each CRUD operation calls the corresponding network helper in utils.
 *
 * The hook reads the authoritative draft/order from OpsContext and keeps a local reducer
 * for optimistic UI updates. Network helpers in ../utils/ShoppingCart.Utils are optional.
 *
 * API (selected):
 *   const cart = useCart({ userId, persistence: 'batch' });
 *   cart.loadDraft({ draftOrder });
 *   cart.updateItemQty({ itemId, quantity });
 *   cart.toggleSaveForLater({ itemId, saveForLater });
 *   cart.removeItem({ itemId });
 *   cart.addItem({ item });
 *   cart.submitOrder({ paymentPayload });
 *
 * The hook returns state and actions and is safe to use in components that rely on OpsContext.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import * as Utils from "./ShoppingCart.Utils";
import { useToastService } from "./useToastService";
import { useOpsContext } from "../../../contexts/OpsContext";

/* -------------------------
   Reducer and initial state
   ------------------------- */

const initialState = {
  loading: false,
  error: null,
  orderId: null,
  order: null,
  items: [],
  lastUpdatedAt: null,
};

const ACTIONS = {
  LOAD_START: "LOAD_START",
  LOAD_SUCCESS: "LOAD_SUCCESS",
  LOAD_FAILURE: "LOAD_FAILURE",
  OPTIMISTIC_UPDATE: "OPTIMISTIC_UPDATE",
  CONFIRM_UPDATE: "CONFIRM_UPDATE",
  ROLLBACK_UPDATE: "ROLLBACK_UPDATE",
  CLEAR: "CLEAR",
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.LOAD_START:
      return { ...state, loading: true, error: null };
    case ACTIONS.LOAD_SUCCESS: {
      const { order } = action.payload;
      return {
        ...state,
        loading: false,
        error: null,
        order,
        orderId: order?._id ?? state.orderId,
        items: Array.isArray(order?.items) ? order.items : [],
        lastUpdatedAt: Date.now(),
      };
    }
    case ACTIONS.LOAD_FAILURE:
      return { ...state, loading: false, error: action.payload?.error ?? "Load failed" };
    case ACTIONS.OPTIMISTIC_UPDATE: {
      const { itemId, patch } = action.payload;
      const items = state.items.map((it) => (it.itemId === itemId ? { ...it, ...patch } : it));
      return { ...state, items, order: { ...state.order, items } };
    }
    case ACTIONS.CONFIRM_UPDATE: {
      const { order } = action.payload;
      return {
        ...state,
        order,
        items: Array.isArray(order?.items) ? order.items : [],
        lastUpdatedAt: Date.now(),
      };
    }
    case ACTIONS.ROLLBACK_UPDATE: {
      return {
        ...state,
        items: action.payload.previousItems,
        order: { ...state.order, items: action.payload.previousItems },
        error: action.payload.error,
      };
    }
    case ACTIONS.CLEAR:
      return { ...initialState };
    default:
      return state;
  }
}

/* -------------------------
   Hook
   ------------------------- */

/**
 * useCart
 * @param {Object} opts
 * @param {string|null} opts.userId
 * @param {'batch'|'atomic'} opts.persistence
 * @param {number} opts.batchDelay debounce delay for batch persistence (ms)
 */
export function useCart({ userId = null, persistence = "batch", batchDelay = 800 } = {}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const toast = useToastService();
  const mountedRef = useRef(true);

  // OpsContext: authoritative orders object and setter
  const ops = useOpsContext?.() ?? {};
  const orders = ops?.orders ?? null;
  const setOrders = ops?.setOrders ?? null;
  const opsOrder = orders?.draftOrder ?? orders?.order ?? null;
  const opsPatchFn = ops?.patchDraftOrder ?? null; // optional helper provided by ops context

  // runtime persistence control
  const [persistenceStrategy, setPersistenceStrategy] = useState(persistence);
  const isBatchMode = persistenceStrategy === "batch";

  // Debounce timer and pending patch
  const patchTimerRef = useRef(null);
  const pendingPatchRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (patchTimerRef.current) {
        clearTimeout(patchTimerRef.current);
        patchTimerRef.current = null;
      }
    };
  }, []);

  /* -------------------------
     Sync with OpsContext (authoritative)
  ------------------------- */
  useEffect(() => {
    if (opsOrder) {
      dispatch({ type: ACTIONS.LOAD_SUCCESS, payload: { order: opsOrder } });
    } else {
      dispatch({ type: ACTIONS.CLEAR });
    }
    // intentionally only depends on opsOrder
  }, [opsOrder]);

  /* -------------------------
     Persistence helpers
  ------------------------- */

  // Prefer ops.patchDraftOrder, then Utils.updateDraftOrder
  const doPatchDraftOrder = useCallback(
    async (orderToPatch) => {
      if (!orderToPatch) return null;
      const orderId = orderToPatch?._id ?? orderToPatch?.orderId ?? null;
      if (!orderId) return null;

      const patchFn =
        typeof opsPatchFn === "function"
          ? opsPatchFn
          : typeof Utils.updateDraftOrder === "function"
          ? Utils.updateDraftOrder
          : null;

      if (!patchFn) return null;

      // Try to call common shapes
      try {
        // prefer signature patchFn({ orderId, patch })
        const patch = { items: orderToPatch.items ?? [] };
        return await patchFn({ orderId, patch });
      } catch (err) {
        // fallback: call with order object
        try {
          return await patchFn(orderToPatch);
        } catch (err2) {
          throw err2;
        }
      }
    },
    [opsPatchFn]
  );

  const schedulePatch = useCallback(() => {
    if (patchTimerRef.current) clearTimeout(patchTimerRef.current);
    patchTimerRef.current = setTimeout(async () => {
      patchTimerRef.current = null;
      const toPatch = pendingPatchRef.current;
      pendingPatchRef.current = null;
      if (!toPatch) return;
      try {
        await doPatchDraftOrder(toPatch);
        // attempt to refresh authoritative state if helper exists
        if (typeof Utils.getDraftOrder === "function") {
          const res = await Utils.getDraftOrder({ userId });
          const order = res?.order ?? res ?? {};
          if (mountedRef.current) dispatch({ type: ACTIONS.CONFIRM_UPDATE, payload: { order } });
        }
      } catch (err) {
        toast.showError("Failed to persist cart changes.");
      }
    }, batchDelay);
  }, [batchDelay, doPatchDraftOrder, toast, userId]);

  const updateOpsOrder = useCallback(
    (newOrder) => {
      if (typeof setOrders === "function") {
        setOrders((prev = {}) => ({ ...prev, draftOrder: newOrder, order: newOrder }));
      }
      pendingPatchRef.current = newOrder;
      schedulePatch();
    },
    [setOrders, schedulePatch]
  );

  /* -------------------------
     Load / Refresh
  ------------------------- */

  const loadDraft = useCallback(
    async (opts = {}) => {

      // Defensive: if caller passed the same draft that's already loaded, skip
      const incoming = opts?.draftOrder ?? null;
      if (incoming && state.order && (incoming._id ?? incoming.orderId) && (state.order._id ?? state.order.orderId)) {
        const incomingId = String(incoming._id ?? incoming.orderId);
        const currentId = String(state.order._id ?? state.order.orderId);
        if (incomingId === currentId) return state.order;
      };
  
      if (opts?.draftOrder) {
        dispatch({ type: ACTIONS.LOAD_SUCCESS, payload: { order: opts.draftOrder } });
        ops.setCart({...ops.cart, ...opts?.draftOrder });
        return opts.draftOrder;
      }
      if (opsOrder) {
        dispatch({ type: ACTIONS.LOAD_SUCCESS, payload: { order: opsOrder } });
        return opsOrder;
      }
      if (typeof Utils.getDraftOrder === "function") {
        dispatch({ type: ACTIONS.LOAD_START });
        try {
          const res = await Utils.getDraftOrder({ userId });
          const order = res?.order ?? res ?? {};
          dispatch({ type: ACTIONS.LOAD_SUCCESS, payload: { order } });
          return order;
        } catch (err) {
          dispatch({ type: ACTIONS.LOAD_FAILURE, payload: { error: err.message ?? "Failed to load cart" } });
          toast.showError("Could not load cart. Try again.");
          return Promise.reject(err);
        }
      }
      const err = new Error("No draft order available in OpsContext and no network helper present.");
      dispatch({ type: ACTIONS.LOAD_FAILURE, payload: { error: err.message } });
      return Promise.reject(err);
    },
    [opsOrder, userId, toast, state.order]
  );

  const refresh = useCallback(async () => {
    if (opsOrder) {
      dispatch({ type: ACTIONS.LOAD_SUCCESS, payload: { order: opsOrder } });
      return opsOrder;
    }
    if (typeof Utils.getDraftOrder === "function") {
      try {
        const res = await Utils.getDraftOrder({ userId });
        const order = res?.order ?? res ?? {};
        if (mountedRef.current) dispatch({ type: ACTIONS.LOAD_SUCCESS, payload: { order } });
        return order;
      } catch (err) {
        toast.showError("Could not refresh cart.");
        return Promise.reject(err);
      }
    }
    return Promise.resolve(null);
  }, [opsOrder, userId, toast]);

  /* -------------------------
     Helpers
  ------------------------- */

  const findItem = useCallback((itemId) => state.items.find((it) => it.itemId === itemId) ?? null, [state.items]);

  /* -------------------------
     Actions (batch vs atomic)
  ------------------------- */

  const updateItemQty = useCallback(
    async ({ orderId = state.orderId, itemId, quantity }) => {
      const prevItems = state.items.slice();
      const target = findItem(itemId);
      if (!target) throw new Error("Item not found in cart");

      const available = (target?.ItemSysInfo?.inventory?.stock ?? Infinity) - (target?.ItemSysInfo?.inventory?.reserved ?? 0);
      if (Number(quantity) > available) {
        toast.showInfo(`Only ${available} available in stock.`);
        throw new Error("Insufficient stock");
      }

      // optimistic update
      dispatch({ type: ACTIONS.OPTIMISTIC_UPDATE, payload: { itemId, patch: { quantity: Number(quantity) } } });

      const newItems = state.items.map((it) => (it.itemId === itemId ? { ...it, quantity: Number(quantity) } : it));
      const newOrder = { ...state.order, items: newItems };

      if (isBatchMode) {
        updateOpsOrder(newOrder);
        toast.showSuccess("Quantity updated (local).");
        return newOrder;
      }

      // atomic mode
      if (typeof Utils.updateDraftOrder === "function") {
        try {
          await Utils.updateDraftOrder({ orderId, patch: { items: [{ itemId, quantity: Number(quantity) }] } });
          if (typeof Utils.getDraftOrder === "function") {
            const res = await Utils.getDraftOrder({ userId });
            const order = res?.order ?? res ?? {};
            if (mountedRef.current) dispatch({ type: ACTIONS.CONFIRM_UPDATE, payload: { order } });
            toast.showSuccess("Quantity updated.");
            return order;
          }
          dispatch({ type: ACTIONS.CONFIRM_UPDATE, payload: { order: newOrder } });
          toast.showSuccess("Quantity updated.");
          return newOrder;
        } catch (err) {
          if (mountedRef.current) dispatch({ type: ACTIONS.ROLLBACK_UPDATE, payload: { previousItems: prevItems, error: err.message } });
          toast.showError("Failed to update quantity.");
          throw err;
        }
      }

      // no network helper — keep optimistic state
      toast.showSuccess("Quantity updated (local).");
      return newOrder;
    },
    [state.items, state.order, state.orderId, findItem, toast, isBatchMode, updateOpsOrder, userId]
  );

  const toggleSaveForLater = useCallback(
    async ({ orderId = state.orderId, itemId, saveForLater = true }) => {
      const prevItems = state.items.slice();
      const target = findItem(itemId);
      if (!target) throw new Error("Item not found in cart");

      dispatch({
        type: ACTIONS.OPTIMISTIC_UPDATE,
        payload: { itemId, patch: { saveForLater: !!saveForLater, status: !!saveForLater ? "savedForLater" : "active" } },
      });

      const newItems = state.items.map((it) =>
        it.itemId === itemId ? { ...it, saveForLater: !!saveForLater, status: !!saveForLater ? "savedForLater" : "active" } : it
      );
      const newOrder = { ...state.order, items: newItems };

      if (isBatchMode) {
        updateOpsOrder(newOrder);
        toast.showSuccess(saveForLater ? "Saved for later (local)." : "Moved to cart (local).");
        return newOrder;
      }

      if (typeof Utils.toggleSaveForLater === "function") {
        try {
          await Utils.toggleSaveForLater({ orderId, itemId, saveForLater: !!saveForLater });
          if (typeof Utils.getDraftOrder === "function") {
            const res = await Utils.getDraftOrder({ userId });
            const order = res?.order ?? res ?? {};
            if (mountedRef.current) dispatch({ type: ACTIONS.CONFIRM_UPDATE, payload: { order } });
            toast.showSuccess(saveForLater ? "Moved to Saved for Later." : "Moved to cart.");
            return order;
          }
          dispatch({ type: ACTIONS.CONFIRM_UPDATE, payload: { order: newOrder } });
          toast.showSuccess(saveForLater ? "Moved to Saved for Later." : "Moved to cart.");
          return newOrder;
        } catch (err) {
          if (mountedRef.current) dispatch({ type: ACTIONS.ROLLBACK_UPDATE, payload: { previousItems: prevItems, error: err.message } });
          toast.showError("Could not move item. Try again.");
          throw err;
        }
      }

      toast.showSuccess(saveForLater ? "Saved for later (local)." : "Moved to cart (local).");
      return newOrder;
    },
    [state.items, state.order, state.orderId, findItem, toast, isBatchMode, updateOpsOrder, userId]
  );

  const removeItem = useCallback(
    async ({ orderId = state.orderId, itemId }) => {
      const prevItems = state.items.slice();
      const exists = findItem(itemId);
      if (!exists) throw new Error("Item not found in cart");

      const optimisticItems = state.items.filter((it) => it.itemId !== itemId);
      const newOrder = { ...state.order, items: optimisticItems };
      dispatch({ type: ACTIONS.CONFIRM_UPDATE, payload: { order: newOrder } });

      if (isBatchMode) {
        updateOpsOrder(newOrder);
        toast.showSuccess("Item removed (local).");
        return newOrder;
      }

      if (typeof Utils.removeItemFromDraft === "function") {
        try {
          await Utils.removeItemFromDraft({ orderId, itemId });
          if (typeof Utils.getDraftOrder === "function") {
            const res = await Utils.getDraftOrder({ userId });
            const order = res?.order ?? res ?? {};
            if (mountedRef.current) dispatch({ type: ACTIONS.CONFIRM_UPDATE, payload: { order } });
            toast.showSuccess("Item removed.");
            return order;
          }
          toast.showSuccess("Item removed.");
          return newOrder;
        } catch (err) {
          if (mountedRef.current) dispatch({ type: ACTIONS.ROLLBACK_UPDATE, payload: { previousItems: prevItems, error: err.message } });
          toast.showError("Could not remove item.");
          throw err;
        }
      }

      toast.showSuccess("Item removed (local).");
      return newOrder;
    },
    [state.items, state.order, state.orderId, findItem, toast, isBatchMode, updateOpsOrder, userId]
  );

  const addItem = useCallback(
    async ({ orderId = state.orderId, item }) => {
      if (!item || !item.itemId) throw new Error("addItem requires item with itemId");
      const prevItems = state.items.slice();
      const existing = state.items.find((it) => it.itemId === item.itemId);

      const optimisticItems = existing
        ? state.items.map((it) => (it.itemId === item.itemId ? { ...it, quantity: Number(it.quantity || 0) + Number(item.quantity || 1) } : it))
        : [...state.items, { ...item, quantity: Number(item.quantity || 1), status: "active", saveForLater: false }];

      const newOrder = { ...state.order, items: optimisticItems };
      dispatch({ type: ACTIONS.CONFIRM_UPDATE, payload: { order: newOrder } });

      if (isBatchMode) {
        updateOpsOrder(newOrder);
        toast.showSuccess("Item added (local).");
        return newOrder;
      }

      if (typeof Utils.addItemToDraft === "function" || typeof Utils.updateDraftOrder === "function") {
        try {
          if (typeof Utils.addItemToDraft === "function") {
            await Utils.addItemToDraft({ orderId, item });
          } else {
            await Utils.updateDraftOrder({ orderId, patch: { items: optimisticItems } });
          }
          if (typeof Utils.getDraftOrder === "function") {
            const res = await Utils.getDraftOrder({ userId });
            const order = res?.order ?? res ?? {};
            if (mountedRef.current) dispatch({ type: ACTIONS.CONFIRM_UPDATE, payload: { order } });
            toast.showSuccess("Item added to cart.");
            return order;
          }
          toast.showSuccess("Item added to cart.");
          return newOrder;
        } catch (err) {
          if (mountedRef.current) dispatch({ type: ACTIONS.ROLLBACK_UPDATE, payload: { previousItems: prevItems, error: err.message } });
          toast.showError("Could not add item.");
          throw err;
        }
      }

      toast.showSuccess("Item added (local).");
      return newOrder;
    },
    [state.items, state.order, state.orderId, toast, isBatchMode, updateOpsOrder, userId]
  );

  const submitOrder = useCallback(
    async ({ orderId = state.orderId, paymentPayload = {} } = {}) => {
      if (isBatchMode && pendingPatchRef.current) {
        if (patchTimerRef.current) {
          clearTimeout(patchTimerRef.current);
          patchTimerRef.current = null;
        }
        try {
          await doPatchDraftOrder(pendingPatchRef.current);
          pendingPatchRef.current = null;
        } catch (err) {
          toast.showError("Failed to persist cart before submit.");
          throw err;
        }
      }

      if (typeof Utils.submitOrder === "function") {
        try {
          const res = await Utils.submitOrder({ orderId, paymentPayload });

          // Optional: clear local cart state after successful submit
          if (mountedRef.current) {
            dispatch({
              type: ACTIONS.CONFIRM_UPDATE,
              payload: {
                order: { ...state.order, status: "submitted", items: [] },
              },
            });
          }

          return res;
        } catch (err) {
          throw err;
        }
      }

      return { success: true, local: true };
    },
    [isBatchMode, doPatchDraftOrder, state.order, state.orderId]
  );

  const refreshPricing = useCallback(
    async ({ orderId = state.orderId } = {}) => {
      if (typeof Utils.refreshPricing === "function") {
        try {
          await Utils.refreshPricing({ orderId });
          if (typeof Utils.getDraftOrder === "function") {
            const res = await Utils.getDraftOrder({ userId });
            const order = res?.order ?? res ?? {};
            if (mountedRef.current) dispatch({ type: ACTIONS.CONFIRM_UPDATE, payload: { order } });
            toast.showSuccess("Pricing refreshed.");
            return order;
          }
        } catch (err) {
          toast.showError("Could not refresh pricing.");
          throw err;
        }
      }
      toast.showInfo("Pricing refresh not available (local).");
      return state.order;
    },
    [state.order, userId, toast]
  );

  /* -------------------------
     Expose API
  ------------------------- */

  const setPersistence = useCallback((mode = "batch") => {
    setPersistenceStrategy(mode === "atomic" ? "atomic" : "batch");
  }, []);

  return {
    // state
    loading: state.loading,
    error: state.error,
    order: state.order,
    orderId: state.orderId,
    items: state.items,
    lastUpdatedAt: state.lastUpdatedAt,

    // actions
    loadDraft,
    refresh,
    updateItemQty,
    toggleSaveForLater,
    removeItem,
    addItem,
    submitOrder,
    refreshPricing,

    // meta & controls
    persistenceStrategy,
    setPersistence,
    isBatchMode,
  };
}

export default useCart;
