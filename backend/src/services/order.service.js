// src/services/order.service.js
//
// Service layer for Order domain (polished, production-ready)
// - Implements business flows: createOrder, submitOrder, cancelOrder, item-level guards
// - Uses OrderRepo for persistence and SalesWindowService for sales-window interactions
// - Emits audit events via auditService using a reusable one-line helper
// - TODO: implement private _getEnrichedOrdersForUser (read-intensive enrichment)

const createError = require('http-errors');
const OrderRepo = require('../repositories/order.repo');
const auditService = require('./audit.service');
const SalesWindowService = require('./salesWindow.service');
const UserRepo = require('../repositories/user.repo');
const { sendOrderConfirmation } = require('./email.service');
const { getById } = require('./item.service');

function sanitizeForClient(doc) {
  if (!doc) return doc;
  const copy = { ...doc };
  return copy;
}

function actorFromOpts(opts = {}) {
  if (!opts) return {};
  if (opts.actor) return opts.actor;
  if (opts.user) return { userId: opts.user.userId || opts.user._id, role: opts.user.role || null };
  return {};
}

const IMMUTABLE_STATUSES = new Set(['confirmed', 'dispatched', 'fulfilled']);

class OrderService {
  /* -------------------------
   * Reusable audit helper
   * - One-line usage: await this._audit('event.type', actor, target, 'success', 'info', correlationId, { details })
   * - Best-effort: does not throw if audit fails
   * ------------------------- */
  async _audit(eventType, actor = {}, target = undefined, outcome = 'success', severity = 'info', correlationId = null, details = {}) {
    try {
      await auditService.logEvent({
        eventType,
        actor,
        target,
        outcome,
        severity,
        correlationId,
        details
      });
    } catch (e) {
      // best-effort: do not fail main flow on audit errors
      // eslint-disable-next-line no-console
      console.warn('auditService.logEvent failed', eventType, e && e.message);
    }
  }

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

      await this._audit('create.order', actor, created._id || created.id, 'success', 'info', correlationId, { orderId: created._id || created.id, status: created.status });

      // best-effort email
      try {
        let userEmail = null;
        if (created?.userId) {
          const user = await UserRepo.findById(created.userId);
          if (user && Array.isArray(user.emails) && user.emails.length > 0) {
            userEmail = user.emails[0].address;
          }
        }
        if (userEmail) await sendOrderConfirmation(userEmail, created);
      } catch (e) {
        // non-fatal
        // eslint-disable-next-line no-console
        console.warn('Email send failed', e && e.message);
      }

