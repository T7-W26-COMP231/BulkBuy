// src/controllers/regionMap.controller.js
/**
 * RegionMap controller
 * - Thin HTTP layer that delegates to src/services/regionMap.service
 * - Propagates actor and correlationId, records audit events for failures/successes
 *
 * Routes should be wired to this controller from src/routes/regionMap.routes.js
 */

const express = require('express');
const mongoose = require('mongoose');
const RegionMapService = require('../services/regionMap.service');
const auditService = require('../services/audit.service');

const router = express.Router();

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

/* Admin guard middleware (re-usable) */
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

/* POST /region-maps */
async function create(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const payload = req.body || {};
    const created = await RegionMapService.create(payload, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'regionMap.create.success',
      actor,
      target: { type: 'RegionMap', id: created._id || null },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { code: created.code, ops_region: created.ops_region }
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'regionMap.create.failed',
      actor,
      target: { type: 'RegionMap', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /region-maps/:id */
async function getById(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const doc = await RegionMapService.getById(id, { actor, correlationId });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'regionMap.get.failed',
      actor,
      target: { type: 'RegionMap', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /region-maps/by-ops/:opsRegion */
async function findByOpsRegion(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const opsRegion = req.params.opsRegion;
    const doc = await RegionMapService.findByOpsRegion(opsRegion, { actor, correlationId });
    if (!doc) return res.status(404).json({ success: false, message: 'RegionMap not found' });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'regionMap.findByOpsRegion.failed',
      actor,
      target: { type: 'RegionMap', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /region-maps - paginate */
async function list(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const page = req.query.page;
    const limit = req.query.limit;
    const filter = req.query.filter || {};
    const result = await RegionMapService.paginate(filter, { page, limit, correlationId, actor });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'regionMap.list.failed',
      actor,
      target: { type: 'RegionMap', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* PATCH /region-maps/:id */
async function updateById(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const update = req.body || {};
    const updated = await RegionMapService.updateById(id, update, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'regionMap.update.failed',
      actor,
      target: { type: 'RegionMap', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /region-maps/upsert */
async function upsert(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const filter = req.body.filter || {};
    const update = req.body.update || {};
    const doc = await RegionMapService.upsert(filter, update, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'regionMap.upsert.failed',
      actor,
      target: { type: 'RegionMap', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /region-maps/bulk-insert */
async function bulkInsert(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const docs = Array.isArray(req.body) ? req.body : (req.body.docs || []);
    const inserted = await RegionMapService.bulkInsert(docs, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: inserted });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'regionMap.bulkInsert.failed',
      actor,
      target: { type: 'RegionMap', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /region-maps/:id/locations - add location */
async function addLocation(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const regionId = req.params.id;
    const locPayload = req.body || {};
    const added = await RegionMapService.addLocation(regionId, locPayload, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: added });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'regionMap.location.add.failed',
      actor,
      target: { type: 'RegionMap', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* PATCH /region-maps/:id/locations/:locationId - update location */
async function updateLocation(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const regionId = req.params.id;
    const locationId = req.params.locationId;
    const update = req.body || {};
    const updated = await RegionMapService.updateLocation(regionId, locationId, update, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'regionMap.location.update.failed',
      actor,
      target: { type: 'RegionMap', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message, locationId: req.params.locationId || null }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* DELETE /region-maps/:id/locations/:locationId - remove location */
async function removeLocation(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const regionId = req.params.id;
    const locationId = req.params.locationId;
    const doc = await RegionMapService.removeLocation(regionId, locationId, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'regionMap.location.remove.failed',
      actor,
      target: { type: 'RegionMap', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message, locationId: req.params.locationId || null }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /region-maps/nearest?lng=...&lat=... */
async function findNearestLocations(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const lng = Number(req.query.lng);
    const lat = Number(req.query.lat);
    const opts = { maxDistance: req.query.maxDistance, limit: req.query.limit, correlationId, actor };
    const results = await RegionMapService.findNearestLocations(lng, lat, opts);
    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'regionMap.findNearest.failed',
      actor,
      target: { type: 'RegionMap', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* DELETE /region-maps/:id - hard delete (admin only) */
async function deleteById(req, res) {
  const correlationId = req.headers['x-correlation-id'] || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const removed = await RegionMapService.deleteById(id, { actor, correlationId });
    return res.status(200).json({ success: true, data: removed });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'regionMap.delete.hard.failed',
      actor,
      target: { type: 'RegionMap', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* Route exports (for wiring in routes file) */
module.exports = {
  create: asyncHandler(create),
  getById: asyncHandler(getById),
  findByOpsRegion: asyncHandler(findByOpsRegion),
  list: asyncHandler(list),
  updateById: asyncHandler(updateById),
  upsert: asyncHandler(upsert),
  bulkInsert: asyncHandler(bulkInsert),
  addLocation: asyncHandler(addLocation),
  updateLocation: asyncHandler(updateLocation),
  removeLocation: asyncHandler(removeLocation),
  findNearestLocations: asyncHandler(findNearestLocations),
  deleteById: [adminOnly, asyncHandler(deleteById)],

  /* Utilities for route wiring */
  validateObjectIdParam,
  parseFilterQuery,
  adminOnly
};
