// src/routes/config.routes.js
/**
 * Config routes
 *
 * Routes:
 * POST   /configs/for-user/:userId      -> create config for user (one-per-user)
 * GET    /configs/:id                   -> get config by id
 * GET    /configs/by-user/:userId       -> get config by user id
 * PATCH  /configs/:id                   -> update config
 * POST   /configs/by-user/:userId/upsert-> upsert config for user
 * POST   /configs/by-user/:userId/theme -> set theme for user
 * POST   /configs/by-user/:userId/location -> set location for user
 * POST   /configs/:id/soft-delete       -> soft delete config
 * DELETE /configs/:id/hard              -> hard delete config (admin)
 * GET    /configs                       -> list/paginate configs
 * GET    /configs/find                  -> find by filter (returns array)
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const ConfigController = require('../controllers/config.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole, requireAnyRole } = require('../middleware/rbac.middleware');

/* Async wrapper to forward errors to express error handler */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/* Simple param validator for :id and other id params */
const validateObjectIdParam = (paramName) => (req, res, next) => {
  const id = req.params[paramName];
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    const err = new Error(`${paramName} must be a valid ObjectId`);
    err.status = 400;
    return next(err);
  }
  return next();
};

/* Require body field middleware */
const requireBodyField = (field) => (req, res, next) => {
  if (!req.body || req.body[field] === undefined || req.body[field] === null) {
    const err = new Error(`${field} is required in request body`);
    err.status = 400;
    return next(err);
  }
  return next();
};

/* Parse optional filter query param (JSON string) */
const parseFilterQuery = (req, res, next) => {
  if (req.query && req.query.filter) {
    try {
      req.query.filter = JSON.parse(req.query.filter);
    } catch (e) {
      const err = new Error('filter must be a valid JSON string');
      err.status = 400;
      return next(err);
    }
  }
  return next();
};

/* Routes */

/* Create config for user (enforce one-per-user at service layer) */
router.post(
  '/for-user/:userId',
  requireAuth,
  validateObjectIdParam('userId'),
  asyncHandler(ConfigController.createForUser)
);

/* Get config by id */
router.get(
  '/:id',
  requireAuth,
  validateObjectIdParam('id'),
  asyncHandler(ConfigController.getById)
);

/* Get config by userId */
router.get(
  '/by-user/:userId',
  requireAuth,
  validateObjectIdParam('userId'),
  asyncHandler(ConfigController.getByUserId)
);

/* Update config by id (partial) */
router.patch(
  '/:id',
  requireAuth,
  validateObjectIdParam('id'),
  asyncHandler(ConfigController.updateById)
);

/* Upsert config for user (create or update single config) */
router.post(
  '/by-user/:userId/upsert',
  requireAuth,
  validateObjectIdParam('userId'),
  asyncHandler(ConfigController.upsertForUser)
);

/* Set theme for user's config */
router.post(
  '/by-user/:userId/theme',
  requireAuth,
  validateObjectIdParam('userId'),
  requireBodyField('theme'),
  asyncHandler(ConfigController.setTheme)
);

/* Set location for user's config */
router.post(
  '/by-user/:userId/location',
  requireAuth,
  validateObjectIdParam('userId'),
  requireBodyField('lat'), // optional but helps catch empty body; service validates ranges
  asyncHandler(ConfigController.setLocation)
);

/* Soft delete config */
router.post(
  '/:id/soft-delete',
  requireAuth,
  validateObjectIdParam('id'),
  asyncHandler(ConfigController.softDelete)
);

/* Hard delete config (admin only) */
const adminOnly = (req, res, next) => {
  const user = req.user;
  if (!user || user.role !== 'administrator') {
    const err = new Error('admin privileges required');
    err.status = 403;
    return next(err);
  }
  return next();
};

router.delete(
  '/:id/hard',
  requireAuth,
  validateObjectIdParam('id'),
  adminOnly,
  asyncHandler(ConfigController.hardDelete)
);

/* List / paginate configs */
router.get(
  '/',
  requireAuth,
  parseFilterQuery,
  asyncHandler(ConfigController.listConfigs)
);

/* Find by filter (returns array) */
router.get(
  '/find',
  requireAuth,
  parseFilterQuery,
  asyncHandler(ConfigController.findByFilter)
);

module.exports = router;