      return sanitizeForClient(created);
    } catch (err) {
      await this._audit('create.order', actor, doc && doc.userId ? doc.userId : undefined, 'failure', 'error', correlationId, { error: err && err.message });
      throw err;
    }
  }

  async getById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const order = await OrderRepo.findById(id, opts);
    if (!order) throw createError(404, 'Order not found');
    return sanitizeForClient(order);
  }

  async getInvoiceById(orderId, opts = {}) {
    if (!orderId) throw createError(400, 'orderId is required');

    const order = await OrderRepo.findById(orderId, { lean: true });
    if (!order) throw createError(404, 'Order not found');

    const finalizedStatuses = new Set(['confirmed', 'dispatched', 'fulfilled']);
    const isFinalized = finalizedStatuses.has(order.status);

    const now = Date.now();
    const isWindowClosed = order.salesWindow?.toEpoch
      ? now > Number(order.salesWindow.toEpoch)
      : false;

    if (!isFinalized) {
      let message = 'Final pricing is not available yet.';
      let pricingPending = true;

      if (order.status === 'declined') {
        message = 'Invoice is not available because this order was declined.';
        pricingPending = false;
      } else if (order.status === 'cancelled') {
        message = 'Invoice is not available because this order was cancelled.';
        pricingPending = false;
      } else if (order.status === 'draft' || order.status === 'submitted' || order.status === 'approved') {
        message = 'Aggregation window is still active. Final pricing is not available yet.';
        pricingPending = true;
      }

      return {
        orderId: order._id,
        orderNumber: order._id,
        invoiceAvailable: false,
        pricingPending,
        status: order.status,
        generatedAt: now,
        items: [],
        summary: null,
        message
      };
    }

    const statusLabelMap = {
      confirmed: 'CONFIRMED / PAID',
      dispatched: 'DISPATCHED',
      fulfilled: 'FULFILLED'
    };

    const items = (order.items || []).map((item) => {
      const snap = Array.isArray(item.pricingSnapshot)
        ? (item.pricingSnapshot.length ? item.pricingSnapshot[item.pricingSnapshot.length - 1] : null)
        : (item.pricingSnapshot || null);

      const quantity = Number(item.quantity || 0);
      const finalUnitPrice = Number(snap?.atInstantPrice || 0);
      const discountPercent = Number(snap?.discountedPercentage || 0);

      const baseUnitPrice =
        discountPercent > 0 && discountPercent < 100
          ? Number((finalUnitPrice / (1 - discountPercent / 100)).toFixed(2))
          : finalUnitPrice;

      const lineBaseTotal = Number((baseUnitPrice * quantity).toFixed(2));
      const lineFinalTotal = Number((finalUnitPrice * quantity).toFixed(2));
      const lineSavings = Number((lineBaseTotal - lineFinalTotal).toFixed(2));

      return {
        itemId: item.itemId,
        productId: item.productId,
        quantity,
        baseUnitPrice,
        finalUnitPrice,
        lineBaseTotal,
        lineFinalTotal,
        lineSavings,
        discountPercent,
        tierLabel: snap?.discountBracket?.final != null
          ? `Tier ${snap.discountBracket.final}`
          : 'Final Bulk Tier'
      };
    });

    const baseTotal = Number(items.reduce((sum, i) => sum + i.lineBaseTotal, 0).toFixed(2));
    const finalTotal = Number(items.reduce((sum, i) => sum + i.lineFinalTotal, 0).toFixed(2));
    const totalSavings = Number((baseTotal - finalTotal).toFixed(2));
    const savingsPercent = baseTotal > 0
      ? Number(((totalSavings / baseTotal) * 100).toFixed(2))
      : 0;

    return {
      orderId: order._id,
      orderNumber: order._id,
      invoiceAvailable: true,
      pricingPending: false,
      generatedAt: now,
      status: order.status,
      statusLabel: statusLabelMap[order.status] || String(order.status || '').toUpperCase(),
      statusNote: 'Aggregation window closed · Final pricing locked',
      summary: {
        totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
        baseTotal,
        finalTotal,
        totalSavings,
        savingsPercent,
        finalPricePerUnit: items.length ? items[0].finalUnitPrice : 0
      },
      items
    };
  }

  async findByUserId(userId, opts = {}) {
    if (!userId) throw createError(400, 'userId is required');
    const results = await OrderRepo.findByUserId(userId, opts);
    return (results || []).map(sanitizeForClient);
  }


  static _statusLabel(status) {
    const map = {
      draft: 'Draft / In cart',
      submitted: 'Submitted — awaiting approval',
      approved: 'Approved',
      declined: 'Declined',
      cancelled: 'Cancelled',
      confirmed: 'Confirmed — payment received',
      dispatched: 'Dispatched',
      fulfilled: 'Fulfilled',
    };
    return map[status] || String(status || '').toUpperCase();
  }

  static _cancellable(status) {
    return ['draft', 'submitted'].includes(status);
  }

  static _syntheticTimeline(order) {
    const LIFECYCLE = ['draft', 'submitted', 'approved', 'confirmed', 'dispatched', 'fulfilled'];
    const TERMINAL = new Set(['declined', 'cancelled']);
    const events = [];

    events.push({
      event: 'create.order',
      fromStatus: null,
      toStatus: 'draft',
      actor: null,
      timestamp: order.createdAt || null,
      note: null,
    });

    const currentIdx = LIFECYCLE.indexOf(order.status);
    if (currentIdx > 0) {
      for (let i = 1; i <= currentIdx; i++) {
        events.push({
          event: `order.${LIFECYCLE[i]}`,
          fromStatus: LIFECYCLE[i - 1],
          toStatus: LIFECYCLE[i],
          actor: null,
          timestamp: i === currentIdx ? (order.updatedAt || null) : null,
          timestampApproximate: i === currentIdx ? true : false,
          note: null,
        });
      }
    }

    if (TERMINAL.has(order.status)) {
      const isDecline = order.status === 'declined';
      events.push({
        event: isDecline ? 'supplier.order.decline' : 'order.cancel',
        fromStatus: null,
        toStatus: order.status,
        actor: null,
        timestamp: order.updatedAt || null,
        note: isDecline ? (order.declineReason || null) : null,
      });
    }

    return events;
  }

  async getStatusById(orderId, opts = {}) {
    if (!orderId) throw createError(400, 'orderId is required');
    const order = await OrderRepo.findById(orderId, { lean: true });
    if (!order) throw createError(404, 'Order not found');

    return {
      orderId: order._id,
      status: order.status,
      statusLabel: OrderService._statusLabel(order.status),
      canCancel: OrderService._cancellable(order.status),
      declineReason: order.status === 'declined' ? (order.declineReason || null) : null,
      expectedDeliveryDate: order.expectedDeliveryDate || null,
      salesWindow: order.salesWindow
        ? { fromEpoch: order.salesWindow.fromEpoch, toEpoch: order.salesWindow.toEpoch }
        : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      generatedAt: Date.now(),
    };
  }

  async getOrderHistory(orderId, opts = {}) {
    if (!orderId) throw createError(400, 'orderId is required');
    const order = await OrderRepo.findById(orderId, { lean: true });
    if (!order) throw createError(404, 'Order not found');

    const events = OrderService._syntheticTimeline(order);

    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 50);
    const total = events.length;
    const slice = events.slice((page - 1) * limit, page * limit);

    return {
      orderId: order._id,
      currentStatus: order.status,
      events: slice,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      generatedAt: Date.now(),
    };
  }

  async getUserOrderHistory(userId, opts = {}) {
    if (!userId) throw createError(400, 'userId is required');

    const filter = { userId };

    if (opts.status) {
      let parsed = opts.status;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch (_) { }
      }
      filter.status = Array.isArray(parsed) ? { $in: parsed } : parsed;
    }

    if (opts.afterEpoch || opts.beforeEpoch) {
      filter.createdAt = {};
      if (opts.afterEpoch) filter.createdAt.$gte = Number(opts.afterEpoch);
      if (opts.beforeEpoch) filter.createdAt.$lte = Number(opts.beforeEpoch);
    }

    const paged = await OrderRepo.paginate(filter, {
      page: opts.page,
      limit: opts.limit,
      sort: { createdAt: -1 },
      select: '_id status declineReason expectedDeliveryDate salesWindow ops_region createdAt updatedAt',
    });

    const items = (paged.items || []).map((o) => ({
      orderId: o._id,
      status: o.status,
      statusLabel: OrderService._statusLabel(o.status),
      canCancel: OrderService._cancellable(o.status),
      declineReason: o.status === 'declined' ? (o.declineReason || null) : null,
      expectedDeliveryDate: o.expectedDeliveryDate || null,
      salesWindow: o.salesWindow ? { fromEpoch: o.salesWindow.fromEpoch, toEpoch: o.salesWindow.toEpoch } : null,
      ops_region: o.ops_region || null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }));

    return { items, total: paged.total, page: paged.page, limit: paged.limit, pages: paged.pages };
  }


  async listOrders(filter = {}, opts = {}) {
    const f = typeof filter === 'object' && filter !== null ? { ...filter } : {};
    const result = await OrderRepo.paginate(f, opts);
    result.items = (result.items || []).map(sanitizeForClient);
    return result;
  }

  async getSupplierOrderRequests(opts = {}) {
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 10);

    const filter = {};

    if (opts.ops_region) {
      filter.ops_region = opts.ops_region;
    }

    if (opts.status && opts.status.toLowerCase() !== "all") {
      filter.status = opts.status.toLowerCase();
    }

    const result = await OrderRepo.paginate(filter, {
      page,
      limit,
      sort: 'createdAt:-1'
    });

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
        await this._audit('update.order', actor, id, 'failure', 'warn', correlationId, { reason: 'not_found' });
        throw createError(404, 'Order not found');
      }
      await this._audit('update.order', actor, id, 'success', 'info', correlationId, { update: payload });
      return sanitizeForClient(updated);
    } catch (err) {
      await this._audit('update.order', actor, id, 'failure', 'error', correlationId, { error: err && err.message });
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
        await this._audit('update.order', actor, filter, 'failure', 'warn', correlationId, { reason: 'not_found' });
        throw createError(404, 'Order not found');
      }
      await this._audit('update.order', actor, filter, 'success', 'info', correlationId, { update: payload });
      return sanitizeForClient(updated);
    } catch (err) {
      await this._audit('update.order', actor, filter, 'failure', 'error', correlationId, { error: err && err.message });
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
        await this._audit('order.addMessage', actor, orderId, 'failure', 'warn', correlationId, { reason: 'not_found' });
        throw createError(404, 'Order not found');
      }
      await this._audit('order.addMessage', actor, orderId, 'success', 'info', correlationId, { messageId });
      return sanitizeForClient(updated);
    } catch (err) {
      await this._audit('order.addMessage', actor, orderId, 'failure', 'error', correlationId, { error: err && err.message });
      throw err;
    }
  }


  async updateStatus(orderId, status, opts = {}) {
  if (!orderId || !status) {
    throw createError(400, 'orderId and status are required');
  }

  const actor = actorFromOpts(opts);
  const correlationId = opts.correlationId || null;

  const allowedTransitions = {
    confirmed: ['dispatched'],
    dispatched: ['fulfilled'],
  };

  try {
    const currentOrder = await OrderRepo.findById(orderId, { lean: true });

    if (!currentOrder) {
      await this._audit(
        'order.updateStatus',
        actor,
        orderId,
        'failure',
        'warn',
        correlationId,
        { reason: 'not_found' }
      );
      throw createError(404, 'Order not found');
    }

    const currentStatus = String(currentOrder.status || '').toLowerCase();
    const nextStatus = String(status || '').toLowerCase();

    const validNextStatuses = allowedTransitions[currentStatus] || [];

    if (!validNextStatuses.includes(nextStatus)) {
      throw createError(
        409,
        `Invalid status transition from ${currentStatus} to ${nextStatus}`
      );
    }

    const updated = await OrderRepo.updateStatus(orderId, nextStatus);

    await this._audit(
      'order.updateStatus',
      actor,
      orderId,
      'success',
      'info',
      correlationId,
      {
        fromStatus: currentStatus,
        toStatus: nextStatus,
        changedAt: Date.now(),
      }
    );

    return sanitizeForClient(updated);
  } catch (err) {
    await this._audit(
      'order.updateStatus',
      actor,
      orderId,
      'failure',
      'error',
      correlationId,
      { error: err && err.message }
    );
    throw err;
  }
}

