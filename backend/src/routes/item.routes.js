// src/routes/item.routes.js
/**
 * Item routes (updated)
 *
 * Uses express-validator middleware from src/validators/item.validators.js
 *
 * Routes:
 * POST   /items                   -> create item
 * GET    /items/:id               -> get item by id
 * GET    /items/sku/:sku          -> get item by sku
 * GET    /items                   -> list / paginate items
 * PATCH  /items/:id               -> update item
 * POST   /items/upsert            -> upsert item (body: { filter, update })
 * POST   /items/bulk-insert       -> bulk insert items (body: array or { docs: [] })
 * POST   /items/:id/adjust-stock  -> adjust stock (body: { delta })
 * POST   /items/:id/reserve       -> reserve qty (body: { qty })
 * POST   /items/:id/release       -> release qty (body: { qty })
 * POST   /items/:id/apply-rating  -> apply rating (body: { rating })
 * POST   /items/:id/soft-delete   -> soft delete
 * DELETE /items/:id/hard          -> hard delete (admin only)
 * POST   /items/:id/publish       -> publish item
 * POST   /items/:id/unpublish     -> unpublish item
 * GET    /items/search            -> public search
 */

const express = require('express');

const ItemController = require('../controllers/item.controller');
const { requireAuth } = require('../middleware/auth.middleware'); // adjust path to your auth middleware
const validators = require('../validators/item.validators');

const router = express.Router();

/* Async wrapper to forward errors to express error handler */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/* Routes */

/* Create item */
router.post(
  '/',
  requireAuth,
  validators.create,
  asyncHandler(ItemController.create)
);

/* Public catalog */
router.get(
  '/catalog',
  validators.list,
  asyncHandler(ItemController.catalog)
);

/* Get item by SKU */
router.get(
  '/sku/:sku',
  requireAuth,
  validators.skuParam,
  asyncHandler(ItemController.findBySku)
);

/* Public search (no auth required) */
router.get(
  '/search',
  validators.publicSearch,
  asyncHandler(ItemController.publicSearch)
);

// added this here to we have retrieve supplier approved items
router.get(
  '/approved',
  requireAuth,
  asyncHandler(ItemController.getApprovedItems)
);


/* Get item by id */
router.get(
  '/:id',
  validators.idParam,
  asyncHandler(ItemController.getById)
);

/* List / paginate items */
router.get(
  '/',
  validators.list,
  asyncHandler(ItemController.list)
);

/* Update item by id (partial) */
router.patch(
  '/:id',
  requireAuth,
  validators.updateById,
  asyncHandler(ItemController.updateById)
);

/* Upsert item (body: { filter, update }) */
router.post(
  '/upsert',
  requireAuth,
  validators.upsert,
  asyncHandler(ItemController.upsert)
);

/* Bulk insert items */
router.post(
  '/bulk-insert',
  requireAuth,
  validators.bulkInsert,
  asyncHandler(ItemController.bulkInsert)
);

/* Adjust stock */
router.post(
  '/:id/adjust-stock',
  requireAuth,
  validators.adjustStock,
  asyncHandler(ItemController.adjustStock)
);

/* Reserve quantity */
router.post(
  '/:id/reserve',
  requireAuth,
  validators.reserve,
  asyncHandler(ItemController.reserve)
);

/* Release reserved quantity */
router.post(
  '/:id/release',
  requireAuth,
  validators.release,
  asyncHandler(ItemController.release)
);

/* Apply rating */
router.post(
  '/:id/apply-rating',
  requireAuth,
  validators.applyRating,
  asyncHandler(ItemController.applyRating)
);

/* Soft delete */
router.post(
  '/:id/soft-delete',
  requireAuth,
  validators.softDelete,
  asyncHandler(ItemController.softDelete)
);

/* Hard delete (admin only) */
router.delete(
  '/:id/hard',
  requireAuth,
  validators.hardDelete,
  validators.adminOnly,
  asyncHandler(ItemController.hardDelete)
);

/* Publish / Unpublish */
router.post(
  '/:id/publish',
  requireAuth,
  validators.publish,
  asyncHandler(ItemController.publish)
);

router.post(
  '/:id/unpublish',
  requireAuth,
  validators.publish,
  asyncHandler(ItemController.unpublish)
);

module.exports = router;
