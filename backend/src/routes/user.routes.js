// src/routes/user.routes.js
const express = require('express');
const UserController = require('../controllers/user.controller');
const userValidators = require('../validators/user.validators');
const { requireAuth, optionalAuth } = require('../middleware/auth.middleware');
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

  // Returns paginated list of users filterable by role, status, and other fields.
  // Usage:
  //   GET /api/users                                          -> all users
  //   GET /api/users?filter={"role":"customer"}              -> customers only
  //   GET /api/users?filter={"role":"supplier"}              -> suppliers only
  //   GET /api/users?filter={"role":{"$in":["customer","supplier"]}} -> all non-admins
  //   GET /api/users?filter={"role":"customer"}&page=2&limit=10      -> paginated
  // Requires: admin auth token

  userValidators.query,
  requireAuth,
  requireRole('administrator'),
  asyncHandler(UserController.listUsers)
);

/* Customer gets own profile */
router.get(
  '/profile',
  requireAuth,
  asyncHandler(UserController.getCustomerProfile)
);

/* Customer self profile update */
router.patch(
  '/profile',
  requireAuth,
  asyncHandler(UserController.updateCustomerProfile)
);

/* Customer notification preferences update */
router.patch(
  '/notifications',
  requireAuth,
  asyncHandler(UserController.updateNotificationPreferences)
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

/* Add customer payment method */
router.patch(
  '/payment-methods',
  requireAuth,
  asyncHandler(UserController.addPaymentMethod)
);

/* Set default customer payment method */
router.patch(
  '/payment-methods/:paymentId/default',
  requireAuth,
  asyncHandler(UserController.setDefaultPaymentMethod)
);

/* Remove customer payment method */
router.delete(
  '/payment-methods/:paymentId',
  requireAuth,
  asyncHandler(UserController.removePaymentMethod)
);

/* Get user by Mongo _id */
router.get(
  '/:id',
  userValidators.idParam,
  requireAuth,
  requireRole('administrator'),
  asyncHandler(UserController.getUserById)
);

/* Update user by _id (partial update) */

// Allows updating user status to 'active' or 'suspended'.
// Used by admin user management page to suspend/activate accounts.
// Body: { "status": "suspended" | "active" }
// Also supports other partial updates: firstName, lastName, emails, etc.

router.patch(
  '/:id',
  userValidators.idParam,
  userValidators.update,
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
