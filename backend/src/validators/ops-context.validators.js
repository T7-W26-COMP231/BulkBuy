// src/validators/ops-context.validators.js
/**
 * Validators for ops-context endpoints (express-validator)
 *
 * - Exports middleware arrays used by src/routes/ops-context.routes.js
 * - getUiProductsQuery validates GET /products (query)
 * - getUiProductsBody validates POST /products (body)
 * - getEnrichedOrdersQuery / getEnrichedOrdersBody validate enriched orders endpoints
 * - evict* validators validate admin eviction endpoints
 */

const { query, body, validationResult } = require('express-validator');

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

/* Helpers */
function isJsonOrString(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string') return true;
  try {
    JSON.parse(value);
    return true;
  } catch (e) {
    // allow plain string (e.g., "draft")
    return true;
  }
}

function toIntOrDefault(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : fallback;
}

/* -------------------------
 * Products validators
 * ------------------------- */

const getUiProductsQuery = [
  query('region').exists().withMessage('region is required').bail().isString().withMessage('region must be a string').trim(),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be an integer >= 1').toInt(),
  query('limit').optional().isInt({ min: 1, max: 500 }).withMessage('limit must be an integer between 1 and 500').toInt(),
  runValidation
];

const getUiProductsBody = [
  body('region').exists().withMessage('region is required').bail().isString().withMessage('region must be a string').trim(),
  body('page').optional().isInt({ min: 1 }).withMessage('page must be an integer >= 1').toInt(),
  body('limit').optional().isInt({ min: 1, max: 500 }).withMessage('limit must be an integer between 1 and 500').toInt(),
  runValidation
];

/* -------------------------
 * Enriched orders validators
 * ------------------------- */

/**
 * Accepts status as:
 *  - omitted
 *  - a simple string (e.g., "submitted")
 *  - a JSON array string (e.g., '["draft","submitted"]')
 */
const statusValidator = (field) => [
  field
    .optional()
    .custom((val) => {
      if (val === undefined || val === null || val === '') return true;
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed.every((s) => typeof s === 'string');
          return true;
        } catch (e) {
          return true;
        }
      }
      if (Array.isArray(val)) return val.every((s) => typeof s === 'string');
      return false;
    })
    .withMessage('status must be a string or JSON array of strings')
];

const booleanLike = (field) => [
  field
    .optional()
    .custom((val) => {
      if (val === undefined || val === null || val === '') return true;
      if (typeof val === 'boolean') return true;
      if (typeof val === 'string') {
        const v = val.toLowerCase();
        return v === 'true' || v === 'false';
      }
      return false;
    })
    .withMessage('must be boolean or "true"/"false"')
];

const getEnrichedOrdersQuery = [
  query('userId').exists().withMessage('userId is required').bail().isString().withMessage('userId must be a string').trim(),
  query('region').optional().isString().withMessage('region must be a string').trim(),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be an integer >= 1').toInt(),
  query('limit').optional().isInt({ min: 1, max: 500 }).withMessage('limit must be an integer between 1 and 500').toInt(),
  query('status').optional().custom(isJsonOrString).withMessage('status must be a string or JSON array'),
  query('includeSaveForLater').optional().custom((v) => v === 'true' || v === 'false' || typeof v === 'boolean').withMessage('includeSaveForLater must be boolean'),
  query('persist').optional().custom((v) => v === 'true' || v === 'false' || typeof v === 'boolean').withMessage('persist must be boolean'),
  runValidation
];

const getEnrichedOrdersBody = [
  body('userId').exists().withMessage('userId is required').bail().isString().withMessage('userId must be a string').trim(),
  body('region').optional().isString().withMessage('region must be a string').trim(),
  body('page').optional().isInt({ min: 1 }).withMessage('page must be an integer >= 1').toInt(),
  body('limit').optional().isInt({ min: 1, max: 500 }).withMessage('limit must be an integer between 1 and 500').toInt(),
  body('status').optional().custom(isJsonOrString).withMessage('status must be a string or JSON array'),
  body('includeSaveForLater').optional().custom((v) => v === true || v === false || v === 'true' || v === 'false').withMessage('includeSaveForLater must be boolean'),
  body('persist').optional().custom((v) => v === true || v === false || v === 'true' || v === 'false').withMessage('persist must be boolean'),
  runValidation
];

/* -------------------------
 * Eviction (admin) validators
 * ------------------------- */

const evictProductsRegion = [
  body('region').exists().withMessage('region is required').bail().isString().withMessage('region must be a string').trim(),
  runValidation
];

const evictOrdersUser = [
  body('userId').exists().withMessage('userId is required').bail().isString().withMessage('userId must be a string').trim(),
  runValidation
];

const evictOrdersRegion = [
  body('region').exists().withMessage('region is required').bail().isString().withMessage('region must be a string').trim(),
  runValidation
];

/* -------------------------
 * Exports
 * ------------------------- */

module.exports = {
  getUiProductsQuery,
  getUiProductsBody,
  getEnrichedOrdersQuery,
  getEnrichedOrdersBody,
  evictProductsRegion,
  evictOrdersUser,
  evictOrdersRegion,
  runValidation
};
