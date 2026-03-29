// src/routes/salesWindow.routes.js
/**
 * SalesWindow routes (optimized, payload-first, annotated)
 *
 * Base path: /api/sales-windows
 *
 * Conventions:
 * - Window id remains a path param (:id)
 * - Mutations accept productId/itemId in the request body
 * - Reads accept productId/itemId via query string
 * - listAllCurrentProducts is internal and NOT exposed here
 *
 * Each route is a single-line definition; above each route is a short annotation
 * describing purpose, expected inputs (path/query/body), and auth/validator expectations.
 */

const express = require('express');
const SalesWindowController = require('../controllers/salesWindow.controller');
const validators = require('../validators/salesWindow.validators'); // adjust path if needed
const { requireAuth } = require('../middleware/auth.middleware'); // adjust path if needed
const { requireRole } = require('../middleware/rbac.middleware'); // adjust path if needed

const router = express.Router();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* -------------------------
 * Core SalesWindow CRUD
 * ------------------------- */

/* Create a sales window
 * POST /api/sales-windows
 * Body: window payload (window.fromEpoch, window.toEpoch, ops_region, metadata, etc.)
 * Auth: required
 * Validator: validators.create
 */
router.post('/', requireAuth, requireRole('administrator'), validators.create, asyncHandler(SalesWindowController.create));

/* Get a sales window by id
 * GET /api/sales-windows/:id
 * Path: :id (windowId)
 * Auth: required
 * Validator: validators.idParam
 */
router.get('/:id', requireAuth, requireRole('administrator'), validators.idParam, asyncHandler(SalesWindowController.getById));

/* Get windows by epoch range
 * GET /api/sales-windows/range?fromEpoch=...&toEpoch=...
 * Query: fromEpoch, toEpoch (numbers)
 * Auth: optional (validator enforces params)
 * Validator: validators.range
 */
router.get('/range', requireAuth, requireRole('administrator'), validators.range, asyncHandler(SalesWindowController.findByWindowRange));

/* List / paginate sales windows
 * GET /api/sales-windows?page=&limit=&filter=&sort=&lean=
 * Query: page, limit, filter (JSON string or object), sort, lean
 * Auth: optional (list is read-only)
 * Validator: validators.list
 */
router.get('/', requireAuth, requireRole('administrator'), validators.list, asyncHandler(SalesWindowController.list));

/* Update a sales window (partial)
 * PATCH /api/sales-windows/:id
 * Path: :id (windowId)
 * Body: partial update object
 * Auth: required
 * Validator: validators.idParam, validators.updateById
 */
router.patch('/:id', requireAuth, requireRole('administrator'), validators.idParam, validators.updateById, asyncHandler(SalesWindowController.updateById));

/* Upsert a sales window
 * POST /api/sales-windows/upsert
 * Body: { filter, update }
 * Auth: required
 * Validator: validators.upsert
 */
router.post('/upsert', requireAuth, requireRole('administrator'), validators.upsert, asyncHandler(SalesWindowController.upsert));

/* Bulk insert sales windows
 * POST /api/sales-windows/bulk-insert
 * Body: array of window docs OR { docs: [...] }
 * Auth: required
 * Validator: validators.bulkInsert
 */
router.post('/bulk-insert', requireAuth, requireRole('administrator'), validators.bulkInsert, asyncHandler(SalesWindowController.bulkInsert));

/* -------------------------
 * Item snapshot endpoints (payload-first)
 * ------------------------- */

/* Add or update an item snapshot for a window
 * POST /api/sales-windows/:id/items
 * Path: :id (windowId)
 * Body: { productId, itemId, pricing_snapshot?, metadata?, ... }
 * Auth: required
 * Validator: validators.idParam, validators.addOrUpdateItem
 */
router.post('/:id/items', requireAuth, requireRole('administrator'), validators.idParam, validators.addOrUpdateItem, asyncHandler(SalesWindowController.addOrUpdateItem));

/* Remove an item snapshot (payload-first delete)
 * DELETE /api/sales-windows/:id/items
 * Path: :id (windowId)
 * Body: { productId, itemId }
 * Auth: required
 * Validator: validators.idParam, validators.deleteItemBody
 * Note: If some clients cannot send bodies with DELETE, keep the legacy
 *       DELETE /:id/items/:productId/:itemId route as a fallback.
 */
router.delete('/:id/items', requireAuth, requireRole('administrator'), validators.idParam, validators.deleteItemBody, asyncHandler(SalesWindowController.removeItem));

/* Get an item snapshot (read)
 * GET /api/sales-windows/:id/items?productId=...&itemId=...&fallback=true
 * Path: :id (windowId)
 * Query: productId, itemId, fallback (optional)
 * Auth: required
 * Validator: validators.idParam, validators.getItemQuery
 */
router.get('/:id/items', requireAuth, requireRole('administrator'), validators.idParam, validators.getItemQuery, asyncHandler(SalesWindowController.getItemSnapshot));

/* -------------------------
 * Product / Item management (mutations via body)
 * ------------------------- */

/* Add a product to a window
 * POST /api/sales-windows/:id/products
 * Path: :id (windowId)
 * Body: { productId, metadata?, ... }
 * Auth: required
 * Validator: validators.idParam, validators.addProduct
 */
router.post('/:id/products', requireAuth, requireRole('administrator'), validators.idParam, validators.addProduct, asyncHandler(SalesWindowController.addProduct));

/* Add an item to a product (single)
 * POST /api/sales-windows/:id/products/items
 * Path: :id (windowId)
 * Body: { productId, itemPayload }
 * Auth: required
 * Validator: validators.idParam, validators.addProductItemBody
 */
