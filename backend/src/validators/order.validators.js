// src/validators/order.validators.js
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

/* Helper to allow empty or valid JSON string in query (e.g., ?filter={...}) */
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
 * Pricing snapshot validators (re-usable)
 * ------------------------- */
const pricingSnapshotValidators = [
  body().custom((value, { path }) => {
    // This custom validator is used in contexts where the pricingSnapshot is nested,
    // so we don't validate the root body here. The specific checks below are applied
    // using dot notation in the callers.
    return true;
  })
];

/* -------------------------
 * Validators
 * ------------------------- */

/**
 * POST /orders
 * Required: userId
 * items: optional array
 * items.*.productId: ObjectId
 * items.*.itemId: ObjectId
 * items.*.pricingSnapshot.* fields validated if present
 */
const create = [
  body('userId').exists().withMessage('userId is required').isMongoId().withMessage('userId must be a valid ObjectId'),
  body('items').optional().isArray(),
  body('items.*.productId').optional().isMongoId().withMessage('items.*.productId must be a valid ObjectId'),
  body('items.*.itemId').optional().isMongoId().withMessage('items.*.itemId must be a valid ObjectId'),
  body('items.*.quantity').optional().isInt({ min: 1 }).withMessage('items.*.quantity must be an integer >= 1').toInt(),
  body('items.*.saveForLater').optional().isBoolean().withMessage('items.*.saveForLater must be boolean').toBoolean(),
  body('items.*.pricingSnapshot').optional().isObject().withMessage('items.*.pricingSnapshot must be an object'),
  body('items.*.pricingSnapshot.atInstantPrice').optional().isFloat({ min: 0 }).withMessage('pricingSnapshot.atInstantPrice must be a non-negative number').toFloat(),
  body('items.*.pricingSnapshot.discountedPercentage').optional().isFloat({ min: 0, max: 100 }).withMessage('pricingSnapshot.discountedPercentage must be between 0 and 100').toFloat(),
  body('items.*.pricingSnapshot.discountBracket.initial').optional().isFloat().withMessage('pricingSnapshot.discountBracket.initial must be a number').toFloat(),
  body('items.*.pricingSnapshot.discountBracket.final').optional().isFloat().withMessage('pricingSnapshot.discountBracket.final must be a number').toFloat(),
  body('ops_region').optional().isString().trim(),
  body('metadata').optional().isObject().withMessage('metadata must be an object'),
  runValidation
];

/**
 * GET /orders (query)
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

/* Param validators */
const idParam = [
  param('id').exists().withMessage('id is required').isMongoId().withMessage('id must be a valid ObjectId'),
  runValidation
];

const userIdParam = [
  param('userId').exists().withMessage('userId is required').isMongoId().withMessage('userId must be a valid ObjectId'),
  runValidation
];

const itemIdParam = [
  param('itemId').exists().withMessage('itemId is required').isMongoId().withMessage('itemId must be a valid ObjectId'),
  runValidation
];

/**
 * PATCH /orders/:id
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
 * PATCH /orders (updateOne)
 * Body: { filter, update, opts }
 */
const updateOne = [
  body('filter').exists().withMessage('filter is required').isObject().withMessage('filter must be an object'),
  body('update').exists().withMessage('update is required').isObject().withMessage('update must be an object'),
  body('update._id').not().exists().withMessage('_id cannot be modified'),
  runValidation
];

/**
 * POST /orders/:id/add-message
 * Body: { messageId }
 */
const addMessage = [
  param('id').exists().isMongoId().withMessage('id must be a valid ObjectId'),
  body('messageId').exists().withMessage('messageId is required').isMongoId().withMessage('messageId must be a valid ObjectId'),
  runValidation
];

/**
 * POST /orders/:id/update-status
 * Body: { status }
 */
const updateStatus = [
  param('id').exists().isMongoId().withMessage('id must be a valid ObjectId'),
  body('status').exists().withMessage('status is required').isIn(['draft', 'submitted', 'confirmed', 'cancelled', 'dispatched', 'fulfilled']).withMessage('invalid status'),
  runValidation
];

/**
 * POST /orders/:id/add-item
 * Body: { productId, itemId, pricingSnapshot?, saveForLater?, quantity? }
 */
