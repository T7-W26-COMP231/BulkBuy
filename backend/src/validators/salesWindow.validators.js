// src/validators/salesWindow.validators.js
/**
 * Validators for SalesWindow endpoints (express-validator)
 *
 * - Matches the optimized, payload-first routes in src/routes/salesWindow.routes.js
 * - Exports middleware arrays and helper guards used by route wiring
 *
 * Usage:
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
  /* param('id').exists().withMessage('id is required').bail()
     .custom((v) => isObjectId(v)).withMessage('id must be a valid ObjectId'),*/
  param('id').exists().withMessage('id is required').bail()
    .isString().notEmpty().withMessage('id must be a non-empty string'),

  runValidation
];

const productIdParam = [
  param('productId').exists().withMessage('productId is required').bail()
    .isString().notEmpty().withMessage('productId must be a non-empty string'),
  /*param('productId').exists().withMessage('productId is required').bail()
    .custom((v) => isObjectId(v)).withMessage('productId must be a valid ObjectId'),*/
  runValidation
];

const itemIdParam = [
  param('itemId').exists().withMessage('itemId is required').bail()
    .isString().notEmpty().withMessage('itemId must be a non-empty string'),
  /*param('itemId').exists().withMessage('itemId is required').bail()
    .custom((v) => isObjectId(v)).withMessage('itemId must be a valid ObjectId'),*/
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
      if (!Number.isFinite(from)) return true;
      if (Number(toEpoch) <= Number(from)) throw new Error('window.toEpoch must be greater than window.fromEpoch');
      return true;
    }),

  body('ops_region').optional().isString().withMessage('ops_region must be a string'),
  body('products').optional().isArray().withMessage('products must be an array'),

  //body('products.*.productId').optional().custom((v) => isObjectId(v)).withMessage('products.*.productId must be a valid ObjectId'),
  body('products.*.productId')
    .optional()
    .isString()
    .notEmpty()
    .withMessage('products.*.productId must be a non-empty string'),

  body('products.*.items').optional().isArray().withMessage('products.*.items must be an array'),

  //body('products.*.items.*.itemId').optional().custom((v) => isObjectId(v)).withMessage('products.*.items.*.itemId must be a valid ObjectId'),
  body('products.*.items.*.itemId')
    .optional()
    .isString()
    .notEmpty()
    .withMessage('products.*.items.*.itemId must be a non-empty string'),

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

  //body('overflow_id').optional().custom((v) => isObjectId(v)).withMessage('overflow_id must be a valid ObjectId'),

  body('overflow_id')
    .optional({ nullable: true })
    .custom((v) => {
      if (v === null || v === undefined || v === '') return true;
      if (isObjectId(v)) return true;
      throw new Error('overflow_id must be a valid ObjectId');
    }),

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
 * Add/Update Item validators (payload-first)
 * ------------------------- */

/* addOrUpdateItem: used for POST /:id/items and POST /:id/products/items/upsert
 * productId and itemId may be provided in body (preferred) or params (legacy)
 */
const addOrUpdateItem = [

  /*body('productId').optional().custom((v) => isObjectId(v)).withMessage('productId must be a valid ObjectId'),
  body('itemId').optional().custom((v) => isObjectId(v)).withMessage('itemId must be a valid ObjectId'),
  body('pricing_snapshot').optional().isObject().withMessage('pricing_snapshot must be an object'),
  body('metadata').optional().custom((v) => {
    if (v === null) return true;
    if (typeof v === 'object' && !Array.isArray(v)) return true;
    throw new Error('metadata must be an object');
  }),
  
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
  runValidation*/

  body('productId').optional().isString().withMessage('productId must be a string'),
  body('itemId').optional().isString().withMessage('itemId must be a string'),
  body('pricing_snapshot').optional().isObject(),
  body('metadata').optional(),
  body().custom((value, { req }) => {
    const productId = req.params.productId || req.body.productId;
    const itemId = req.params.itemId || req.body.itemId;
    if (!productId || !itemId) {
      throw new Error('productId and itemId are required');
    }
    return true;
  }),
  runValidation
];

