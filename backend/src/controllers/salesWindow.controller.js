// src/controllers/salesWindow.controller.js
/**
 * SalesWindow controller
 * - Thin HTTP layer that delegates to src/services/salesWindow.service
 * - Propagates actor and correlationId, records audit events for failures/successes
 *
 * Routes should be wired to this controller from src/routes/salesWindow.routes.js
 */

const mongoose = require('mongoose');
const SalesWindowService = require('../services/salesWindow.service');
const auditService = require('../services/audit.service');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function actorFromReq(req = {}) {
  const user = req.user || null;
  return {
    userId: user && (user.userId || user._id) || null,
    role: user && user.role || null
  };
}

/* Simple ObjectId param validator */
const validateObjectIdParam = (paramName) => (req, res, next) => {
  const id = req.params[paramName];
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    const err = new Error(`${paramName} must be a valid ObjectId`);
    err.status = 400;
    return next(err);
  }
  return next();
};

/* Parse optional filter query param (JSON string) */
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

/* Admin guard (re-usable) */
const adminOnly = (req, res, next) => {
  const user = req.user;
  if (!user || user.role !== 'administrator') {
    const err = new Error('admin privileges required');
    err.status = 403;
    return next(err);
  }
  return next();
};

/* Controller actions */

/* POST /sales-windows */
async function create(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const payload = req.body || {};
    const created = await SalesWindowService.create(payload, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'salesWindow.create.success',
      actor,
      target: { type: 'SalesWindow', id: created._id || null },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { window: created.window }
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'salesWindow.create.failed',
      actor,
      target: { type: 'SalesWindow', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /sales-windows/:id */
async function getById(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const doc = await SalesWindowService.getById(id, { actor, correlationId });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'salesWindow.get.failed',
      actor,
      target: { type: 'SalesWindow', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /sales-windows/range?fromEpoch=...&toEpoch=... */
async function findByWindowRange(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const fromEpoch = Number(req.query.fromEpoch);
    const toEpoch = Number(req.query.toEpoch);
    if (!Number.isFinite(fromEpoch) || !Number.isFinite(toEpoch)) {
      const err = new Error('fromEpoch and toEpoch query parameters are required and must be numbers');
      err.status = 400;
      throw err;
    }
    const docs = await SalesWindowService.findByWindowRange(fromEpoch, toEpoch, { actor, correlationId });
    return res.status(200).json({ success: true, data: docs });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'salesWindow.findByWindowRange.failed',
      actor,
      target: { type: 'SalesWindow', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /sales-windows - paginate/list */
async function list(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const page = req.query.page;
    const limit = req.query.limit;
    const filter = req.query.filter || {};
    const result = await SalesWindowService.paginate(filter, { page, limit, correlationId, actor });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'salesWindow.list.failed',
      actor,
      target: { type: 'SalesWindow', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* PATCH /sales-windows/:id */
async function updateById(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const update = req.body || {};
    const updated = await SalesWindowService.updateById(id, update, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'salesWindow.update.failed',
      actor,
      target: { type: 'SalesWindow', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /sales-windows/upsert */
async function upsert(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const filter = req.body.filter || {};
    const update = req.body.update || {};
    const doc = await SalesWindowService.upsert(filter, update, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'salesWindow.upsert.failed',
      actor,
      target: { type: 'SalesWindow', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /sales-windows/bulk-insert */
async function bulkInsert(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const docs = Array.isArray(req.body) ? req.body : (req.body.docs || []);
    const inserted = await SalesWindowService.bulkInsert(docs, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: inserted });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'salesWindow.bulkInsert.failed',
      actor,
      target: { type: 'SalesWindow', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /sales-windows/:id/items - add or update item snapshot
   Accepts productId and itemId in params or body:
   - params: /:id/items/:productId/:itemId  (route wiring may vary)
   - body fallback: { productId, itemId, pricing_snapshot, metadata }
*/
async function addOrUpdateItem(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const windowId = req.params.id;
    const productId = req.params.productId || req.body.productId;
    const itemId = req.params.itemId || req.body.itemId;
    const payload = req.body || {};
    if (!productId || !itemId) {
      const err = new Error('productId and itemId are required');
      err.status = 400;
      throw err;
    }
    const result = await SalesWindowService.addOrUpdateItem(windowId, productId, itemId, payload, { actor, correlationId, session: req.mongoSession, createOverflowThresholdBytes: req.body.createOverflowThresholdBytes });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'salesWindow.item.addOrUpdate.failed',
      actor,
      target: { type: 'SalesWindow', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* DELETE /sales-windows/:id/items/:productId/:itemId - remove item */
async function removeItem(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const windowId = req.params.id;
    const productId = req.params.productId;
    const itemId = req.params.itemId;
    if (!productId || !itemId) {
      const err = new Error('productId and itemId are required');
      err.status = 400;
      throw err;
    }
    const removed = await SalesWindowService.removeItem(windowId, productId, itemId, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: { removed } });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'salesWindow.item.remove.failed',
      actor,
      target: { type: 'SalesWindow', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /sales-windows/:id/items/:productId/:itemId - get item snapshot (optional fallback to last window via ?fallback=true) */
async function getItemSnapshot(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const windowId = req.params.id;
    const productId = req.params.productId;
    const itemId = req.params.itemId;
    const fallback = req.query.fallback === 'true' || req.query.fallback === true;
    if (!productId || !itemId) {
      const err = new Error('productId and itemId are required');
      err.status = 400;
      throw err;
    }
    const snapshot = await SalesWindowService.getItemSnapshot(windowId, productId, itemId, { fallbackToLastWindow: fallback, actor, correlationId });
    if (!snapshot) return res.status(404).json({ success: false, message: 'Item snapshot not found' });
    return res.status(200).json({ success: true, data: snapshot });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'salesWindow.item.get.failed',
      actor,
      target: { type: 'SalesWindow', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /sales-windows/:id/overflow-chain - returns array of linked overflow windows */
async function getOverflowChain(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const startId = req.params.id;
    const chain = await SalesWindowService.getOverflowChain(startId, { actor, correlationId });
    return res.status(200).json({ success: true, data: chain });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'salesWindow.overflowChain.failed',
      actor,
      target: { type: 'SalesWindow', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* DELETE /sales-windows/:id - hard delete (admin only) */
async function deleteById(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const removed = await SalesWindowService.deleteById(id, { actor, correlationId });
    return res.status(200).json({ success: true, data: removed });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'salesWindow.delete.hard.failed',
      actor,
      target: { type: 'SalesWindow', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* Exports for route wiring */
module.exports = {
  create: asyncHandler(create),
  getById: asyncHandler(getById),
  findByWindowRange: asyncHandler(findByWindowRange),
  list: asyncHandler(list),
  updateById: asyncHandler(updateById),
  upsert: asyncHandler(upsert),
  bulkInsert: asyncHandler(bulkInsert),
  addOrUpdateItem: asyncHandler(addOrUpdateItem),
  removeItem: asyncHandler(removeItem),
  getItemSnapshot: asyncHandler(getItemSnapshot),
  getOverflowChain: asyncHandler(getOverflowChain),
  deleteById: [adminOnly, asyncHandler(deleteById)],

  /* Utilities for route wiring */
  validateObjectIdParam,
  parseFilterQuery,
  adminOnly
};
