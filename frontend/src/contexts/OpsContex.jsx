// src/contexts/OpsContext.jsx
/**
 * OpsContext.jsx
 *
 * - Centralized client for ops-context endpoints:
 *   - GET/POST /products
 *   - GET/POST /orders/enriched
 *   - POST /products/evict
 *   - POST /orders/evict-user
 *   - POST /orders/evict-region
 *
 * - Exposes:
 *   - useOpsContext() hook
 *   - OpsContextProvider component
 *
 * - Stateful features:
 *   - stores canonical `products` and `orders` state + meta
 *   - exposes fetch + set wrappers: fetchAndSetUiProducts, refreshUiProducts,
 *     fetchAndSetEnrichedOrders, refreshEnrichedOrders
 *   - supports append (infinite scroll) for products
 *   - exposes applyRealtimeUpdate(payload) to merge websocket updates
 *
 * - Auth:
 *   - accepts `getAuthToken` (preferred) to read current token synchronously
 *   - if omitted, falls back to reading persisted session from localStorage
 *
 * Usage:
 *   const {
 *     products, productsMeta, loadingProducts,
 *     orders, ordersMeta, loadingOrders,
 *     fetchAndSetUiProducts, refreshUiProducts,
 *     fetchAndSetEnrichedOrders, refreshEnrichedOrders,
 *     appendUiProducts, applyRealtimeUpdate,
 *     evictProductsRegion, evictOrdersUser, evictOrdersRegion
 *   } = useOpsContext();
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

const DEFAULT_API_BASE = 'http://localhost:5000/api/opcs';
const DEFAULT_ENDPOINTS = {
  getUiProducts: '/products',
  getEnrichedOrders: '/orders/enriched',
  evictProductsRegion: '/products/evict',
  evictOrdersUser: '/orders/evict-user',
  evictOrdersRegion: '/orders/evict-region'
};

function safeParseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) q.append(k, JSON.stringify(v));
    else q.append(k, String(v));
  });
  const qs = q.toString();
  return qs ? `?${qs}` : '';
}

/* -------------------------
   Context
   ------------------------- */

const OpsContext = createContext(null);

export function useOpsContext() {
  const ctx = useContext(OpsContext);
  if (!ctx) throw new Error('useOpsContext must be used within an OpsContextProvider');
  return ctx;
}

/* -------------------------
   Provider
   ------------------------- */