/* -------------------------
 * Delete item (body) validator
 * ------------------------- */

const deleteItemBody = [
  //body('productId').exists().withMessage('productId is required').bail().custom((v) => isObjectId(v)).withMessage('productId must be a valid ObjectId'),
  //body('itemId').exists().withMessage('itemId is required').bail().custom((v) => isObjectId(v)).withMessage('itemId must be a valid ObjectId'),
  body('productId').exists().withMessage('productId is required').bail()
    .isString().notEmpty().withMessage('productId must be a non-empty string'),
  body('itemId').exists().withMessage('itemId is required').bail()
    .isString().notEmpty().withMessage('itemId must be a non-empty string'),
  runValidation
];

/* -------------------------
 * Get item snapshot (query) validator
 * ------------------------- */

const getItemQuery = [
  //query('productId').exists().withMessage('productId is required').bail().custom((v) => isObjectId(v)).withMessage('productId must be a valid ObjectId'),
  //query('itemId').exists().withMessage('itemId is required').bail().custom((v) => isObjectId(v)).withMessage('itemId must be a valid ObjectId'),

  query('productId').exists().withMessage('productId is required').bail()
    .isString().notEmpty().withMessage('productId must be a non-empty string'),
  query('itemId').exists().withMessage('itemId is required').bail()
    .isString().notEmpty().withMessage('itemId must be a non-empty string'),

  query('fallback').optional().isBoolean().withMessage('fallback must be boolean').toBoolean(),
  runValidation
];

/* -------------------------
 * Product / ProductItem validators
 * ------------------------- */

const addProduct = [
  //body('productId').exists().withMessage('productId is required').bail().custom((v) => isObjectId(v)).withMessage('productId must be a valid ObjectId'),

  body('productId').exists().withMessage('productId is required').bail()
    .isString().notEmpty().withMessage('productId must be a non-empty string'),
  body('metadata').optional().custom((v) => {
    if (v === null) return true;
    if (typeof v === 'object' && !Array.isArray(v)) return true;
    throw new Error('metadata must be an object');
  }),
  runValidation
];

const addProductItemBody = [
  /*body('productId').exists().withMessage('productId is required').bail().custom((v) => isObjectId(v)).withMessage('productId must be a valid ObjectId'),
  body('itemPayload').optional().isObject().withMessage('itemPayload must be an object'),
  // allow direct item fields in body as fallback
  body('itemId').optional().custom((v) => isObjectId(v)).withMessage('itemId must be a valid ObjectId'),*/

  body('productId').exists().withMessage('productId is required').bail()
    .isString().notEmpty().withMessage('productId must be a non-empty string'),
  body('itemPayload').optional().isObject().withMessage('itemPayload must be an object'),
  body('itemId').optional()
    .isString().notEmpty().withMessage('itemId must be a non-empty string'),

  runValidation
];

const listProductItemsQuery = [
  //query('productId').exists().withMessage('productId is required').bail().custom((v) => isObjectId(v)).withMessage('productId must be a valid ObjectId'),

  query('productId').exists().withMessage('productId is required').bail()
    .isString().notEmpty().withMessage('productId must be a non-empty string'),

  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('lean').optional().isBoolean().toBoolean(),
  runValidation
];

/* -------------------------
 * Pricing validators
 * ------------------------- */

const pricingSnapshotBody = [
  /*body('productId').exists().withMessage('productId is required').bail().custom((v) => isObjectId(v)).withMessage('productId must be a valid ObjectId'),
  body('itemId').exists().withMessage('itemId is required').bail().custom((v) => isObjectId(v)).withMessage('itemId must be a valid ObjectId'),
  body('snapshot').exists().withMessage('snapshot is required').bail().isObject().withMessage('snapshot must be an object'),*/

  body('productId').exists().withMessage('productId is required').bail()
    .isString().notEmpty().withMessage('productId must be a non-empty string'),
  body('itemId').exists().withMessage('itemId is required').bail()
    .isString().notEmpty().withMessage('itemId must be a non-empty string'),
  body('snapshot').exists().withMessage('snapshot is required').bail()
    .isObject().withMessage('snapshot must be an object'),

  runValidation
];

