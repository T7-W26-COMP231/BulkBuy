// src/validators/review.validators.js
/**
 * Validators for Review endpoints
 * - Uses express-validator
 * - Exports middleware arrays for route wiring
 */

const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

const STATUS_ENUM = ['draft', 'submitted', 'deleted'];

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

const reviewerIdParam = [
  param('reviewerId').exists().withMessage('reviewerId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('reviewerId must be a valid ObjectId'),
  runValidation
];

const revieweeIdParam = [
  param('revieweeId').exists().withMessage('revieweeId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('revieweeId must be a valid ObjectId'),
  runValidation
];

/* Create review */
const create = [
  body('reviewerId').exists().withMessage('reviewerId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('reviewerId must be a valid ObjectId'),
  body('revieweeId').exists().withMessage('revieweeId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('revieweeId must be a valid ObjectId'),
  body('productId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('productId must be a valid ObjectId'),
  body('itemId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('itemId must be a valid ObjectId'),
  body('messageId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('messageId must be a valid ObjectId'),
  body('rating').exists().withMessage('rating is required').bail()
    .isFloat({ min: 1, max: 5 }).withMessage('rating must be a number between 1 and 5')
    .toFloat(),
  body('ops_region').optional().isString().trim(),
  body('status').optional().isIn(STATUS_ENUM).withMessage(`status must be one of: ${STATUS_ENUM.join(', ')}`),
  body('metadata').optional().isObject().withMessage('metadata must be an object'),
  runValidation
];

/* Query list */
const queryValidator = [
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

/* Update review (partial) */
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
  body('reviewerId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('reviewerId must be a valid ObjectId'),
  body('revieweeId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('revieweeId must be a valid ObjectId'),
  body('productId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('productId must be a valid ObjectId'),
  body('itemId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('itemId must be a valid ObjectId'),
  body('messageId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('messageId must be a valid ObjectId'),
  body('rating').optional().isFloat({ min: 1, max: 5 }).withMessage('rating must be a number between 1 and 5').toFloat(),
  body('status').optional().isIn(STATUS_ENUM).withMessage(`status must be one of: ${STATUS_ENUM.join(', ')}`),
  runValidation
];

/* Publish validator (only id required) */
const publish = idParam;

/* Soft delete validator (only id required) */
const softDelete = idParam;

/* Average rating query validator */
const averageQuery = [
  query('productId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('productId must be a valid ObjectId'),
  query('itemId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('itemId must be a valid ObjectId'),
  query('revieweeId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('revieweeId must be a valid ObjectId'),
  query('includeDeleted').optional().isIn(['true', 'false']).withMessage('includeDeleted must be "true" or "false"'),
  runValidation
];

module.exports = {
  runValidation,
  create,
  query: queryValidator,
  idParam,
  update,
  publish,
  softDelete,
  adminOnly,
  reviewerIdParam,
  revieweeIdParam,
  averageQuery
};
