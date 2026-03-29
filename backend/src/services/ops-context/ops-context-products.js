// src/services/ops-context/ops-context-products.js
/**
 * Ops-context product helpers (in-process cache, SalesWindow-only)
 *
 * - getUiProducts(opts) calls SalesWindowService.listAllCurrentProducts(region, opts)
 * - In-memory cache with TTL, stale-while-revalidate, single-flight locks
 * - Export evictRegionCache(region) to be called from SalesWindowService on writes
 */

const createError = require('http-errors');
const SalesWindowService = require('../../services/salesWindow.service');

const DEFAULT_TTL = 60; // seconds
const STALE_TTL = 30; // seconds served stale while revalidating
const MAX_CACHE_ENTRIES = 1000; // LRU capacity

/* Simple LRU map with TTL metadata */
class LRUCache {
  constructor(max = 1000) {
    this.max = max;
    this.map = new Map(); // key -> { value, expiresAt, staleAt, createdAt }
  }

  _touch(key, entry) {
    this.map.delete(key);
    this.map.set(key, entry);
    // enforce capacity
    if (this.map.size > this.max) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }

  get(key) {
    const e = this.map.get(key);
    if (!e) return null;
    const now = Date.now();
    // if expired fully, remove and return null
    if (e.expiresAt && e.expiresAt <= now - 0) {
      this.map.delete(key);
      return null;
    }
    // touch LRU
    this._touch(key, e);
    return e;
  }

  set(key, payload, ttl = DEFAULT_TTL, staleTtl = STALE_TTL) {
    const now = Date.now();
    const entry = {
      payload,
      createdAt: now,
      expiresAt: now + ttl * 1000,
      staleAt: now + (ttl - staleTtl) * 1000 // time after which entry is stale but still served
    };
    this._touch(key, entry);
  }

  delete(key) {
    this.map.delete(key);
  }

  clearRegionPrefix(prefix) {
    for (const key of Array.from(this.map.keys())) {
      if (key.startsWith(prefix)) this.map.delete(key);
    }
  }
}

/* single-flight locks per key */
const inflight = new Map(); // key -> Promise

const cache = new LRUCache(MAX_CACHE_ENTRIES);
/* region versions for cheap invalidation */
const regionVersion = new Map(); // region -> integer

function _toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : fallback;
}

function _normalize(result = {}, page = 1, limit = 25) {
  const products = Array.isArray(result.products) ? result.products : Array.isArray(result.items) ? result.items : [];
  const total = Number.isFinite(Number(result.total)) ? Number(result.total) : products.length;
  const pages = Number.isFinite(Number(result.pages)) ? Number(result.pages) : (limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 0);
  return { products, total, page: Number(page), limit: Number(limit), pages };
}

function _cacheKey(region, page, limit, version) {
  const r = String(region).trim().toLowerCase();
  return `${r}|p${page}|l${limit}|v${version}`;
}

function _getVersion(region) {
  const r = String(region).trim().toLowerCase();
  return regionVersion.get(r) || 0;
}

function _bumpVersion(region) {
  const r = String(region).trim().toLowerCase();
  const v = (_getVersion(r) || 0) + 1;
  regionVersion.set(r, v);
  // also clear any keys with old prefix to free memory
  const prefix = `${r}|`;
  cache.clearRegionPrefix(prefix);
  return v;
}

/* background refresh (no await) */
async function _refreshCache(region, page, limit, version, opts = {}) {
  const key = _cacheKey(region, page, limit, version);
  // single-flight for refresh
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const swOpts = Object.assign({}, opts, { page, limit, lean: true });
      const swResult = await SalesWindowService.listAllCurrentProducts(region, swOpts);
      const payload = _normalize(swResult, page, limit);
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
 * getUiProducts(opts)
 * - requires opts.region (string)
 * - returns normalized paginated shape
 */
async function getUiProducts(opts = {}) {
  const region = opts.region;
  if (!region || typeof region !== 'string') throw createError(400, 'region is required and must be a string');

  const page = _toInt(opts.page, 1);
  const limit = _toInt(opts.limit, 25);
  const version = _getVersion(region);
  const key = _cacheKey(region, page, limit, version);

  // try cache
  const entry = cache.get(key);
  const now = Date.now();
  if (entry) {
    // fresh
    if (entry.expiresAt > now && entry.staleAt > now) {
      return entry.payload;
    }
    // stale: serve immediately and refresh in background
    if (entry.expiresAt > now) {
      // trigger background refresh (do not await)
      _refreshCache(region, page, limit, version, opts).catch(() => {});
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
      const swOpts = Object.assign({}, opts, { page, limit, lean: true });
      const swResult = await SalesWindowService.listAllCurrentProducts(region, swOpts);
      const payload = _normalize(swResult, page, limit);
      cache.set(key, payload, DEFAULT_TTL, STALE_TTL);
      return payload;
    } catch (err) {
      // if there is a stale entry, return it; otherwise bubble error
      const stale = cache.get(key);
      if (stale && stale.payload) return stale.payload;
      if (err && err.status) throw err;
      throw createError(500, err && err.message ? err.message : 'getUiProducts failed');
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, computePromise);
  return computePromise;
}

/**
 * evictRegionCache(region)
 * - bump region version and clear region keys
 * - call this from SalesWindowService after writes that affect region
 */
async function evictRegionCache(region) {
  if (!region || typeof region !== 'string') return;
  _bumpVersion(region);
}

module.exports = {
  getUiProducts,
  evictRegionCache
};
