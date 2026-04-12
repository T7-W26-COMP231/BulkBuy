// src/validators/config.validators.js
/**
 * Validators for Config endpoints
 * - Uses express-validator
 * - Exports middleware arrays for route wiring
 */

const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

const THEME_ENUM = ['light', 'dark', 'system'];

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

const userIdParam = [
  param('userId').exists().withMessage('userId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('userId must be a valid ObjectId'),
  runValidation
];

/* Create config for user (one-per-user) */
const createForUser = [
  ...userIdParam,
  body('location').optional().isObject().withMessage('location must be an object'),
  body('location.lat').optional().isFloat({ min: -90, max: 90 }).withMessage('lat must be between -90 and 90').toFloat(),
  body('location.lng').optional().isFloat({ min: -180, max: 180 }).withMessage('lng must be between -180 and 180').toFloat(),
  body('location.address').optional().isString().trim(),
  body('theme').optional().isIn(THEME_ENUM).withMessage(`theme must be one of: ${THEME_ENUM.join(', ')}`),
  body('isPrivate').optional().isBoolean().withMessage('isPrivate must be a boolean').toBoolean(),
  body('ops_region').optional().isString().trim(),
  body('metadata').optional().custom((v) => {
    if (typeof v === 'object') return true;
    throw new Error('metadata must be an object');
  }),
  runValidation
];

/* Upsert config for user (create or update) */
const upsertForUser = [
  ...userIdParam,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('payload must be an object');
    }
    return true;
  }),
  body('location').optional().isObject().withMessage('location must be an object'),
  body('location.lat').optional().isFloat({ min: -90, max: 90 }).withMessage('lat must be between -90 and 90').toFloat(),
  body('location.lng').optional().isFloat({ min: -180, max: 180 }).withMessage('lng must be between -180 and 180').toFloat(),
  body('location.address').optional().isString().trim(),
  body('theme').optional().isIn(THEME_ENUM).withMessage(`theme must be one of: ${THEME_ENUM.join(', ')}`),
  body('isPrivate').optional().isBoolean().withMessage('isPrivate must be a boolean').toBoolean(),
  body('ops_region').optional().isString().trim(),
  body('metadata').optional().custom((v) => {
    if (typeof v === 'object') return true;
    throw new Error('metadata must be an object');
  }),
  runValidation
];

/* Update config by id (partial) */
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
  body('location').optional().isObject().withMessage('location must be an object'),
  body('location.lat').optional().isFloat({ min: -90, max: 90 }).withMessage('lat must be between -90 and 90').toFloat(),
  body('location.lng').optional().isFloat({ min: -180, max: 180 }).withMessage('lng must be between -180 and 180').toFloat(),
  body('location.address').optional().isString().trim(),
  body('theme').optional().isIn(THEME_ENUM).withMessage(`theme must be one of: ${THEME_ENUM.join(', ')}`),
  body('isPrivate').optional().isBoolean().withMessage('isPrivate must be a boolean').toBoolean(),
  body('ops_region').optional().isString().trim(),
  body('metadata').optional().custom((v) => {
    if (typeof v === 'object') return true;
    throw new Error('metadata must be an object');
  }),
  runValidation
];

/* Set theme for user's config */
const setTheme = [
  ...userIdParam,
  body('theme').exists().withMessage('theme is required').bail()
    .isIn(THEME_ENUM).withMessage(`theme must be one of: ${THEME_ENUM.join(', ')}`),
  runValidation
];

/* Set location for user's config */
const setLocation = [
  ...userIdParam,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('location payload must be an object');
    }
    if (Object.keys(value).length === 0) {
      throw new Error('location payload cannot be empty');
    }
    return true;
  }),
  body('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('lat must be between -90 and 90').toFloat(),
  body('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('lng must be between -180 and 180').toFloat(),
  body('address').optional().isString().trim(),
  runValidation
];

/* Soft delete / hard delete validators */
const softDelete = idParam;
const hardDelete = idParam;

/* List / paginate validators */
const listValidator = [
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

module.exports = {
  runValidation,
  idParam,
  userIdParam,
  createForUser,
  upsertForUser,
  updateById,
  setTheme,
  setLocation,
  softDelete,
  hardDelete,
  list: listValidator,
  adminOnly
};