export function OpsContextProvider({
  children,
  apiBase = DEFAULT_API_BASE,
  endpoints = DEFAULT_ENDPOINTS,
  getAuthToken = null,
  authStorageKey = 'app_auth_session_v1'
}) {
  /* Loading / error */
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState(null);

  /* Canonical state */
  const [products, setProducts] = useState(null); // expected server shape (e.g., { products: [], meta: {} } )
  const [productsMeta, setProductsMeta] = useState({ region: null, page: 1, limit: 25, fetchedAt: null });

  const [orders, setOrders] = useState(null); // expected server shape (paginated)
  const [ordersMeta, setOrdersMeta] = useState({ userId: null, region: null, page: 1, limit: 25, fetchedAt: null });

  /* In-memory caches */
  const productsCacheRef = useRef(new Map());
  const ordersCacheRef = useRef(new Map());

  /* Abort controllers */
  const abortControllersRef = useRef(new Set());
  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach((c) => {
        try { c.abort(); } catch {}
      });
      abortControllersRef.current.clear();
    };
  }, []);

  /* Resolve token synchronously */
  const resolveToken = useCallback(() => {
    try {
      if (typeof getAuthToken === 'function') return getAuthToken() || null;
      if (typeof window === 'undefined') return null;
      const raw = localStorage.getItem(authStorageKey);
      const parsed = raw ? safeParseJSON(raw) : null;
      return parsed && parsed.accessToken ? parsed.accessToken : null;
    } catch {
      return null;
    }
  }, [getAuthToken, authStorageKey]);

  /* Internal fetch helper */
  const apiFetch = useCallback(
    async (path, opts = {}) => {
      const url = path.startsWith('http') ? path : `${apiBase}${path}`;
      const controller = new AbortController();
      abortControllersRef.current.add(controller);

      const token = resolveToken();
      const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
      if (token) headers.Authorization = `Bearer ${token}`;

      const fetchOpts = {
        method: opts.method || 'GET',
        headers,
        signal: controller.signal,
        credentials: opts.credentials || undefined
      };
      if (opts.body !== undefined) {
        fetchOpts.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
      }

      try {
        const res = await fetch(url, fetchOpts);
        const text = await res.text();
        const json = text ? safeParseJSON(text) : null;
        return { ok: res.ok, status: res.status, raw: json, text };
      } catch (err) {
        if (err && err.name === 'AbortError') return { ok: false, status: 0, error: 'aborted' };
        return { ok: false, status: 0, error: err?.message || 'Network error' };
      } finally {
        abortControllersRef.current.delete(controller);
      }
    },
    [apiBase, resolveToken]
  );

  /* Cache key helpers */
  const productsKey = useCallback(({ region, page = 1, limit = 25 }) => {
    return `r:${String(region || '__null__')}|p:${page}|l:${limit}`;
  }, []);

  const ordersKey = useCallback(
    ({ userId, region = '__null__', page = 1, limit = 25, status, includeSaveForLater = false, persist = false }) => {
      const s = Array.isArray(status) ? status.join(',') : (status === undefined ? '__all__' : String(status));
      return `u:${String(userId)}|r:${String(region)}|p:${page}|l:${limit}|s:${s}|isl:${includeSaveForLater ? 1 : 0}|pr:${persist ? 1 : 0}`;
    },
    []
  );

  /* -------------------------
     Low-level fetchers (do not mutate provider state)
     ------------------------- */
  const _fetchUiProducts = useCallback(
    async (opts = {}) => {
      if (!opts || !opts.region || typeof opts.region !== 'string') {
        throw new Error('region is required and must be a string');
      }
      const method = (opts.method || 'GET').toUpperCase();
      const page = Number.isFinite(Number(opts.page)) ? Number(opts.page) : 1;
      const limit = Number.isFinite(Number(opts.limit)) ? Number(opts.limit) : 25;
      const key = productsKey({ region: opts.region, page, limit });

      // cached
      const cached = productsCacheRef.current.get(key);
      if (cached && !opts.force) return cached;

      if (method === 'GET') {
        const qs = buildQuery({ region: opts.region, page, limit });
        const res = await apiFetch(`${endpoints.getUiProducts}${qs}`, { method: 'GET', signal: opts.signal });
        if (!res.ok) {
          const msg = (res.raw && (res.raw.error || res.raw.message)) || `HTTP ${res.status}`;
          throw Object.assign(new Error(msg), { status: res.status, payload: res.raw });
        }
        const payload = res.raw ?? res.text ?? {};
        productsCacheRef.current.set(key, payload);
        return payload;
      }

      // POST
      const res = await apiFetch(endpoints.getUiProducts, {
        method: 'POST',
        body: { region: opts.region, page, limit },
        signal: opts.signal
      });
      if (!res.ok) {
        const msg = (res.raw && (res.raw.error || res.raw.message)) || `HTTP ${res.status}`;
        throw Object.assign(new Error(msg), { status: res.status, payload: res.raw });
      }
      const payload = res.raw ?? res.text ?? {};
      productsCacheRef.current.set(key, payload);
      return payload;
    },
    [apiFetch, endpoints.getUiProducts, productsKey]
  );

  const _fetchEnrichedOrders = useCallback(
    async (opts = {}) => {
      if (!opts || !opts.userId) throw new Error('userId is required');
      const method = (opts.method || 'GET').toUpperCase();
      const page = Number.isFinite(Number(opts.page)) ? Number(opts.page) : 1;
      const limit = Number.isFinite(Number(opts.limit)) ? Number(opts.limit) : 25;
      const status = opts.status;
      const includeSaveForLater = !!opts.includeSaveForLater;
      const persist = !!opts.persist;
      const key = ordersKey({
        userId: opts.userId,
        region: opts.region,
        page,
        limit,
        status,
        includeSaveForLater,
        persist
      });

      const cached = ordersCacheRef.current.get(key);
      if (cached && !opts.force) return cached;

      if (method === 'GET') {
        const qs = buildQuery({
          userId: opts.userId,
          region: opts.region,
          page,
          limit,
          status,
          includeSaveForLater,
          persist
        });
        const res = await apiFetch(`${endpoints.getEnrichedOrders}${qs}`, { method: 'GET', signal: opts.signal });
        if (!res.ok) {
          const msg = (res.raw && (res.raw.error || res.raw.message)) || `HTTP ${res.status}`;
          throw Object.assign(new Error(msg), { status: res.status, payload: res.raw });
        }
        const payload = res.raw ?? res.text ?? {};
        ordersCacheRef.current.set(key, payload);
        return payload;
      }

      // POST
      const res = await apiFetch(endpoints.getEnrichedOrders, {
        method: 'POST',
        body: {
          userId: opts.userId,
          region: opts.region,
          page,
          limit,
          status,
          includeSaveForLater,
          persist
        },
        signal: opts.signal
      });
      if (!res.ok) {
        const msg = (res.raw && (res.raw.error || res.raw.message)) || `HTTP ${res.status}`;
        throw Object.assign(new Error(msg), { status: res.status, payload: res.raw });
      }
      const payload = res.raw ?? res.text ?? {};
      ordersCacheRef.current.set(key, payload);
      return payload;
    },
    [apiFetch, endpoints.getEnrichedOrders, ordersKey]
  );

  /* -------------------------
     Stateful wrappers (update provider state)
     ------------------------- */

  const fetchAndSetUiProducts = useCallback(
    async (opts = {}) => {
      setLoadingProducts(true);
      setError(null);
      try {
        const payload = await _fetchUiProducts(opts);
        setProducts(payload);
        setProductsMeta({
          region: opts.region,
          page: opts.page ?? 1,
          limit: opts.limit ?? 25,
          fetchedAt: Date.now()
        });
        return payload;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setLoadingProducts(false);
      }
    },
    [_fetchUiProducts]
  );

  const refreshUiProducts = useCallback(
    async (opts = {}) => {
      // force bypass cache for this key
      const key = productsKey({ region: opts.region, page: opts.page ?? 1, limit: opts.limit ?? 25 });
      productsCacheRef.current.delete(key);
      return fetchAndSetUiProducts(Object.assign({}, opts, { force: true }));
    },
    [fetchAndSetUiProducts, productsKey]
  );

  const appendUiProducts = useCallback(
    async (opts = {}) => {
      // fetch page and append to existing products.products array if present
      setLoadingProducts(true);
      setError(null);
      try {
        const payload = await _fetchUiProducts(opts);
        // merge into existing products state
        setProducts((prev) => {
          const existingItems = (prev && (prev.products || prev.items)) || [];
          const newItems = (payload && (payload.products || payload.items)) || [];
          const merged = Array.isArray(existingItems) ? [...existingItems, ...newItems] : newItems;
          // preserve server meta if present
          const meta = payload.meta || payload.pagination || {};
          return { ...(prev || {}), products: merged, meta };
        });
        setProductsMeta((prev) => ({
          region: opts.region,
          page: opts.page ?? (prev?.page ?? 1),
          limit: opts.limit ?? (prev?.limit ?? 25),
          fetchedAt: Date.now()
        }));
        return payload;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setLoadingProducts(false);
      }
    },
    [_fetchUiProducts]
  );

  const fetchAndSetEnrichedOrders = useCallback(
    async (opts = {}) => {
      // requireAuth: default false (allow callers to decide). If caller sets requireAuth true and no token, throw.
      const requireAuth = opts.requireAuth === undefined ? false : Boolean(opts.requireAuth);
      if (requireAuth && !resolveToken()) throw new Error('Authentication required to fetch orders');

      setLoadingOrders(true);
      setError(null);
      try {
        const payload = await _fetchEnrichedOrders(opts);
        setOrders(payload);
        setOrdersMeta({
          userId: opts.userId,
          region: opts.region ?? null,
          page: opts.page ?? 1,
          limit: opts.limit ?? 25,
          fetchedAt: Date.now()
        });
        return payload;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setLoadingOrders(false);
      }
    },
    [_fetchEnrichedOrders, resolveToken]
  );

  const refreshEnrichedOrders = useCallback(
    async (opts = {}) => {
      // force bypass cache for this key
      const key = ordersKey({
        userId: opts.userId,
        region: opts.region,
        page: opts.page ?? 1,
        limit: opts.limit ?? 25,
        status: opts.status,
        includeSaveForLater: opts.includeSaveForLater,
        persist: opts.persist
      });
      ordersCacheRef.current.delete(key);
      return fetchAndSetEnrichedOrders(Object.assign({}, opts, { force: true }));
    },
    [fetchAndSetEnrichedOrders, ordersKey]
  );

  /* -------------------------
     Realtime / websocket helper
     - applyRealtimeUpdate(payload): merge server-sent updates into state
     - payload shape is application-specific; provider will attempt safe merges
     ------------------------- */
  const applyRealtimeUpdate = useCallback((payload = {}) => {
    if (!payload) return;

    // products update
    if (payload.products || payload.product) {
      setProducts((prev) => {
        const prevItems = (prev && (prev.products || prev.items)) || [];
        const incoming = payload.products || (payload.product ? [payload.product] : []);
        // merge by id (productId or _id)
        const map = new Map(prevItems.map((p) => [p.productId || p._id, p]));
        incoming.forEach((p) => {
          const id = p.productId || p._id;
          if (!id) return;
          const existing = map.get(id) || {};
          map.set(id, { ...existing, ...p });
        });
        const merged = Array.from(map.values());
        return { ...(prev || {}), products: merged, meta: prev?.meta ?? {} };
      });
    }

    // orders update
    if (payload.orders || payload.order) {
      setOrders((prev) => {
        const prevItems = (prev && (prev.items || prev.orders)) || [];
        const incoming = payload.orders || (payload.order ? [payload.order] : []);
        const map = new Map(prevItems.map((o) => [o._id || o.id, o]));
        incoming.forEach((o) => {
          const id = o._id || o.id;
          if (!id) return;
          const existing = map.get(id) || {};
          map.set(id, { ...existing, ...o });
        });
        const merged = Array.from(map.values());
        return { ...(prev || {}), items: merged, meta: prev?.meta ?? {} };
      });
    }
  }, []);

  /* -------------------------
     Eviction helpers (call server and clear local cache/state)
     ------------------------- */
  const evictProductsRegion = useCallback(
    async (region) => {
      if (!region || typeof region !== 'string') throw new Error('region is required and must be a string');
      setError(null);
      setLoadingProducts(true);
      try {
        await apiFetch(endpoints.evictProductsRegion, { method: 'POST', body: { region } });
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        const prefix = `r:${String(region)}|`;
        for (const key of Array.from(productsCacheRef.current.keys())) {
          if (key.startsWith(prefix)) productsCacheRef.current.delete(key);
        }
        // clear in-memory state if it matches region
        setProducts((prev) => {
          if (!prev) return prev;
          if (productsMeta.region === region) return null;
          return prev;
        });
        setLoadingProducts(false);
      }
    },
    [apiFetch, endpoints.evictProductsRegion, productsMeta.region]
  );

  const evictOrdersUser = useCallback(
    async (userId) => {
      if (!userId) throw new Error('userId is required');
      setError(null);
      setLoadingOrders(true);
      try {
        await apiFetch(endpoints.evictOrdersUser, { method: 'POST', body: { userId } });
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        const prefix = `u:${String(userId)}|`;
        for (const key of Array.from(ordersCacheRef.current.keys())) {
          if (key.startsWith(prefix)) ordersCacheRef.current.delete(key);
        }
        setOrders((prev) => {
          if (!prev) return prev;
          if (ordersMeta.userId === userId) return null;
          return prev;
        });
        setLoadingOrders(false);
      }
    },
    [apiFetch, endpoints.evictOrdersUser, ordersMeta.userId]
  );

  const evictOrdersRegion = useCallback(
    async (region) => {
      if (!region || typeof region !== 'string') throw new Error('region is required and must be a string');
      setError(null);
      setLoadingOrders(true);
      try {
        await apiFetch(endpoints.evictOrdersRegion, { method: 'POST', body: { region } });
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        for (const key of Array.from(ordersCacheRef.current.keys())) {
          if (key.includes(`|r:${String(region)}|`)) ordersCacheRef.current.delete(key);
        }
        setOrders((prev) => {
          if (!prev) return prev;
          if (ordersMeta.region === region) return null;
          return prev;
        });
        setLoadingOrders(false);
      }
    },
    [apiFetch, endpoints.evictOrdersRegion, ordersMeta.region]
  );

  const clearCache = useCallback(() => {
    productsCacheRef.current.clear();
    ordersCacheRef.current.clear();
  }, []);

  const clearState = useCallback(() => {
    setProducts(null);
    setProductsMeta({ region: null, page: 1, limit: 25, fetchedAt: null });
    setOrders(null);
    setOrdersMeta({ userId: null, region: null, page: 1, limit: 25, fetchedAt: null });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  /* -------------------------
     Expose API
     ------------------------- */
  const value = useMemo(
    () => ({
      /* state */
      loadingProducts,
      loadingOrders,
      error,
      products,
      productsMeta,
      orders,
      ordersMeta,
      /* fetch + state setters */
      fetchAndSetUiProducts,
      refreshUiProducts,
      appendUiProducts,
      fetchAndSetEnrichedOrders,
      refreshEnrichedOrders,
      /* realtime helper */
      applyRealtimeUpdate,
      /* eviction + cache */
      evictProductsRegion,
      evictOrdersUser,
      evictOrdersRegion,
      clearCache,
      clearState,
      clearError,
      /* low-level (optional) */
      _productsCache: productsCacheRef.current,
      _ordersCache: ordersCacheRef.current,
      _apiFetch: apiFetch
    }),
    [
      loadingProducts,
      loadingOrders,
      error,
      products,
      productsMeta,
      orders,
      ordersMeta,
      fetchAndSetUiProducts,
      refreshUiProducts,
      appendUiProducts,
      fetchAndSetEnrichedOrders,
      refreshEnrichedOrders,
      applyRealtimeUpdate,
      evictProductsRegion,
      evictOrdersUser,
      evictOrdersRegion,
      clearCache,
      clearState,
      clearError,
      apiFetch
    ]
  );

  return <OpsContext.Provider value={value}>{children}</OpsContext.Provider>;
}


/**
 * OpsContext API Reference (paste at bottom of OpsContext.jsx)
 *
 * This file-level docstring documents the public surface and internal helpers
 * exposed by the OpsContext provider. Paste this block at the bottom of the
 * provider file so future maintainers and consumers can quickly understand
 * behavior, parameters, return shapes, auth expectations, caching semantics,
 * and side effects.
 *
 * ---------------------------------------------------------------------------
 * Overview
 * ---------------------------------------------------------------------------
 * The OpsContext provider centralizes client logic for the ops-context service:
 *   - Products endpoints: GET/POST /products, POST /products/evict
 *   - Orders endpoints:   GET/POST /orders/enriched, POST /orders/evict-user,
 *                         POST /orders/evict-region
 *
 * The provider exposes:
 *   - state: products, productsMeta, orders, ordersMeta, loadingProducts,
 *            loadingOrders, error
 *   - high-level actions: fetchAndSetUiProducts, refreshUiProducts, appendUiProducts,
 *                         fetchAndSetEnrichedOrders, refreshEnrichedOrders
 *   - realtime helper: applyRealtimeUpdate
 *   - eviction helpers: evictProductsRegion, evictOrdersUser, evictOrdersRegion
 *   - utility: clearCache, clearState, clearError
 *
 * The provider accepts:
 *   - apiBase: base URL for ops endpoints (default '/api/opcs' in this codebase)
 *   - endpoints: object mapping logical names to relative paths
 *   - getAuthToken: optional synchronous function returning current access token
 *                   (preferred when provider is mounted under AuthProvider)
 *   - authStorageKey: fallback localStorage key used to read persisted session
 *
 * Design goals:
 *   - Single source of truth for products and orders state
 *   - Public product endpoints work without auth; order endpoints typically require auth
 *   - Lightweight in-memory caching to avoid redundant network calls
 *   - Abortable requests to avoid race conditions
 *   - Simple hooks for realtime updates (applyRealtimeUpdate) to integrate websockets
 *
 * ---------------------------------------------------------------------------
 * Low-level helper
 * ---------------------------------------------------------------------------
 * apiFetch(path, opts)
 *   Purpose:
 *     Low-level HTTP helper used by all provider methods.
 *   Parameters:
 *     - path (string): relative or absolute URL to call.
 *     - opts (object): optional { method, headers, body, signal, credentials }.
 *   Behavior:
 *     - Creates an AbortController and attaches its signal to the request.
 *     - Resolves token synchronously via getAuthToken() or localStorage fallback
 *       and sets Authorization header when token is present.
 *     - Sends JSON body when opts.body is provided (stringified if not a string).
 *     - Attempts to parse response text as JSON and returns both parsed and raw text.
 *   Returns:
 *     Promise resolving to { ok: boolean, status: number, raw: any|null, text: string }.
 *   Errors:
 *     - On network error returns { ok: false, status: 0, error: message }.
 *     - Does not throw; callers may throw based on res.ok.
 *   Side effects:
 *     - Registers and cleans up AbortController in provider's controller set.
 *
 * ---------------------------------------------------------------------------
 * Low-level fetchers (do not mutate provider state)
 * ---------------------------------------------------------------------------
 * _fetchUiProducts(opts)
 *   Purpose:
 *     Fetch UI-friendly products payload from server and cache result in-memory.
 *   Parameters:
 *     - opts: { region (required, string), page, limit, method = 'GET'|'POST',
 *               signal, force (boolean) }
 *   Behavior:
 *     - Validates region.
 *     - Builds cache key from region|page|limit.
 *     - If cached and force !== true, returns cached payload.
 *     - Calls GET or POST products endpoint via apiFetch.
 *     - On success stores payload in productsCacheRef keyed by params.
 *   Returns:
 *     Promise resolving to server payload (parsed JSON or raw text).
 *   Errors:
 *     - Throws Error with message and attaches { status, payload } when res.ok === false.
 *   Auth:
 *     - Public endpoint; token optional. If token present it will be sent.
 *
 * _fetchEnrichedOrders(opts)
 *   Purpose:
 *     Fetch enriched orders payload from server and cache result in-memory.
 *   Parameters:
 *     - opts: { userId (required), region, page, limit, status, includeSaveForLater,
 *               persist, method = 'GET'|'POST', signal, force (boolean) }
 *   Behavior:
 *     - Validates userId.
 *     - Builds composite cache key from all relevant params.
 *     - If cached and force !== true, returns cached payload.
 *     - Calls GET or POST orders/enriched endpoint via apiFetch.
 *     - On success stores payload in ordersCacheRef keyed by params.
 *   Returns:
 *     Promise resolving to server payload (parsed JSON or raw text).
 *   Errors:
 *     - Throws Error with message and attaches { status, payload } when res.ok === false.
 *   Auth:
 *     - Typically requires auth; provider will include token when available.
 *
 * ---------------------------------------------------------------------------
 * Stateful wrappers (update provider state)
 * ---------------------------------------------------------------------------
 * fetchAndSetUiProducts(opts)
 *   Purpose:
 *     High-level method to fetch products and update provider state so UI re-renders.
 *   Parameters:
 *     - opts: { region (required), page, limit, method, signal, force }
 *   Behavior:
 *     - Sets loadingProducts true, clears error.
 *     - Calls _fetchUiProducts(opts).
 *     - On success sets products state and productsMeta (region, page, limit, fetchedAt).
 *     - On error sets error state and rethrows.
 *   Returns:
 *     Promise resolving to fetched payload.
 *   Auth:
 *     - Works without auth for public product routes.
 *   Cache:
 *     - Uses in-memory cache unless force === true.
 *
 * refreshUiProducts(opts)
 *   Purpose:
 *     Force a fresh fetch for products (bypass cache) and update provider state.
 *   Parameters:
 *     - opts: same as fetchAndSetUiProducts.
 *   Behavior:
 *     - Deletes the cache entry for the given key then calls fetchAndSetUiProducts with force.
 *   Returns:
 *     Promise resolving to fresh payload.
 *
 * appendUiProducts(opts)
 *   Purpose:
 *     Fetch a page of products and append results to existing products state (infinite scroll).
 *   Parameters:
 *     - opts: { region (required), page (required), limit, method, signal }
 *   Behavior:
 *     - Calls _fetchUiProducts(opts).
 *     - Merges returned items into products.products (or products.items) preserving server meta.
 *     - Updates productsMeta.fetchedAt and page/limit.
 *   Returns:
 *     Promise resolving to fetched page payload.
 *
 * fetchAndSetEnrichedOrders(opts)
 *   Purpose:
 *     Fetch enriched orders and update provider state so UI re-renders.
 *   Parameters:
 *     - opts: { userId (required), region, page, limit, status, includeSaveForLater,
 *               persist, method, signal, requireAuth (optional boolean) }
 *   Behavior:
 *     - If requireAuth === true and no token is available, throws immediately.
 *     - Sets loadingOrders true, clears error.
 *     - Calls _fetchEnrichedOrders(opts).
 *     - On success sets orders state and ordersMeta (userId, region, page, limit, fetchedAt).
 *     - On error sets error state and rethrows.
 *   Returns:
 *     Promise resolving to fetched payload.
 *   Auth:
 *     - Caller should guard with requireAuth or check useAuth() before calling.
 *
 * refreshEnrichedOrders(opts)
 *   Purpose:
 *     Force a fresh fetch for enriched orders (bypass cache) and update provider state.
 *   Parameters:
 *     - opts: same as fetchAndSetEnrichedOrders.
 *   Behavior:
 *     - Deletes the composite cache key then calls fetchAndSetEnrichedOrders with force.
 *   Returns:
 *     Promise resolving to fresh payload.
 *
 * ---------------------------------------------------------------------------
 * Realtime helper
 * ---------------------------------------------------------------------------
 * applyRealtimeUpdate(payload)
 *   Purpose:
 *     Merge server-sent realtime updates (WebSocket/SSE) into provider state without refetching.
 *   Parameters:
 *     - payload (object): application-specific update shape. Common shapes:
 *         { product } | { products: [...] } | { order } | { orders: [...] }
 *   Behavior:
 *     - For product updates: merges incoming product(s) into products.products by id
 *       (productId or _id), preserving existing fields and server meta.
 *     - For order updates: merges incoming order(s) into orders.items (or orders)
 *       by id (_id or id), preserving existing fields and server meta.
 *     - Designed to be idempotent and tolerant of partial payloads.
 *   Returns:
 *     void
 *   Notes:
 *     - Does not call server. Use refresh* methods when authoritative refresh is required.
 *
 * ---------------------------------------------------------------------------
 * Eviction helpers
 * ---------------------------------------------------------------------------
 * evictProductsRegion(region)
 *   Purpose:
 *     Request server-side eviction for a region and clear local cache/state for that region.
 *   Parameters:
 *     - region (string, required)
 *   Behavior:
 *     - Calls POST /products/evict with { region }.
 *     - Deletes matching keys from productsCacheRef.
 *     - If current productsMeta.region === region clears provider products state.
 *   Returns:
 *     Promise<void>
 *   Auth:
 *     - Server enforces admin role; provider includes token when available.
 *
 * evictOrdersUser(userId)
 *   Purpose:
 *     Request server-side eviction for a user's enriched orders and clear local cache/state.
 *   Parameters:
 *     - userId (string, required)
 *   Behavior:
 *     - Calls POST /orders/evict-user with { userId }.
 *     - Deletes matching keys from ordersCacheRef.
 *     - If current ordersMeta.userId === userId clears provider orders state.
 *   Returns:
 *     Promise<void>
 *   Auth:
 *     - Server enforces admin role; provider includes token when available.
 *
 * evictOrdersRegion(region)
 *   Purpose:
 *     Request server-side eviction for orders in a region and clear local cache/state.
 *   Parameters:
 *     - region (string, required)
 *   Behavior:
 *     - Calls POST /orders/evict-region with { region }.
 *     - Deletes matching keys from ordersCacheRef that include the region token.
 *     - If current ordersMeta.region === region clears provider orders state.
 *   Returns:
 *     Promise<void>
 *   Auth:
 *     - Server enforces admin role; provider includes token when available.
 *
 * ---------------------------------------------------------------------------
 * Utilities
 * ---------------------------------------------------------------------------
 * clearCache()
 *   Purpose:
 *     Clear in-memory caches (productsCacheRef and ordersCacheRef).
 *   Behavior:
 *     - Empties both caches. Does not change provider state.
 *
 * clearState()
 *   Purpose:
 *     Reset provider state to initial empty values.
 *   Behavior:
 *     - Sets products and orders state to null and resets meta objects.
 *
 * clearError()
 *   Purpose:
 *     Clear provider error state.
 *   Behavior:
 *     - Sets error to null.
 *
 * ---------------------------------------------------------------------------
 * Usage patterns and best practices
 * ---------------------------------------------------------------------------
 * - Components should prefer the high-level wrappers (fetchAndSetUiProducts,
 *   fetchAndSetEnrichedOrders, appendUiProducts, refresh*) so state is centralized
 *   and UI re-renders automatically when provider state changes.
 *
 * - Use useEffect in components to trigger initial loads and to react to parameter
 *   changes (region, userId). Example:
 *     useEffect(() => {
 *       const controller = new AbortController();
 *       fetchAndSetUiProducts({ region, page: 1, limit: 24, signal: controller.signal });
 *       return () => controller.abort();
 *     }, [region]);
 *
 * - Guard auth-only calls client-side with useAuth() (UX) and rely on server
 *   middleware (requireAuth/requireRole) for security.
 *
 * - For realtime updates:
 *     - Wire a WebSocket or SSE connection in a top-level component.
 *     - On incoming messages call applyRealtimeUpdate(payload).
 *     - Use refreshUiProducts or refreshEnrichedOrders when a full authoritative
 *       refresh is required (e.g., after a complex mutation).
 *
 * - Caching:
 *     - The provider uses a best-effort in-memory cache keyed by request params.
 *     - Use force or refresh* methods to bypass cache when necessary.
 *     - Caches are cleared by eviction helpers and clearCache().
 *
 * - Error handling:
 *     - Methods set provider-level error state and rethrow errors so callers can
 *       handle them locally if needed.
 *
 * ---------------------------------------------------------------------------
 * Example quick reference
 * ---------------------------------------------------------------------------
 * const { products, productsMeta, fetchAndSetUiProducts, refreshUiProducts } = useOpsContext();
 *
 * // initial load
 * useEffect(() => {
 *   fetchAndSetUiProducts({ region: 'us-east', page: 1, limit: 24 }).catch(console.error);
 * }, [fetchAndSetUiProducts, region]);
 *
 * // infinite scroll
 * await appendUiProducts({ region: 'us-east', page: 2, limit: 24 });
 *
 * // orders (requires auth)
 * await fetchAndSetEnrichedOrders({ userId: user._id, region: 'us-east', requireAuth: true });
 *
 * // realtime
 * socket.on('product:update', (payload) => applyRealtimeUpdate(payload));
 *
 * ---------------------------------------------------------------------------
 * Notes for maintainers
 * ---------------------------------------------------------------------------
 * - Keep server-side auth enforcement (requireAuth/requireRole) in place; client
 *   checks are only UX guards.
 * - If you change the persisted auth storage key in AuthProvider, update
 *   authStorageKey here or pass getAuthToken from AuthProvider to avoid stale reads.
 * - Consider adding separate error/loading flags per endpoint for finer-grained UI.
 * - When adding new endpoints, follow the pattern: low-level fetcher -> stateful
 *   wrapper -> optional append/refresh helpers -> eviction if applicable.
 *
 * End of OpsContext API Reference.
 */