async approveSupplierOrder(orderId, opts = {}) {
  if (!orderId) {
    throw createError(400, 'orderId is required');
  }

  const actor = actorFromOpts(opts);
  const correlationId = opts.correlationId || null;

  try {
    const updated = await OrderRepo.updateStatus(orderId, 'approved');

    if (!updated) {
      await this._audit(
        'supplier.order.approve',
        actor,
        orderId,
        'failure',
        'warn',
        correlationId,
        { reason: 'not_found' }
      );
      throw createError(404, 'Order not found');
    }

    await this._audit(
      'supplier.order.approve',
      actor,
      orderId,
      'success',
      'info',
      correlationId,
      { status: 'approved' }
    );

    return sanitizeForClient(updated);
  } catch (err) {
    await this._audit(
      'supplier.order.approve',
      actor,
      orderId,
      'failure',
      'error',
      correlationId,
      { error: err && err.message }
    );
    throw err;
  }
}

async declineSupplierOrder(orderId, reason, opts = {}) {
  if (!orderId) {
    throw createError(400, 'orderId is required');
  }

  if (!reason || !reason.trim()) {
    throw createError(400, 'decline reason is required');
  }

  const actor = actorFromOpts(opts);
  const correlationId = opts.correlationId || null;

  try {
    const updated = await OrderRepo.updateById(
      orderId,
      {
        status: 'declined',
        declineReason: reason.trim(),
        updatedAt: Date.now()
      },
      { new: true }
    );

    if (!updated) {
      await this._audit(
        'supplier.order.decline',
        actor,
        orderId,
        'failure',
        'warn',
        correlationId,
        { reason: 'not_found' }
      );
      throw createError(404, 'Order not found');
    }

    await this._audit(
      'supplier.order.decline',
      actor,
      orderId,
      'success',
      'info',
      correlationId,
      {
        status: 'declined',
        declineReason: reason.trim()
      }
    );

    return sanitizeForClient(updated);
  } catch (err) {
    await this._audit(
      'supplier.order.decline',
      actor,
      orderId,
      'failure',
      'error',
      correlationId,
      { error: err && err.message }
    );
    throw err;
  }
}


  async confirmFulfillment(orderId, expectedDeliveryDate, opts = {}) {
    if (!orderId) {
      throw createError(400, 'orderId is required');
    }

    if (!expectedDeliveryDate) {
      throw createError(400, 'expectedDeliveryDate is required');
    }

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const updated = await OrderRepo.updateById(
        orderId,
        {
          status: 'confirmed',
          expectedDeliveryDate: Number(expectedDeliveryDate),
          updatedAt: Date.now()
        },
        { new: true }
      );

      if (!updated) {
        await this._audit(
          'supplier.fulfillment.confirm',
          actor,
          orderId,
          'failure',
          'warn',
          correlationId,
          { reason: 'not_found' }
        );
        throw createError(404, 'Order not found');
      }

      await this._audit(
        'supplier.fulfillment.confirm',
        actor,
        orderId,
        'success',
        'info',
        correlationId,
        {
          status: 'confirmed',
          expectedDeliveryDate: Number(expectedDeliveryDate)
        }
      );

      return sanitizeForClient(updated);
    } catch (err) {
      await this._audit(
        'supplier.fulfillment.confirm',
        actor,
        orderId,
        'failure',
        'error',
        correlationId,
        { error: err && err.message }
      );
      throw err;
    }
  }


  /* -------------------------
   * Cart / item-level operations with immutability guards
   * ------------------------- */

  async addItem(orderId, item = {}, opts = {}) {
    if (!orderId) throw createError(400, 'orderId is required');
    if (!item || typeof item !== 'object') throw createError(400, 'item is required');
    if (!item.itemId || !item.productId) throw createError(400, 'item.productId and item.itemId are required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    // immutability guard
    const order = await OrderRepo.findById(orderId, { lean: true });
    if (!order) throw createError(404, 'Order not found');
    if (IMMUTABLE_STATUSES.has(order.status)) throw createError(409, 'Order items cannot be modified in current status');

    try {
      const updated = await OrderRepo.addItem(orderId, item, { session: opts.session, select: opts.select, populate: opts.populate });
      if (!updated) {
        await this._audit('order.addItem', actor, orderId, 'failure', 'warn', correlationId, { reason: 'not_found', itemId: item.itemId });
        throw createError(404, 'Order not found');
      }
      await this._audit('order.addItem', actor, orderId, 'success', 'info', correlationId, { itemId: item.itemId, quantity: item.quantity || 1, saveForLater: !!item.saveForLater });
      return sanitizeForClient(updated);
    } catch (err) {
      await this._audit('order.addItem', actor, orderId, 'failure', 'error', correlationId, { error: err && err.message, itemId: item && item.itemId });
      throw err;
    }
  }

  async setItemQuantity(orderId, itemId, quantity, opts = {}) {
    if (!orderId || !itemId) throw createError(400, 'orderId and itemId are required');
    if (quantity === undefined || quantity === null) throw createError(400, 'quantity is required');

    const order = await OrderRepo.findById(orderId, { lean: true });
    if (!order) throw createError(404, 'Order not found');
    if (IMMUTABLE_STATUSES.has(order.status)) throw createError(409, 'Order items cannot be modified in current status');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const updated = await OrderRepo.setItemQuantity(orderId, itemId, quantity, { session: opts.session, select: opts.select, populate: opts.populate });
      if (!updated) {
        await this._audit('order.setItemQuantity', actor, orderId, 'failure', 'warn', correlationId, { reason: 'not_found', itemId });
        throw createError(404, 'Order or item not found');
      }
      await this._audit('order.setItemQuantity', actor, orderId, 'success', 'info', correlationId, { itemId, quantity });
      return sanitizeForClient(updated);
    } catch (err) {
      await this._audit('order.setItemQuantity', actor, orderId, 'failure', 'error', correlationId, { error: err && err.message, itemId, quantity });
      throw err;
    }
  }

  async updateItem(orderId, itemId, changes = {}, opts = {}) {
    if (!orderId || !itemId) throw createError(400, 'orderId and itemId are required');
    if (!changes || typeof changes !== 'object') throw createError(400, 'changes must be an object');

    const order = await OrderRepo.findById(orderId, { lean: true });
    if (!order) throw createError(404, 'Order not found');
    if (IMMUTABLE_STATUSES.has(order.status)) throw createError(409, 'Order items cannot be modified in current status');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const updated = await OrderRepo.updateItem(orderId, itemId, changes, { session: opts.session, select: opts.select, populate: opts.populate });
      if (!updated) {
        await this._audit('order.updateItem', actor, orderId, 'failure', 'warn', correlationId, { reason: 'not_found', itemId });
        throw createError(404, 'Order or item not found');
      }
      await this._audit('order.updateItem', actor, orderId, 'success', 'info', correlationId, { itemId, changes });
      return sanitizeForClient(updated);
    } catch (err) {
      await this._audit('order.updateItem', actor, orderId, 'failure', 'error', correlationId, { error: err && err.message, itemId, changes });
      throw err;
    }
  }

  async removeItem(orderId, itemId, opts = {}) {
    if (!orderId || !itemId) throw createError(400, 'orderId and itemId are required');

    const order = await OrderRepo.findById(orderId, { lean: true });
    if (!order) throw createError(404, 'Order not found');
    if (IMMUTABLE_STATUSES.has(order.status)) throw createError(409, 'Order items cannot be modified in current status');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const updated = await OrderRepo.removeItem(orderId, itemId, { session: opts.session, select: opts.select, populate: opts.populate });
      if (!updated) {
        await this._audit('order.removeItem', actor, orderId, 'failure', 'warn', correlationId, { reason: 'not_found', itemId });
        throw createError(404, 'Order or item not found');
      }
      await this._audit('order.removeItem', actor, orderId, 'success', 'info', correlationId, { itemId });
      return sanitizeForClient(updated);
    } catch (err) {
      await this._audit('order.removeItem', actor, orderId, 'failure', 'error', correlationId, { error: err && err.message, itemId });
      throw err;
    }
  }

  async extractSaveForLater(orderId, opts = {}) {
    if (!orderId) throw createError(400, 'orderId is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const result = await OrderRepo.extractSaveForLater(orderId, { session: opts.session, select: opts.select, populate: opts.populate });
      if (!result) {
        await this._audit('order.extractSaveForLater', actor, orderId, 'failure', 'warn', correlationId, { reason: 'not_found' });
        throw createError(404, 'Order not found');
      }
      await this._audit('order.extractSaveForLater', actor, orderId, 'success', 'info', correlationId, { savedCount: Array.isArray(result.saved) ? result.saved.length : 0 });
      return { saved: result.saved, order: sanitizeForClient(result.order) };
    } catch (err) {
      await this._audit('order.extractSaveForLater', actor, orderId, 'failure', 'error', correlationId, { error: err && err.message });
      throw err;
    }
  }

  /* -------------------------
   * Submit / Cancel flows (transactional)
   * ------------------------- */

  async submitOrder(orderId, opts = {}) {
    if (!orderId) throw createError(400, 'orderId is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const session = await this.startSession();
    session.startTransaction();
    try {
      const orderDoc = await OrderRepo._findDocById(orderId);
      if (!orderDoc) throw createError(404, 'Order not found');
      if (orderDoc.status !== 'draft') throw createError(409, 'Only draft orders can be submitted');

      const region = orderDoc.ops_region;
      if (!region) throw createError(400, 'order.ops_region is required to submit');

      const swResult = await SalesWindowService.listAllCurrentProducts(region, { page: 1, limit: 1000, session, lean: true });
      const swProducts = Array.isArray(swResult.products) ? swResult.products : [];

      const productLookup = new Map();
      for (const p of swProducts) {
        const pid = String(p.productId);
        const itemMap = new Map();
        if (Array.isArray(p.items)) {
          for (const it of p.items) {
            itemMap.set(String(it.itemId), it);
          }
        }
        productLookup.set(pid, { product: p, itemMap, windowId: p.windowId, window: p.window });
      }

      /*const missing = [];
      for (const it of orderDoc.items || []) {
        const pid = String(it.productId);
        const iid = String(it.itemId);
        const pEntry = productLookup.get(pid);
        if (!pEntry) {
          missing.push({ productId: pid, itemId: iid });
          continue;
        }
        const swItem = pEntry.itemMap.get(iid);
        if (!swItem) {
          missing.push({ productId: pid, itemId: iid });
        }
      }*/

      /*const missing = [];
      for (const it of orderDoc.items || []) {
        const pid = String(it.productId);
        const iid = String(it.itemId);
        const pEntry = productLookup.get(pid);
        if (!pEntry) {
          missing.push({ productId: pid, itemId: iid });
          continue;
        }
        const swItem = pEntry.itemMap.get(iid);
        if (!swItem) {
          missing.push({ productId: pid, itemId: iid });
        }
      }*/

      const missing = [];
      for (const it of orderDoc.items || []) {
        const pid = String(it.productId);
        const iid = String(it.itemId);

        let pEntry = productLookup.get(pid);
        if (!pEntry) {
          for (const [, entry] of productLookup) {
            if (entry.itemMap.has(iid)) {
              pEntry = entry;
              it.productId = entry.product.productId;
              break;
            }
          }
        }

        if (!pEntry) {
          missing.push({ productId: pid, itemId: iid });
          continue;
        }
        const swItem = pEntry.itemMap.get(iid);
        if (!swItem) {
          missing.push({ productId: pid, itemId: iid });
        }
      }

      if (missing.length > 0) {
        throw createError(409, `Some items are not available in current sales window: ${JSON.stringify(missing)}`);
      }

      /*for (const it of orderDoc.items || []) {
        const pid = String(it.productId);
        const iid = String(it.itemId);
        const pEntry = productLookup.get(pid);
        const swItem = pEntry.itemMap.get(iid);*/

      for (const it of orderDoc.items || []) {
        const pid = String(it.productId);
        const iid = String(it.itemId);

        // ✅ Same fallback lookup
        let pEntry = productLookup.get(pid);
        if (!pEntry) {
          for (const [, entry] of productLookup) {
            if (entry.itemMap.has(iid)) {
              pEntry = entry;
              break;
            }
          }
        }
        if (!pEntry) continue;
        const swItem = pEntry.itemMap.get(iid);
        if (!swItem) continue;

        let latestSnapshot = null;
        if (Array.isArray(swItem.pricing_snapshots) && swItem.pricing_snapshots.length > 0) {
          latestSnapshot = swItem.pricing_snapshots[swItem.pricing_snapshots.length - 1];
        } else if (swItem.pricing_snapshot) {
          latestSnapshot = swItem.pricing_snapshot;
        }

        if (!Array.isArray(it.pricingSnapshot)) it.pricingSnapshot = [];
        if (latestSnapshot) {
          const snap = Object.assign({}, latestSnapshot);
          if (snap.createdAt && snap.createdAt instanceof Date) snap.createdAt = snap.createdAt.getTime();
          it.pricingSnapshot.push(snap);
        }

        const currentQtySold = Number(swItem.qtySold || 0);
        const increment = Number(it.quantity || 1);
        const newQtySold = currentQtySold + increment;
        console.log("🔍 windowId being used:", pEntry.windowId);
        console.log("🔍 productId:", pid);
        console.log("🔍 itemId:", iid);
        console.log("🔍 newQtySold:", newQtySold);
        try {
          //await SalesWindowService.addOrUpdateItem(pEntry.windowId, pid, iid, { qtySold: newQtySold }, { session, actor, correlationId });
          await SalesWindowService.addOrUpdateItem(pEntry.windowId, pid, iid, { qtySold: newQtySold }, { actor, correlationId });

        } catch (e) {
          // non-fatal for submission
          // eslint-disable-next-line no-console
          console.warn('Failed to update qtySold on sales window', e && e.message);
        }

        // pricing tier logic placeholder
      }

      orderDoc.status = 'submitted';
      const firstWindow = swProducts && swProducts.length > 0 ? swProducts[0].window : null;
      if (firstWindow) {
        orderDoc.salesWindow = { fromEpoch: Number(firstWindow.fromEpoch), toEpoch: Number(firstWindow.toEpoch) };
      }
      orderDoc.updatedAt = Date.now();
      await orderDoc.save({ session });

      const draft = await OrderRepo.findOrCreateDraftForUserRegion(orderDoc.userId, region, { session });
      await OrderRepo.moveSaveForLaterToDraft(orderDoc._id, draft._id, { session });

      await session.commitTransaction();
      session.endSession();

      await this._audit('order.submit', actor, orderDoc._id, 'success', 'info', correlationId, { userId: orderDoc.userId, region });

      const updatedPlain = await OrderRepo.findById(orderDoc._id, { lean: true });
      return sanitizeForClient(updatedPlain);
    }
    catch (err) {
      try {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
      } catch (abortErr) {
        console.warn('abortTransaction failed:', abortErr.message);
      }
      session.endSession();
      await this._audit('order.submit', actor, orderId, 'failure', 'error', correlationId, { error: err && err.message });
      throw err;
    }
    /*catch (err) {
      await session.abortTransaction();
      session.endSession();

      await this._audit('order.submit', actor, orderId, 'failure', 'error', correlationId, { error: err && err.message });
      throw err;
    }*/

  }

  async cancelOrder(orderId, opts = {}) {
    if (!orderId) throw createError(400, 'orderId is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const session = await this.startSession();
    session.startTransaction();
    try {
      const orderDoc = await OrderRepo._findDocById(orderId);
      if (!orderDoc) throw createError(404, 'Order not found');

      if (orderDoc.status === 'submitted') {
        const region = orderDoc.ops_region;
        const draft = await OrderRepo.findOrCreateDraftForUserRegion(orderDoc.userId, region, { session });
        const targetDoc = await OrderRepo._findDocById(draft._id);
        if (session) targetDoc.$session(session);

        const existingIds = new Set((targetDoc.items || []).map((it) => String(it.itemId)));
        for (const it of orderDoc.items || []) {
          if (!existingIds.has(String(it.itemId))) {
            targetDoc.items.push({
              productId: it.productId,
              itemId: it.itemId,
              pricingSnapshot: it.pricingSnapshot || {},
              saveForLater: false,
              quantity: it.quantity || 1
            });
          }
        }
        targetDoc.updatedAt = Date.now();
        await targetDoc.save({ session });
      }

      orderDoc.status = 'cancelled';
      orderDoc.updatedAt = Date.now();
      await orderDoc.save({ session });

      await session.commitTransaction();
      session.endSession();

      await this._audit('order.cancel', actor, orderDoc._id, 'success', 'info', correlationId, { userId: orderDoc.userId });

      const plain = await OrderRepo.findById(orderDoc._id, { lean: true });
      return sanitizeForClient(plain);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();

      await this._audit('order.cancel', actor, orderId, 'failure', 'error', correlationId, { error: err && err.message });
      throw err;
    }
  }

  /* -------------------------
   * Read-intensive enrichment (TODO)
   * ------------------------- */

  // TODO: implement _getEnrichedOrdersForUser(userId, opts)
  // Signature:
  //   async _getEnrichedOrdersForUser(userId, { region, page, limit, statusFilter, includeSaveForLater, session, persist })
  // Purpose:
  //   - Return paginated orders for user enriched with latest sales-window pricing, availability, flags
  //   - Use batch SalesWindowService calls to avoid N+1
  //   - If opts.persist === true, persist updated pricing snapshots for submitted orders

  /**
   * Private read-intensive helper
   *
   * Signature:
   *   async _getEnrichedOrdersForUser(userId, opts = {})
   *
   * opts:
   *   - region (string) optional: restrict to a single region
   *   - page (number) optional
   *   - limit (number) optional
   *   - status (string|Array) optional: filter by order.status
   *   - includeSaveForLater (boolean) optional: include saveForLater items in enrichment
   *   - session (ClientSession) optional
   *   - persist (boolean) optional: if true, persist updated pricing snapshots for submitted orders
   *
   * Returns:
   *   { items: [enrichedOrder], total, page, limit, pages }
   *
   * Behavior:
   *   - Paginates orders for the user (and region/status if provided)
   *   - Batches SalesWindowService calls per region to avoid N+1
   *   - Enriches each order item with latestSalesWindowSnapshot, availableQty, qtySold, pricing_tiers, missingInWindow
   *   - If opts.persist === true and order.status === 'submitted', persists appended pricing snapshots (best-effort, in same session if provided)
   *
   * Usage:
   *   const enriched = await this._getEnrichedOrdersForUser(userId, { region, page, limit });
   */
  async _getEnrichedOrdersForUser(userId, opts = {}) {
    if (!userId) throw createError(400, 'userId is required');

    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
    const includeSaveForLater = !!opts.includeSaveForLater;
    const persist = !!opts.persist;
    const session = opts.session || null;

    // Build filter for orders
    const filter = { userId };
    if (opts.region) filter.ops_region = opts.region;
    if (opts.status) {
      if (Array.isArray(opts.status)) filter.status = { $in: opts.status };
      else filter.status = opts.status;
    }

    // 1) fetch paginated orders
    const paged = await OrderRepo.paginate(filter, { page, limit, populate: opts.populate || '', select: opts.select || '' });
    const orders = Array.isArray(paged.items) ? paged.items : [];

    if (orders.length === 0) {
      return { items: [], total: paged.total || 0, page, limit, pages: paged.pages || 0 };
    }

    // 2) group orders by region to batch SalesWindow calls
    const regionToOrders = new Map();
    for (const o of orders) {
      const r = o.ops_region || '__null__';
      if (!regionToOrders.has(r)) regionToOrders.set(r, []);
      regionToOrders.get(r).push(o);
    }

    // 3) For each region, collect unique product/item ids to request from SalesWindow
    const regionLookups = new Map(); // region -> { productId -> { itemId -> swItem } }
    for (const [region, ordersForRegion] of regionToOrders.entries()) {
      try {
        // fetch all current products for region (reasonable upper limit)
        const swRes = await SalesWindowService.listAllCurrentProducts(region === '__null__' ? null : region, { page: 1, limit: 2000, session, lean: true });
        const swProducts = Array.isArray(swRes.products) ? swRes.products : [];

        const productMap = new Map();
        for (const p of swProducts) {
          const pid = String(p.productId);
          const itemMap = new Map();
          if (Array.isArray(p.items)) {
            for (const it of p.items) {
              itemMap.set(String(it.itemId), it);
            }
          }
          productMap.set(pid, { product: p, itemMap, window: p.window, windowId: p.windowId });
        }
        regionLookups.set(region, productMap);
      } catch (e) {
        // best-effort: set empty map so items will be marked missing
        regionLookups.set(region, new Map());
        // eslint-disable-next-line no-console
        console.warn('SalesWindowService.listAllCurrentProducts failed for region', region, e && e.message);
      }
    }

    //-------------------------------------------------
    function replacer(key, value) {
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      return value;
    }

    const getItemObj = async (item = {}, itemId = null) => {
      let safe = Object.assign({}, item);
      if (Object.keys(safe).length <= 0) {
        safe = await getById(itemId);
      }
      const images = Array.isArray(safe?.images) ? safe?.images : [];
      const primaryImage = images.length > 0 ? safe.images[0] : null;
      return {
        // Your custom mappings
        _id: safe._id,
        sku: safe.sku,
        title: safe.title,
        slug: safe.slug,
        shortDescription: safe.shortDescription || safe.description || '',
        images: images, // using your variable
        image: primaryImage, // using your variable
        published: safe.published,
        status: safe.status,

        // Adding the missing fields from your list
        description: safe.description,
        brand: safe.brand,
        categories: safe.categories,
        tags: safe.tags,
        media: safe.media,
        inventory: safe.inventory,
        variants: safe.variants,
        weight: safe.weight,
        dimensions: safe.dimensions,
        taxClass: safe.taxClass,
        ratings: safe.ratings,
        reviews: safe.reviews,
        relatedProducts: safe.relatedProducts,
        seller: safe.seller,
        metadata: safe.metadata,
        ops_region: safe.ops_region,
        createdAt: safe.createdAt,
        updatedAt: safe.updatedAt,
      };
    }

    // console.log('\nthese are the regionLookups ---------> | ', JSON.stringify(JSON.stringify(regionLookups, replacer, 2)));//-----------------------------

    //-------------------------------------------------

    //-------------------------------------------------
    /* function replacer(key, value) {
       if (value instanceof Map) {
         return Object.fromEntries(value);
       }
       return value;
     }
 
     const getItemObj = async (item = {}, itemId = null) => {
       let safe = Object.assign({}, item);
       if (Object.keys(safe).length <= 0) {
         safe = await getById(itemId);
       }
       const images = Array.isArray(safe?.images) ? safe?.images : [];
       const primaryImage = images.length > 0 ? safe.images[0] : null;
       return {
         // Your custom mappings
         _id: safe._id,
         sku: safe.sku,
         title: safe.title,
         slug: safe.slug,
         shortDescription: safe.shortDescription || safe.description || '',
         images: images, // using your variable
         image: primaryImage, // using your variable
         published: safe.published,
         status: safe.status,
 
         // Adding the missing fields from your list
         description: safe.description,
         brand: safe.brand,
         categories: safe.categories,
         tags: safe.tags,
         media: safe.media,
         inventory: safe.inventory,
         variants: safe.variants,
         weight: safe.weight,
         dimensions: safe.dimensions,
         taxClass: safe.taxClass,
         ratings: safe.ratings,
         reviews: safe.reviews,
         relatedProducts: safe.relatedProducts,
         seller: safe.seller,
         metadata: safe.metadata,
         ops_region: safe.ops_region,
         createdAt: safe.createdAt,
         updatedAt: safe.updatedAt,
       };
     }*/

    // console.log('\nthese are the regionLookups ---------> | ', JSON.stringify(JSON.stringify(regionLookups, replacer, 2)));//-----------------------------

    //-------------------------------------------------

    // 4) Enrich orders in-memory; collect persistence updates if persist === true
    const ordersToPersist = []; // { orderId, updatedItems } for submitted orders
    const enrichedOrders = [];

    for (const order of orders) {

      // If status is NOT 'draft' or 'submitted'
      if (!['draft', 'submitted'].includes(order.status)) {
        enrichedOrders.push(order);
        continue; // Skips the rest of THIS loop iteration
      }


      // If status is NOT 'draft' or 'submitted'
      if (!['draft', 'submitted'].includes(order.status)) {
        enrichedOrders.push(order);
        continue; // Skips the rest of THIS loop iteration
      }

      const r = order.ops_region || '__null__';
      const productMap = regionLookups.get(r) || new Map();

      // clone order shallow to avoid mutating original repo result
      const enriched = Object.assign({}, order);
      enriched.items = await Promise.all((order.items || []).map(async (it) => {
        const out = Object.assign({}, it);
        out.ItemSysInfo = await getItemObj({}, it.itemId);
        out.latestPricingSnapshot = null;
        out.availableQty = null;
        out.qtySold = null;
        out.pricing_tiers = null;
        out.missingInWindow = false;

        const pid = String(it.productId);
        const iid = String(it.itemId);
        const pEntry = productMap.get(pid);
        if (!pEntry) {
          out.missingInWindow = true;
          return out;
        }
        const swItem = pEntry.itemMap.get(iid);
        if (!swItem) {
          out.missingInWindow = true;
          return out;
        }

        // attach fields from sales window item (best-effort)
        out.availableQty = typeof swItem.qtyAvailable === 'number' ? swItem.qtyAvailable : null;
        out.qtySold = typeof swItem.qtySold === 'number' ? swItem.qtySold : null;
        out.pricing_tiers = Array.isArray(swItem.pricing_tiers) ? swItem.pricing_tiers : (swItem.pricingTiers || null);

        // determine latest pricing snapshot
        let latest = null;
        if (Array.isArray(swItem.pricing_snapshots) && swItem.pricing_snapshots.length > 0) {
          latest = swItem.pricing_snapshots[swItem.pricing_snapshots.length - 1];
        } else if (swItem.pricing_snapshot) {
          latest = swItem.pricing_snapshot;
        }
        if (latest) {
          // normalize createdAt to epoch ms if Date
          const snap = Object.assign({}, latest);
          if (snap.createdAt && snap.createdAt instanceof Date) snap.createdAt = snap.createdAt.getTime();
          out.latestPricingSnapshot = snap;
        }

        return out;
      }));

      // If persist requested and order is submitted, prepare to append snapshots where missing or stale
      if (persist && order.status === 'submitted') {
        const updatedItems = [];
        for (let i = 0; i < enriched.items.length; i++) {
          const it = enriched.items[i];
          if (it.missingInWindow) continue;
          if (it.latestPricingSnapshot) {
            // decide whether to append: if order item has no pricingSnapshot or latest differs by createdAt
            const existing = Array.isArray(order.items[i].pricingSnapshot) ? order.items[i].pricingSnapshot : (order.items[i].pricingSnapshot ? [order.items[i].pricingSnapshot] : []);
            const lastExisting = existing.length > 0 ? existing[existing.length - 1] : null;
            const lastExistingTs = lastExisting && lastExisting.createdAt ? Number(lastExisting.createdAt) : null;
            const latestTs = it.latestPricingSnapshot && it.latestPricingSnapshot.createdAt ? Number(it.latestPricingSnapshot.createdAt) : null;
            if (!lastExistingTs || (latestTs && latestTs > lastExistingTs)) {
              // append
              updatedItems.push({ itemId: it.itemId, pricingSnapshot: it.latestPricingSnapshot });
            }
          }
        }
        if (updatedItems.length > 0) {
          ordersToPersist.push({ orderId: order._id, updatedItems });
        }
      }

      enrichedOrders.push(enriched);
    }

    // 5) Persist appended snapshots for submitted orders if requested (best-effort, in provided session)
    if (persist && ordersToPersist.length > 0) {
      // perform updates sequentially to avoid heavy parallel writes; keep best-effort semantics
      for (const upd of ordersToPersist) {
        try {
          const sessionOpts = session ? { session } : {};
          // load doc instance to mutate pricingSnapshot arrays
          const doc = await OrderRepo._findDocById(upd.orderId);
          if (!doc) continue;
          if (session) doc.$session(session);
          let changed = false;
          for (const ui of upd.updatedItems) {
            const idx = (doc.items || []).findIndex((it) => String(it.itemId) === String(ui.itemId));
            if (idx === -1) continue;
            if (!Array.isArray(doc.items[idx].pricingSnapshot)) doc.items[idx].pricingSnapshot = [];
            doc.items[idx].pricingSnapshot.push(ui.pricingSnapshot);
            changed = true;
          }
          if (changed) {
            doc.updatedAt = Date.now();
            await doc.save(sessionOpts);
          }
        } catch (e) {
          // swallow and continue; log for visibility
          // eslint-disable-next-line no-console
          console.warn('Failed to persist pricing snapshots for order', upd.orderId, e && e.message);
        }
      }
    }
    // 6) Return paginated enriched shape
    return {
      items: enrichedOrders.map(sanitizeForClient),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      pages: paged.pages
    };
  }



  /* -------------------------
   * Misc / helpers
   * ------------------------- */

  async hardDeleteById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const removed = await OrderRepo.hardDeleteById(id);
      if (!removed) {
        await this._audit('delete.order.hard', actor, id, 'failure', 'warn', correlationId, { reason: 'not_found' });
        throw createError(404, 'Order not found');
      }
      await this._audit('delete.order.hard', actor, id, 'success', 'info', correlationId, {});
      return sanitizeForClient(removed);
    } catch (err) {
      await this._audit('delete.order.hard', actor, id, 'failure', 'error', correlationId, { error: err && err.message });
      throw err;
    }
  }

  async bulkCreate(docs = [], opts = {}) {
    if (!Array.isArray(docs) || docs.length === 0) throw createError(400, 'docs must be a non-empty array');

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    try {
      const inserted = await OrderRepo.bulkInsert(docs, { session: opts.session });
      await this._audit('create.order.bulk', actor, undefined, 'success', 'info', correlationId, { count: Array.isArray(inserted) ? inserted.length : 0 });
      const plain = (inserted || []).map((d) => (d && d.toObject ? d.toObject() : d));
      return plain.map(sanitizeForClient);
    } catch (err) {
      await this._audit('create.order.bulk', actor, undefined, 'failure', 'error', correlationId, { error: err && err.message });
      throw err;
    }
  }

  async getDashboardMetrics() {
    const pendingQuotes = await this.count({
      status: "submitted",
    });

    const activeWindows = await this.count({
      status: { $in: ["approved", "confirmed"] },
    });

    const criticalAlerts = await this.count({
      status: { $in: ["declined", "cancelled"] },
    });

    console.log("📊 DASHBOARD METRICS:", {
      pendingQuotes,
      activeWindows,
      criticalAlerts,
    });

    return {
      pendingQuotes,
      activeWindows,
      criticalAlerts,
    };
  }

  async count(filter = {}) {
    const f =
      typeof filter === "object" && filter !== null
        ? { ...filter }
        : {};

    return OrderRepo.count(f);
  }

  async startSession() {
    return OrderRepo.startSession();
  }
}

module.exports = new OrderService();
