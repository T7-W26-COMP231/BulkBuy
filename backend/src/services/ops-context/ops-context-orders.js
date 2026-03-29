// src/services/ops-context/ops-context-orders.js
/**
 * Ops-context order helpers (in-process cache, read-intensive)
 *
 * - getEnrichedOrdersForUser(opts) calls OrderService._getEnrichedOrdersForUser(userId, opts)
 * - In-memory cache with TTL, stale-while-revalidate, single-flight locks
 * - Export evictUserCache(userId) and evictRegionCache(region) to be called from services on writes
 *
 * Notes
 * - This module is read-optimized and best-effort: stale data may be served while background refresh runs.
 * - If callers require strong consistency they should call OrderService._getEnrichedOrdersForUser directly with session/persist options.
 */

const createError = require('http-errors');
const OrderService = require('../../services/order.service');

const DEFAULT_TTL = 30; // seconds (fresh)
const STALE_TTL = 15; // seconds served stale while revalidating
const MAX_CACHE_ENTRIES = 2000; // LRU capacity

/* Simple LRU map with TTL metadata */
class LRUCache {
  constructor(max = 1000) {
    this.max = max;
    this.map = new Map(); // key -> { payload, createdAt, expiresAt, staleAt }
  }

  _touch(key, entry) {
    this.map.delete(key);
    this.map.set(key, entry);
    if (this.map.size > this.max) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }

  get(key) {
    const e = this.map.get(key);
    if (!e) return null;
    const now = Date.now();
    if (e.expiresAt && e.expiresAt <= now) {
      this.map.delete(key);
      return null;
    }
    this._touch(key, e);
    return e;
  }

  set(key, payload, ttl = DEFAULT_TTL, staleTtl = STALE_TTL) {
    const now = Date.now();
    const entry = {
      payload,
      createdAt: now,
      expiresAt: now + ttl * 1000,
      staleAt: now + (ttl - staleTtl) * 1000
    };
    this._touch(key, entry);
  }

  delete(key) {
    this.map.delete(key);
  }

  clearUserPrefix(prefix) {
    for (const key of Array.from(this.map.keys())) {
      if (key.startsWith(prefix)) this.map.delete(key);
    }
  }

  clearRegionPrefix(prefix) {
    for (const key of Array.from(this.map.keys())) {
      if (key.includes(`|r:${prefix}|`)) this.map.delete(key);
    }
  }
}

/* single-flight locks per key */
const inflight = new Map(); // key -> Promise

const cache = new LRUCache(MAX_CACHE_ENTRIES);
/* user/region versions for cheap invalidation */
const userVersion = new Map(); // userId -> integer
const regionVersion = new Map(); // region -> integer

function _toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : fallback;
}

function _getUserVersion(userId) {
  const u = String(userId || '__null__').trim();
  return userVersion.get(u) || 0;
}

function _bumpUserVersion(userId) {
  const u = String(userId || '__null__').trim();
  const v = (_getUserVersion(u) || 0) + 1;
  userVersion.set(u, v);
  // clear keys for this user
  const prefix = `u:${u}|`;
  cache.clearUserPrefix(prefix);
  return v;
}

function _getRegionVersion(region) {
  const r = String(region || '__null__').trim().toLowerCase();
  return regionVersion.get(r) || 0;
}

function _bumpRegionVersion(region) {
  const r = String(region || '__null__').trim().toLowerCase();
  const v = (_getRegionVersion(r) || 0) + 1;
  regionVersion.set(r, v);
  // clear region keys
  cache.clearRegionPrefix(r);
  return v;
}

function _cacheKey(userId, region, page, limit, status, includeSaveForLater, persist, uver, rver) {
  const u = String(userId || '__null__').trim();
  const r = String(region || '__null__').trim().toLowerCase();
  const s = Array.isArray(status) ? status.join(',') : (status === undefined ? '__all__' : String(status));
  const isl = includeSaveForLater ? '1' : '0';
  const p = persist ? '1' : '0';
  return `u:${u}|r:${r}|p${page}|l${limit}|s:${s}|isl:${isl}|pr:${p}|uv:${uver}|rv:${rver}`;
}

