// src/routes/salesWindow.routes.js
/**
 * SalesWindow routes (validated)
 *
 * Base path: /api/sales-windows
 *
 * Routes:
 * POST   /                         -> create sales window
 * GET    /:id                      -> get sales window by id
 * GET    /range                    -> get windows by range (fromEpoch,toEpoch)
 * GET    /                         -> list / paginate sales windows
 * PATCH  /:id                      -> update sales window
 * POST   /upsert                   -> upsert sales window (body: { filter, update })
 * POST   /bulk-insert              -> bulk insert sales windows (body: array or { docs: [] })
 * POST   /:id/items                -> add or update item snapshot (body: { productId, itemId, ... })
 * DELETE /:id/items/:productId/:itemId -> remove item snapshot
 * GET    /:id/items/:productId/:itemId -> get item snapshot
 * GET    /:id/overflow-chain       -> get overflow chain for a window
 * DELETE /:id                      -> hard delete sales window (admin only)
 */

const express = require('express');
const SalesWindowController = require('../controllers/salesWindow.controller');
const validators = require('../validators/salesWindow.validators'); // adjust path if needed
const { requireAuth } = require('../middleware/auth.middleware'); // adjust path to your auth middleware

const router = express.Router();

/* Async wrapper to forward errors to express error handler */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/* Create sales window
 * POST /api/sales-windows
 */
router.post(
  '/',
  requireAuth,
  validators.create,
  asyncHandler(SalesWindowController.create)
);

/* Get sales window by id
 * GET /api/sales-windows/:id
 */
router.get(
  '/:id',
  requireAuth,
  validators.idParam,
  asyncHandler(SalesWindowController.getById)
);

/* Get windows by range
 * GET /api/sales-windows/range?fromEpoch=...&toEpoch=...
 */
router.get(
  '/range',
  validators.range,
  asyncHandler(SalesWindowController.findByWindowRange)
);

/* List / paginate sales windows
 * GET /api/sales-windows
 */
router.get(
  '/',
  validators.list,
  asyncHandler(SalesWindowController.list)
);

/* Update sales window by id (partial)
 * PATCH /api/sales-windows/:id
 */
router.patch(
  '/:id',
  requireAuth,
  validators.updateById,
  asyncHandler(SalesWindowController.updateById)
);

/* Upsert sales window
 * POST /api/sales-windows/upsert
 */
router.post(
  '/upsert',
  requireAuth,
  validators.upsert,
  asyncHandler(SalesWindowController.upsert)
);

/* Bulk insert sales windows
 * POST /api/sales-windows/bulk-insert
 */
router.post(
  '/bulk-insert',
  requireAuth,
  validators.bulkInsert,
  asyncHandler(SalesWindowController.bulkInsert)
);

/* Add or update item snapshot
 * POST /api/sales-windows/:id/items
 * Body must include productId and itemId (or they can be provided in params)
 */
router.post(
  '/:id/items',
  requireAuth,
  validators.idParam,
  validators.addOrUpdateItem,
  asyncHandler(SalesWindowController.addOrUpdateItem)
);

/* Remove item snapshot
 * DELETE /api/sales-windows/:id/items/:productId/:itemId
 */
router.delete(
  '/:id/items/:productId/:itemId',
  requireAuth,
  validators.idParam,
  validators.productIdParam,
  validators.itemIdParam,
  asyncHandler(SalesWindowController.removeItem)
);

/* Get item snapshot (with optional fallback query param)
 * GET /api/sales-windows/:id/items/:productId/:itemId
 */
router.get(
  '/:id/items/:productId/:itemId',
  requireAuth,
  validators.idParam,
  validators.productIdParam,
  validators.itemIdParam,
  asyncHandler(SalesWindowController.getItemSnapshot)
);

/* Get overflow chain for a window
 * GET /api/sales-windows/:id/overflow-chain
 */
router.get(
  '/:id/overflow-chain',
  requireAuth,
  validators.idParam,
  asyncHandler(SalesWindowController.getOverflowChain)
);

/* Hard delete sales window (admin only)
 * DELETE /api/sales-windows/:id
 */
router.delete(
  '/:id',
  requireAuth,
  validators.idParam,
  validators.adminOnly,
  asyncHandler(SalesWindowController.deleteById)
);

module.exports = router;
