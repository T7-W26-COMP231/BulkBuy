// src/validators/regionMap.validators.js
/**
 * Validators for RegionMap endpoints
 * - Uses express-validator
 * - Exports middleware arrays for route wiring
 *
 * Example usage:
 *   router.post('/', requireAuth, regionMapValidators.create, RegionMapController.create)
 *   router.patch('/:id', requireAuth, regionMapValidators.updateById, RegionMapController.updateById)
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
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => isObjectId(v)).withMessage('id must be a valid ObjectId'),
  runValidation
];

const locationIdParam = [
  param('locationId').exists().withMessage('locationId is required').bail()
    .custom((v) => isObjectId(v)).withMessage('locationId must be a valid ObjectId'),
  runValidation
];

const opsRegionParam = [
  param('opsRegion').exists().withMessage('opsRegion is required').bail()
    .isString().trim().notEmpty().withMessage('opsRegion must be a non-empty string'),
  runValidation
];

/* -------------------------
 * Create validator
 * ------------------------- */

const create = [
  body('ops_region').exists().withMessage('ops_region is required').bail()
    .isString().trim().notEmpty().withMessage('ops_region must be a non-empty string'),
  body('code').exists().withMessage('code is required').bail()
    .isString().trim().notEmpty().withMessage('code must be a non-empty string'),
  body('name').exists().withMessage('name is required').bail()
    .isString().trim().notEmpty().withMessage('name must be a non-empty string'),

  body('description').optional().isObject().withMessage('description must be an object'),
  body('description.subject').optional().isString().trim(),
  body('description.text').optional().isString().trim(),
  body('description.files').optional().isArray(),
  body('description.files.*').optional().custom((v) => isObjectId(v)).withMessage('description.files must be ObjectIds'),

  body('locations').optional().isArray(),
  body('locations.*.locationId').optional().custom((v) => isObjectId(v)).withMessage('locationId must be a valid ObjectId'),
  body('locations.*.name').optional().isString().trim().notEmpty().withMessage('location.name must be a non-empty string'),
  body('locations.*.type').optional().isString().trim(),
  body('locations.*.description').optional().isObject(),
  body('locations.*.address').optional().isObject(),
  body('locations.*.address.line1').optional().isString().trim(),
  body('locations.*.address.line2').optional().isString().trim(),
  body('locations.*.address.city').optional().isString().trim(),
  body('locations.*.address.region').optional().isString().trim(),
  body('locations.*.address.postalCode').optional().isString().trim(),
  body('locations.*.address.country').optional().isString().trim(),
  body('locations.*.geo').optional().custom((v) => {
    if (!v || typeof v !== 'object') throw new Error('geo must be an object');
    if (v.type !== 'Point') throw new Error('geo.type must be Point');
    if (!Array.isArray(v.coordinates) || v.coordinates.length !== 2) throw new Error('geo.coordinates must be [lng, lat]');
    if (!isFinite(v.coordinates[0]) || !isFinite(v.coordinates[1])) throw new Error('geo.coordinates must contain numbers');
    return true;
  }),
  body('locations.*.contact').optional().isObject(),
  body('locations.*.contact.phone').optional().isString().trim(),
  body('locations.*.contact.email').optional().isEmail().withMessage('contact.email must be a valid email'),
  body('locations.*.metadata').optional().custom((v) => {
    if (typeof v === 'object' && !Array.isArray(v)) return true;
    throw new Error('locations.*.metadata must be an object');
  }),

  body('metadata').optional().custom((v) => {
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
  body('ops_region').optional().isString().trim().notEmpty(),
  body('code').optional().isString().trim().notEmpty(),
  body('name').optional().isString().trim().notEmpty(),
  body('description').optional().isObject(),
  body('metadata').optional().custom((v) => {
    if (typeof v === 'object' && !Array.isArray(v)) return true;
    throw new Error('metadata must be an object');
  }),
  runValidation
];

/* -------------------------
 * Location validators
 * ------------------------- */

const addLocation = [
  ...idParam,
  body('name').exists().withMessage('name is required').bail()
    .isString().trim().notEmpty().withMessage('name must be a non-empty string'),
  body('type').optional().isString().trim(),
  body('description').optional().isObject(),
  body('address').optional().isObject(),
  body('address.line1').optional().isString().trim(),
  body('address.city').optional().isString().trim(),
  body('address.country').optional().isString().trim(),
  body('geo').optional().custom((v) => {
    if (!v || typeof v !== 'object') throw new Error('geo must be an object');
    if (v.type !== 'Point') throw new Error('geo.type must be Point');
    if (!Array.isArray(v.coordinates) || v.coordinates.length !== 2) throw new Error('geo.coordinates must be [lng, lat]');
    if (!isFinite(v.coordinates[0]) || !isFinite(v.coordinates[1])) throw new Error('geo.coordinates must contain numbers');
    return true;
  }),
  body('contact').optional().isObject(),
  body('contact.email').optional().isEmail().withMessage('contact.email must be a valid email'),
  body('metadata').optional().custom((v) => {
    if (typeof v === 'object' && !Array.isArray(v)) return true;
    throw new Error('metadata must be an object');
  }),
  runValidation
];

const updateLocation = [
  ...idParam,
  ...locationIdParam,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('update payload must be an object');
    }
    if (Object.keys(value).length === 0) {
      throw new Error('update payload cannot be empty');
    }
    return true;
  }),
  body('name').optional().isString().trim().notEmpty(),
  body('type').optional().isString().trim(),
  body('description').optional().isObject(),
  body('address').optional().isObject(),
  body('geo').optional().custom((v) => {
    if (!v || typeof v !== 'object') throw new Error('geo must be an object');
    if (v.type !== 'Point') throw new Error('geo.type must be Point');
    if (!Array.isArray(v.coordinates) || v.coordinates.length !== 2) throw new Error('geo.coordinates must be [lng, lat]');
    if (!isFinite(v.coordinates[0]) || !isFinite(v.coordinates[1])) throw new Error('geo.coordinates must contain numbers');
    return true;
  }),
  body('contact').optional().isObject(),
  body('metadata').optional().custom((v) => {
    if (typeof v === 'object' && !Array.isArray(v)) return true;
    throw new Error('metadata must be an object');
  }),
  runValidation
];

const removeLocation = [
  ...idParam,
  ...locationIdParam,
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
 * List / nearest validators
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

const nearest = [
  query('lng').exists().withMessage('lng is required').bail().isFloat().withMessage('lng must be a number').toFloat(),
  query('lat').exists().withMessage('lat is required').bail().isFloat().withMessage('lat must be a number').toFloat(),
  query('maxDistance').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
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
  locationIdParam,
  opsRegionParam,

  /* actions */
  create,
  updateById,
  upsert,
  bulkInsert,

  /* locations */
  addLocation,
  updateLocation,
  removeLocation,

  /* listing / search */
  list,
  nearest
};
