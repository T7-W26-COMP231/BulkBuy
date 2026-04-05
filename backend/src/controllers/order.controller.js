// src/controllers/order.controller.js
const createError = require('http-errors');
const OrderService = require('../services/order.service');
const { getSocketIO } = require('../socket');

/**
 * Standard response wrapper
 * @param {Object} res
 * @param {Number} status
 * @param {Object} payload
 */
function send(res, status, payload) {
  return res.status(status).json(payload);
}

/**
 * Async wrapper to forward errors to express error handler
 * @param {Function} fn async route handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Build common opts (actor, correlationId, session)
 */
function buildOpts(req = {}) {
  return {
    session: req.app && req.app.locals && req.app.locals.session,
    actor: req.user,
    correlationId: req.headers && (req.headers['x-correlation-id'] || req.headers['x-request-id']) || null
  };
}

const OrderController = {
  /**
   * POST /orders
   */
  createOrder: asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const opts = buildOpts(req);
    const created = await OrderService.createOrder(payload, opts);

    // Emit real-time event (order created) - best-effort
    try {
      const io = getSocketIO();
      io.emit('order_created', created);
    } catch (err) {
      console.warn('Socket.IO not ready:', err && err.message);
    }

    return send(res, 201, { success: true, data: created });
  }),

  /**
   * GET /orders/:id
   */
  getById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw createError(400, 'id is required');
    const opts = {
      select: req.query.select,
      populate: req.query.populate
    };
    const order = await OrderService.getById(id, opts);
    return send(res, 200, { success: true, data: order });
  }),

  /**
   * GET /orders/user/:userId
   */
  findByUserId: asyncHandler(async (req, res) => {
    const { userId } = req.params;
    if (!userId) throw createError(400, 'userId is required');
    const opts = {
      page: req.query.page,
      limit: req.query.limit,
      sort: req.query.sort,
      select: req.query.select,
      populate: req.query.populate
    };
    const results = await OrderService.findByUserId(userId, opts);
    return send(res, 200, { success: true, items: results });
  }),

  /**
   * GET /orders/user/:userId/enriched
   * Read-intensive, paginated, enriched orders for a user
   * Query params: region, page, limit, status (string or JSON array), includeSaveForLater, persist
   */
  getEnrichedByUserId: asyncHandler(async (req, res) => {
    const { userId } = req.params;
    if (!userId) throw createError(400, 'userId is required');

    const opts = buildOpts(req);
    const serviceOpts = {
      region: req.query.region,
      page: req.query.page,
      limit: req.query.limit,
      status: (() => {
        if (!req.query.status) return undefined;
        try {
          return JSON.parse(req.query.status);
        } catch (e) {
          return req.query.status;
        }
      })(),
      includeSaveForLater: req.query.includeSaveForLater === 'true' || req.query.includeSaveForLater === true,
      persist: req.query.persist === 'true' || req.query.persist === true,
      session: opts.session
    };

    const enriched = await OrderService._getEnrichedOrdersForUser(userId, serviceOpts);
    return send(res, 200, { success: true, ...enriched });
  }),

  /**
   * GET /orders
   * Query: ?page=1&limit=25&sort=createdAt:-1&filter={"status":"draft"}
   */
  listOrders: asyncHandler(async (req, res) => {
    let filter = {};
    try {
      filter = req.query.filter ? JSON.parse(req.query.filter) : {};
    } catch (err) {
      throw createError(400, 'Invalid filter JSON');
    }
    const opts = {
      page: req.query.page,
      limit: req.query.limit,
      sort: req.query.sort,
      select: req.query.select,
      populate: req.query.populate
    };
    const result = await OrderService.listOrders(filter, opts);
    return send(res, 200, { success: true, ...result });
  }),

  /**
 * GET /orders/supplier-requests
 */
  getSupplierOrderRequests: asyncHandler(async (req, res) => {
    const opts = {
      ops_region: req.query.ops_region,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit
    };

    const result = await OrderService.getSupplierOrderRequests(opts);

    return send(res, 200, {
      success: true,
      ...result
    });
  }),

  /**
   * PATCH /orders/:id
   */
  updateById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const update = req.body || {};

    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    const opts = Object.assign({ new: true }, {
      populate: req.query.populate,
      actor: req.user,
      correlationId: req.headers['x-correlation-id'] || null
    });

    const updated = await OrderService.updateById(id, update, opts);

    // Emit real-time event (order updated)
    try {
      const io = getSocketIO();
      io.emit('order_updated', updated);
    } catch (err) {
      console.warn('Socket.IO not ready:', err && err.message);
    }

    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * PATCH /orders
   * Body: { filter, update, opts }
   */
  updateOne: asyncHandler(async (req, res) => {
    const body = req.body || {};
    const filter = body.filter || {};
    const update = body.update || {};
    const opts = Object.assign({}, body.opts || {}, {
      actor: req.user,
      correlationId: req.headers['x-correlation-id'] || null
    });
    const updated = await OrderService.updateOne(filter, update, opts);
    // Emit real-time event (order updated)
    try {
      const io = getSocketIO();
      io.emit('order_updated', updated);
    } catch (err) {
      console.warn('Socket.IO not ready:', err && err.message);
    }
    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * POST /orders/:id/add-message
   * Body: { messageId }
   */
  addMessage: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { messageId } = req.body || {};
    if (!id || !messageId) throw createError(400, 'order id and messageId are required');
    const opts = buildOpts(req);
    const updated = await OrderService.addMessage(id, messageId, opts);
    return send(res, 200, { success: true, data: updated });
  }),

  /**
  * POST /orders/:id/update-status
  * Body: { status }
  */
  updateStatus: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!id || !status) {
      throw createError(400, 'order id and status are required');
    }

    const opts = buildOpts(req);
    const updated = await OrderService.updateStatus(id, status, opts);

    // Emit status update
    try {
      const io = getSocketIO();
      io.emit('order_status_updated', updated);
    } catch (err) {
      console.warn('Socket.IO not ready:', err && err.message);
    }

    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * PATCH /orders/:id/approve
   * Supplier approves order request
   */
  approveSupplierOrder: asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!id) {
      throw createError(400, 'order id is required');
    }

    const opts = buildOpts(req);
    const updated = await OrderService.approveSupplierOrder(id, opts);

    // Emit supplier approval event
    try {
      const io = getSocketIO();
      io.emit('supplier_order_approved', updated);
    } catch (err) {
      console.warn('Socket.IO not ready:', err && err.message);
    }

    return send(res, 200, { success: true, data: updated });
  }),

  /**
 * PATCH /orders/:id/decline
 * Supplier declines order request with required reason
 */
