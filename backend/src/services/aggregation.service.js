// src/services/aggregation.service.js
//
// Service layer for Aggregation domain.
// - Performs input sanitization and business-level checks.
// - Delegates persistence to Aggregation repository.
// - Emits service-level audit logs via src/services/audit.service.js.
// - Returns plain objects safe for clients.

const createError = require('http-errors');
const AggregationRepo = require('../repositories/aggregation.repo');
const auditService = require('./audit.service');
const Item = require('../models/item.model');
const Aggregation = require('../models/aggregation.model');

function sanitizeForClient(doc) {
  if (!doc) return doc;
  const copy = { ...doc };
  // remove any internal-only fields if present (none expected by default)
  return copy;
}

/**
 * Build audit actor from opts (best-effort).
 */
function actorFromOpts(opts = {}) {
  if (!opts) return {};
  if (opts.actor) return opts.actor;
  if (opts.user) return { userId: opts.user.userId || opts.user._id, role: opts.user.role || null };
  return {};
}

class AggregationService {
  /**
   * Create an aggregation.
   * - Logs audit event (create.aggregation).
   *
   * @param {Object} payload
   * @param {Object} [opts] - { session, actor, correlationId }
   * @returns {Promise<Object>}
   */
  async createAggregation(payload = {}, opts = {}) {
    if (!payload || typeof payload !== 'object') throw createError(400, 'Invalid payload');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const doc = { ...payload };
    delete doc._id;
    delete doc.createdAt;
    delete doc.updatedAt;

    try {
      const created = await AggregationRepo.create(doc, { session: opts.session });
      await auditService.logEvent({
        eventType: 'create.aggregation',
        actor,
        target: created._id || created.id,
        outcome: 'success',
        correlationId,
        details: { aggregationId: created._id || created.id }
      });
      return sanitizeForClient(created);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'create.aggregation',
        actor,
        target: doc && doc.ops_region ? doc.ops_region : undefined,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Get aggregation by id
   * @param {String|ObjectId} id
   * @param {Object} [opts] - { select, populate }
   */
  async getById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const agg = await AggregationRepo.findById(id, opts);
    if (!agg) throw createError(404, 'Aggregation not found');
    return sanitizeForClient(agg);
  }

  /**
   * Find aggregations by itemId
   * @param {String|ObjectId} itemId
   * @param {Object} [opts]
   */
  async findByItemId(itemId, opts = {}) {
    if (!itemId) throw createError(400, 'itemId is required');
    const results = await AggregationRepo.findByItemId(itemId, opts);
    return (results || []).map(sanitizeForClient);
  }

  /**
   * List / paginate aggregations
   * @param {Object} filter
   * @param {Object} opts - { page, limit, sort, select, populate }
   */
  async listAggregations(filter = {}, opts = {}) {
    const f = typeof filter === 'object' && filter !== null ? { ...filter } : {};
    const result = await AggregationRepo.paginate(f, opts);
    result.items = (result.items || []).map(sanitizeForClient);
    return result;
  }

  /**
   * Update aggregation by id
   * - Logs audit event (update.aggregation).
   *
   * @param {String|ObjectId} id
   * @param {Object} update
   * @param {Object} [opts] - { new, populate, actor, correlationId }
   */
  async updateById(id, update = {}, opts = { new: true }) {
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const payload = { ...update };
    delete payload._id;
    delete payload.createdAt;

    try {
      const updated = await AggregationRepo.updateById(id, payload, opts);
      if (!updated) {
        await auditService.logEvent({
          eventType: 'update.aggregation',
          actor,
          target: id,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'Aggregation not found');
      }
      await auditService.logEvent({
        eventType: 'update.aggregation',
        actor,
        target: id,
        outcome: 'success',
        correlationId,
        details: { update: payload }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'update.aggregation',
        actor,
        target: id,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Update one aggregation by filter
   * - Logs audit event (update.aggregation).
   */
  async updateOne(filter = {}, update = {}, opts = {}) {
    if (!filter || Object.keys(filter).length === 0) throw createError(400, 'filter is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const payload = { ...update };
    delete payload._id;
    delete payload.createdAt;

    try {
      const updated = await AggregationRepo.updateOne(filter, payload, opts);
      if (!updated) {
        await auditService.logEvent({
          eventType: 'update.aggregation',
          actor,
          target: filter,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'Aggregation not found');
      }
      await auditService.logEvent({
        eventType: 'update.aggregation',
        actor,
        target: filter,
        outcome: 'success',
        correlationId,
        details: { update: payload }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'update.aggregation',
        actor,
        target: filter,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Add an order id to aggregation.orders (idempotent)
   * - Logs audit event (aggregation.addOrder).
   */
  async addOrder(aggregationId, orderId, opts = {}) {
    if (!aggregationId || !orderId) throw createError(400, 'aggregationId and orderId are required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const updated = await AggregationRepo.addOrder(aggregationId, orderId);
      if (!updated) {
        await auditService.logEvent({
          eventType: 'aggregation.addOrder',
          actor,
          target: aggregationId,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'Aggregation not found');
      }
      await auditService.logEvent({
        eventType: 'aggregation.addOrder',
        actor,
        target: aggregationId,
        outcome: 'success',
        correlationId,
        details: { orderId }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'aggregation.addOrder',
        actor,
        target: aggregationId,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Mark aggregation as processed
   * - Logs audit event (aggregation.markProcessed).
   */
  async markProcessed(aggregationId, opts = {}) {
    if (!aggregationId) throw createError(400, 'aggregationId is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const updated = await AggregationRepo.markProcessed(aggregationId);
      if (!updated) {
        await auditService.logEvent({
          eventType: 'aggregation.markProcessed',
          actor,
          target: aggregationId,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'Aggregation not found');
      }
      await auditService.logEvent({
        eventType: 'aggregation.markProcessed',
        actor,
        target: aggregationId,
        outcome: 'success',
        correlationId,
        details: {}
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'aggregation.markProcessed',
        actor,
        target: aggregationId,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Hard delete by id (permanent removal)
   * - Logs audit event (delete.aggregation.hard).
   */
  async hardDeleteById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const removed = await AggregationRepo.hardDeleteById(id);
      if (!removed) {
        await auditService.logEvent({
          eventType: 'delete.aggregation.hard',
          actor,
          target: id,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'Aggregation not found');
      }
      await auditService.logEvent({
        eventType: 'delete.aggregation.hard',
        actor,
        target: id,
        outcome: 'success',
        correlationId,
        details: {}
      });
      return sanitizeForClient(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'delete.aggregation.hard',
        actor,
        target: id,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Bulk insert aggregations
   * - Logs a single audit event summarizing the bulk operation.
   */
  async bulkCreate(docs = [], opts = {}) {
    if (!Array.isArray(docs) || docs.length === 0) throw createError(400, 'docs must be a non-empty array');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const inserted = await AggregationRepo.bulkInsert(docs, { session: opts.session });
      await auditService.logEvent({
        eventType: 'create.aggregation.bulk',
        actor,
        target: undefined,
        outcome: 'success',
        correlationId,
        details: { count: Array.isArray(inserted) ? inserted.length : 0 }
      });
      const plain = (inserted || []).map((d) => (d && d.toObject ? d.toObject() : d));
      return plain.map(sanitizeForClient);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'create.aggregation.bulk',
        actor,
        target: undefined,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Get aggregated demand and tier progress for the logged-in supplier
   * @param {String|ObjectId} supplierId
   * @returns {Promise<Array>}
   */
  async getSupplierDemandStatus(supplierId) {
    if (!supplierId) throw createError(401, 'Supplier authentication required');
    const supplierIdStr = supplierId.toString(); // 👈 force string
    // this getSupplierDemandStatus is using two collections aggregation and items


    const aggregations = await Aggregation.find({
      'itemDtos.supplierId': supplierIdStr, // 👈 match as string

      'itemDtos.supplierId': supplierId,
      status: { $nin: ['suspended', 'closed'] }
    }).lean();
    console.log("📦 aggregations found:", aggregations.length); // add this to verify


    if (!aggregations.length) return [];

    const results = [];

    for (const agg of aggregations) {
      const supplierDtos = agg.itemDtos.filter(
        (dto) => String(dto.supplierId) === String(supplierId)
      );

      for (const dto of supplierDtos) {
        const item = await Item.findById(dto.itemId).lean();
        if (!item) continue;

        const currentDemand = agg.orders?.length || 0;
        const sortedTiers = [...(item.pricingTiers || [])].sort((a, b) => a.minQty - b.minQty);

        let currentTierIndex = -1;
        for (let i = 0; i < sortedTiers.length; i++) {
          if (currentDemand >= sortedTiers[i].minQty) currentTierIndex = i;
        }

        const isMaxTier = currentTierIndex === sortedTiers.length - 1 && currentTierIndex >= 0;
        const currentTier = currentTierIndex >= 0 ? sortedTiers[currentTierIndex] : null;
        const nextTier = !isMaxTier && currentTierIndex + 1 < sortedTiers.length
          ? sortedTiers[currentTierIndex + 1]
          : null;

        let progressPercent = 0;
        if (isMaxTier) {
          progressPercent = 100;
        } else if (nextTier) {
          const from = currentTier ? currentTier.minQty : 0;
          progressPercent = Math.min(100, Math.round(
            ((currentDemand - from) / (nextTier.minQty - from)) * 100
          ));
        }

        results.push({
          itemId: item._id,
          title: item.title,
          category: item.tags?.[0] || item.shipping?.class || 'General',
          images: item.images || [],
          ops_region: agg.ops_region,
          currentDemand,
          currentTier: currentTier
            ? { tierIndex: currentTierIndex + 1, minQty: currentTier.minQty, price: currentTier.price }
            : null,
          nextTier: nextTier
            ? { tierIndex: currentTierIndex + 2, minQty: nextTier.minQty, price: nextTier.price }
            : null,
          isMaxTier,
          progressPercent,
          aggregationId: agg._id,
          aggregationStatus: agg.status,
        });
      }
    }

    return results;
  }

  /**
   * Count aggregations matching filter
   */
  async count(filter = {}) {
    const f = typeof filter === 'object' && filter !== null ? { ...filter } : {};
    return AggregationRepo.count(f);
  }

  /**
   * Start a transaction session
   */
  async startSession() {
    return AggregationRepo.startSession();
  }
}

module.exports = new AggregationService();
