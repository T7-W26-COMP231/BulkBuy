// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
//const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');
const { requireAuth, optionalAuth } = require('../middleware/auth.middleware');

/**
 * Async wrapper to forward errors to express error handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Public
 */
router.post('/register', asyncHandler(authCtrl.register));
router.post('/login', asyncHandler(authCtrl.login));
//belwo route will help to create supplier 
router.post('/users', requireAuth, requireRole('administrator'), asyncHandler(authCtrl.createUser)); // 👈 new

/**
 * Token refresh (expects refresh token in cookie or body)
 * - Controller should read refresh token from cookie or req.body.refreshToken
 */
router.post('/refresh', asyncHandler(authCtrl.refresh));

/**
 * Protected
 */
router.post('/logout', optionalAuth, asyncHandler(authCtrl.logout));
router.get('/me', requireAuth, asyncHandler(authCtrl.me));

module.exports = router;

