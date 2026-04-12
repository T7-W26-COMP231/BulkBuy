// src/controllers/salesWindow.controller.js
/**
 * SalesWindow controller (optimized, payload-first)
 *
 * - Thin HTTP layer that delegates to src/services/salesWindow.service.
 * - Controller does NOT perform auditing; service layer handles audit.
 * - Mutations accept productId/itemId in request body; reads accept them via query.
 * - listAllCurrentProducts remains internal and is NOT exported.
 *
 * Exported handlers:
 * - create, getById, findByWindowRange, list, updateById, upsert, bulkInsert
 * - addProduct, addProductItem, addOrUpdateItem, removeItem
 * - listProductItems
 * - addPricingSnapshot, upsertPricingSnapshot, listPricingSnapshots, listPricingTiers
 * - bulkInsertProducts, bulkInsertItems
 * - getItemSnapshot, getOverflowChain, listAllCurrentSalesWindows, deleteById
 *
 * Keep this file focused on request/response mapping and minimal validation
 * (route-level validators handle most input checks).
 */

const mongoose = require('mongoose');
const createError = require('http-errors');
const SalesWindowService = require('../services/salesWindow.service');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function actorFromReq(req = {}) {
  const user = req.user || null;
  return {
    userId: user && (user.userId || user._id) || null,
    role: user && user.role || null
  };
}

function correlationIdFromReq(req = {}) {
  return (req.headers && (req.headers['x-correlation-id'] || req.headers['x-request-id'])) || req.query.correlationId || null;
}

/* Utilities for route wiring (kept for compatibility with routes) */
const validateObjectIdParam = (paramName) => (req, res, next) => {
  const id = req.params[paramName];
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    const err = new Error(`${paramName} must be a valid ObjectId`);
    err.status = 400;
    return next(err);
  }
  return next();
};

const parseFilterQuery = (req, res, next) => {
  if (req.query && req.query.filter && typeof req.query.filter === 'string') {
    try {
      req.query.filter = JSON.parse(req.query.filter);
    } catch (e) {
      const err = new Error('filter must be a valid JSON string');
      err.status = 400;
      return next(err);
    }
  }
  return next();
};

const adminOnly = (req, res, next) => {
  const user = req.user;
  if (!user || user.role !== 'administrator') {
    const err = new Error('admin privileges required');
    err.status = 403;
    return next(err);
  }
  return next();
};

/* -------------------------
 * Controller actions
 * ------------------------- */

/* POST /api/sales-windows
 * Body: window payload
 */
async function create(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const payload = req.body || {};
  const opts = { actor, correlationId, session: req.mongoSession || null, useTransaction: req.useTransaction || false };
  const created = await SalesWindowService.create(payload, opts);
  return res.status(201).json({ success: true, data: created });
}

/* GET /api/sales-windows/:id */
async function getById(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const id = req.params.id;
  if (!id) throw createError(400, 'id is required');
  const opts = { actor, correlationId, lean: req.query.lean === 'true' || req.query.lean === true };
  const doc = await SalesWindowService.getById(id, opts);
  return res.status(200).json({ success: true, data: doc });
}

/* GET /api/sales-windows/range?fromEpoch=...&toEpoch=... */
async function findByWindowRange(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const fromEpoch = Number(req.query.fromEpoch);
  const toEpoch = Number(req.query.toEpoch);
  if (!Number.isFinite(fromEpoch) || !Number.isFinite(toEpoch)) {
    throw createError(400, 'fromEpoch and toEpoch query parameters are required and must be numbers');
  }
  const docs = await SalesWindowService.findByWindowRange(fromEpoch, toEpoch, { actor, correlationId });
  return res.status(200).json({ success: true, data: docs });
}

/* GET /api/sales-windows
 * Query: page, limit, filter, sort, lean
 */
async function list(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const page = req.query.page ? parseInt(req.query.page, 10) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
  const filter = req.query.filter || {};
  const opts = {
    actor,
    correlationId,
    page,
    limit,
    sort: req.query.sort ? JSON.parse(String(req.query.sort)) : undefined,
    lean: req.query.lean === 'true' || req.query.lean === true
  };
  const result = await SalesWindowService.paginate(filter, opts);
  return res.status(200).json({ success: true, ...result });
}

/* PATCH /api/sales-windows/:id
 * Body: partial update
 */
