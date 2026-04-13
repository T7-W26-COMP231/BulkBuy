// src/validators/aggregation.validators.js
const { body, param, query, validationResult } = require('express-validator');

/**
 * Run express-validator results and forward a structured error
 */
function runValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error('Validation failed');
    err.status = 400;
    err.details = errors.array();
    return next(err);
  }
  return next();
}

/**
 * Helper to allow empty or valid JSON string in query (e.g., ?filter={...})
 */
function isJsonString(value) {
  if (value === undefined || value === null || value === '') return true;
  try {
    JSON.parse(value);
    return true;
  } catch (e) {
    return false;
  }
}

/* -------------------------
 * Validators
 * ------------------------- */

/**
 * POST /aggregations
 * Required: itemDtos (non-empty array)
 * itemDtos.*.itemId: ObjectId
 * itemDtos.*.pricingSnapshot: object (optional)
 * itemDtos.*.supplierId: ObjectId (optional)
 * itemDtos.*.salesWindow: array of { from: number, to: number } (optional)
 */
const create = [
  body('itemDtos')
    .exists().withMessage('itemDtos is required')
    .isArray({ min: 1 }).withMessage('itemDtos must be a non-empty array'),
  body('itemDtos.*.itemId')
    .exists().withMessage('itemDtos.*.itemId is required')
    .isMongoId().withMessage('itemDtos.*.itemId must be a valid ObjectId'),
  body('itemDtos.*.pricingSnapshot').optional().isObject().withMessage('itemDtos.*.pricingSnapshot must be an object'),
  body('itemDtos.*.supplierId').optional().isMongoId().withMessage('itemDtos.*.supplierId must be a valid ObjectId'),
  body('itemDtos.*.salesWindow').optional().isArray(),
  body('itemDtos.*.salesWindow.*.from').optional().isInt().withMessage('salesWindow.from must be an integer epoch ms'),
  body('itemDtos.*.salesWindow.*.to').optional().isInt().withMessage('salesWindow.to must be an integer epoch ms'),
  body('ops_region').optional().isString().trim(),
  body('metadata').optional().isObject().withMessage('metadata must be an object'),
  runValidation
];

/**
 * GET /aggregations (query)
 * Supports ?page=&limit=&sort=&filter=JSON
 */
const queryValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sort').optional().isString(),
  query('select').optional().isString(),
  query('populate').optional().isString(),
  query('filter').optional().custom(isJsonString).withMessage('filter must be valid JSON string'),
  runValidation
];

/**
 * Param validators
 */
const idParam = [
  param('id').exists().withMessage('id is required').isMongoId().withMessage('id must be a valid ObjectId'),
  runValidation
];

const itemIdParam = [
  param('itemId').exists().withMessage('itemId is required').isMongoId().withMessage('itemId must be a valid ObjectId'),
  runValidation
];

/**
 * PATCH /aggregations/:id
 * Partial update - require body to be object (non-empty)
 * Disallow modifying immutable fields
 */
const update = [
  param('id').exists().isMongoId().withMessage('id must be a valid ObjectId'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('update payload must be an object');
    }
    if (Object.keys(value).length === 0) {
      throw new Error('update payload cannot be empty');
    }
    return true;
  }),
  body('_id').not().exists().withMessage('_id cannot be modified'),
  body('createdAt').not().exists().withMessage('createdAt cannot be modified'),
  runValidation
];

/**
 * PATCH /aggregations (updateOne)
 * Body: { filter, update, opts }
 */
const updateOne = [
  body('filter').exists().withMessage('filter is required').isObject().withMessage('filter must be an object'),
  body('update').exists().withMessage('update is required').isObject().withMessage('update must be an object'),
  body('update._id').not().exists().withMessage('_id cannot be modified'),
  runValidation
];

/**
 * POST /aggregations/:id/add-order
 * Body: { orderId }
 */
const addOrder = [
  param('id').exists().isMongoId().withMessage('id must be a valid ObjectId'),
  //body('orderId').exists().withMessage('orderId is required').isMongoId().withMessage('orderId must be a valid ObjectId'),
  body('orderId').exists().withMessage('orderId is required').isString().notEmpty().withMessage('orderId must be a non-empty string'),

  runValidation
];

/**
 * POST /aggregations/bulk
 * Body: array of aggregation objects
 */
const bulkCreate = [
  body().isArray({ min: 1 }).withMessage('request body must be a non-empty array'),
  body('*.itemDtos').optional().isArray(),
  body('*.itemDtos.*.itemId').optional().isMongoId().withMessage('itemDtos.*.itemId must be a valid ObjectId'),
  runValidation
];

/**
 * Admin-only guard middleware
 */
function adminOnly(req, res, next) {
  const user = req.user;
  if (!user || !user.role || user.role !== 'administrator') {
    const err = new Error('admin privileges required');
    err.status = 403;
    return next(err);
  }
  return next();
}

/* -------------------------
 * Exports
 * ------------------------- */

module.exports = {
  create,
  query: queryValidator,
  idParam,
  itemIdParam,
  update,
  updateOne,
  addOrder,
  bulkCreate,
  adminOnly
};
