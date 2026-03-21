// src/routes/user.routes.js
const express = require('express');
const UserController = require('../controllers/user.controller');
const userValidators = require('../validators/user.validators');
const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');
const { requireRole, requireAnyRole } = require('../middleware/rbac.middleware');

const router = express.Router();

/**
 * Async wrapper to forward errors to express error handler
 * @param {Function} fn async route handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Routes
 *
 * POST   /users                    -> create user
 * POST   /users/authenticate       -> authenticate user (email + password)
 * POST   /users/search             -> search users (body filters + pagination)
 * GET    /users/public-search      -> public provider search (q, page, limit)
 * GET    /users                    -> list users (pagination/filter via query)
 * GET    /users/:id                -> get user by Mongo _id
 * GET    /users/by-userid/:userId  -> get user by human-friendly userId
 * GET    /users/by-email           -> get user by email (query param ?email=)
 * PATCH  /users/:id                -> update user by _id
 * PATCH  /users                    -> update one by filter (body: { filter, update, opts })
 * DELETE /users/:id                -> soft-delete user by _id
 * POST   /users/bulk               -> bulk create users
 */

/* Create user */
router.post(
  '/',
  userValidators.create,
  requireAuth,
  requireRole('administrator'),
  asyncHandler(UserController.createUser)
);

/* Authenticate */
router.post(
  '/authenticate',  
  requireAuth,
  asyncHandler(UserController.authenticate)
);

/* Search users (body filters) */
router.post(
  '/search',
  requireAuth,
  requireRole('administrator'),
  asyncHandler(UserController.searchUsers)
);

/* Public search (query: q, page, limit, filters JSON) */
router.get(
  '/public-search',
  requireAuth,
  requireRole('administrator'),
  asyncHandler(UserController.publicSearch)
);

/* List users (supports ?page=&limit=&filter= JSON) */
router.get(
  '/',
  userValidators.query,
  requireAuth,
  requireRole('administrator'),
  asyncHandler(UserController.listUsers)
);

/* Get user by Mongo _id */
router.get(
  '/:id',
  userValidators.idParam,
  requireAuth,
  requireRole('administrator'),
  asyncHandler(UserController.getUserById)
);

/* Get user by human-friendly userId */
router.get(
  '/by-userid/:userId',
  userValidators.userIdParam,
  requireAuth,
  asyncHandler(UserController.getUserByUserId)
);

/* Get user by email (query param ?email=someone@example.com) */
router.get(
  '/by-email',
  asyncHandler(UserController.getUserByEmail)
);

/* Update user by _id (partial update) */
router.patch(
  '/:id',
  userValidators.idParam,
  userValidators.update,
  requireAuth,
  requireRole('administrator'),
  asyncHandler(UserController.updateUserById)
);

/* Update one by filter: body { filter, update, opts } */
router.patch(
  '/',
  requireAuth,
  asyncHandler(UserController.updateOne)
);

/* Delete user by _id (soft delete) */
router.delete(
  '/:id',
  userValidators.idParam,
  requireAuth,
  requireRole('administrator'),
  asyncHandler(UserController.deleteUserById)
);

/* Bulk create users */
router.post(
  '/bulk',
  userValidators.bulkCreate,
  requireAuth,
  requireRole('administrator'),
  asyncHandler(UserController.bulkCreate)
);

module.exports = router;
