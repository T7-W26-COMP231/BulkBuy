// src/routes/regionMap.routes.js
/**
 * RegionMap routes (validated)
 *
 * Base path: /api/region-maps
 *
 * Routes:
 * POST   /                   -> create region map
 * GET    /:id                -> get region map by id
 * GET    /by-ops/:opsRegion  -> get region map by ops_region
 * GET    /                   -> list / paginate region maps
 * PATCH  /:id                -> update region map
 * POST   /upsert             -> upsert region map (body: { filter, update })
 * POST   /bulk-insert        -> bulk insert region maps (body: array or { docs: [] })
 * POST   /:id/locations      -> add location to region map
 * PATCH  /:id/locations/:locationId -> update nested location
 * DELETE /:id/locations/:locationId -> remove nested location
 * GET    /nearest            -> find nearest locations (query: lng, lat, maxDistance, limit)
 * DELETE /:id                -> hard delete region map (admin only)
 */

const express = require('express');

const RegionMapController = require('../controllers/regionMap.controller');
const validators = require('../validators/regionMap.validators');
const { requireAuth } = require('../middleware/auth.middleware'); // adjust path to your auth middleware

const router = express.Router();

/* Async wrapper to forward errors to express error handler */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/* Convenience middlewares from controller */
const { parseFilterQuery, adminOnly } = RegionMapController;

/* Create region map
 * POST /api/region-maps
 */
router.post(
  '/',
  requireAuth,
  validators.create,
  asyncHandler(RegionMapController.create)
);

/* Get region map by id
 * GET /api/region-maps/:id
 */
router.get(
  '/:id',
  requireAuth,
  validators.idParam,
  asyncHandler(RegionMapController.getById)
);

/* Get region map by ops_region
 * GET /api/region-maps/by-ops/:opsRegion
 */
router.get(
  '/by-ops/:opsRegion',
  requireAuth,
  validators.opsRegionParam,
  asyncHandler(RegionMapController.findByOpsRegion)
);

/* List / paginate region maps
 * GET /api/region-maps
 *
 * Validate query params first, then parse filter JSON into object for controller/service.
 */
router.get(
  '/',
  validators.list,
  parseFilterQuery,
  asyncHandler(RegionMapController.list)
);

/* Update region map by id (partial)
 * PATCH /api/region-maps/:id
 */
router.patch(
  '/:id',
  requireAuth,
  validators.updateById,
  asyncHandler(RegionMapController.updateById)
);

/* Upsert region map
 * POST /api/region-maps/upsert
 */
router.post(
  '/upsert',
  requireAuth,
  validators.upsert,
  asyncHandler(RegionMapController.upsert)
);

/* Bulk insert region maps
 * POST /api/region-maps/bulk-insert
 */
router.post(
  '/bulk-insert',
  requireAuth,
  validators.bulkInsert,
  asyncHandler(RegionMapController.bulkInsert)
);

/* Add location to region map
 * POST /api/region-maps/:id/locations
 */
router.post(
  '/:id/locations',
  requireAuth,
  validators.addLocation,
  asyncHandler(RegionMapController.addLocation)
);

/* Update nested location
 * PATCH /api/region-maps/:id/locations/:locationId
 */
router.patch(
  '/:id/locations/:locationId',
  requireAuth,
  validators.updateLocation,
  asyncHandler(RegionMapController.updateLocation)
);

/* Remove nested location
 * DELETE /api/region-maps/:id/locations/:locationId
 */
router.delete(
  '/:id/locations/:locationId',
  requireAuth,
  validators.removeLocation,
  asyncHandler(RegionMapController.removeLocation)
);

/* Find nearest locations
 * GET /api/region-maps/nearest?lng=...&lat=...&maxDistance=...&limit=...
 * Public endpoint (no auth required)
 */
router.get(
  '/nearest',
  validators.nearest,
  asyncHandler(RegionMapController.findNearestLocations)
);

/* Hard delete region map (admin only)
 * DELETE /api/region-maps/:id
 */
router.delete(
  '/:id',
  requireAuth,
  validators.idParam,
  adminOnly,
  asyncHandler(RegionMapController.deleteById)
);

module.exports = router;
