// src/services/salesWindow.service.js
/**
 * SalesWindow service
 * - Business logic for SalesWindow documents
 * - Delegates persistence to src/repositories/salesWindow.repo
 * - Emits audit events via src/services/audit.service
 *
 * Methods:
 * - create, getById, findByWindowRange, paginate, updateById, upsert, deleteById
 * - addOrUpdateItem, removeItem, getItemSnapshot, bulkInsert, getOverflowChain, count, startSession
 *
 * All methods accept opts = { actor, correlationId, session, ... } where appropriate.
 */

const createError = require('http-errors');
const SalesWindowRepo = require('../repositories/salesWindow.repo');
const auditService = require('./audit.service');

function actorFromOpts(opts = {}) {
  if (!opts) return { userId: null, role: null };
  if (opts.actor) return opts.actor;
  if (opts.user) {
    return {
      userId: opts.user && (opts.user.userId || opts.user._id) || null,
      role: opts.user && opts.user.role || null
    };
  }
  return { userId: null, role: null };
}

function sanitize(doc) {
  if (!doc) return doc;
  if (typeof doc.toObject === 'function') {
    const obj = doc.toObject();
    delete obj.__v;
    return obj;
  }
  // plain object
  const copy = { ...doc };
  if (copy && copy.__v !== undefined) delete copy.__v;
  return copy;
}

class SalesWindowService {
  async create(payload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!payload || typeof payload !== 'object') throw createError(400, 'payload is required');

    try {
      const created = await SalesWindowRepo.create(payload, { session: opts.session, lean: false });
      await auditService.logEvent({
        eventType: 'salesWindow.create.success',
        actor,
        target: { type: 'SalesWindow', id: created._id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { window: created.window }
      });
      return sanitize(created);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'salesWindow.create.failed',
        actor,
        target: { type: 'SalesWindow', id: null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message, payload: { window: payload.window } }
      });
      throw err;
    }
  }

  async getById(id, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');

    try {
      const doc = await SalesWindowRepo.findById(id, opts);
      if (!doc) throw createError(404, 'SalesWindow not found');
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'salesWindow.get.failed',
        actor: actorFromOpts(opts),
        target: { type: 'SalesWindow', id: id || null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  async findByWindowRange(fromEpoch, toEpoch, opts = {}) {
    const correlationId = opts.correlationId || null;
    try {
      const docs = await SalesWindowRepo.findByWindowRange(fromEpoch, toEpoch, opts);
      return (docs || []).map(sanitize);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'salesWindow.findByWindowRange.failed',
        actor: actorFromOpts(opts),
        target: { type: 'SalesWindow', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, fromEpoch, toEpoch }
      });
      throw err;
    }
  }

  async paginate(filter = {}, opts = {}) {
    const correlationId = opts.correlationId || null;
    try {
      const result = await SalesWindowRepo.paginate(filter, opts);
      result.items = (result.items || []).map(sanitize);
      return result;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'salesWindow.list.failed',
        actor: actorFromOpts(opts),
        target: { type: 'SalesWindow', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  async updateById(id, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update is required');

    try {
      const updated = await SalesWindowRepo.updateById(id, update, opts);
      if (!updated) throw createError(404, 'SalesWindow not found');
      await auditService.logEvent({
        eventType: 'salesWindow.update.success',
        actor,
        target: { type: 'SalesWindow', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { update }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'salesWindow.update.failed',
        actor,
        target: { type: 'SalesWindow', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  async addOrUpdateItem(windowId, productId, itemId, payload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, 'windowId is required');
    if (!productId) throw createError(400, 'productId is required');
    if (!itemId) throw createError(400, 'itemId is required');

    try {
      const result = await SalesWindowRepo.addOrUpdateItem(windowId, productId, itemId, payload, opts);
      await auditService.logEvent({
        eventType: 'salesWindow.item.addOrUpdate.success',
        actor,
        target: { type: 'SalesWindow', id: windowId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { productId, itemId, movedToOverflow: result && result.movedToOverflow }
      });
      return result;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'salesWindow.item.addOrUpdate.failed',
        actor,
        target: { type: 'SalesWindow', id: windowId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, productId, itemId }
      });
      throw err;
    }
  }

  async removeItem(windowId, productId, itemId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, 'windowId is required');
    if (!productId) throw createError(400, 'productId is required');
    if (!itemId) throw createError(400, 'itemId is required');

    try {
      const removed = await SalesWindowRepo.removeItem(windowId, productId, itemId, opts);
      await auditService.logEvent({
        eventType: 'salesWindow.item.remove.success',
        actor,
        target: { type: 'SalesWindow', id: windowId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { productId, itemId, removed: !!removed }
      });
      return removed;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'salesWindow.item.remove.failed',
        actor,
        target: { type: 'SalesWindow', id: windowId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, productId, itemId }
      });
      throw err;
    }
  }

  async getItemSnapshot(windowId, productId, itemId, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, 'windowId is required');
    if (!productId) throw createError(400, 'productId is required');
    if (!itemId) throw createError(400, 'itemId is required');

    try {
      const snapshot = await SalesWindowRepo.getItemSnapshot(windowId, productId, itemId, opts);
      return snapshot;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'salesWindow.item.get.failed',
        actor: actorFromOpts(opts),
        target: { type: 'SalesWindow', id: windowId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, productId, itemId }
      });
      throw err;
    }
  }

  async upsert(filter = {}, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!filter || Object.keys(filter).length === 0) throw createError(400, 'filter is required');

    try {
      const doc = await SalesWindowRepo.upsert(filter, update, opts);
      await auditService.logEvent({
        eventType: 'salesWindow.upsert.success',
        actor,
        target: { type: 'SalesWindow', id: doc && doc._id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { filter }
      });
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'salesWindow.upsert.failed',
        actor,
        target: { type: 'SalesWindow', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, filter }
      });
      throw err;
    }
  }

  async bulkInsert(docs = [], opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!Array.isArray(docs) || docs.length === 0) return [];

    try {
      const inserted = await SalesWindowRepo.bulkInsert(docs, opts);
      await auditService.logEvent({
        eventType: 'salesWindow.bulkInsert.success',
        actor,
        target: { type: 'SalesWindow', id: null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { count: inserted.length }
      });
      return inserted;
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
      throw err;
    }
  }

  async deleteById(id, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');

    try {
      const removed = await SalesWindowRepo.deleteById(id, opts);
      if (!removed) throw createError(404, 'SalesWindow not found');
      await auditService.logEvent({
        eventType: 'salesWindow.delete.hard.success',
        actor,
        target: { type: 'SalesWindow', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'salesWindow.delete.hard.failed',
        actor,
        target: { type: 'SalesWindow', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  async count(filter = {}, opts = {}) {
    try {
      return SalesWindowRepo.count(filter, opts);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'salesWindow.count.failed',
        actor: actorFromOpts(opts),
        target: { type: 'SalesWindow', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId: opts.correlationId || null,
        details: { message: err.message }
      });
      throw err;
    }
  }

  async getOverflowChain(startWindowId, opts = {}) {
    try {
      return SalesWindowRepo.getOverflowChain(startWindowId, opts);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'salesWindow.overflowChain.failed',
        actor: actorFromOpts(opts),
        target: { type: 'SalesWindow', id: startWindowId || null },
        outcome: 'failure',
        severity: 'error',
        correlationId: opts.correlationId || null,
        details: { message: err.message }
      });
      throw err;
    }
  }

  async startSession() {
    return SalesWindowRepo.startSession();
  }
}

module.exports = new SalesWindowService();
