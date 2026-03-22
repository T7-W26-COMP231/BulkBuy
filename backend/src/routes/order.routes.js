// src/routes/order.routes.js
const express = require('express');
const OrderController = require('../controllers/order.controller');
const orderValidators = require('../validators/order.validators');

const router = express.Router();

/**
 * Async wrapper to forward errors to express error handler
 * @param {Function} fn async route handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Routes
 *
 * POST   /orders                      -> create order
 * POST   /orders/bulk                 -> bulk create orders
 * GET    /orders                      -> list orders (pagination/filter via query)
 * GET    /orders/:id                  -> get order by Mongo _id
 * GET    /orders/user/:userId         -> find orders by userId
 * PATCH  /orders/:id                  -> update order by _id
 * PATCH  /orders                      -> update one by filter (body: { filter, update, opts })
 * POST   /orders/:id/add-message      -> add message id to order
 * POST   /orders/:id/update-status    -> update order status
 * POST   /orders/:id/add-item         -> add or increment item in cart
 * PATCH  /orders/:id/set-item-quantity-> set item quantity (0 removes)
 * PATCH  /orders/:id/update-item      -> update item attributes (quantity/saveForLater/pricingSnapshot)
 * DELETE /orders/:id/items/:itemId    -> remove item from order
 * POST   /orders/:id/extract-save-for-later -> extract saveForLater items
 * DELETE /orders/:id/hard             -> hard delete (admin)
 */

/* Create order */
router.post(
  '/',
  orderValidators && orderValidators.create,
  asyncHandler(OrderController.createOrder)
);

/* Bulk create orders */
router.post(
  '/bulk',
  orderValidators && orderValidators.bulkCreate,
  asyncHandler(OrderController.bulkCreate)
);

/* List orders (supports ?page=&limit=&filter= JSON) */
router.get(
  '/',
  orderValidators && orderValidators.query,
  asyncHandler(OrderController.listOrders)
);

/* Get order by Mongo _id */
router.get(
  '/:id',
  orderValidators && orderValidators.idParam,
  asyncHandler(OrderController.getById)
);

/* Find orders by userId */
router.get(
  '/user/:userId',
  orderValidators && orderValidators.userIdParam,
  asyncHandler(OrderController.findByUserId)
);

/* Update order by _id (partial update) */
router.patch(
  '/:id',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.update,
  asyncHandler(OrderController.updateById)
);

/* Update one by filter: body { filter, update, opts } */
router.patch(
  '/',
  orderValidators && orderValidators.updateOne,
  asyncHandler(OrderController.updateOne)
);

/* Add message to order */
router.post(
  '/:id/add-message',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.addMessage,
  asyncHandler(OrderController.addMessage)
);

/* Update order status */
router.post(
  '/:id/update-status',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.updateStatus,
  asyncHandler(OrderController.updateStatus)
);

/* Add or increment item in cart */
router.post(
  '/:id/add-item',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.addItem,
  asyncHandler(OrderController.addItem)
);

/* Set item quantity (0 removes item) */
router.patch(
  '/:id/set-item-quantity',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.setItemQuantity,
  asyncHandler(OrderController.setItemQuantity)
);

/* Update item attributes (quantity, saveForLater, pricingSnapshot) */
router.patch(
  '/:id/update-item',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.updateItem,
  asyncHandler(OrderController.updateItem)
);

/* Remove item from order */
router.delete(
  '/:id/items/:itemId',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.itemIdParam,
  asyncHandler(OrderController.removeItem)
);

/* Extract saveForLater items */
router.post(
  '/:id/extract-save-for-later',
  orderValidators && orderValidators.idParam,
  asyncHandler(OrderController.extractSaveForLater)
);

/* Hard delete (admin) */
router.delete(
  '/:id/hard',
  orderValidators && orderValidators.idParam,
  orderValidators && orderValidators.adminOnly,
  asyncHandler(OrderController.hardDeleteById)
);

module.exports = router;
