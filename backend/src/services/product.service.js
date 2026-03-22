// src/services/product.service.js
//
// Service layer for Product domain.
// - Performs input sanitization and business-level validation.
// - Delegates persistence to repositories.
// - Emits service-level audit logs via src/services/audit.service.js.
// - Returns plain objects safe for clients (no internal-only fields).

const createError = require('http-errors');
const ProductRepo = require('../repositories/product.repo');
const auditService = require('./audit.service');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;

/**
 * Helper to sanitize product objects returned to clients.
 * Removes internal-only fields if present.
 */
function sanitizeForClient(doc) {
  if (!doc) return doc;
  const copy = { ...doc };
  if (copy.deletedAt === null) delete copy.deletedAt;
  if (copy.deletedBy === null) delete copy.deletedBy;
  if (copy.deleted === undefined) delete copy.deleted;
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

class ProductService {
  /**
   * Create a product.
   * - Logs audit event (create.product).
   *
   * @param {Object} payload
   * @param {Object} [opts] - { session, actor, correlationId }
   * @returns {Promise<Object>} created product (plain object)
   */
  async createProduct(payload = {}, opts = {}) {
    if (!payload || typeof payload !== 'object') throw createError(400, 'Invalid payload');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    // sanitize client-provided fields
    const doc = { ...payload };
    delete doc._id;
    delete doc.createdAt;
    delete doc.updatedAt;
    delete doc.deleted;
    delete doc.deletedAt;
    delete doc.deletedBy;
    delete doc.status; // status controlled by business logic if needed

    try {
      const created = await ProductRepo.create(doc, { session: opts.session });
      await auditService.logEvent({
        eventType: 'create.product',
        actor,
        target: created._id || created.id || created.userId || created.name,
        outcome: 'success',
        correlationId,
        details: { productId: created._id || created.id }
      });
      return sanitizeForClient(created);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'create.product',
        actor,
        target: doc.name || undefined,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Get product by Mongo _id
   * @param {String|ObjectId} id
   * @param {Object} [opts] - { select, populate, includeDeleted=false }
   */
  async getProductById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const product = await ProductRepo.findById(id, opts);
    if (!product) throw createError(404, 'Product not found');
    return sanitizeForClient(product);
  }

  /**
   * Find products by itemId
   * @param {String|ObjectId} itemId
   * @param {Object} [opts]
   */
  async findByItemId(itemId, opts = {}) {
    if (!itemId) throw createError(400, 'itemId is required');
    const results = await ProductRepo.findByItemId(itemId, opts);
    return (results || []).map(sanitizeForClient);
  }

  /**
   * Generic search / list with pagination
   * @param {Object} filter
   * @param {Object} opts - { page, limit, sort, select, populate, includeDeleted=false }
   */
  async listProducts(filter = {}, opts = {}) {
    const f = typeof filter === 'object' && filter !== null ? { ...filter } : {};
    const page = Math.max(DEFAULT_PAGE, parseInt(opts.page, 10) || DEFAULT_PAGE);
    const limit = Math.max(1, parseInt(opts.limit, 10) || DEFAULT_LIMIT);

    const paginateOpts = {
      page,
      limit,
      sort: opts.sort,
      select: opts.select,
      populate: opts.populate,
      includeDeleted: !!opts.includeDeleted
    };

    const result = await ProductRepo.paginate(f, paginateOpts);
    result.items = (result.items || []).map(sanitizeForClient);
    return result;
  }

  /**
   * Public search for products (text search + filters)
   * @param {String|null} q
   * @param {Object} opts - { page, limit, sort, filters, select, populate }
   */
  async publicSearch(q = null, opts = {}) {
    const filters = opts.filters && typeof opts.filters === 'object' ? { ...opts.filters } : {};
    const searchOpts = {
      limit: opts.limit,
      skip: opts.skip,
      sort: opts.sort,
      filters,
      select: opts.select,
      populate: opts.populate
    };
    const res = await ProductRepo.publicSearch(q, searchOpts);
    res.results = (res.results || []).map(sanitizeForClient);
    return { total: res.total, items: res.results };
  }

  /**
   * Update product by _id
   * - Logs audit event (update.product).
   *
   * @param {String|ObjectId} id
   * @param {Object} update
   * @param {Object} [opts] - { new, populate, includeDeleted=false, actor, correlationId }
   */
  async updateById(id, update = {}, opts = { new: true }) {
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const payload = { ...update };
    delete payload._id;
    delete payload.createdAt;
    delete payload.deleted;
    delete payload.deletedAt;
    delete payload.deletedBy;

    try {
      const updated = await ProductRepo.updateById(id, payload, opts);
      if (!updated) throw createError(404, 'Product not found');
      await auditService.logEvent({
        eventType: 'update.product',
        actor,
        target: id,
        outcome: 'success',
        correlationId,
        details: { update: payload }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'update.product',
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
   * Update one product by filter
   * - Logs audit event (update.product).
   */
  async updateOne(filter = {}, update = {}, opts = {}) {
    if (!filter || Object.keys(filter).length === 0) throw createError(400, 'filter is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const payload = { ...update };
    delete payload._id;
    delete payload.createdAt;
    delete payload.deleted;
    delete payload.deletedAt;
    delete payload.deletedBy;

    try {
      const updated = await ProductRepo.updateOne(filter, payload, opts);
      if (!updated) throw createError(404, 'Product not found');
      await auditService.logEvent({
        eventType: 'update.product',
        actor,
        target: filter,
        outcome: 'success',
        correlationId,
        details: { update: payload }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'update.product',
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
   * Upsert product
   * - Logs audit event (upsert.product).
   */
  async upsertProduct(filter = {}, update = {}, opts = {}) {
    if (!filter || Object.keys(filter).length === 0) throw createError(400, 'filter is required for upsert');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const payload = { ...update };
    delete payload._id;
    delete payload.createdAt;
    delete payload.deleted;
    delete payload.deletedAt;
    delete payload.deletedBy;

    try {
      const doc = await ProductRepo.upsert(filter, payload, opts);
      await auditService.logEvent({
        eventType: 'upsert.product',
        actor,
        target: filter,
        outcome: 'success',
        correlationId,
        details: { upsert: payload }
      });
      return sanitizeForClient(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'upsert.product',
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
   * Soft-delete product by _id (service-level delete)
   * - Logs audit event (delete.product.soft).
   */
  async deleteProductById(id, deletedBy = null, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const deleted = await ProductRepo.softDeleteById(id, deletedBy);
      if (!deleted) throw createError(404, 'Product not found');
      await auditService.logEvent({
        eventType: 'delete.product.soft',
        actor,
        target: id,
        outcome: 'success',
        correlationId,
        details: { deletedBy }
      });
      return sanitizeForClient(deleted);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'delete.product.soft',
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
   * Restore a soft-deleted product
   * - Logs audit event (restore.product).
   */
  async restoreProductById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const restored = await ProductRepo.restoreById(id);
      if (!restored) throw createError(404, 'Product not found');
      await auditService.logEvent({
        eventType: 'restore.product',
        actor,
        target: id,
        outcome: 'success',
        correlationId,
        details: {}
      });
      return sanitizeForClient(restored);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'restore.product',
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
   * Hard delete by _id (permanent removal)
   * - Admin-only usage expected; service may restrict access.
   * - Logs audit event (delete.product.hard).
   */
  async hardDeleteById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const removed = await ProductRepo.hardDeleteById(id);
      if (!removed) throw createError(404, 'Product not found');
      await auditService.logEvent({
        eventType: 'delete.product.hard',
        actor,
        target: id,
        outcome: 'success',
        correlationId,
        details: {}
      });
      return sanitizeForClient(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'delete.product.hard',
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
   * Bulk insert products
   * - Logs a single audit event summarizing the bulk operation.
   */
  async bulkCreate(docs = [], opts = {}) {
    if (!Array.isArray(docs) || docs.length === 0) throw createError(400, 'docs must be a non-empty array');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const inserted = await ProductRepo.bulkInsert(docs, { session: opts.session });
      await auditService.logEvent({
        eventType: 'create.product.bulk',
        actor,
        target: undefined,
        outcome: 'success',
        correlationId,
        details: { count: Array.isArray(inserted) ? inserted.length : 0 }
      });
      // insertMany returns docs (not lean), convert to plain objects
      const plain = (inserted || []).map((d) => (d && d.toObject ? d.toObject() : d));
      return plain.map(sanitizeForClient);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'create.product.bulk',
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
   * Count products matching filter
   */
  async countProducts(filter = {}, opts = {}) {
    const f = typeof filter === 'object' && filter !== null ? { ...filter } : {};
    return ProductRepo.count(f, opts);
  }

  /**
   * Start a transaction session
   */
  async startSession() {
    return ProductRepo.startSession();
  }
}

module.exports = new ProductService();
