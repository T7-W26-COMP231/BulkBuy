// src/validators/supply.validators.js
/**
 * Validators for Supply endpoints
 * - Uses express-validator
 * - Exports middleware arrays for route wiring
 */

const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

const STATUS = ['quote', 'accepted', 'dispatched', 'cancelled', 'delivered', 'received'];

/**
 * Run express-validator results and forward a structured error
 */
function runValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.param, message: e.msg }));
    const err = new Error('Validation failed');
    err.status = 400;
    err.details = details;
    return next(err);
  }
  return next();
}

/**
 * Helper: allow empty or valid JSON string in query (e.g., ?filter={...})
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

/**
 * Admin guard middleware
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

/* Common param validators */
const idParam = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('id must be a valid ObjectId'),
  runValidation
];

const itemIdParam = [
  param('itemId').exists().withMessage('itemId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('itemId must be a valid ObjectId'),
  runValidation
];

/* Create supply */
const create = [
  body('supplierId').exists().withMessage('supplierId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('supplierId must be a valid ObjectId'),
  body('requesterId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('requesterId must be a valid ObjectId'),
  body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('items.*.itemId').exists().withMessage('items.*.itemId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('items.*.itemId must be a valid ObjectId'),
  body('items.*.requestedQuantity').optional().isInt({ min: 0 }).withMessage('items.*.requestedQuantity must be a non-negative integer'),
  body('items.*.quotes').optional().isArray().withMessage('items.*.quotes must be an array'),
  body('deliveryLocation').optional().isObject().withMessage('deliveryLocation must be an object'),
  body('ops_region').optional().isString().trim(),
  body('metadata').optional().isObject(),
  runValidation
];

/* Query list */
const queryValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('sort').optional().isString(),
  query('filter').optional().custom(isJsonString).withMessage('filter must be valid JSON string'),
  runValidation
];

/* Update supply (partial) */
const update = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('id must be a valid ObjectId'),
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
  runValidation
];

/* Add item to supply */
const addItem = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('id must be a valid ObjectId'),
  body('itemId').exists().withMessage('itemId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('itemId must be a valid ObjectId'),
  body('requestedQuantity').optional().isInt({ min: 0 }).withMessage('requestedQuantity must be a non-negative integer'),
  body('quotes').optional().isArray().withMessage('quotes must be an array'),
  runValidation
];

/* Add quote to an item */
const addQuote = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('id must be a valid ObjectId'),
  body('itemId').exists().withMessage('itemId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('itemId must be a valid ObjectId'),
  body('quote').exists().withMessage('quote is required').bail().isObject().withMessage('quote must be an object'),
  body('quote.pricePerBulkUnit').exists().withMessage('quote.pricePerBulkUnit is required').bail()
    .isFloat({ min: 0 }).withMessage('quote.pricePerBulkUnit must be a non-negative number').toFloat(),
  body('quote.numberOfBulkUnits').optional().isInt({ min: 1 }).withMessage('quote.numberOfBulkUnits must be an integer >= 1').toInt(),
  body('quote.discountingScheme').optional().isArray().withMessage('quote.discountingScheme must be an array'),
  body('quote.isAccepted').optional().isBoolean().toBoolean(),
  runValidation
];

/* Accept quote */
const acceptQuote = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('id must be a valid ObjectId'),
  body('itemId').exists().withMessage('itemId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('itemId must be a valid ObjectId'),
  body('quoteId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('quoteId must be a valid ObjectId'),
  body('quoteIndex').optional().isInt({ min: 0 }).withMessage('quoteIndex must be a non-negative integer').toInt(),
  body().custom((value) => {
    // require at least one of quoteId or quoteIndex (or allow default behavior)
    if (!value.quoteId && value.quoteIndex === undefined) {
      // allow default acceptance behavior (accept first quote) — do not fail validation
      return true;
    }
    return true;
  }),
  runValidation
];

/* Update status */
const updateStatus = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('id must be a valid ObjectId'),
  body('status').exists().withMessage('status is required').bail()
    .isIn(STATUS).withMessage(`status must be one of: ${STATUS.join(', ')}`),
  runValidation
];

module.exports = {
  runValidation,
  create,
  query: queryValidator,
  idParam,
  update,
  addQuote,
  acceptQuote,
  updateStatus,
  addItem,
  itemIdParam,
  adminOnly
};
