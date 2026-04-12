// src/services/regionMap.service.js
/**
 * RegionMap service
 * - Business logic for RegionMap documents
 * - Delegates persistence to src/repositories/regionMap.repo
 * - Emits audit events via src/services/audit.service
 *
 * Methods:
 * - create, getById, findByOpsRegion, paginate, updateById, upsert, deleteById
 * - addLocation, updateLocation, removeLocation, findNearestLocations, bulkInsert
 *
 * All methods accept opts = { actor, correlationId, session, ... } where appropriate.
 */

const createError = require('http-errors');
const RegionMapRepo = require('../repositories/regionMap.repo');
const auditService = require('./audit.service');

function actorFromOpts(opts = {}) {
  if (!opts) return { userId: null, role: null };
  if (opts.actor) return opts.actor;
  if (opts.user) return {
    userId: opts.user && (opts.user.userId || opts.user._id) || null,
    role: opts.user && opts.user.role || null
  };
  return { userId: null, role: null };
}

function sanitize(doc) {
  if (!doc) return doc;
  // If mongoose doc, convert to plain object
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete obj.__v;
  return obj;
}

class RegionMapService {
  /**
   * Create a region map
   */
  async create(payload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!payload || typeof payload !== 'object') throw createError(400, 'payload is required');

    try {
      const created = await RegionMapRepo.create(payload, { session: opts.session, lean: false });
      await auditService.logEvent({
        eventType: 'regionMap.create.success',
        actor,
        target: { type: 'RegionMap', id: created._id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { code: created.code, ops_region: created.ops_region }
      });
      return sanitize(created);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'regionMap.create.failed',
        actor,
        target: { type: 'RegionMap', id: null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message, payload: { code: payload.code, ops_region: payload.ops_region } }
      });
      throw err;
    }
  }

  /**
   * Get by id
   */
  async getById(id, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    try {
      const doc = await RegionMapRepo.findById(id, opts);
      if (!doc) throw createError(404, 'RegionMap not found');
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'regionMap.get.failed',
        actor: actorFromOpts(opts),
        target: { type: 'RegionMap', id: id || null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Find by ops_region
   */
  async findByOpsRegion(opsRegion, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!opsRegion) throw createError(400, 'opsRegion is required');
    try {
      const doc = await RegionMapRepo.findByOpsRegion(opsRegion, opts);
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'regionMap.findByOpsRegion.failed',
        actor: actorFromOpts(opts),
        target: { type: 'RegionMap', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, opsRegion }
      });
      throw err;
    }
  }

  /**
   * Paginate region maps
   */
  async paginate(filter = {}, opts = {}) {
    const correlationId = opts.correlationId || null;
    try {
      const result = await RegionMapRepo.paginate(filter, opts);
      result.items = (result.items || []).map(sanitize);
      return result;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'regionMap.list.failed',
        actor: actorFromOpts(opts),
        target: { type: 'RegionMap', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Update by id (partial)
   */
  async updateById(id, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    try {
      const updated = await RegionMapRepo.updateById(id, update, opts);
      if (!updated) throw createError(404, 'RegionMap not found');
      await auditService.logEvent({
        eventType: 'regionMap.update.success',
        actor,
        target: { type: 'RegionMap', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { update }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'regionMap.update.failed',
        actor,
        target: { type: 'RegionMap', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Add a location to a region map
   */
  async addLocation(regionId, locPayload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!regionId) throw createError(400, 'regionId is required');

    try {
      const added = await RegionMapRepo.addLocation(regionId, locPayload, opts);
      if (!added) throw createError(404, 'RegionMap not found');
      await auditService.logEvent({
        eventType: 'regionMap.location.add.success',
        actor,
        target: { type: 'RegionMap', id: regionId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { locationId: added.locationId, name: added.name }
      });
      return sanitize(added);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'regionMap.location.add.failed',
        actor,
        target: { type: 'RegionMap', id: regionId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Update a nested location by locationId
   */
  async updateLocation(regionId, locationId, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!regionId) throw createError(400, 'regionId is required');
    if (!locationId) throw createError(400, 'locationId is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update is required');

    try {
      const updated = await RegionMapRepo.updateLocation(regionId, locationId, update, opts);
      if (!updated) throw createError(404, 'RegionMap or location not found');
      await auditService.logEvent({
        eventType: 'regionMap.location.update.success',
        actor,
        target: { type: 'RegionMap', id: regionId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { locationId, update }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'regionMap.location.update.failed',
        actor,
        target: { type: 'RegionMap', id: regionId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, locationId }
      });
      throw err;
    }
  }

  /**
   * Remove a location by locationId
   */
  async removeLocation(regionId, locationId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!regionId) throw createError(400, 'regionId is required');
    if (!locationId) throw createError(400, 'locationId is required');

    try {
      const doc = await RegionMapRepo.removeLocation(regionId, locationId, opts);
      if (!doc) throw createError(404, 'RegionMap not found');
      await auditService.logEvent({
        eventType: 'regionMap.location.remove.success',
        actor,
        target: { type: 'RegionMap', id: regionId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { locationId }
      });
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'regionMap.location.remove.failed',
        actor,
        target: { type: 'RegionMap', id: regionId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, locationId }
      });
      throw err;
    }
  }

  /**
   * Find nearest locations to a point
   */
  async findNearestLocations(lng, lat, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!isFinite(lng) || !isFinite(lat)) throw createError(400, 'lng and lat are required numbers');
    try {
      const results = await RegionMapRepo.findNearestLocations(lng, lat, opts);
      return results;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'regionMap.findNearest.failed',
        actor: actorFromOpts(opts),
        target: { type: 'RegionMap', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, lng, lat }
      });
      throw err;
    }
  }

  /**
   * Upsert region map by filter
   */
  async upsert(filter = {}, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!filter || Object.keys(filter).length === 0) throw createError(400, 'filter is required');

    try {
      const doc = await RegionMapRepo.upsert(filter, update, opts);
      await auditService.logEvent({
        eventType: 'regionMap.upsert.success',
        actor,
        target: { type: 'RegionMap', id: doc._id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { filter }
      });
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'regionMap.upsert.failed',
        actor,
        target: { type: 'RegionMap', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, filter }
      });
      throw err;
    }
  }

  /**
   * Bulk insert region maps
   */
  async bulkInsert(docs = [], opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!Array.isArray(docs) || docs.length === 0) return [];
    try {
      const inserted = await RegionMapRepo.bulkInsert(docs, opts);
      await auditService.logEvent({
        eventType: 'regionMap.bulkInsert.success',
        actor,
        target: { type: 'RegionMap', id: null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { count: inserted.length }
      });
      return inserted;
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
      throw err;
    }
  }

  /**
   * Delete by id (hard delete)
   */
  async deleteById(id, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');

    try {
      const removed = await RegionMapRepo.deleteById(id, opts);
      if (!removed) throw createError(404, 'RegionMap not found');
      await auditService.logEvent({
        eventType: 'regionMap.delete.hard.success',
        actor,
        target: { type: 'RegionMap', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'regionMap.delete.hard.failed',
        actor,
        target: { type: 'RegionMap', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Count documents
   */
  async count(filter = {}, opts = {}) {
    return RegionMapRepo.count(filter, opts);
  }

  /**
   * Start a mongoose session
   */
  async startSession() {
    return RegionMapRepo.startSession();
  }
}

module.exports = new RegionMapService();
