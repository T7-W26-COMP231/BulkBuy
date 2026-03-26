// src/services/item.service.js
/**
 * Item service
 * - Business logic for Item documents
 * - Delegates persistence to src/repositories/item.repo
 * - Emits audit events via src/services/audit.service
 *
 * Methods:
 * - create, getById, findBySku, paginate, updateById, upsert, bulkInsert
 * - adjustStock, reserve, release, applyRating
 * - softDeleteById, hardDeleteById, publish/unpublish
 *
 * All methods accept opts = { actor, correlationId, session, ... } where appropriate.
 */

const createError = require('http-errors');
const ItemRepo = require('../repositories/item.repo');
const auditService = require('./audit.service');

function actorFromOpts(opts = {}) {
  if (!opts) return { userId: null, role: null };
  if (opts.actor) return opts.actor;
  if (opts.user) return { userId: opts.user && (opts.user.userId || opts.user._id) || null, role: opts.user && opts.user.role || null };
  return { userId: null, role: null };
}

function sanitize(doc) {
  if (!doc) return doc;
  // If mongoose doc, convert to plain object
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  // Remove internal fields if present
  delete obj.__v;
  return obj;
}

function resolveCurrentPrice(item = {}) {
  const now = new Date();

  const prices = Array.isArray(item.price) ? item.price : [];
  const activePrice = prices.find((p) => {
    const fromOk = !p.effectiveFrom || new Date(p.effectiveFrom) <= now;
    const toOk = !p.effectiveTo || new Date(p.effectiveTo) >= now;
    return fromOk && toOk;
  });

  if (!activePrice) {
    return {
      value: 0,
      currency: 'USD'
    };
  }

  return {
    value: activePrice.sale ?? activePrice.list ?? 0,
    currency: activePrice.currency || 'USD'
  };
}

function resolveTierInfo(item = {}) {
  const tiers = Array.isArray(item.pricingTiers)
    ? [...item.pricingTiers].sort((a, b) => a.minQty - b.minQty)
    : [];

  if (tiers.length === 0) {
    return {
      currentTierLabel: 'Tier 1',
      nextTierLabel: null,
      nextThresholdQty: null
    };
  }

  // For now, treat first tier as current baseline if no demand/group qty is stored yet
  const currentTier = tiers[0];
  const nextTier = tiers[1] || null;

  return {
    currentTierLabel: `Tier ${tiers.indexOf(currentTier) + 1}`,
    nextTierLabel: nextTier ? `Tier ${tiers.indexOf(nextTier) + 1}` : null,
    nextThresholdQty: nextTier ? nextTier.minQty : null
  };
}

function resolvePrimaryImage(item = {}) {
  // If later you populate S3/media, swap this logic accordingly.
  // For now it safely supports a few possible locations.
  if (item.imageUrl) return item.imageUrl;

  if (Array.isArray(item.media) && item.media.length > 0) {
    const mediaImage = item.media.find((m) => m.type === 'image' && m.url);
    if (mediaImage?.url) return mediaImage.url;
  }

  if (item.metadata && typeof item.metadata.get === 'function') {
    const metaImage = item.metadata.get('imageUrl');
    if (metaImage) return metaImage;
  }

  if (item.metadata && item.metadata.imageUrl) {
    return item.metadata.imageUrl;
  }

  return null;
}

function mapCatalogItem(item = {}) {
  const safe = sanitize(item);
  const price = resolveCurrentPrice(safe);
  const tierInfo = resolveTierInfo(safe);

  return {
    _id: safe._id,
    sku: safe.sku,
    title: safe.title,
    slug: safe.slug,
    shortDescription: safe.shortDescription || safe.description || '',
    image: resolvePrimaryImage(safe),
    currentPrice: price.value,
    currency: price.currency,
    currentTierLabel: tierInfo.currentTierLabel,
    nextTierLabel: tierInfo.nextTierLabel,
    nextThresholdQty: tierInfo.nextThresholdQty,
    published: safe.published,
    status: safe.status
  };
}

