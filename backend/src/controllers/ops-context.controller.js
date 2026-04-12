// src/controllers/ops-context.controller.js
/**
 * Ops-context controller
 *
 * - Exposes read-optimized helpers and cache eviction endpoints
 * - GET/POST /products            -> getUiProducts
 * - GET/POST /orders/enriched     -> getEnrichedOrders
 * - POST /products/evict          -> evictProductsRegionCache (admin)
 * - POST /orders/evict-user       -> evictOrdersUserCache (admin)
 * - POST /orders/evict-region     -> evictOrdersRegionCache (admin)
 *
 * Handlers are best-effort and return cached/stale results when appropriate.
 */

const createError = require('http-errors');
const OpsContextService = require('../services/ops-context/ops-context-service');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function actorFromReq(req = {}) {
  const user = req.user || null;
  return { userId: user && (user.userId || user._id) || null, role: user && user.role || null };
}

function correlationIdFromReq(req = {}) {
  return (req.headers && (req.headers['x-correlation-id'] || req.headers['x-request-id'])) || req.query.correlationId || null;
}

/**
 * GET/POST /api/ops-context/products
 */
async function getUiProducts(req, res) {
  const actor = actorFromReq(req);
  const correlationId = correlationIdFromReq(req);
  const source = req.method === 'GET' ? req.query : req.body || {};
  const region = source.region;
  const page = source.page ? parseInt(source.page, 10) : 1;
  const limit = source.limit ? parseInt(source.limit, 10) : 25;

  if (!region || typeof region !== 'string') throw createError(400, 'region is required and must be a string');
  if (!Number.isFinite(page) || page <= 0) throw createError(400, 'page must be a positive integer');
  if (!Number.isFinite(limit) || limit <= 0) throw createError(400, 'limit must be a positive integer');

  const opts = { region, page, limit, actor, correlationId, session: req.mongoSession || null };
  try {
    const result = await OpsContextService.getUiProducts(opts);    
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    throw createError(500, `error getting ui products @ : ${error}`);
  }
  
}

/**
 * GET/POST /api/ops-context/orders/enriched
 */
async function getEnrichedOrders(req, res) {
  const actor = actorFromReq(req);
  const correlationId = correlationIdFromReq(req);
  const source = req.method === 'GET' ? req.query : req.body || {};

  const userId = source.userId;
  if (!userId || typeof userId !== 'string') throw createError(400, 'userId is required and must be a string');
  const region = source.region || null;
  const page = source.page ? parseInt(source.page, 10) : 1;
  const limit = source.limit ? parseInt(source.limit, 10) : 25;

  // parse status: allow JSON array or simple string
  let status = undefined;
  if (source.status !== undefined && source.status !== null && source.status !== '') {
    if (typeof source.status === 'string') {
      try {
        status = JSON.parse(source.status);
      } catch (e) {
        status = source.status;
      }
    } else {
      status = source.status;
    }
  }

  const includeSaveForLater = source.includeSaveForLater === true || source.includeSaveForLater === 'true';
  const persist = source.persist === true || source.persist === 'true';

  if (!Number.isFinite(page) || page <= 0) throw createError(400, 'page must be a positive integer');
  if (!Number.isFinite(limit) || limit <= 0) throw createError(400, 'limit must be a positive integer');

  const opts = {
    userId,
    region,
    page,
    limit,
    status,
    includeSaveForLater,
    persist,
    session: req.mongoSession || null,
    actor,
    correlationId
  };

  const result = await OpsContextService.getEnrichedOrdersForUser(opts);
  return res.status(200).json({ success: true, ...result });
}

/**
 * POST /api/ops-context/products/evict
 * Body: { region }
 * Admin-only endpoint to evict product cache for a region
 */
async function evictProductsRegion(req, res) {
  const actor = actorFromReq(req);
  const correlationId = correlationIdFromReq(req);
  const region = (req.body && req.body.region) || (req.query && req.query.region);

  if (!region || typeof region !== 'string') throw createError(400, 'region is required and must be a string');

  await OpsContextService.evictProductsRegionCache(region);
  return res.status(200).json({ success: true, evicted: { region }, actor, correlationId });
}

/**
 * POST /api/ops-context/orders/evict-user
 * Body: { userId }
 * Admin-only endpoint to evict cached enriched orders for a user
 */
async function evictOrdersUser(req, res) {
  const actor = actorFromReq(req);
  const correlationId = correlationIdFromReq(req);
  const userId = (req.body && req.body.userId) || (req.query && req.query.userId);

  if (!userId || typeof userId !== 'string') throw createError(400, 'userId is required and must be a string');

  await OpsContextService.evictOrdersUserCache(userId);
  return res.status(200).json({ success: true, evicted: { userId }, actor, correlationId });
}

/**
 * POST /api/ops-context/orders/evict-region
 * Body: { region }
 * Admin-only endpoint to evict cached enriched orders for a region
 */
async function evictOrdersRegion(req, res) {
  const actor = actorFromReq(req);
  const correlationId = correlationIdFromReq(req);
  const region = (req.body && req.body.region) || (req.query && req.query.region);

  if (!region || typeof region !== 'string') throw createError(400, 'region is required and must be a string');

  await OpsContextService.evictOrdersRegionCache(region);
  return res.status(200).json({ success: true, evicted: { region }, actor, correlationId });
}

module.exports = {
  getUiProducts: asyncHandler(getUiProducts),
  getEnrichedOrders: asyncHandler(getEnrichedOrders),
  evictProductsRegion: asyncHandler(evictProductsRegion),
  evictOrdersUser: asyncHandler(evictOrdersUser),
  evictOrdersRegion: asyncHandler(evictOrdersRegion)
};