const pricingSnapshotsQuery = [
  //query('productId').exists().withMessage('productId is required').bail().custom((v) => isObjectId(v)).withMessage('productId must be a valid ObjectId'),
  //query('itemId').exists().withMessage('itemId is required').bail().custom((v) => isObjectId(v)).withMessage('itemId must be a valid ObjectId'),

  query('productId').exists().withMessage('productId is required').bail()
    .isString().notEmpty().withMessage('productId must be a non-empty string'),
  query('itemId').exists().withMessage('itemId is required').bail()
    .isString().notEmpty().withMessage('itemId must be a non-empty string'),

  runValidation
];

const pricingTiersQuery = [
  //query('productId').exists().withMessage('productId is required').bail().custom((v) => isObjectId(v)).withMessage('productId must be a valid ObjectId'),
  //query('itemId').exists().withMessage('itemId is required').bail().custom((v) => isObjectId(v)).withMessage('itemId must be a valid ObjectId'),

  query('productId').exists().withMessage('productId is required').bail()
    .isString().notEmpty().withMessage('productId must be a non-empty string'),
  query('itemId').exists().withMessage('itemId is required').bail()
    .isString().notEmpty().withMessage('itemId must be a non-empty string'),
  runValidation
];

/* -------------------------
 * Bulk validators
 * ------------------------- */

const bulkProductsBody = [
  body().custom((v) => {
    if (Array.isArray(v)) return true;
    if (v && Array.isArray(v.products)) return true;
    throw new Error('body must be an array of products or { products: [] }');
  }),
  runValidation
];

const bulkItemsBody = [
  //body('productId').exists().withMessage('productId is required').bail().custom((v) => isObjectId(v)).withMessage('productId must be a valid ObjectId'),
  //body('items').exists().withMessage('items is required').bail().isArray().withMessage('items must be an array'),

  body('productId').exists().withMessage('productId is required').bail()
    .isString().notEmpty().withMessage('productId must be a non-empty string'),
  body('items').exists().withMessage('items is required').bail()
    .isArray().withMessage('items must be an array'),

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
 * Current windows validator
 * ------------------------- */

const currentQuery = [
  query('region').exists().withMessage('region is required').bail().isString().withMessage('region must be a string'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('lean').optional().isBoolean().toBoolean(),
  runValidation
];

/* -------------------------
 * Upsert validator
 * POST /api/sales-windows/upsert
 * Body: { filter, update, options? }
 * - filter: required non-empty object
 * - update: required non-empty object
 * - options: optional object (pass-through)
 * ------------------------- */
const upsert = [
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('request body must be an object');
    }
    return true;
  }),
  body('filter')
    .exists().withMessage('filter is required').bail()
    .custom((v) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('filter must be an object');
      if (Object.keys(v).length === 0) throw new Error('filter must be a non-empty object');
      return true;
    }),
  body('update')
    .exists().withMessage('update is required').bail()
    .custom((v) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('update must be an object');
      if (Object.keys(v).length === 0) throw new Error('update must be a non-empty object');
      return true;
    }),
  body('options').optional().custom((v) => {
    if (v === null) return true;
    if (typeof v === 'object' && !Array.isArray(v)) return true;
    throw new Error('options must be an object');
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

  /* core actions */
  create,
  updateById,
  range,
  list,
  bulkInsert: bulkProductsBody, // reuse bulkProductsBody for route wiring of bulk-insert
  upsert,

  /* item/product actions */
  addOrUpdateItem,
  deleteItemBody,
  getItemQuery,
  addProduct,
  addProductItemBody,
  listProductItemsQuery,

  /* pricing */
  pricingSnapshotBody,
  pricingSnapshotsQuery,
  pricingTiersQuery,

  /* bulk product/item */
  bulkProductsBody,
  bulkItemsBody,

  /* current windows */
  currentQuery
};