function _normalize(result = {}, page = 1, limit = 25) {
  const items = Array.isArray(result.items) ? result.items : Array.isArray(result.orders) ? result.orders : [];
  const total = Number.isFinite(Number(result.total)) ? Number(result.total) : items.length;
  const pages = Number.isFinite(Number(result.pages)) ? Number(result.pages) : (limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 0);
  return { items, total, page: Number(page), limit: Number(limit), pages };
}

/* background refresh (no await) */
async function _refreshCache(userId, region, page, limit, status, includeSaveForLater, persist, uver, rver, opts = {}) {
  const key = _cacheKey(userId, region, page, limit, status, includeSaveForLater, persist, uver, rver);
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const svcOpts = Object.assign({}, opts, {
        region,
        page,
        limit,
        status,
        includeSaveForLater,
        persist
      });
      const res = await OrderService._getEnrichedOrdersForUser(userId, svcOpts);
      const payload = _normalize(res, page, limit);
      cache.set(key, payload, DEFAULT_TTL, STALE_TTL);
      return payload;
    } catch (err) {
      // swallow; keep stale cache if present
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/**
 * getEnrichedOrdersForUser(opts)
 * - opts.userId (required)
 * - opts.region (optional)
 * - opts.page (optional)
 * - opts.limit (optional)
 * - opts.status (optional string or array)
 * - opts.includeSaveForLater (optional boolean)
 * - opts.persist (optional boolean) - if true, service may persist appended snapshots
 * - opts.session (optional) - passed to service if provided
 *
 * Behavior:
 * - Try to serve from in-process cache (fresh or stale)
 * - If stale, return stale payload and refresh in background
 * - If missing, compute (single-flight) and cache result
 * - Returns normalized paginated shape: { items, total, page, limit, pages }
 */
async function getEnrichedOrdersForUser(opts = {}) {
  const userId = opts.userId;
  if (!userId) throw createError(400, 'userId is required');

  const page = _toInt(opts.page, 1);
  const limit = _toInt(opts.limit, 25);
  const status = opts.status;
  const includeSaveForLater = !!opts.includeSaveForLater;
  const persist = !!opts.persist;
  const region = opts.region || null;

  const uver = _getUserVersion(userId);
  const rver = _getRegionVersion(region);

  const key = _cacheKey(userId, region, page, limit, status, includeSaveForLater, persist, uver, rver);

  // try cache
  const entry = cache.get(key);
  const now = Date.now();
  if (entry) {
    // fresh
    if (entry.expiresAt > now && entry.staleAt > now) {
      return entry.payload;
    }
    // stale but not expired: serve and refresh in background
    if (entry.expiresAt > now) {
      _refreshCache(userId, region, page, limit, status, includeSaveForLater, persist, uver, rver, { session: opts.session }).catch(() => {});
      return entry.payload;
    }
    // expired: fallthrough to compute
  }

  // single-flight compute
  if (inflight.has(key)) {
    try {
      const res = await inflight.get(key);
      if (res) return res;
    } catch (e) {
      // continue to compute locally
    }
  }

  const computePromise = (async () => {
    try {
      const svcOpts = {
        region,
        page,
        limit,
        status,
        includeSaveForLater,
        persist,
        session: opts.session
      };
      const res = await OrderService._getEnrichedOrdersForUser(userId, svcOpts);
      const payload = _normalize(res, page, limit);
      cache.set(key, payload, DEFAULT_TTL, STALE_TTL);
      return payload;
    } catch (err) {
      // if there is a stale entry, return it; otherwise bubble error
      const stale = cache.get(key);
      if (stale && stale.payload) return stale.payload;
      if (err && err.status) throw err;
      throw createError(500, err && err.message ? err.message : 'getEnrichedOrdersForUser failed');
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, computePromise);
  return computePromise;
}

/**
 * evictUserCache(userId)
 * - bump user version and clear user keys
 * - call this after writes that affect a user's orders (order create/update/cancel/submit)
 */
function evictUserCache(userId) {
  if (!userId) return;
  _bumpUserVersion(userId);
}

/**
 * evictRegionCache(region)
 * - bump region version and clear region keys
 * - call this after SalesWindow writes that affect region pricing/availability
 */
function evictRegionCache(region) {
  if (!region) return;
  _bumpRegionVersion(region);
}

module.exports = {
  getEnrichedOrdersForUser,
  evictUserCache,
  evictRegionCache
};
