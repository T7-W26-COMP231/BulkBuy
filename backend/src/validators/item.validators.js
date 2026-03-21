// src/validators/item.validators.js
/**
 * Validators for Item endpoints
 * - Uses express-validator
 * - Exports middleware arrays for route wiring
 *
 * Example usage:
 *   router.post('/', requireAuth, itemValidators.create, ItemController.create)
 *   router.patch('/:id', requireAuth, itemValidators.updateById, ItemController.updateById)
 */

const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

const STATUS_ENUM = ['active', 'suspended', 'draft'];

/* -------------------------
 * Helpers
 * ------------------------- */

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v));

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
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => isObjectId(v)).withMessage('id must be a valid ObjectId'),
  runValidation
];

const skuParam = [
  param('sku').exists().withMessage('sku is required').bail()
    .isString().trim().notEmpty().withMessage('sku must be a non-empty string'),
  runValidation
];

/* -------------------------
 * Create validator
 * ------------------------- */

const create = [
  body('sku').exists().withMessage('sku is required').bail()
    .isString().trim().notEmpty().withMessage('sku must be a non-empty string'),
  body('title').exists().withMessage('title is required').bail()
    .isString().trim().notEmpty().withMessage('title must be a non-empty string'),
  body('slug').optional().isString().trim(),
  body('description').optional().isString(),
  body('shortDescription').optional().isString(),

  body('brand').optional().isObject().withMessage('brand must be an object'),
  body('brand.id').optional().custom((v) => isObjectId(v)).withMessage('brand.id must be a valid ObjectId'),
  body('brand.name').optional().isString().trim(),

  body('categories').optional().isArray().withMessage('categories must be an array'),
  body('categories.*').optional().custom((v) => isObjectId(v)).withMessage('each category must be a valid ObjectId'),

  body('tags').optional().isArray(),
  body('tags.*').optional().isString().trim(),

  body('images').optional().isArray(),
  body('images.*').optional().custom((v) => isObjectId(v)).withMessage('each image must be a valid ObjectId'),

  body('media').optional().isArray(),
  body('media.*.type').optional().isIn(['video', 'image']).withMessage('media.type must be video or image'),
  body('media.*.s3').optional().custom((v) => isObjectId(v)).withMessage('media.s3 must be a valid ObjectId'),

  body('price').optional().isArray(),
  body('price.*.list').optional().isFloat({ min: 0 }).withMessage('price.list must be >= 0').toFloat(),
  body('price.*.sale').optional({ nullable: true }).custom((v) => v === null || Number(v) >= 0).withMessage('price.sale must be null or >= 0'),
  body('price.*.currency').optional().isString().trim().isLength({ min: 1 }).withMessage('price.currency required'),
  body('price.*.effectiveFrom').optional().isISO8601().toDate(),
  body('price.*.effectiveTo').optional().isISO8601().toDate(),

  body('pricingTiers').optional().isArray(),
  body('pricingTiers.*.minQty').optional().isInt({ min: 1 }).toInt(),
  body('pricingTiers.*.price').optional().isFloat({ min: 0 }).toFloat(),
  body('pricingTiers.*.currency').optional().isString().trim(),

  body('inventory').optional().isObject(),
  body('inventory.stock').optional().isInt({ min: 0 }).toInt(),
  body('inventory.reserved').optional().isInt({ min: 0 }).toInt(),
  body('inventory.backorder').optional().isBoolean().toBoolean(),
  body('inventory.warehouses').optional().isArray(),
  body('inventory.warehouses.*.id').optional().custom((v) => isObjectId(v)).withMessage('warehouse id must be a valid ObjectId'),
  body('inventory.warehouses.*.qty').optional().isInt({ min: 0 }).toInt(),

  body('variants').optional().isArray(),
  body('variants.*.sku').optional().isString().trim(),
  body('variants.*.attributes').optional().isObject(),
  body('variants.*.price').optional().isArray(),
  body('variants.*.inventory').optional().isObject(),

  body('weight.value').optional().isFloat({ min: 0 }).toFloat(),
  body('weight.unit').optional().isString().trim(),
  body('dimensions.length').optional().isFloat({ min: 0 }).toFloat(),
  body('dimensions.width').optional().isFloat({ min: 0 }).toFloat(),
  body('dimensions.height').optional().isFloat({ min: 0 }).toFloat(),
  body('dimensions.unit').optional().isString().trim(),

  body('shipping').optional().isObject(),
  body('shipping.class').optional().isString().trim(),
  body('shipping.freightClass').optional().isString().trim(),
  body('shipping.shipsFrom').optional().isString().trim(),

  body('taxClass').optional().isString().trim(),

  body('ratings').optional().isObject(),
  body('ratings.avg').optional().isFloat({ min: 0 }).toFloat(),
  body('ratings.count').optional().isInt({ min: 0 }).toInt(),

  body('reviews').optional().isArray(),
  body('reviews.*').optional().custom((v) => isObjectId(v)).withMessage('each review must be a valid ObjectId'),

  body('relatedProducts').optional().isArray(),
  body('relatedProducts.*').optional().custom((v) => isObjectId(v)).withMessage('each relatedProduct must be a valid ObjectId'),

  body('seller').optional().isObject(),
  body('seller.id').optional().custom((v) => isObjectId(v)).withMessage('seller.id must be a valid ObjectId'),
  body('seller.name').optional().isString().trim(),

  body('metadata').optional().custom((v) => {
    if (typeof v === 'object' && !Array.isArray(v)) return true;
    throw new Error('metadata must be an object');
  }),

  body('status').optional().isIn(STATUS_ENUM).withMessage(`status must be one of: ${STATUS_ENUM.join(', ')}`),
  body('ops_region').optional().isString().trim(),
  body('published').optional().isBoolean().toBoolean(),

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
  body('sku').optional().isString().trim().notEmpty(),
  body('title').optional().isString().trim().notEmpty(),
  body('slug').optional().isString().trim(),
  body('description').optional().isString(),
  body('shortDescription').optional().isString(),

  body('price').optional().isArray(),
  body('price.*.list').optional().isFloat({ min: 0 }).toFloat(),
  body('price.*.sale').optional({ nullable: true }).custom((v) => v === null || Number(v) >= 0),
  body('price.*.currency').optional().isString().trim(),

  body('inventory').optional().isObject(),
  body('inventory.stock').optional().isInt({ min: 0 }).toInt(),
  body('inventory.reserved').optional().isInt({ min: 0 }).toInt(),
  body('inventory.backorder').optional().isBoolean().toBoolean(),

  body('variants').optional().isArray(),
  body('variants.*.sku').optional().isString().trim(),

  body('status').optional().isIn(STATUS_ENUM),
  body('published').optional().isBoolean().toBoolean(),

  runValidation
];

