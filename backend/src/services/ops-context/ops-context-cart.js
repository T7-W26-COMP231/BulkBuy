/*
// on region change, also change the region of the draft order.
// ops contex load the locations drop down on lunch
- on read or write,
    - update sales window collection
    - update draft order
    - real time trigger update UI
        - getSwItem(windowId, productId, itemId)
        - patchSwItem(windowId, productId, itemId)
        - getDraftOrder(userId, orderId =null)
        - patchDraftOrder(userId, orderId =null)
        - ws send the update signal region wide

*/



const DEFAULT_API_BASE = "http://localhost:5000/api/opscs";
export const BASE_API = DEFAULT_API_BASE || process.env.REACT_APP_API_BASE;
const DEFAULT_TIMEOUT_MS = 10_000;

/* -------------------------
   Low-level fetch wrapper
   ------------------------- */

/**
 * apiFetch
 * @param {string} path - API path (must start with /)
 * @param {object} options - { method, body, headers, timeoutMs }
 * @returns {Promise<any>}
 */
export async function apiFetch(path, { method = "GET", body = null, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!path || typeof path !== "string") throw new Error("apiFetch requires a path string");
  const url = `${BASE_API}${path}`;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const signal = controller ? controller.signal : undefined;

  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    signal,
  };

  if (body != null) {
    try {
      opts.body = JSON.stringify(body);
    } catch (err) {
      throw new Error("Failed to serialize request body");
    }
  }

  let timeout;
  if (controller) {
    timeout = setTimeout(() => controller.abort(), timeoutMs);
  }

  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    if (err.name === "AbortError") {
      const e = new Error("Request timed out");
      e.code = "ETIMEDOUT";
      throw e;
    }
    throw err;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    let bodyText = null;
    try {
      bodyText = isJson ? await res.json() : await res.text();
    } catch (parseErr) {
      bodyText = await res.text().catch(() => null);
    }
    const err = new Error(`API error ${res.status}: ${res.statusText}`);
    err.status = res.status;
    err.body = bodyText;
    throw err;
  }

  if (isJson) {
    try {
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  return null;
}

/* -------------------------
   Public API functions
   ------------------------- */

/**
 * getDraftOrder
 * Fetch the user's draft order (cart).
 * @param {{userId: string}} params
 * @returns {Promise<any>}
 */
export async function getDraftOrder({ userId }) {
  if (!userId) throw new Error("getDraftOrder requires userId");
  return apiFetch(`/orders/draft?userId=${encodeURIComponent(userId)}`, { method: "GET" });
}

/**
 * updateDraftOrder
 * Patch the draft order with a patch object
 * @param {{orderId: string, patch: object}} params
 * @returns {Promise<any>}
 */
export async function updateDraftOrder({ orderId, patch }) {
  if (!orderId) throw new Error("updateDraftOrder requires orderId");
  return apiFetch(`/orders/${encodeURIComponent(orderId)}/draft`, {
    method: "PATCH",
    body: patch,
  });
}

/**
 * addItemToDraft
 * Add an item to the draft order
 * @param {{orderId: string, item: object}} params
 * @returns {Promise<any>}
 */
export async function addItemToDraft({ orderId, item }) {
  if (!orderId || !item) throw new Error("addItemToDraft requires orderId and item");
  return apiFetch(`/orders/${encodeURIComponent(orderId)}/items`, {
    method: "POST",
    body: item,
  });
}

/**
 * removeItemFromDraft
 * Remove an item from the draft order
 * @param {{orderId: string, itemId: string}} params
 * @returns {Promise<any>}
 */
export async function removeItemFromDraft({ orderId, itemId }) {
  if (!orderId || !itemId) throw new Error("removeItemFromDraft requires orderId and itemId");
  return apiFetch(`/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}

/**
 * toggleSaveForLater
 * Toggle saveForLater flag for an item
 * @param {{orderId: string, itemId: string, saveForLater: boolean}} params
 * @returns {Promise<any>}
 */
export async function toggleSaveForLater({ orderId, itemId, saveForLater }) {
  if (!orderId || !itemId) throw new Error("toggleSaveForLater requires orderId and itemId");
  return apiFetch(`/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: { saveForLater: !!saveForLater },
  });
}

/**
 * submitOrder
 * Submit the draft order (checkout)
 * @param {{orderId: string, paymentPayload?: object}} params
 * @returns {Promise<any>}
 */
export async function submitOrder({ orderId, paymentPayload = {} }) {
  if (!orderId) throw new Error("submitOrder requires orderId");
  return apiFetch(`/orders/${encodeURIComponent(orderId)}/submit`, {
    method: "POST",
    body: paymentPayload,
  });
}

/**
 * refreshPricing
 * Refresh pricing snapshots for items in the order
 * @param {{orderId: string}} params
 * @returns {Promise<any>}
 */
export async function refreshPricing({ orderId }) {
  if (!orderId) throw new Error("refreshPricing requires orderId");
  return apiFetch(`/orders/${encodeURIComponent(orderId)}/pricing/refresh`, {
    method: "POST",
  });
}

/* -------------------------
   Pure helpers
   ------------------------- */

/**
 * formatCurrency
 * @param {number} value
 * @param {string} currency
 * @param {string} locale
 * @returns {string}
 */
export function formatCurrency(value = 0, currency = "CAD", locale = "en-CA") {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch (err) {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

/**
 * calcLineTotal
 * @param {{pricingSnapshot?: {atInstantPrice: number}, quantity?: number}} item
 * @returns {number}
 */
export function calcLineTotal(item) {
  const price = Number(item?.pricingSnapshot?.atInstantPrice ?? 0);
  const qty = Number(item?.quantity ?? 0);
  return Number((price * qty).toFixed(2));
}

/**
 * groupItemsByStatus
 * @param {Array} items
 * @returns {{active: Array, savedForLater: Array}}
 */
export function groupItemsByStatus(items = []) {
  const active = [];
  const savedForLater = [];
  for (const it of items) {
    if (it?.saveForLater || it?.status === "savedForLater") savedForLater.push(it);
    else active.push(it);
  }
  return { active, savedForLater };
}

/**
 * safeParseOrder
 * Normalize server order shape into expected cart shape
 * @param {object} raw
 * @returns {object}
 */
export function safeParseOrder(raw = {}) {
  const order = { ...raw };
  order.items = Array.isArray(raw.items) ? raw.items.map((it) => ({ ...it, quantity: Number(it.quantity ?? 0) })) : [];
  return order;
}

/* -------------------------
   Retry helper
   ------------------------- */

/**
 * retryable
 * @param {Function} fn - async function to run
 * @param {{retries?: number, delayMs?: number}} opts
 * @returns {Promise<any>}
 */
export async function retryable(fn, { retries = 2, delayMs = 300 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i)));
      }
    }
  }
  throw lastErr;
}

/* -------------------------
   Default export
   ------------------------- */
const ShoppingCartUtils = {
  apiFetch,
  getDraftOrder,
  updateDraftOrder,
  addItemToDraft,
  removeItemFromDraft,
  toggleSaveForLater,
  submitOrder,
  refreshPricing,
  formatCurrency,
  calcLineTotal,
  groupItemsByStatus,
  safeParseOrder,
  retryable,
};

export default ShoppingCartUtils;