router.post('/:id/products/items', requireAuth, requireRole('administrator'), validators.idParam, validators.addProductItemBody, asyncHandler(SalesWindowController.addProductItem));

/* Upsert an item (alternate upsert route)
 * POST /api/sales-windows/:id/products/items/upsert
 * Path: :id (windowId)
 * Body: { productId, itemId, ... }
 * Auth: required
 * Validator: validators.idParam, validators.addOrUpdateItem
 */
router.post('/:id/products/items/upsert', requireAuth, requireRole('administrator'), validators.idParam, validators.addOrUpdateItem, asyncHandler(SalesWindowController.addOrUpdateItem));

/* List items for a product (read)
 * GET /api/sales-windows/:id/products/items?productId=...&page=&limit=
 * Path: :id (windowId)
 * Query: productId, page, limit, lean
 * Auth: required
 * Validator: validators.idParam, validators.listProductItemsQuery
 */
router.get('/:id/products/items', requireAuth, requireRole('administrator'), validators.idParam, validators.listProductItemsQuery, asyncHandler(SalesWindowController.listProductItems));

/* -------------------------
 * Pricing snapshots and tiers
 * ------------------------- */

/* Add a pricing snapshot
 * POST /api/sales-windows/:id/pricing-snapshots
 * Path: :id (windowId)
 * Body: { productId, itemId, snapshot }
 * Auth: required
 * Validator: validators.idParam, validators.pricingSnapshotBody
 */
router.post('/:id/pricing-snapshots', requireAuth, requireRole('administrator'), validators.idParam, validators.pricingSnapshotBody, asyncHandler(SalesWindowController.addPricingSnapshot));

/* Upsert a pricing snapshot
 * PUT /api/sales-windows/:id/pricing-snapshots
 * Path: :id (windowId)
 * Body: { productId, itemId, snapshot }
 * Auth: required
 * Validator: validators.idParam, validators.pricingSnapshotBody
 */
router.put('/:id/pricing-snapshots', requireAuth, requireRole('administrator'), validators.idParam, validators.pricingSnapshotBody, asyncHandler(SalesWindowController.upsertPricingSnapshot));

/* List pricing snapshots (global query)
 * GET /api/sales-windows/pricing-snapshots?productId=...&itemId=...
 * Query: productId, itemId
 * Auth: optional
 * Validator: validators.pricingSnapshotsQuery
 */
router.get('/pricing-snapshots', requireAuth, requireRole('administrator'), validators.pricingSnapshotsQuery, asyncHandler(SalesWindowController.listPricingSnapshots));

/* Get pricing tiers for an item
 * GET /api/sales-windows/:id/pricing-tiers?productId=...&itemId=...
 * Path: :id (windowId)
 * Query: productId, itemId
 * Auth: required
 * Validator: validators.idParam, validators.pricingTiersQuery
 */
router.get('/:id/pricing-tiers', requireAuth, requireRole('administrator'), validators.idParam, validators.pricingTiersQuery, asyncHandler(SalesWindowController.listPricingTiers));

/* -------------------------
 * Bulk product/item operations
 * ------------------------- */

/* Bulk insert products into a window
 * POST /api/sales-windows/:id/bulk-products
 * Path: :id (windowId)
 * Body: array of products
 * Auth: required
 * Validator: validators.idParam, validators.bulkProductsBody
 */
router.post('/:id/bulk-products', requireAuth, requireRole('administrator'), validators.idParam, validators.bulkProductsBody, asyncHandler(SalesWindowController.bulkInsertProducts));

/* Bulk insert items for a product
 * POST /api/sales-windows/:id/products/bulk-items
 * Path: :id (windowId)
 * Body: { productId, items: [...] }
 * Auth: required
 * Validator: validators.idParam, validators.bulkItemsBody
 */
router.post('/:id/products/bulk-items', requireAuth, requireRole('administrator'), validators.idParam, validators.bulkItemsBody, asyncHandler(SalesWindowController.bulkInsertItems));

/* -------------------------
 * Utilities
 * ------------------------- */

/* Get overflow chain for a window
 * GET /api/sales-windows/:id/overflow-chain
 * Path: :id (windowId)
 * Auth: required
 * Validator: validators.idParam
 */
router.get('/:id/overflow-chain', requireAuth, requireRole('administrator'), validators.idParam, asyncHandler(SalesWindowController.getOverflowChain));

/* Get current sales window status for a customer-facing item/product check
 * GET /api/sales-windows/public/current-status?region=...&productId=...&itemId=...
 * Query: region (required), productId (optional), itemId (optional)
 * Auth: not required
 * Validator: none
 * Note: This returns a minimal customer-safe payload (windowId, fromEpoch, toEpoch, status) instead of full SalesWindow documents.
 */
router.get('/public/current-status', asyncHandler(SalesWindowController.getCurrentWindowStatusForCustomer));

/* List all current sales windows (head + overflow)
 * GET /api/sales-windows/current?region=...&page=&limit=
 * Query: region (required), page, limit, lean
 * Auth: optional
 * Validator: validators.currentQuery
 * Note: This returns SalesWindow documents as-is; merging/price enrichment is done elsewhere.
 */
router.get('/current', requireAuth, requireRole('administrator'), validators.currentQuery, asyncHandler(SalesWindowController.listAllCurrentSalesWindows));

/* Hard delete a sales window (admin only)
 * DELETE /api/sales-windows/:id
 * Path: :id (windowId)
 * Auth: required (admin)
 * Validator: validators.idParam, validators.adminOnly
 */
router.delete('/:id', requireAuth, requireRole('administrator'), validators.idParam, validators.adminOnly, asyncHandler(SalesWindowController.deleteById));

module.exports = router;