declineSupplierOrder: asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  if (!id) {
    throw createError(400, 'order id is required');
  }

  if (!reason || !reason.trim()) {
    throw createError(400, 'decline reason is required');
  }

  const opts = buildOpts(req);
  const updated = await OrderService.declineSupplierOrder(
    id,
    reason.trim(),
    opts
  );

  // Emit supplier decline event
  try {
    const io = getSocketIO();
    io.emit('supplier_order_declined', updated);
  } catch (err) {
    console.warn('Socket.IO not ready:', err && err.message);
  }

  return send(res, 200, { success: true, data: updated });
}),

/**
 * PATCH /orders/:id/confirm-fulfillment
 * Supplier confirms fulfillment and records expected delivery date
 */

confirmFulfillment: asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { expectedDeliveryDate } = req.body || {};

  if (!id) {
    throw createError(400, 'order id is required');
  }

  if (!expectedDeliveryDate) {
    throw createError(400, 'expectedDeliveryDate is required');
  }

  const opts = buildOpts(req);
  const updated = await OrderService.confirmFulfillment(
    id,
    expectedDeliveryDate,
    opts
  );

  try {
    const io = getSocketIO();
    io.emit('order_fulfillment_confirmed', updated);
  } catch (err) {
    console.warn('Socket.IO not ready:', err && err.message);
  }

  return send(res, 200, { success: true, data: updated });
}),



  /**
   * POST /orders/:id/submit
   * Submits a draft order (transactional)
   */
  submitOrder: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw createError(400, 'order id is required');
    const opts = buildOpts(req);
    const updated = await OrderService.submitOrder(id, opts);

    // Emit submission event
    try {
      const io = getSocketIO();
      io.emit('order_submitted', updated);
    } catch (err) {
      console.warn('Socket.IO not ready:', err && err.message);
    }

    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * POST /orders/:id/cancel
   * Cancels an order and moves items to draft where applicable
   */
  cancelOrder: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw createError(400, 'order id is required');
    const opts = buildOpts(req);
    const updated = await OrderService.cancelOrder(id, opts);

    // Emit cancellation event
    try {
      const io = getSocketIO();
      io.emit('order_cancelled', updated);
    } catch (err) {
      console.warn('Socket.IO not ready:', err && err.message);
    }

    return send(res, 200, { success: true, data: updated });
  }),

  /* -------------------------
   * Cart / item-level endpoints
   * ------------------------- */

  /**
   * POST /orders/:id/add-item
   * Body: { productId, itemId, pricingSnapshot?, saveForLater?, quantity? }
   */
  addItem: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = req.body || {};
    if (!id) throw createError(400, 'order id is required');
    if (!item || typeof item !== 'object') throw createError(400, 'item is required');
    const opts = buildOpts(req);
    const updated = await OrderService.addItem(id, item, opts);
    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * PATCH /orders/:id/set-item-quantity
   * Body: { itemId, quantity }
   */
  setItemQuantity: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { itemId, quantity } = req.body || {};
    if (!id || !itemId) throw createError(400, 'order id and itemId are required');
    if (quantity === undefined || quantity === null) throw createError(400, 'quantity is required');
    const opts = buildOpts(req);
    const updated = await OrderService.setItemQuantity(id, itemId, quantity, opts);
    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * PATCH /orders/:id/update-item
   * Body: { itemId, changes: { quantity?, saveForLater?, pricingSnapshot? } }
   */
  updateItem: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { itemId, changes } = req.body || {};
    if (!id || !itemId) throw createError(400, 'order id and itemId are required');
    if (!changes || typeof changes !== 'object') throw createError(400, 'changes must be an object');
    const opts = buildOpts(req);
    const updated = await OrderService.updateItem(id, itemId, changes, opts);
    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * DELETE /orders/:id/items/:itemId
   */
  removeItem: asyncHandler(async (req, res) => {
    const { id, itemId } = req.params;
    if (!id || !itemId) throw createError(400, 'order id and itemId are required');
    const opts = buildOpts(req);
    const updated = await OrderService.removeItem(id, itemId, opts);
    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * POST /orders/:id/extract-save-for-later
   */
  extractSaveForLater: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw createError(400, 'order id is required');
    const opts = buildOpts(req);
    const result = await OrderService.extractSaveForLater(id, opts);
    return send(res, 200, { success: true, data: result });
  }),

  /**
   * DELETE /orders/:id/hard
   * Hard delete (admin usage)
   */
  hardDeleteById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw createError(400, 'id is required');
    const opts = buildOpts(req);
    const removed = await OrderService.hardDeleteById(id, opts);
    return send(res, 200, { success: true, data: removed });
  }),

  /**
   * POST /orders/bulk
   */
  bulkCreate: asyncHandler(async (req, res) => {
    const docs = req.body;
    if (!Array.isArray(docs) || docs.length === 0) {
      throw createError(400, 'Request body must be a non-empty array of order objects');
    }
    const opts = buildOpts(req);
    const inserted = await OrderService.bulkCreate(docs, opts);
    return send(res, 201, { success: true, data: inserted });
  })
};

module.exports = OrderController;
