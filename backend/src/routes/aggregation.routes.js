// src/routes/aggregation.routes.js
const express = require('express');
const AggregationController = require('../controllers/aggregation.controller');
const aggregationValidators = require('../validators/aggregation.validators');
const { requireAuth } = require('../middleware/auth.middleware');

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
 * POST   /aggregations                    -> create aggregation
 * POST   /aggregations/bulk               -> bulk create aggregations
 * GET    /aggregations                    -> list aggregations (pagination/filter via query)
 * GET    /aggregations/:id                -> get aggregation by Mongo _id
 * GET    /aggregations/by-item/:itemId    -> find aggregations by itemId
 * PATCH  /aggregations/:id                -> update aggregation by _id
 * PATCH  /aggregations                    -> update one by filter (body: { filter, update, opts })
 * POST   /aggregations/:id/add-order      -> add order id to aggregation
 * POST   /aggregations/:id/mark-processed -> mark aggregation processed
 * DELETE /aggregations/:id/hard           -> hard delete (admin)
 */

/* Create aggregation */
router.post(
  '/',
  aggregationValidators && aggregationValidators.create,
  asyncHandler(AggregationController.createAggregation)
);

/* Bulk create aggregations */
router.post(
  '/bulk',
  aggregationValidators && aggregationValidators.bulkCreate,
  asyncHandler(AggregationController.bulkCreate)
);

/* GET /aggregations/supplier/demand-status
 * Returns aggregated demand and tier progress for the logged-in supplier
 * Requires: supplier auth token
 */
router.get(
  '/supplier/demand-status',
  requireAuth,
  asyncHandler(AggregationController.getSupplierDemandStatus)
);

/* List aggregations (supports ?page=&limit=&filter= JSON) */
router.get(
  '/',
  aggregationValidators && aggregationValidators.query,
  asyncHandler(AggregationController.listAggregations)
);

/* Get aggregation by Mongo _id */
router.get(
  '/:id',
  aggregationValidators && aggregationValidators.idParam,
  asyncHandler(AggregationController.getById)
);

/* Find aggregations by itemId */
router.get(
  '/by-item/:itemId',
  aggregationValidators && aggregationValidators.itemIdParam,
  asyncHandler(AggregationController.findByItemId)
);

/* Update aggregation by _id (partial update) */
router.patch(
  '/:id',
  aggregationValidators && aggregationValidators.idParam,
  aggregationValidators && aggregationValidators.update,
  asyncHandler(AggregationController.updateById)
);

/* Update one by filter: body { filter, update, opts } */
router.patch(
  '/',
  aggregationValidators && aggregationValidators.updateOne,
  asyncHandler(AggregationController.updateOne)
);

/* Add order to aggregation */
router.post(
  '/:id/add-order',
  aggregationValidators && aggregationValidators.idParam,
  aggregationValidators && aggregationValidators.addOrder,
  asyncHandler(AggregationController.addOrder)
);

/* Mark aggregation processed */
router.post(
  '/:id/mark-processed',
  aggregationValidators && aggregationValidators.idParam,
  asyncHandler(AggregationController.markProcessed)
);

/* Hard delete (admin) */
router.delete(
  '/:id/hard',
  aggregationValidators && aggregationValidators.idParam,
  aggregationValidators && aggregationValidators.adminOnly,
  asyncHandler(AggregationController.hardDeleteById)
);

module.exports = router;
