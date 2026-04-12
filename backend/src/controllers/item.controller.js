// src/controllers/item.controller.js
/**
 * Item controller
 * - Thin HTTP layer that delegates to src/services/item.service
 * - Propagates actor and correlationId, records audit events for failures/successes
 *
 * Routes should be wired to this controller from src/routes/item.routes.js
 */

const express = require('express');
const mongoose = require('mongoose');
const ItemService = require('../services/item.service');
const auditService = require('../services/audit.service');
const router = express.Router();

const User = require('../models/user.model');   // 👈 added here this is used in getApprovedItems()
const Supply = require('../models/supply.model'); // 👈 added here this is used in getApprovedItems()

/* Async wrapper to forward errors to express error handler */
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

/* Simple param validator for :id and other id params */
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
  if (req.query && req.query.filter) {
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

/* Admin guard middleware */
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

/* POST /items */
async function create(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const payload = req.body || {};
    const created = await ItemService.create(payload, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'item.create.success',
      actor,
      target: { type: 'Item', id: created._id || null },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { sku: created.sku }
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.create.failed',
      actor,
      target: { type: 'Item', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /items/:id */
async function getById(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const doc = await ItemService.getById(id, { actor, correlationId });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.get.failed',
      actor,
      target: { type: 'Item', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /items/sku/:sku */
async function findBySku(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const sku = req.params.sku;
    const doc = await ItemService.findBySku(sku, { actor, correlationId });
    if (!doc) return res.status(404).json({ success: false, message: 'Item not found' });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.findBySku.failed',
      actor,
      target: { type: 'Item', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /items - paginate */
async function list(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const page = req.query.page;
    const limit = req.query.limit;
    const filter = req.query.filter || {};
    const result = await ItemService.paginate(filter, { page, limit, correlationId, actor });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.list.failed',
      actor,
      target: { type: 'Item', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /items/catalog */
async function catalog(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);

  try {
    const filters = {
      q: req.query.q || null,
      category: req.query.category || null,
      ops_region: req.query.ops_region || null
    };

    const page = req.query.page;
    const limit = req.query.limit;

    const result = await ItemService.getCatalog(filters, {
      page,
      limit,
      correlationId,
      actor
    });

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.catalog.failed',
      actor,
      target: { type: 'Item', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });

    return res.status(err.status || 500).json({
      success: false,
      message: err.message
    });
  }
}

/* PATCH /items/:id */
async function updateById(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const update = req.body || {};
    const updated = await ItemService.updateById(id, update, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.update.failed',
      actor,
      target: { type: 'Item', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /items/upsert */
async function upsert(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const filter = req.body.filter || {};
    const update = req.body.update || {};
    const doc = await ItemService.upsert(filter, update, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.upsert.failed',
      actor,
      target: { type: 'Item', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /items/bulk-insert */
async function bulkInsert(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const docs = Array.isArray(req.body) ? req.body : (req.body.docs || []);
    const inserted = await ItemService.bulkInsert(docs, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: inserted });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.bulkInsert.failed',
      actor,
      target: { type: 'Item', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /items/:id/adjust-stock */
async function adjustStock(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const delta = Number(req.body.delta || req.query.delta || 0);
    const inventory = await ItemService.adjustStock(id, delta, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: inventory });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.inventory.adjust.failed',
      actor,
      target: { type: 'Item', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /items/:id/reserve */
async function reserve(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const qty = Number(req.body.qty || req.query.qty || 1);
    const inventory = await ItemService.reserve(id, qty, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: inventory });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.inventory.reserve.failed',
      actor,
      target: { type: 'Item', id: req.params.id || null },
      outcome: 'failure',
      severity: 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /items/:id/release */
async function release(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const qty = Number(req.body.qty || req.query.qty || 1);
    const inventory = await ItemService.release(id, qty, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: inventory });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.inventory.release.failed',
      actor,
      target: { type: 'Item', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /items/:id/apply-rating */
async function applyRating(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const rating = Number(req.body.rating || req.query.rating || 0);
    const updated = await ItemService.applyRating(id, rating, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.rating.apply.failed',
      actor,
      target: { type: 'Item', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /items/:id/soft-delete */
async function softDelete(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const removed = await ItemService.softDeleteById(id, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: removed });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.delete.soft.failed',
      actor,
      target: { type: 'Item', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* DELETE /items/:id/hard */
async function hardDelete(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const removed = await ItemService.hardDeleteById(id, { actor, correlationId });
    return res.status(200).json({ success: true, data: removed });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.delete.hard.failed',
      actor,
      target: { type: 'Item', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /items/:id/publish */
async function publish(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const updated = await ItemService.publish(id, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.publish.failed',
      actor,
      target: { type: 'Item', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /items/:id/unpublish */
async function unpublish(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const updated = await ItemService.unpublish(id, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.unpublish.failed',
      actor,
      target: { type: 'Item', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /items/search - public search */
async function publicSearch(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const q = req.query.q || null;
    const opts = {
      limit: req.query.limit,
      skip: req.query.skip,
      sort: req.query.sort,
      filters: req.query.filter || {}
    };
    const result = await ItemService.publicSearch(q, { ...opts, actor, correlationId });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'item.search.failed',
      actor,
      target: { type: 'Item', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

//added thsi method so we can get approved items that supplier can create quote for or can supply 

async function getApprovedItems(req, res) {
  try {
    const userId = req.user?._id || req.user?.userId;

    const user = await User.findById(userId)
      .populate('AllowedSupplyItems')
      .lean()
      .exec();

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const approvedItems = user.AllowedSupplyItems || [];
    if (approvedItems.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const supplies = await Supply.find({ supplierId: userId, deleted: false }).lean();

    const items = approvedItems.map((item) => {
      const supply = supplies.find((s) =>
        s.items.some((si) => String(si.itemId) === String(item._id))
      );
      let quoteStatus = 'no_quote';
      if (supply) {
        if (supply.status === 'accepted') quoteStatus = 'approved';
        else if (supply.status === 'quote') quoteStatus = 'draft';
        else if (supply.status === 'received') quoteStatus = 'reviewing';
        else quoteStatus = supply.status;
      }
      return { ...item, quoteStatus, supplyId: supply?._id || null };
    });

    return res.status(200).json({ success: true, data: items });
  } catch (err) {
    console.error('getApprovedItems error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}


/* Route exports (for wiring in routes file) */
module.exports = {
  create: asyncHandler(create),
  getById: asyncHandler(getById),
  findBySku: asyncHandler(findBySku),
  list: asyncHandler(list),
  catalog: asyncHandler(catalog),
  updateById: asyncHandler(updateById),
  upsert: asyncHandler(upsert),
  bulkInsert: asyncHandler(bulkInsert),
  adjustStock: asyncHandler(adjustStock),
  reserve: asyncHandler(reserve),
  release: asyncHandler(release),
  applyRating: asyncHandler(applyRating),
  softDelete: asyncHandler(softDelete),
  hardDelete: [adminOnly, asyncHandler(hardDelete)],
  publish: asyncHandler(publish),
  unpublish: asyncHandler(unpublish),
  publicSearch: asyncHandler(publicSearch),
  getApprovedItems: asyncHandler(getApprovedItems),

  /* Utilities for route wiring */
  validateObjectIdParam,
  parseFilterQuery,
  adminOnly
};