/* -------------------------
 * Upsert validator
 * ------------------------- */

const upsert = [
  body('filter').exists().withMessage('filter is required').bail()
    .custom((v) => v && typeof v === 'object' && !Array.isArray(v)).withMessage('filter must be an object'),
  body('update').exists().withMessage('update is required').bail()
    .custom((v) => v && typeof v === 'object' && !Array.isArray(v)).withMessage('update must be an object'),
  runValidation
];

/* -------------------------
 * Bulk insert validator
 * ------------------------- */

const bulkInsert = [
  body().custom((v) => {
    if (Array.isArray(v)) return true;
    if (v && Array.isArray(v.docs)) return true;
    throw new Error('body must be an array of docs or { docs: [] }');
  }),
  runValidation
];

/* -------------------------
 * Inventory / rating validators
 * ------------------------- */

const adjustStock = [
  ...idParam,
  body('delta').exists().withMessage('delta is required').bail()
    .isNumeric().withMessage('delta must be a number').toFloat(),
  runValidation
];

const reserve = [
  ...idParam,
  body('qty').exists().withMessage('qty is required').bail()
    .isInt({ min: 1 }).withMessage('qty must be an integer >= 1').toInt(),
  runValidation
];

const release = [
  ...idParam,
  body('qty').exists().withMessage('qty is required').bail()
    .isInt({ min: 1 }).withMessage('qty must be an integer >= 1').toInt(),
  runValidation
];

const applyRating = [
  ...idParam,
  body('rating').exists().withMessage('rating is required').bail()
    .isFloat({ min: 0.5, max: 5 }).withMessage('rating must be between 0.5 and 5').toFloat(),
  runValidation
];

/* -------------------------
 * Publish / delete validators
 * ------------------------- */

const publish = [
  ...idParam,
  runValidation
];

const softDelete = [
  ...idParam,
  runValidation
];

const hardDelete = [
  ...idParam,
  runValidation
];

/* -------------------------
 * List / search validators
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

const publicSearch = [
  query('q').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('skip').optional().isInt({ min: 0 }).toInt(),
  query('filter').optional().custom((value) => {
    if (!value) return true;
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
  skuParam,

  /* actions */
  create,
  updateById,
  upsert,
  bulkInsert,

  /* inventory / rating */
  adjustStock,
  reserve,
  release,
  applyRating,

  /* publish / delete */
  publish,
  softDelete,
  hardDelete,

  /* listing / search */
  list,
  publicSearch
};
