// src/services/ops-context/ops-context-service.js
/**
 * Ops-context service aggregator
 *
 * - Re-exports ops-context helpers for controller/service usage
 * - Central place to import cached, read-optimized helpers:
 *   - products: getUiProducts, evictRegionCache
 *   - orders: getEnrichedOrdersForUser, evictUserCache, evictRegionCache
 */

const ordersContext = require('./ops-context-orders');
const productsContext = require('./ops-context-products');

/**
 * getUiProducts(opts)
 * - Proxy to ops-context-products.getUiProducts
 * - opts: { region, page, limit, lean, ... }
 */
async function getUiProducts(opts = {}) {
  return productsContext.getUiProducts(opts);
}

/**
 * getEnrichedOrdersForUser(opts)
 * - Proxy to ops-context-orders.getEnrichedOrdersForUser
 * - opts: { userId, region, page, limit, status, includeSaveForLater, persist, session }
 */
async function getEnrichedOrdersForUser(opts = {}) {
  return ordersContext.getEnrichedOrdersForUser(opts);
}

/* Eviction helpers (exposed for services to call after writes) */
function evictProductsRegionCache(region) {
  return productsContext.evictRegionCache(region);
}

function evictOrdersUserCache(userId) {
  return ordersContext.evictUserCache(userId);
}

function evictOrdersRegionCache(region) {
  return ordersContext.evictRegionCache(region);
}

module.exports = {
  getUiProducts,
  getEnrichedOrdersForUser,
  evictProductsRegionCache,
  evictOrdersUserCache,
  evictOrdersRegionCache
};
