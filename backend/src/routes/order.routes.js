// src/routes/order.routes.js
const express = require('express');
const OrderController = require('../controllers/order.controller');
const orderValidators = require('../validators/order.validators');
const { requireAuth, requireAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * Async wrapper to forward errors to express error handler
 * @param {Function} fn async route handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Route annotations and definitions
 *
 * Each route is annotated with:
 * - purpose: short description of intent
 * - method: HTTP method
 * - path: route path
 * - params: path/query/body parameters expected
 * - validators: validator middleware (if present)
 * - controller: controller handler
 */


/**
 * Routes
 *
 * POST   /orders                      -> create order
 * POST   /orders/bulk                 -> bulk create orders
 * GET    /orders                      -> list orders (pagination/filter via query)
 * GET    /orders/:id/invoice          -> get finalized invoice data for an order
 * GET    /orders/:id                  -> get order by Mongo _id
 * GET    /orders/user/:userId         -> find orders by userId
 * GET    /orders/user/:userId/enriched-> enriched, read-intensive orders for user
 * PATCH  /orders/:id                  -> update order by _id
 * PATCH  /orders                      -> update one by filter (body: { filter, update, opts })
 * POST   /orders/:id/add-message      -> add message id to order
 * POST   /orders/:id/update-status    -> update order status
 * POST   /orders/:id/submit           -> submit a draft order
 * POST   /orders/:id/cancel           -> cancel an order
 * POST   /orders/:id/add-item         -> add or increment item in cart
 * PATCH  /orders/:id/set-item-quantity-> set item quantity (0 removes)
 * PATCH  /orders/:id/update-item      -> update item attributes (quantity/saveForLater/pricingSnapshot)
 * DELETE /orders/:id/items/:itemId    -> remove item from order
 * POST   /orders/:id/extract-save-for-later -> extract saveForLater items
 * DELETE /orders/:id/hard             -> hard delete (admin)
 */


/* -------------------------------------------------------------------------- */
/* Create order
 * purpose: Create a new order document (initial draft or prefilled)
 * method: POST
 * path: /orders
 * params:
 *   - body: order payload (userId, items[], ops_region, etc.)
 * validators: orderValidators.create
 * controller: OrderController.createOrder
 */
router.post(
  '/',
  orderValidators && orderValidators.create,
  asyncHandler(OrderController.createOrder)
);

/* -------------------------------------------------------------------------- */
/* Bulk create orders
 * purpose: Bulk ingest/create multiple orders (admin/ingest)
 * method: POST
 * path: /orders/bulk
 * params:
 *   - body: Array of order objects
 * validators: orderValidators.bulkCreate
 * controller: OrderController.bulkCreate
 */
router.post(
  '/bulk',
  orderValidators && orderValidators.bulkCreate,
  asyncHandler(OrderController.bulkCreate)
);

/* -------------------------------------------------------------------------- */
/* List orders (paginated)
 * purpose: List orders with pagination, sorting and optional filter
 * method: GET
 * path: /orders
 * params:
 *   - query: page, limit, sort, select, populate, filter (JSON string)
 * validators: orderValidators.query
 * controller: OrderController.listOrders
 */
router.get(
  '/',
  orderValidators && orderValidators.query,
  asyncHandler(OrderController.listOrders)
);

/* -------------------------------------------------------------------------- */
/* Supplier order requests
 * purpose: Retrieve supplier order requests for review
 * method: GET
 * path: /orders/supplier-requests
 * params:
 *   - query: supplierId, status, page, limit
 * validators: none for now
 * controller: OrderController.getSupplierOrderRequests
 */
router.get(
  '/supplier-requests',
  asyncHandler(OrderController.getSupplierOrderRequests)
);

/* -------------------------------------------------------------------------- */
/* Dashboard metrics (admin)
 * purpose: Retrieve summary metrics for the admin dashboard
 * method: GET
 * path: /orders/dashboard-metrics
 * params:
 *   - none
 * validators: requireAuth, requireAdmin
 * controller: OrderController.getDashboardMetrics
 */
router.get(
  '/dashboard-metrics',
  requireAuth,
  requireAdmin,
  asyncHandler(OrderController.getDashboardMetrics)
);

/* -------------------------------------------------------------------------- */
/* Get order status by id
 * purpose: Retrieve current status snapshot for a single order
 * method: GET
 * path: /orders/:id/status
 * params:
 *   - path: id (order id)
 * validators: requireAuth, getStatus
 * controller: OrderController.getStatusById
 */
router.get(
  '/:id/status',
  requireAuth,
  orderValidators && orderValidators.getStatus,
  asyncHandler(OrderController.getStatusById)
);

/* -------------------------------------------------------------------------- */
/* Get order history by id
 * purpose: Retrieve status-change timeline for a single order
 * method: GET
 * path: /orders/:id/history
 * params:
 *   - path: id (order id)
 *   - query: includeAudit (bool), page, limit
 * validators: requireAuth, getHistory
 * controller: OrderController.getHistoryById
 */
router.get(
  '/:id/history',
  requireAuth,
  orderValidators && orderValidators.getHistory,
  asyncHandler(OrderController.getHistoryById)
);

/* -------------------------------------------------------------------------- */
/* Get user order history
 * purpose: Retrieve paginated order history summaries for a user
 * method: GET
 * path: /orders/user/:userId/history
 * params:
 *   - path: userId
 *   - query: status, afterEpoch, beforeEpoch, page, limit
 * validators: requireAuth, getUserHistory
 * controller: OrderController.getUserOrderHistory
 */
router.get(
  '/user/:userId/history',
  requireAuth,
  orderValidators && orderValidators.getUserHistory,
  asyncHandler(OrderController.getUserOrderHistory)
);
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Get finalized order invoice by id
 * purpose: Retrieve invoice-ready data for a single order, including final pricing,
 *          totals, savings, and pending-pricing state when the aggregation window
 *          has not closed yet
 * method: GET
 * path: /orders/:id/invoice
 * params:
 *   - path: id (order id)
 * validators: orderValidators.idParam
 * controller: OrderController.getInvoiceById
 */
router.get(
  '/:id/invoice',
  orderValidators && orderValidators.idParam,
  asyncHandler(OrderController.getInvoiceById)
);

/* -------------------------------------------------------------------------- */
/* Get order by id
 * purpose: Retrieve a single order by Mongo _id
 * method: GET
 * path: /orders/:id
 * params:
 *   - path: id (Mongo ObjectId)
 *   - query: select, populate
 * validators: orderValidators.idParam
 * controller: OrderController.getById
 */
router.get(
  '/:id',
  orderValidators && orderValidators.idParam,
  asyncHandler(OrderController.getById)
);

/* -------------------------------------------------------------------------- */
/* Find orders by userId
 * purpose: Return orders for a specific user (paged)
 * method: GET
 * path: /orders/user/:userId
 * params:
 *   - path: userId
 *   - query: page, limit, sort, select, populate
 * validators: orderValidators.userIdParam
 * controller: OrderController.findByUserId
 */
router.get(
  '/user/:userId',
  orderValidators && orderValidators.userIdParam,
  asyncHandler(OrderController.findByUserId)
);

/* -------------------------------------------------------------------------- */
/* Read-intensive enriched orders for user
 * purpose: Return paginated, enriched orders for a user (latest sales-window data)
 * method: GET
 * path: /orders/user/:userId/enriched
 * params:
 *   - path: userId
 *   - query: region, page, limit, status (string or JSON array), includeSaveForLater, persist
 * validators: orderValidators.userIdParam
 * controller: OrderController.getEnrichedByUserId
 */
router.get(
  '/user/:userId/enriched',
  orderValidators && orderValidators.userIdParam,
  asyncHandler(OrderController.getEnrichedByUserId)
);

/* -------------------------------------------------------------------------- */
/* Partial update by id
 * purpose: Apply partial updates to an order document
 * method: PATCH
 * path: /orders/:id
 * params:
 *   - path: id
 *   - body: partial update object
 * validators: orderValidators.idParam, orderValidators.update
 * controller: OrderController.updateById
 */

/* -------------------------------------------------------------------------- */
/* Approve supplier order request
 * purpose: Supplier approves an order request for supply workflow
 * method: PATCH
 * path: /orders/:id/approve
 * params:
 *   - path: id
 * validators: orderValidators.idParam
 * controller: OrderController.approveSupplierOrder
 */
router.patch(
  '/:id/approve',
  orderValidators && orderValidators.idParam,
  asyncHandler(OrderController.approveSupplierOrder)
);

/* -------------------------------------------------------------------------- */
/* Decline supplier order request
 * purpose: Supplier declines an order request with required reason
 * method: PATCH
 * path: /orders/:id/decline
 * params:
 *   - path: id
 *   - body: { reason }
 * validators: orderValidators.idParam
 * controller: OrderController.declineSupplierOrder
 */
router.patch(
  '/:id/decline',
  orderValidators && orderValidators.idParam,
  asyncHandler(OrderController.declineSupplierOrder)
);
router.patch(
  '/:id',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.update,
  asyncHandler(OrderController.updateById)
);

/* -------------------------------------------------------------------------- */
/* Confirm fulfillment
 * purpose: Supplier confirms fulfillment and records expected delivery date
 * method: PATCH
 * path: /orders/:id/confirm-fulfillment
 * params:
 *   - path: id
 *   - body: { expectedDeliveryDate }
 * validators: orderValidators.idParam
 * controller: OrderController.confirmFulfillment
 */
router.patch(
  '/:id/confirm-fulfillment',
  orderValidators && orderValidators.idParam,
  asyncHandler(OrderController.confirmFulfillment)
);


/* -------------------------------------------------------------------------- */
/* Update one by filter
 * purpose: Find one order by filter and apply update (body: { filter, update, opts })
 * method: PATCH
 * path: /orders
 * params:
 *   - body: { filter, update, opts }
 * validators: orderValidators.updateOne
 * controller: OrderController.updateOne
 */
router.patch(
  '/',
  orderValidators && orderValidators.updateOne,
  asyncHandler(OrderController.updateOne)
);

/* -------------------------------------------------------------------------- */
/* Add message to order
 * purpose: Add a message id to order.messages (idempotent)
 * method: POST
 * path: /orders/:id/add-message
 * params:
 *   - path: id
 *   - body: { messageId }
 * validators: orderValidators.idParam, orderValidators.addMessage
 * controller: OrderController.addMessage
 */
router.post(
  '/:id/add-message',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.addMessage,
  asyncHandler(OrderController.addMessage)
);

/* -------------------------------------------------------------------------- */
/* Update order status
 * purpose: Atomically update order.status
 * method: POST
 * path: /orders/:id/update-status
 * params:
 *   - path: id
 *   - body: { status }
 * validators: orderValidators.idParam, orderValidators.updateStatus
 * controller: OrderController.updateStatus
 */
router.post(
  '/:id/update-status',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.updateStatus,
  asyncHandler(OrderController.updateStatus)
);

/* -------------------------------------------------------------------------- */
/* Submit a draft order
 * purpose: Submit a draft order (transactional flow: validate sales windows, update qtySold, create new draft)
 * method: POST
 * path: /orders/:id/submit
 * params:
 *   - path: id
 * validators: orderValidators.idParam
 * controller: OrderController.submitOrder
 */
router.post(
  '/:id/submit',
  orderValidators && orderValidators.idParam,
  asyncHandler(OrderController.submitOrder)
);

/* -------------------------------------------------------------------------- */
/* Cancel an order
 * purpose: Cancel an order and move items to draft where applicable
 * method: POST
 * path: /orders/:id/cancel
 * params:
 *   - path: id
 * validators: orderValidators.idParam
 * controller: OrderController.cancelOrder
 */
router.post(
  '/:id/cancel',
  orderValidators && orderValidators.idParam,
  asyncHandler(OrderController.cancelOrder)
);

/* -------------------------------------------------------------------------- */
/* Add or increment item in cart
 * purpose: Add an item to a draft order or increment existing quantity
 * method: POST
 * path: /orders/:id/add-item
 * params:
 *   - path: id
 *   - body: { productId, itemId, pricingSnapshot?, saveForLater?, quantity? }
 * validators: orderValidators.idParam, orderValidators.addItem
 * controller: OrderController.addItem
 */
router.post(
  '/:id/add-item',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.addItem,
  asyncHandler(OrderController.addItem)
);

/* -------------------------------------------------------------------------- */
/* Set item quantity
 * purpose: Set quantity for an item; quantity === 0 removes the item
 * method: PATCH
 * path: /orders/:id/set-item-quantity
 * params:
 *   - path: id
 *   - body: { itemId, quantity }
 * validators: orderValidators.idParam, orderValidators.setItemQuantity
 * controller: OrderController.setItemQuantity
 */
router.patch(
  '/:id/set-item-quantity',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.setItemQuantity,
  asyncHandler(OrderController.setItemQuantity)
);

/* -------------------------------------------------------------------------- */
/* Update item attributes
 * purpose: Update item attributes in-place (quantity, saveForLater, pricingSnapshot)
 * method: PATCH
 * path: /orders/:id/update-item
 * params:
 *   - path: id
 *   - body: { itemId, changes: { quantity?, saveForLater?, pricingSnapshot? } }
 * validators: orderValidators.idParam, orderValidators.updateItem
 * controller: OrderController.updateItem
 */
router.patch(
  '/:id/update-item',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.updateItem,
  asyncHandler(OrderController.updateItem)
);

/* -------------------------------------------------------------------------- */
/* Remove item from order
 * purpose: Remove an item by itemId from an order
 * method: DELETE
 * path: /orders/:id/items/:itemId
 * params:
 *   - path: id, itemId
 * validators: orderValidators.idParam, orderValidators.itemIdParam
 * controller: OrderController.removeItem
 */
router.delete(
  '/:id/items/:itemId',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.itemIdParam,
  asyncHandler(OrderController.removeItem)
);

/* -------------------------------------------------------------------------- */
/* Extract saveForLater items
 * purpose: Remove items marked saveForLater from the order and return them
 * method: POST
 * path: /orders/:id/extract-save-for-later
 * params:
 *   - path: id
 * validators: orderValidators.idParam
 * controller: OrderController.extractSaveForLater
 */
router.post(
  '/:id/extract-save-for-later',
  orderValidators && orderValidators.idParam,
  asyncHandler(OrderController.extractSaveForLater)
);

/* -------------------------------------------------------------------------- */
/* Hard delete (admin)
 * purpose: Permanently delete an order (admin only)
 * method: DELETE
 * path: /orders/:id/hard
 * params:
 *   - path: id
 * validators: orderValidators.idParam, orderValidators.adminOnly
 * controller: OrderController.hardDeleteById
 */
router.delete(
  '/:id/hard',
  requireAuth,
  requireAdmin,
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.adminOnly,
  asyncHandler(OrderController.hardDeleteById)
);

module.exports = router;