const addItem = [
  param('id').exists().isMongoId().withMessage('id must be a valid ObjectId'),
  body('productId').exists().withMessage('productId is required').isMongoId().withMessage('productId must be a valid ObjectId'),
  body('itemId').exists().withMessage('itemId is required').isMongoId().withMessage('itemId must be a valid ObjectId'),
  body('quantity').optional().isInt({ min: 1 }).withMessage('quantity must be integer >= 1').toInt(),
  body('saveForLater').optional().isBoolean().withMessage('saveForLater must be boolean').toBoolean(),
  body('pricingSnapshot').optional().isObject().withMessage('pricingSnapshot must be an object'),
  body('pricingSnapshot.atInstantPrice').optional().isFloat({ min: 0 }).withMessage('pricingSnapshot.atInstantPrice must be a non-negative number').toFloat(),
  body('pricingSnapshot.discountedPercentage').optional().isFloat({ min: 0, max: 100 }).withMessage('pricingSnapshot.discountedPercentage must be between 0 and 100').toFloat(),
  body('pricingSnapshot.discountBracket.initial').optional().isFloat().withMessage('pricingSnapshot.discountBracket.initial must be a number').toFloat(),
  body('pricingSnapshot.discountBracket.final').optional().isFloat().withMessage('pricingSnapshot.discountBracket.final must be a number').toFloat(),
  runValidation
];

/**
 * PATCH /orders/:id/set-item-quantity
 * Body: { itemId, quantity }
 */
const setItemQuantity = [
  param('id').exists().isMongoId().withMessage('id must be a valid ObjectId'),
  body('itemId').exists().withMessage('itemId is required').isMongoId().withMessage('itemId must be a valid ObjectId'),
  body('quantity').exists().withMessage('quantity is required').isInt({ min: 0 }).withMessage('quantity must be integer >= 0').toInt(),
  runValidation
];

/**
 * PATCH /orders/:id/update-item
 * Body: { itemId, changes: { quantity?, saveForLater?, pricingSnapshot? } }
 */
const updateItem = [
  param('id').exists().isMongoId().withMessage('id must be a valid ObjectId'),
  body('itemId').exists().withMessage('itemId is required').isMongoId().withMessage('itemId must be a valid ObjectId'),
  body('changes').exists().withMessage('changes is required').isObject().withMessage('changes must be an object'),
  body('changes.quantity').optional().isInt({ min: 0 }).withMessage('changes.quantity must be integer >= 0').toInt(),
  body('changes.saveForLater').optional().isBoolean().withMessage('changes.saveForLater must be boolean').toBoolean(),
  body('changes.pricingSnapshot').optional().isObject().withMessage('changes.pricingSnapshot must be an object'),
  body('changes.pricingSnapshot.atInstantPrice').optional().isFloat({ min: 0 }).withMessage('pricingSnapshot.atInstantPrice must be a non-negative number').toFloat(),
  body('changes.pricingSnapshot.discountedPercentage').optional().isFloat({ min: 0, max: 100 }).withMessage('pricingSnapshot.discountedPercentage must be between 0 and 100').toFloat(),
  body('changes.pricingSnapshot.discountBracket.initial').optional().isFloat().withMessage('pricingSnapshot.discountBracket.initial must be a number').toFloat(),
  body('changes.pricingSnapshot.discountBracket.final').optional().isFloat().withMessage('pricingSnapshot.discountBracket.final must be a number').toFloat(),
  runValidation
];

/**
 * DELETE /orders/:id/items/:itemId
 * itemId param validated above (itemIdParam)
 */

/**
 * POST /orders/:id/extract-save-for-later
 * No body required
 */

/**
 * POST /orders/bulk
 * Body: array of order objects
 */
const bulkCreate = [
  body().isArray({ min: 1 }).withMessage('request body must be a non-empty array'),
  body('*.userId').exists().withMessage('userId is required for each order').isMongoId().withMessage('userId must be a valid ObjectId'),
  body('*.items').optional().isArray(),
  body('*.items.*.productId').optional().isMongoId().withMessage('items.*.productId must be a valid ObjectId'),
  body('*.items.*.itemId').optional().isMongoId().withMessage('items.*.itemId must be a valid ObjectId'),
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
  userIdParam,
  itemIdParam,
  update,
  updateOne,
  addMessage,
  updateStatus,
  addItem,
  setItemQuantity,
  updateItem,
  bulkCreate,
  adminOnly
};
