// src/services/order.service.js
//
// Service layer for Order domain.
// "Service layer for Order domain. - Performs input sanitization and business-level checks."
// "Delegates persistence to Order repository. - Emits service-level audit logs via src/services/audit.service.js."
//
// - Returns plain objects safe for clients.
// - Exposes item-level helpers for cart operations: addItem, setItemQuantity, updateItem, removeItem, extractSaveForLater.
//
// Note: status "draft" represents a user's shopping cart. When an order is submitted,
// a new blank draft may be created and saveForLater items carried over.

const createError = require('http-errors');
const OrderRepo = require('../repositories/order.repo');
const auditService = require('./audit.service');

function sanitizeForClient(doc) {
  if (!doc) return doc;
  const copy = { ...doc };
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

class OrderService {
  /* -------------------------
   * Core CRUD
   * ------------------------- */

  async createOrder(payload = {}, opts = {}) {
    if (!payload || typeof payload !== 'object') throw createError(400, 'Invalid payload');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const doc = { ...payload };
    delete doc._id;
    delete doc.createdAt;
    delete doc.updatedAt;

    if (!doc.userId) throw createError(422, 'userId is required to create an order');
    if (!Array.isArray(doc.items)) doc.items = [];

    try {
      const created = await OrderRepo.create(doc, { session: opts.session });
      await auditService.logEvent({
        eventType: 'create.order',
        actor,
        target: created._id || created.id,
        outcome: 'success',
        correlationId,
        details: { orderId: created._id || created.id, status: created.status }
      });
      return sanitizeForClient(created);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'create.order',
        actor,
        target: doc && doc.userId ? doc.userId : undefined,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  async getById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const order = await OrderRepo.findById(id, opts);
    if (!order) throw createError(404, 'Order not found');
    return sanitizeForClient(order);
  }

  async findByUserId(userId, opts = {}) {
    if (!userId) throw createError(400, 'userId is required');
    const results = await OrderRepo.findByUserId(userId, opts);
    return (results || []).map(sanitizeForClient);
  }

  async listOrders(filter = {}, opts = {}) {
    const f = typeof filter === 'object' && filter !== null ? { ...filter } : {};
    const result = await OrderRepo.paginate(f, opts);
    result.items = (result.items || []).map(sanitizeForClient);
    return result;
  }

  async updateById(id, update = {}, opts = { new: true }) {
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const payload = { ...update };
    delete payload._id;
    delete payload.createdAt;

    try {
      const updated = await OrderRepo.updateById(id, payload, opts);
      if (!updated) {
        await auditService.logEvent({
          eventType: 'update.order',
          actor,
          target: id,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'Order not found');
      }
      await auditService.logEvent({
        eventType: 'update.order',
        actor,
        target: id,
        outcome: 'success',
        correlationId,
        details: { update: payload }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'update.order',
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

  async updateOne(filter = {}, update = {}, opts = {}) {
    if (!filter || Object.keys(filter).length === 0) throw createError(400, 'filter is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const payload = { ...update };
    delete payload._id;
    delete payload.createdAt;

    try {
      const updated = await OrderRepo.updateOne(filter, payload, opts);
      if (!updated) {
        await auditService.logEvent({
          eventType: 'update.order',
          actor,
          target: filter,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'Order not found');
      }
      await auditService.logEvent({
        eventType: 'update.order',
        actor,
        target: filter,
        outcome: 'success',
        correlationId,
        details: { update: payload }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'update.order',
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

  /* -------------------------
   * Messages & status
   * ------------------------- */

  async addMessage(orderId, messageId, opts = {}) {
    if (!orderId || !messageId) throw createError(400, 'orderId and messageId are required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const updated = await OrderRepo.addMessage(orderId, messageId);
      if (!updated) {
        await auditService.logEvent({
          eventType: 'order.addMessage',
          actor,
          target: orderId,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'Order not found');
      }
      await auditService.logEvent({
        eventType: 'order.addMessage',
        actor,
        target: orderId,
        outcome: 'success',
        correlationId,
        details: { messageId }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'order.addMessage',
        actor,
        target: orderId,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  async updateStatus(orderId, status, opts = {}) {
    if (!orderId || !status) throw createError(400, 'orderId and status are required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const updated = await OrderRepo.updateStatus(orderId, status);
      if (!updated) {
        await auditService.logEvent({
          eventType: 'order.updateStatus',
          actor,
          target: orderId,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'Order not found');
      }
      await auditService.logEvent({
        eventType: 'order.updateStatus',
        actor,
        target: orderId,
        outcome: 'success',
        correlationId,
        details: { status }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'order.updateStatus',
        actor,
        target: orderId,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /* -------------------------
   * Cart / item-level operations
   * ------------------------- */

  /**
   * Add or increment an item in the order (cart).
   * - item: { productId, itemId, pricingSnapshot?, saveForLater?, quantity? }
   */
  async addItem(orderId, item = {}, opts = {}) {
    if (!orderId) throw createError(400, 'orderId is required');
    if (!item || typeof item !== 'object') throw createError(400, 'item is required');
    if (!item.itemId || !item.productId) throw createError(400, 'item.productId and item.itemId are required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const updated = await OrderRepo.addItem(orderId, item, { session: opts.session, select: opts.select, populate: opts.populate });
      if (!updated) {
        await auditService.logEvent({
          eventType: 'order.addItem',
          actor,
          target: orderId,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found', itemId: item.itemId }
        });
        throw createError(404, 'Order not found');
      }
      await auditService.logEvent({
        eventType: 'order.addItem',
        actor,
        target: orderId,
        outcome: 'success',
        correlationId,
        details: { itemId: item.itemId, quantity: item.quantity || 1, saveForLater: !!item.saveForLater }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'order.addItem',
        actor,
        target: orderId,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message, itemId: item && item.itemId }
      });
      throw err;
    }
  }

  /**
   * Set item quantity. If quantity === 0 the item is removed.
   */
  async setItemQuantity(orderId, itemId, quantity, opts = {}) {
    if (!orderId || !itemId) throw createError(400, 'orderId and itemId are required');
    if (quantity === undefined || quantity === null) throw createError(400, 'quantity is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const updated = await OrderRepo.setItemQuantity(orderId, itemId, quantity, { session: opts.session, select: opts.select, populate: opts.populate });
      if (!updated) {
        await auditService.logEvent({
          eventType: 'order.setItemQuantity',
          actor,
          target: orderId,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found', itemId }
        });
        throw createError(404, 'Order or item not found');
      }
      await auditService.logEvent({
        eventType: 'order.setItemQuantity',
        actor,
        target: orderId,
        outcome: 'success',
        correlationId,
        details: { itemId, quantity }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'order.setItemQuantity',
        actor,
        target: orderId,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message, itemId, quantity }
      });
      throw err;
    }
  }

  /**
   * Update item attributes: quantity, saveForLater, pricingSnapshot.
   * If quantity <= 0 the item is removed.
   */
  async updateItem(orderId, itemId, changes = {}, opts = {}) {
    if (!orderId || !itemId) throw createError(400, 'orderId and itemId are required');
    if (!changes || typeof changes !== 'object') throw createError(400, 'changes must be an object');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const updated = await OrderRepo.updateItem(orderId, itemId, changes, { session: opts.session, select: opts.select, populate: opts.populate });
      if (!updated) {
        await auditService.logEvent({
          eventType: 'order.updateItem',
          actor,
          target: orderId,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found', itemId }
        });
        throw createError(404, 'Order or item not found');
      }
      await auditService.logEvent({
        eventType: 'order.updateItem',
        actor,
        target: orderId,
        outcome: 'success',
        correlationId,
        details: { itemId, changes }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'order.updateItem',
        actor,
        target: orderId,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message, itemId, changes }
      });
      throw err;
    }
  }

  /**
   * Remove an item from the order.
   */
  async removeItem(orderId, itemId, opts = {}) {
    if (!orderId || !itemId) throw createError(400, 'orderId and itemId are required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const updated = await OrderRepo.removeItem(orderId, itemId, { session: opts.session, select: opts.select, populate: opts.populate });
      if (!updated) {
        await auditService.logEvent({
          eventType: 'order.removeItem',
          actor,
          target: orderId,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found', itemId }
        });
        throw createError(404, 'Order or item not found');
      }
      await auditService.logEvent({
        eventType: 'order.removeItem',
        actor,
        target: orderId,
        outcome: 'success',
        correlationId,
        details: { itemId }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'order.removeItem',
        actor,
        target: orderId,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message, itemId }
      });
      throw err;
    }
  }

  /**
   * Extract items marked saveForLater and remove them from the order.
   * Returns { saved, order } where order is the updated order object.
   */
  async extractSaveForLater(orderId, opts = {}) {
    if (!orderId) throw createError(400, 'orderId is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const result = await OrderRepo.extractSaveForLater(orderId, { session: opts.session, select: opts.select, populate: opts.populate });
      if (!result) {
        await auditService.logEvent({
          eventType: 'order.extractSaveForLater',
          actor,
          target: orderId,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'Order not found');
      }
      await auditService.logEvent({
        eventType: 'order.extractSaveForLater',
        actor,
        target: orderId,
        outcome: 'success',
        correlationId,
        details: { savedCount: Array.isArray(result.saved) ? result.saved.length : 0 }
      });
      // sanitize order
      return { saved: result.saved, order: sanitizeForClient(result.order) };
    } catch (err) {
      await auditService.logEvent({
        eventType: 'order.extractSaveForLater',
        actor,
        target: orderId,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /* -------------------------
   * Bulk / misc
   * ------------------------- */

  async hardDeleteById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const removed = await OrderRepo.hardDeleteById(id);
      if (!removed) {
        await auditService.logEvent({
          eventType: 'delete.order.hard',
          actor,
          target: id,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'Order not found');
      }
      await auditService.logEvent({
        eventType: 'delete.order.hard',
        actor,
        target: id,
        outcome: 'success',
        correlationId,
        details: {}
      });
      return sanitizeForClient(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'delete.order.hard',
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

  async bulkCreate(docs = [], opts = {}) {
    if (!Array.isArray(docs) || docs.length === 0) throw createError(400, 'docs must be a non-empty array');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const inserted = await OrderRepo.bulkInsert(docs, { session: opts.session });
      await auditService.logEvent({
        eventType: 'create.order.bulk',
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
        eventType: 'create.order.bulk',
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

  async count(filter = {}) {
    const f = typeof filter === 'object' && filter !== null ? { ...filter } : {};
    return OrderRepo.count(f);
  }

  async startSession() {
    return OrderRepo.startSession();
  }

  async createOrderTransaction(payload = {}, transactionalWork, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const session = await this.startSession();
    session.startTransaction();
    try {
      const created = await OrderRepo.create(payload, { session });
      if (typeof transactionalWork === 'function') {
        await transactionalWork(session, created);
      }
      await session.commitTransaction();
      session.endSession();

      await auditService.logEvent({
        eventType: 'create.order.transaction',
        actor,
        target: created._id || created.id,
        outcome: 'success',
        correlationId,
        details: {}
      });

      return sanitizeForClient(created);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();

      await auditService.logEvent({
        eventType: 'create.order.transaction',
        actor,
        target: payload && payload.userId ? payload.userId : undefined,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });

      throw err;
    }
  }
}

module.exports = new OrderService();
