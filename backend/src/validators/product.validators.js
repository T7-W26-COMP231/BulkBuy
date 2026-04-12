// src/validators/product.validators.js
const { body, param, query, validationResult } = require('express-validator');

/**
 * Helper middleware to run express-validator results
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
 * Helper to validate JSON string in query (e.g., ?filter={...})
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
 * POST /products
 * Required: name
 * Optional: descriptions (array), items (array), discountScheme, salesWindow, ops_region, metadata, status
 */
const create = [
  body('name').exists().withMessage('name is required').isString().trim().notEmpty(),
  body('descriptions').optional().isArray(),
  body('descriptions.*.locale').optional().isString(),
  body('descriptions.*.title').optional().isString(),
  body('descriptions.*.body').optional().isString(),
  body('items').optional().isArray(),
  //body('items.*.itemId').optional().isMongoId().withMessage('items.*.itemId must be a valid ObjectId'),
  body('items.*.itemId').optional().isString().withMessage('items.*.itemId must be a string'),

  body('items.*.salesPrices').optional().isArray(),
  body('status').optional().isIn(['active', 'inactive', 'deleted', 'suspended', 'on_sale']),
  runValidation
];

/**
 * POST /products/search
 * Body: { filters, page, limit, sort, select, populate }
 */
const search = [
  body('filters').optional().isObject().withMessage('filters must be an object'),
  body('page').optional().isInt({ min: 1 }).toInt(),
  body('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  runValidation
];

/**
 * GET /products (query)
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
  //param('id').exists().withMessage('id is required').isMongoId().withMessage('id must be a valid ObjectId'),
  param('id').exists().withMessage('id is required').isString().notEmpty().withMessage('id must be a non-empty string'),

  runValidation
];

const itemIdParam = [
  //param('itemId').exists().withMessage('itemId is required').isMongoId().withMessage('itemId must be a valid ObjectId'),
  param('itemId').exists().withMessage('itemId is required').isString().notEmpty().withMessage('itemId must be a non-empty string'),

  runValidation
];

/**
 * PATCH /products/:id
 * Partial update - require body to be object (non-empty)
 */
const update = [

  /*param('id').exists().isMongoId().withMessage('id must be a valid ObjectId'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('update payload must be an object');
    }
    if (Object.keys(value).length === 0) {
      throw new Error('update payload cannot be empty');
    }
    return true;
  }),
  // disallow changing immutable fields if present
  body('_id').not().exists().withMessage('_id cannot be modified'),
  body('createdAt').not().exists().withMessage('createdAt cannot be modified'),
  body('deleted').not().exists().withMessage('deleted cannot be modified'),*/
  param('id').exists().isString().notEmpty().withMessage('id must be a non-empty string'),
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
  body('deleted').not().exists().withMessage('deleted cannot be modified'),
  runValidation
];

/**
 * PATCH /products (updateOne)
 * Body: { filter, update, opts }
 */
const updateOne = [
  body('filter').exists().withMessage('filter is required').isObject().withMessage('filter must be an object'),
  body('update').exists().withMessage('update is required').isObject().withMessage('update must be an object'),
  body('update._id').not().exists().withMessage('_id cannot be modified'),
  runValidation
];

/**
 * POST /products/bulk
 * Body: array of product objects
 */
const bulkCreate = [
  body().isArray({ min: 1 }).withMessage('request body must be a non-empty array'),
  body('*.name').exists().withMessage('each product must have a name').isString().trim().notEmpty(),
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
  search,
  query: queryValidator,
  idParam,
  itemIdParam,
  update,
  updateOne,
  bulkCreate,
  adminOnly
};
