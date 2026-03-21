// src/validators/salesWindow.validators.js
/**
 * Validators for SalesWindow endpoints
 * - Uses express-validator
 * - Exports middleware arrays for route wiring used in src/routes/salesWindow.routes.js
 *
 * Example:
 *   router.post('/', requireAuth, validators.create, SalesWindowController.create)
 */

const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v));

/* -------------------------
 * Helpers
 * ------------------------- */

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

/* Admin guard (for routes that require admin) */
function adminOnly(req, res, next) {
  const user = req.user;
  if (!user || user.role !== 'administrator') {
    const err = new Error('admin privileges required');
    err.status = 403;
    return next(err);
  }
  return next();
}

/* -------------------------
 * Param validators
 * ------------------------- */

const idParam = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => isObjectId(v)).withMessage('id must be a valid ObjectId'),
  runValidation
];

const productIdParam = [
  param('productId').exists().withMessage('productId is required').bail()
    .custom((v) => isObjectId(v)).withMessage('productId must be a valid ObjectId'),
  runValidation
];

const itemIdParam = [
  param('itemId').exists().withMessage('itemId is required').bail()
    .custom((v) => isObjectId(v)).withMessage('itemId must be a valid ObjectId'),
  runValidation
];

/* -------------------------
 * Create validator
 * ------------------------- */

const create = [
  body('window').exists().withMessage('window is required').bail().isObject().withMessage('window must be an object'),
  body('window.fromEpoch').exists().withMessage('window.fromEpoch is required').bail()
    .isInt({ min: 0 }).withMessage('window.fromEpoch must be an integer epoch ms'),
  body('window.toEpoch').exists().withMessage('window.toEpoch is required').bail()
    .isInt({ min: 0 }).withMessage('window.toEpoch must be an integer epoch ms')
    .custom((toEpoch, { req }) => {
      const from = Number(req.body.window && req.body.window.fromEpoch);
      if (!Number.isFinite(from)) return true; // other validators will catch missing fromEpoch
      if (Number(toEpoch) <= Number(from)) throw new Error('window.toEpoch must be greater than window.fromEpoch');
      return true;
    }),

  body('products').optional().isArray().withMessage('products must be an array'),
  body('products.*.productId').optional().custom((v) => isObjectId(v)).withMessage('products.*.productId must be a valid ObjectId'),
  body('products.*.items').optional().isArray().withMessage('products.*.items must be an array'),
  body('products.*.items.*.itemId').optional().custom((v) => isObjectId(v)).withMessage('products.*.items.*.itemId must be a valid ObjectId'),
  body('products.*.items.*.pricing_snapshot').optional().isObject().withMessage('pricing_snapshot must be an object'),
  body('products.*.metadata').optional().isObject().withMessage('product metadata must be an object'),

  body('overflow_id').optional().custom((v) => isObjectId(v)).withMessage('overflow_id must be a valid ObjectId'),
  body('metadata').optional().custom((v) => {
    if (v === null) return true;
    if (typeof v === 'object' && !Array.isArray(v)) return true;
    throw new Error('metadata must be an object');
  }),

  runValidation
];

/* -------------------------
 * Update validator (partial)
 * ------------------------- */

const updateById = [
  ...idParam,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('update payload must be an object');
    }
    if (Object.keys(value).length === 0) {
      throw new Error('update payload cannot be empty');
    }
    return true;
  }),
  body('window').optional().isObject().withMessage('window must be an object'),
  body('window.fromEpoch').optional().isInt({ min: 0 }).withMessage('window.fromEpoch must be an integer epoch ms'),
  body('window.toEpoch').optional().isInt({ min: 0 }).withMessage('window.toEpoch must be an integer epoch ms'),
  body('overflow_id').optional().custom((v) => isObjectId(v)).withMessage('overflow_id must be a valid ObjectId'),
  body('metadata').optional().custom((v) => {
    if (v === null) return true;
    if (typeof v === 'object' && !Array.isArray(v)) return true;
    throw new Error('metadata must be an object');
  }),
  runValidation
];

/* -------------------------
 * Range validator
 * ------------------------- */

const range = [
  query('fromEpoch').exists().withMessage('fromEpoch is required').bail()
    .isInt({ min: 0 }).withMessage('fromEpoch must be an integer epoch ms').toInt(),
  query('toEpoch').exists().withMessage('toEpoch is required').bail()
    .isInt({ min: 0 }).withMessage('toEpoch must be an integer epoch ms').toInt()
    .custom((toEpoch, { req }) => {
      const from = Number(req.query.fromEpoch);
      if (!Number.isFinite(from)) return true;
      if (Number(toEpoch) <= Number(from)) throw new Error('toEpoch must be greater than fromEpoch');
      return true;
    }),
  runValidation
];

/* -------------------------
 * Add/Update Item validator
 * ------------------------- */

/**
 * addOrUpdateItem expects productId and itemId either in params or in body.
 * When used on POST /:id/items we validate body fallback.
 */
const addOrUpdateItem = [
  // productId and itemId may be in body; if present validate them
  body('productId').optional().custom((v) => isObjectId(v)).withMessage('productId must be a valid ObjectId'),
  body('itemId').optional().custom((v) => isObjectId(v)).withMessage('itemId must be a valid ObjectId'),
  body('pricing_snapshot').optional().isObject().withMessage('pricing_snapshot must be an object'),
  body('metadata').optional().custom((v) => {
    if (v === null) return true;
    if (typeof v === 'object' && !Array.isArray(v)) return true;
    throw new Error('metadata must be an object');
  }),
  // custom validator to ensure productId and itemId exist either in params or body
  body().custom((value, { req }) => {
    const productId = req.params.productId || req.body.productId;
    const itemId = req.params.itemId || req.body.itemId;
    if (!productId || !itemId) {
      throw new Error('productId and itemId are required (either in params or body)');
    }
    if (!isObjectId(productId)) throw new Error('productId must be a valid ObjectId');
    if (!isObjectId(itemId)) throw new Error('itemId must be a valid ObjectId');
    return true;
  }),
  runValidation
];

/* -------------------------
 * Upsert / bulk validators
 * ------------------------- */

const upsert = [
  body('filter').exists().withMessage('filter is required').bail()
    .custom((v) => v && typeof v === 'object' && !Array.isArray(v)).withMessage('filter must be an object'),
  body('update').exists().withMessage('update is required').bail()
    .custom((v) => v && typeof v === 'object' && !Array.isArray(v)).withMessage('update must be an object'),
  runValidation
];

const bulkInsert = [
  body().custom((v) => {
    if (Array.isArray(v)) return true;
    if (v && Array.isArray(v.docs)) return true;
    throw new Error('body must be an array of docs or { docs: [] }');
  }),
  runValidation
];

/* -------------------------
 * List / paginate validators
 * ------------------------- */

const list = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('sort').optional().isString(),
  query('filter').optional().custom((value) => {
    if (value === undefined || value === null || value === '') return true;
    try {
      JSON.parse(value);
      return true;
    } catch (e) {
      throw new Error('filter must be valid JSON string');
    }
  }),
  runValidation
];

/* -------------------------
 * Exports
 * ------------------------- */

module.exports = {
  /* helpers */
  runValidation,
  adminOnly,

  /* params */
  idParam,
  productIdParam,
  itemIdParam,

  /* actions */
  create,
  updateById,
  range,
  addOrUpdateItem,
  upsert,
  bulkInsert,
  list
};