class ItemService {
  /**
   * Create an item
   * @param {Object} payload
   * @param {Object} opts - { actor, correlationId, session }
   */
  async create(payload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!payload || typeof payload !== 'object') throw createError(400, 'payload is required');

    try {
      const created = await ItemRepo.create(payload, { session: opts.session, lean: false });
      await auditService.logEvent({
        eventType: 'item.create.success',
        actor,
        target: { type: 'Item', id: created._id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { sku: created.sku }
      });
      return sanitize(created);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.create.failed',
        actor,
        target: { type: 'Item', id: null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message, payload: { sku: payload && payload.sku } }
      });
      throw err;
    }
  }

  /**
   * Get item by id
   */
  async getById(id, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    try {
      const doc = await ItemRepo.findById(id, opts);
      if (!doc) throw createError(404, 'Item not found');
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.get.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Item', id: id || null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Find item by SKU
   */
  async findBySku(sku, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!sku) throw createError(400, 'sku is required');
    try {
      const doc = await ItemRepo.findBySku(sku, opts);
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.findBySku.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Item', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, sku }
      });
      throw err;
    }
  }

  /**
   * Paginate items
   */
  async paginate(filter = {}, opts = {}) {
    const correlationId = opts.correlationId || null;
    try {
      const result = await ItemRepo.paginate(filter, opts);
      result.items = (result.items || []).map(sanitize);
      return result;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.list.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Item', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Public catalog for marketplace page
   */
  async getCatalog(filters = {}, opts = {}) {
    const correlationId = opts.correlationId || null;

    try {
      const result = await ItemRepo.getCatalogItems(filters, opts);

      return {
        ...result,
        items: (result.items || []).map(mapCatalogItem)
      };
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.catalog.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Item', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Update item by id (partial)
   */
  async updateById(id, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    try {
      const updated = await ItemRepo.updateById(id, update, opts);
      if (!updated) throw createError(404, 'Item not found');
      await auditService.logEvent({
        eventType: 'item.update.success',
        actor,
        target: { type: 'Item', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { update }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.update.failed',
        actor,
        target: { type: 'Item', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Upsert item by filter
   */
  async upsert(filter = {}, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!filter || Object.keys(filter).length === 0) throw createError(400, 'filter is required');

    try {
      const doc = await ItemRepo.upsert(filter, update, opts);
      await auditService.logEvent({
        eventType: 'item.upsert.success',
        actor,
        target: { type: 'Item', id: doc._id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { filter }
      });
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.upsert.failed',
        actor,
        target: { type: 'Item', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, filter }
      });
      throw err;
    }
  }

  /**
   * Bulk insert items
   */
  async bulkInsert(docs = [], opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!Array.isArray(docs) || docs.length === 0) return [];
    try {
      const inserted = await ItemRepo.bulkInsert(docs, opts);
      await auditService.logEvent({
        eventType: 'item.bulkInsert.success',
        actor,
        target: { type: 'Item', id: null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { count: inserted.length }
      });
      return inserted;
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
      throw err;
    }
  }

  /**
   * Adjust stock by delta (delegates to repo)
   */
  async adjustStock(id, delta = 0, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    if (!Number.isFinite(delta)) throw createError(400, 'delta must be a number');

    try {
      const inventory = await ItemRepo.adjustStock(id, delta, opts);
      await auditService.logEvent({
        eventType: 'item.inventory.adjust.success',
        actor,
        target: { type: 'Item', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { delta }
      });
      return inventory;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.inventory.adjust.failed',
        actor,
        target: { type: 'Item', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, delta }
      });
      throw err;
    }
  }

  /**
   * Reserve quantity
   */
  async reserve(id, qty = 1, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    qty = Number(qty) || 0;
    if (qty <= 0) throw createError(400, 'qty must be > 0');

    try {
      const inventory = await ItemRepo.reserve(id, qty, opts);
      await auditService.logEvent({
        eventType: 'item.inventory.reserve.success',
        actor,
        target: { type: 'Item', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { qty }
      });
      return inventory;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.inventory.reserve.failed',
        actor,
        target: { type: 'Item', id },
        outcome: 'failure',
        severity: 'warning',
        correlationId,
        details: { message: err.message, qty }
      });
      throw err;
    }
  }

  /**
   * Release reserved quantity
   */
  async release(id, qty = 1, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    qty = Number(qty) || 0;
    if (qty <= 0) throw createError(400, 'qty must be > 0');

    try {
      const inventory = await ItemRepo.release(id, qty, opts);
      await auditService.logEvent({
        eventType: 'item.inventory.release.success',
        actor,
        target: { type: 'Item', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { qty }
      });
      return inventory;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.inventory.release.failed',
        actor,
        target: { type: 'Item', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, qty }
      });
      throw err;
    }
  }

  /**
   * Apply rating to item (delegates to model instance method via repo update)
   * - This service expects the repo to return the updated document
   */
  async applyRating(id, rating = 0, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    rating = Number(rating) || 0;
    if (rating <= 0) throw createError(400, 'rating must be > 0');

    try {
      // Fetch item, call instance method, return sanitized result
      const itemDoc = await ItemRepo.findById(id, { session: opts.session });
      if (!itemDoc) throw createError(404, 'Item not found');

      // If repo returned a plain object (lean), re-fetch as document to use instance method
      let updated;
      if (typeof itemDoc.applyRating === 'function') {
        updated = await itemDoc.applyRating(rating);
        // applyRating returns inventory/rating object; fetch full doc
        const full = await ItemRepo.findById(id, { session: opts.session });
        updated = full;
      } else {
        // Fallback: compute new avg/count and persist
        const current = itemDoc.ratings || { avg: 0, count: 0 };
        const total = (current.avg || 0) * (current.count || 0);
        const newCount = (current.count || 0) + 1;
        const newAvg = (total + rating) / newCount;
        const payload = { 'ratings.avg': Number(newAvg.toFixed(2)), 'ratings.count': newCount };
        updated = await ItemRepo.updateById(id, { $set: payload }, { session: opts.session, new: true });
      }

      await auditService.logEvent({
        eventType: 'item.rating.apply.success',
        actor,
        target: { type: 'Item', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { rating }
      });

      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.rating.apply.failed',
        actor,
        target: { type: 'Item', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, rating }
      });
      throw err;
    }
  }

  /**
   * Soft delete item by id
   */
  async softDeleteById(id, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');

    try {
      const removed = await ItemRepo.softDeleteById(id, opts);
      if (!removed) throw createError(404, 'Item not found');
      await auditService.logEvent({
        eventType: 'item.delete.soft.success',
        actor,
        target: { type: 'Item', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.delete.soft.failed',
        actor,
        target: { type: 'Item', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Hard delete item by id (admin usage expected)
   */
  async hardDeleteById(id, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');

    try {
      const removed = await ItemRepo.deleteById(id, opts);
      if (!removed) throw createError(404, 'Item not found');

      // Best-effort: additional cleanup (e.g., remove references) can be performed here

      await auditService.logEvent({
        eventType: 'item.delete.hard.success',
        actor,
        target: { type: 'Item', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.delete.hard.failed',
        actor,
        target: { type: 'Item', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Publish item
   */
  async publish(id, opts = {}) {
    return this.updateById(id, { $set: { published: true } }, opts);
  }

  /**
   * Unpublish item
   */
  async unpublish(id, opts = {}) {
    return this.updateById(id, { $set: { published: false } }, opts);
  }

  /**
   * Public search wrapper
   */
  async publicSearch(q = null, opts = {}) {
    try {
      const result = await ItemRepo.publicSearch(q, opts);
      result.results = (result.results || []).map(sanitize);
      return result;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'item.search.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Item', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId: opts.correlationId || null,
        details: { message: err.message }
      });
      throw err;
    }
  }
}

module.exports = new ItemService();
