// src/routes/review.routes.js
/**
 * Review routes
 * - Thin routing layer that wires validators, auth, and controller handlers
 *
 * Routes:
 * POST   /reviews                      -> create review
 * GET    /reviews                      -> list reviews (pagination/filter)
 * GET    /reviews/:id                  -> get review by id
 * PATCH  /reviews/:id                  -> update review
 * POST   /reviews/:id/publish          -> publish review (draft -> submitted)
 * POST   /reviews/:id/soft-delete      -> soft delete
 * DELETE /reviews/:id/hard             -> hard delete (admin)
 *
 * GET    /reviews/by-reviewer/:reviewerId
 * GET    /reviews/by-reviewee/:revieweeId
 * GET    /reviews/average              -> average rating (query params)
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const ReviewController = require('../controllers/review.controller');
const reviewValidators = require('../validators/review.validators');
const { requireAuth } = require('../middleware/auth.middleware');

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

/* Simple body validator for required fields */
const requireBodyField = (field) => (req, res, next) => {
  if (!req.body || req.body[field] === undefined || req.body[field] === null) {
    const err = new Error(`${field} is required in request body`);
    err.status = 400;
    return next(err);
  }
  return next();
};

/* Public / authenticated routes */
router.post(
  '/',
  requireAuth,
  reviewValidators.create,
  asyncHandler(ReviewController.createReview)
);

router.get(
  '/',
  requireAuth,
  reviewValidators.query,
  asyncHandler(ReviewController.listReviews)
);

router.get(
  '/:id',
  requireAuth,
  validateObjectIdParam('id'),
  asyncHandler(ReviewController.getById)
);

router.patch(
  '/:id',
  requireAuth,
  validateObjectIdParam('id'),
  reviewValidators.update,
  asyncHandler(ReviewController.updateById)
);

router.post(
  '/:id/publish',
  requireAuth,
  validateObjectIdParam('id'),
  asyncHandler(ReviewController.publishReview)
);

router.post(
  '/:id/soft-delete',
  requireAuth,
  validateObjectIdParam('id'),
  asyncHandler(ReviewController.softDelete)
);

router.delete(
  '/:id/hard',
  requireAuth,
  validateObjectIdParam('id'),
  reviewValidators.adminOnly,
  asyncHandler(ReviewController.hardDelete)
);

/* Lookup routes */
router.get(
  '/by-reviewer/:reviewerId',
  requireAuth,
  validateObjectIdParam('reviewerId'),
  asyncHandler(ReviewController.findByReviewer)
);

router.get(
  '/by-reviewee/:revieweeId',
  requireAuth,
  validateObjectIdParam('revieweeId'),
  asyncHandler(ReviewController.findByReviewee)
);

/* Average rating: accepts productId, itemId, revieweeId as query params */
router.get(
  '/average',
  requireAuth,
  reviewValidators.averageQuery || [], // optional: if validator exists
  asyncHandler(ReviewController.averageRating)
);

module.exports = router;