async function updateById(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const id = req.params.id;
  const update = req.body || {};
  if (!id) throw createError(400, 'id is required');
  const opts = { actor, correlationId, session: req.mongoSession || null, new: true };
  const updated = await SalesWindowService.updateById(id, update, opts);
  return res.status(200).json({ success: true, data: updated });
}

/* POST /api/sales-windows/upsert
 * Body: { filter, update }
 */
async function upsert(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const filter = req.body.filter || {};
  const update = req.body.update || {};
  const doc = await SalesWindowService.upsert(filter, update, { actor, correlationId, session: req.mongoSession || null });
  return res.status(200).json({ success: true, data: doc });
}

/* POST /api/sales-windows/bulk-insert
 * Body: array or { docs: [] }
 */
async function bulkInsert(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const docs = Array.isArray(req.body) ? req.body : (req.body.docs || []);
  const inserted = await SalesWindowService.bulkInsert(docs, { actor, correlationId, session: req.mongoSession || null });
  return res.status(200).json({ success: true, data: inserted });
}

/* -------------------------
 * Product / Item / Pricing handlers (payload-first)
 * ------------------------- */

/* POST /api/sales-windows/:id/products
 * Body: { productId, ... }
 */
async function addProduct(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const windowId = req.params.id;
  const payload = req.body || {};
  if (!windowId) throw createError(400, 'windowId is required');
  const result = await SalesWindowService.addProduct(windowId, payload, { actor, correlationId, session: req.mongoSession || null });
  return res.status(200).json({ success: true, data: result });
}

/* POST /api/sales-windows/:id/products/items
 * Body: { productId, itemPayload }
 */
async function addProductItem(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const windowId = req.params.id;
  const productId = req.body.productId;
  const itemPayload = req.body.itemPayload || req.body;
  if (!windowId) throw createError(400, 'windowId is required');
  if (!productId) throw createError(400, 'productId is required');
  const result = await SalesWindowService.addProductItem(windowId, productId, itemPayload, { actor, correlationId, session: req.mongoSession || null });
  return res.status(200).json({ success: true, data: result });
}

/* POST /api/sales-windows/:id/products/items/upsert
 * Body: { productId, itemId, ... }
 * (alternate upsert route that uses body for ids)
 */
async function addOrUpdateItem(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const windowId = req.params.id;
  const productId = req.body.productId;
  const itemId = req.body.itemId;
  const payload = req.body || {};
  if (!windowId) throw createError(400, 'windowId is required');
  if (!productId) throw createError(400, 'productId is required');
  if (!itemId) throw createError(400, 'itemId is required');
  const result = await SalesWindowService.addOrUpdateItem(windowId, productId, itemId, payload, { actor, correlationId, session: req.mongoSession || null });
  return res.status(200).json({ success: true, data: result });
}

/* DELETE /api/sales-windows/:id/items
 * Body: { productId, itemId }
 */
async function removeItem(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const windowId = req.params.id;
  const { productId, itemId } = req.body || {};
  if (!windowId) throw createError(400, 'windowId is required');
  if (!productId || !itemId) throw createError(400, 'productId and itemId are required');
  const removed = await SalesWindowService.removeItem(windowId, productId, itemId, { actor, correlationId, session: req.mongoSession || null });
  return res.status(200).json({ success: true, data: removed });
}

/* GET /api/sales-windows/:id/products/items?productId=...&page=&limit=
 * Query: productId, page, limit
 */
async function listProductItems(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const windowId = req.params.id;
  const productId = req.query.productId;
  if (!windowId) throw createError(400, 'windowId is required');
  if (!productId) throw createError(400, 'productId is required');
  const opts = { actor, correlationId, lean: req.query.lean === 'true' || req.query.lean === true, page: req.query.page, limit: req.query.limit };
  const items = await SalesWindowService.listProductItems(windowId, productId, opts);
  return res.status(200).json({ success: true, data: items });
}

/* POST /api/sales-windows/:id/pricing-snapshots
 * Body: { productId, itemId, snapshot }
 */
async function addPricingSnapshot(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const windowId = req.params.id;
  const productId = req.body.productId;
  const itemId = req.body.itemId;
  const snapshot = req.body.snapshot || req.body;
  if (!windowId) throw createError(400, 'windowId is required');
  if (!productId) throw createError(400, 'productId is required');
  if (!itemId) throw createError(400, 'itemId is required');
  const resObj = await SalesWindowService.addPricingSnapshot(windowId, productId, itemId, snapshot, { actor, correlationId, session: req.mongoSession || null });
  return res.status(200).json({ success: true, data: resObj });
}

