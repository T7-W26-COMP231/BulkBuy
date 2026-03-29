// src/routes/ops-context.routes.js
/**
 * Ops-context routes
 *
 * Base path: /api/ops-context
 *
 * Routes (annotated per-route)
 *
 * Products:
 *   GET  /products                 -> query: region (required), page, limit
 *   POST /products                 -> body: { region (required), page, limit }
 *   POST /products/evict           -> body: { region } (admin)
 *
 * Orders (enriched):
 *   GET  /orders/enriched          -> query: userId (required), region, page, limit, status, includeSaveForLater, persist
 *   POST /orders/enriched          -> body: { userId (required), region, page, limit, status, includeSaveForLater, persist }
 *   POST /orders/evict-user        -> body: { userId } (admin)
 *   POST /orders/evict-region      -> body: { region } (admin)
 *
 * Controller: src/controllers/ops-context.controller.js
 * Validators: src/validators/ops-context.validators.js
 * Auth: optionalAuth by default; requireAuth for admin endpoints
 */

const express = require('express');
const OpsContextController = require('../controllers/ops-context.controller');
const validators = require('../validators/ops-context.validators');
const { requireAuth, optionalAuth } = require('../middleware/auth.middleware');
const { requireRole, requireAnyRole } = require('../middleware/rbac.middleware');

const router = express.Router();

/**
 * Async wrapper to forward errors to express error handler
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* -------------------------------------------------------------------------- */
/* GET /api/ops-context/products
 * purpose: Return UI-friendly products for a region (cached)
 * method: GET
 * path: /products
 * query: region (required), page, limit
 * validators: validators.getUiProductsQuery
 * auth: optionalAuth
 * controller: OpsContextController.getUiProducts
 */
router.get(
  '/products',
  optionalAuth,
  validators.getUiProductsQuery,
  asyncHandler(OpsContextController.getUiProducts)
);

/* -------------------------------------------------------------------------- */
/* POST /api/ops-context/products
 * purpose: Same as GET /products but accepts payload in body for non-GET clients
 * method: POST
 * path: /products
 * body: { region (required), page, limit }
 * validators: validators.getUiProductsBody
 * auth: optionalAuth
 * controller: OpsContextController.getUiProducts
 */
router.post(
  '/products',
  optionalAuth,
  validators.getUiProductsBody,
  asyncHandler(OpsContextController.getUiProducts)
);

/* -------------------------------------------------------------------------- */
/* POST /api/ops-context/products/evict
 * purpose: Evict product cache for a region (admin)
 * method: POST
 * path: /products/evict
 * body: { region }
 * validators: validators.evictProductsRegion (if provided)
 * auth: requireAuth (admin)
 * controller: OpsContextController.evictProductsRegion
 */
router.post(
  '/products/evict',
  requireAuth,
  requireRole('administrator'),
  validators && validators.evictProductsRegion,
  asyncHandler(OpsContextController.evictProductsRegion)
);

/* -------------------------------------------------------------------------- */
/* GET /api/ops-context/orders/enriched
 * purpose: Return paginated, enriched orders for a user (cached, read-optimized)
 * method: GET
 * path: /orders/enriched
 * query: userId (required), region, page, limit, status, includeSaveForLater, persist
 * validators: validators.getEnrichedOrdersQuery
 * auth: optionalAuth
 * controller: OpsContextController.getEnrichedOrders
 */
router.get(
  '/orders/enriched',
  requireAuth,
  validators.getEnrichedOrdersQuery,
  asyncHandler(OpsContextController.getEnrichedOrders)
);

/* -------------------------------------------------------------------------- */
/* POST /api/ops-context/orders/enriched
 * purpose: Same as GET /orders/enriched but accepts payload in body
 * method: POST
 * path: /orders/enriched
 * body: { userId (required), region, page, limit, status, includeSaveForLater, persist }
 * validators: validators.getEnrichedOrdersBody
 * auth: optionalAuth
 * controller: OpsContextController.getEnrichedOrders
 */
router.post(
  '/orders/enriched',
  requireAuth,
  validators.getEnrichedOrdersBody,
  asyncHandler(OpsContextController.getEnrichedOrders)
);

/* -------------------------------------------------------------------------- */
/* POST /api/ops-context/orders/evict-user
 * purpose: Evict cached enriched orders for a user (admin)
 * method: POST
 * path: /orders/evict-user
 * body: { userId }
 * validators: validators.evictOrdersUser (if provided)
 * auth: requireAuth (admin)
 * controller: OpsContextController.evictOrdersUser
 */
router.post(
  '/orders/evict-user',
  requireAuth,
  // requireRole('administrator'),
  validators && validators.evictOrdersUser,
  asyncHandler(OpsContextController.evictOrdersUser)
);

/* -------------------------------------------------------------------------- */
/* POST /api/ops-context/orders/evict-region
 * purpose: Evict cached enriched orders for a region (admin)
 * method: POST
 * path: /orders/evict-region
 * body: { region }
 * validators: validators.evictOrdersRegion (if provided)
 * auth: requireAuth (admin)
 * controller: OpsContextController.evictOrdersRegion
 */
router.post(
  '/orders/evict-region',
  requireAuth,
  // requireRole('administrator'),
  validators && validators.evictOrdersRegion,
  asyncHandler(OpsContextController.evictOrdersRegion)
);

module.exports = router;