/* PUT /api/sales-windows/:id/pricing-snapshots
 * Body: { productId, itemId, snapshot }
 */
async function upsertPricingSnapshot(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const windowId = req.params.id;
  const productId = req.body.productId;
  const itemId = req.body.itemId;
  const snapshot = req.body.snapshot || req.body;
  if (!windowId) throw createError(400, 'windowId is required');
  if (!productId) throw createError(400, 'productId is required');
  if (!itemId) throw createError(400, 'itemId is required');
  const resObj = await SalesWindowService.upsertPricingSnapshot(windowId, productId, itemId, snapshot, { actor, correlationId, session: req.mongoSession || null });
  return res.status(200).json({ success: true, data: resObj });
}

/* GET /api/sales-windows/pricing-snapshots?productId=...&itemId=... */
async function listPricingSnapshots(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const productId = req.query.productId || req.body.productId;
  const itemId = req.query.itemId || req.body.itemId;
  if (!productId) throw createError(400, 'productId is required');
  if (!itemId) throw createError(400, 'itemId is required');
  const snapshots = await SalesWindowService.listPricingSnapshots(productId, itemId, { actor, correlationId });
  return res.status(200).json({ success: true, data: snapshots });
}

/* GET /api/sales-windows/:id/pricing-tiers?productId=...&itemId=... */
async function listPricingTiers(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const windowId = req.params.id;
  const productId = req.query.productId || req.body.productId;
  const itemId = req.query.itemId || req.body.itemId;
  if (!windowId) throw createError(400, 'windowId is required');
  if (!productId) throw createError(400, 'productId is required');
  if (!itemId) throw createError(400, 'itemId is required');
  const tiers = await SalesWindowService.listPricingTiers(windowId, productId, itemId, { actor, correlationId });
  return res.status(200).json({ success: true, data: tiers });
}

/* POST /api/sales-windows/:id/bulk-products
 * Body: array of products
 */
async function bulkInsertProducts(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const windowId = req.params.id;
  const products = Array.isArray(req.body) ? req.body : (req.body.products || []);
  if (!windowId) throw createError(400, 'windowId is required');
  const inserted = await SalesWindowService.bulkInsertProducts(windowId, products, { actor, correlationId, session: req.mongoSession || null });
  return res.status(200).json({ success: true, data: inserted });
}

/* POST /api/sales-windows/:id/products/bulk-items
 * Body: { productId, items: [...] }
 */
async function bulkInsertItems(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const windowId = req.params.id;
  const productId = req.body.productId;
  const items = Array.isArray(req.body.items) ? req.body.items : (Array.isArray(req.body) ? req.body : (req.body.items || []));
  if (!windowId) throw createError(400, 'windowId is required');
  if (!productId) throw createError(400, 'productId is required');
  const inserted = await SalesWindowService.bulkInsertItems(windowId, productId, items, { actor, correlationId, session: req.mongoSession || null });
  return res.status(200).json({ success: true, data: inserted });
}

/* -------------------------
 * Read helpers (query-based)
 * ------------------------- */

/* GET /api/sales-windows/:id/items?productId=...&itemId=...&fallback=true
 * Query-based read for item snapshot
 */
async function getItemSnapshot(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const windowId = req.params.id;
  const productId = req.query.productId;
  const itemId = req.query.itemId;
  const fallback = req.query.fallback === 'true' || req.query.fallback === true;
  if (!productId || !itemId) throw createError(400, 'productId and itemId are required');
  const snapshot = await SalesWindowService.getItemSnapshot(windowId, productId, itemId, { fallbackToLastWindow: fallback, actor, correlationId });
  if (!snapshot) return res.status(404).json({ success: false, message: 'Item snapshot not found' });
  return res.status(200).json({ success: true, data: snapshot });
}

/* GET /api/sales-windows/:id/overflow-chain */
async function getOverflowChain(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const startId = req.params.id;
  const chain = await SalesWindowService.getOverflowChain(startId, { actor, correlationId });
  return res.status(200).json({ success: true, data: chain });
}

/* GET /api/sales-windows/current?region=...&page=&limit=
 * Returns SalesWindow documents as-is (head + overflow)
 */
async function listAllCurrentSalesWindows(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const region = req.query.region || req.body.region;
  if (!region) throw createError(400, 'region is required');
  const opts = {
    actor,
    correlationId,
    lean: req.query.lean === 'true' || req.query.lean === true,
    sort: req.query.sort ? JSON.parse(String(req.query.sort)) : undefined,
    page: req.query.page ? parseInt(req.query.page, 10) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined
  };
  const docs = await SalesWindowService.listAllCurrentSalesWindows(region, opts);
  return res.status(200).json({ success: true, data: docs });
}

/* GET /api/sales-windows/public/current-status?region=...&productId=...&itemId=...
 * Returns only the current sales window status and timestamps needed by customer intent-edit flows.
 */
async function getCurrentWindowStatusForCustomer(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);

  const region = req.query.region || req.body.region;
  const productId = req.query.productId || req.body.productId;
  const itemId = req.query.itemId || req.body.itemId;

  if (!region) throw createError(400, 'region is required');

  const docs = await SalesWindowService.listAllCurrentSalesWindows(region, {
    actor,
    correlationId,
    lean: true
  });

  const windows = Array.isArray(docs) ? docs : [];
  const now = Date.now();

  let matchedWindow = null;

  for (const win of windows) {
    const products = Array.isArray(win.products) ? win.products : [];

    for (const product of products) {
      const sameProduct = !productId || String(product.productId) === String(productId);
      if (!sameProduct) continue;

      const items = Array.isArray(product.items) ? product.items : [];

      for (const item of items) {
        const sameItem = !itemId || String(item.itemId) === String(itemId);
        if (sameItem) {
          matchedWindow = win;
          break;
        }
      }

      if (matchedWindow) break;
    }

    if (matchedWindow) break;
  }

  if (!matchedWindow) {
    return res.status(404).json({
      success: false,
      message: 'No active sales window found for this item.'
    });
  }

  const fromEpoch = matchedWindow.window?.fromEpoch;
  const toEpoch = matchedWindow.window?.toEpoch;

  let status = 'unknown';
  if (Number.isFinite(fromEpoch) && Number.isFinite(toEpoch)) {
    if (now < fromEpoch) status = 'upcoming';
    else if (now > toEpoch) status = 'closed';
    else status = 'open';
  }

  return res.status(200).json({
    success: true,
    data: {
      windowId: matchedWindow._id,
      fromEpoch,
      toEpoch,
      status
    }
  });
}

/* DELETE /api/sales-windows/:id (hard delete, admin only) */
async function deleteById(req, res) {
  const correlationId = correlationIdFromReq(req);
  const actor = actorFromReq(req);
  const id = req.params.id;
  if (!id) throw createError(400, 'id is required');
  const removed = await SalesWindowService.deleteById(id, { actor, correlationId });
  return res.status(200).json({ success: true, data: removed });
}

/* -------------------------
 * Exports
 * ------------------------- */
module.exports = {
  create: asyncHandler(create),
  getById: asyncHandler(getById),
  findByWindowRange: asyncHandler(findByWindowRange),
  list: asyncHandler(list),
  updateById: asyncHandler(updateById),
  upsert: asyncHandler(upsert),
  bulkInsert: asyncHandler(bulkInsert),

  /* Product / Item / Pricing */
  addProduct: asyncHandler(addProduct),
  addProductItem: asyncHandler(addProductItem),
  addOrUpdateItem: asyncHandler(addOrUpdateItem),
  removeItem: asyncHandler(removeItem),
  listProductItems: asyncHandler(listProductItems),
  addPricingSnapshot: asyncHandler(addPricingSnapshot),
  upsertPricingSnapshot: asyncHandler(upsertPricingSnapshot),
  listPricingSnapshots: asyncHandler(listPricingSnapshots),
  listPricingTiers: asyncHandler(listPricingTiers),
  bulkInsertProducts: asyncHandler(bulkInsertProducts),
  bulkInsertItems: asyncHandler(bulkInsertItems),

  /* Other */
  getItemSnapshot: asyncHandler(getItemSnapshot),
  getOverflowChain: asyncHandler(getOverflowChain),
  listAllCurrentSalesWindows: asyncHandler(listAllCurrentSalesWindows),
  getCurrentWindowStatusForCustomer: asyncHandler(getCurrentWindowStatusForCustomer),
  deleteById: [adminOnly, asyncHandler(deleteById)],

  /* Utilities for route wiring */
  validateObjectIdParam,
  parseFilterQuery,
  adminOnly
};
