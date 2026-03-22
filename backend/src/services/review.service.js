// src/services/review.service.js
/**
 * Review service
 * - Business logic for reviews
 * - Delegates persistence to review.repo
 * - Emits audit events via audit.service
 *
 * Methods:
 * - createReview, listReviews, getById, updateById
 * - publishReview, softDeleteById, hardDeleteById
 * - findByReviewer, findByReviewee, averageRating
 *
 * All methods accept opts = { actor, correlationId, session, ... } where appropriate.
 */

const createError = require('http-errors');
const ReviewRepo = require('../repositories/review.repo');
const auditService = require('./audit.service');

const STATUS_ENUM = ['draft', 'submitted', 'deleted'];

function actorFromOpts(opts = {}) {
  if (!opts) return { userId: null, role: null };
  if (opts.actor) return opts.actor;
  if (opts.user) return { userId: opts.user && (opts.user.userId || opts.user._id) || null, role: opts.user && opts.user.role || null };
  return { userId: null, role: null };
}

function sanitize(doc) {
  if (!doc) return doc;
  if (typeof doc.toObject === 'function') {
    const obj = doc.toObject();
    if (obj.internalNotes) delete obj.internalNotes;
    if (obj.deleted !== undefined) delete obj.deleted;
    return obj;
  }
  const copy = { ...doc };
  delete copy.internalNotes;
  delete copy.deleted;
  return copy;
}

class ReviewService {
  /**
   * Create a new review
   * @param {Object} payload
   * @param {Object} opts
   */
  async createReview(payload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!payload || typeof payload !== 'object') throw createError(400, 'Invalid payload');
    if (!payload.reviewerId) throw createError(400, 'reviewerId is required');
    if (!payload.revieweeId) throw createError(400, 'revieweeId is required');
    if (payload.rating === undefined || payload.rating === null) throw createError(400, 'rating is required');

    // enforce rating bounds
    const rating = Number(payload.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) throw createError(400, 'rating must be a number between 1 and 5');

    const safe = { ...payload };
    delete safe._id;
    delete safe.createdAt;
    delete safe.updatedAt;

    try {
      const created = await ReviewRepo.create(safe, { session: opts.session });
      await auditService.logEvent({
        eventType: 'review.create.success',
        actor,
        target: { type: 'Review', id: created._id || created.id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(created);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'review.create.failed',
        actor,
        target: { type: 'Review', id: null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Paginated list of reviews
   * @param {Object} filter
   * @param {Object} opts
   */
  async listReviews(filter = {}, opts = {}) {
    const correlationId = opts.correlationId || null;
    try {
      const result = await ReviewRepo.paginate(filter, opts);
      result.items = (result.items || []).map(sanitize);
      return result;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'review.list.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Review', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Get review by id
   * @param {String} id
   * @param {Object} opts
   */
  async getById(id, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    try {
      const doc = await ReviewRepo.findById(id, opts);
      if (!doc) throw createError(404, 'Review not found');
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'review.get.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Review', id: id || null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Update review by id (partial)
   * @param {String} id
   * @param {Object} update
   * @param {Object} opts
   */
  async updateById(id, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    const payload = { ...update };
    delete payload._id;

    // Prevent invalid status values
    if (payload.status && !STATUS_ENUM.includes(payload.status)) {
      throw createError(400, `status must be one of: ${STATUS_ENUM.join(', ')}`);
    }

    try {
      const updated = await ReviewRepo.updateById(id, payload, opts);
      if (!updated) throw createError(404, 'Review not found');
      await auditService.logEvent({
        eventType: 'review.update.success',
        actor,
        target: { type: 'Review', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { update: payload }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'review.update.failed',
        actor,
        target: { type: 'Review', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Publish a review (draft -> submitted)
   * @param {String} id
   * @param {Object} opts
   */
  async publishReview(id, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');

    try {
      const updated = await ReviewRepo.updateById(id, { $set: { status: 'submitted' } }, { ...opts, new: true });
      if (!updated) throw createError(404, 'Review not found');
      await auditService.logEvent({
        eventType: 'review.publish.success',
        actor,
        target: { type: 'Review', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'review.publish.failed',
        actor,
        target: { type: 'Review', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Soft delete review
   * @param {String} id
   * @param {String|null} deletedBy
   * @param {Object} opts
   */
  async softDeleteById(id, deletedBy = null, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');

    try {
      const removed = await ReviewRepo.softDeleteById(id, deletedBy, opts);
      if (!removed) throw createError(404, 'Review not found');
      await auditService.logEvent({
        eventType: 'review.delete.soft.success',
        actor,
        target: { type: 'Review', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'review.delete.soft.failed',
        actor,
        target: { type: 'Review', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Hard delete review
   * @param {String} id
   * @param {Object} opts
   */
  async hardDeleteById(id, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');

    try {
      const removed = await ReviewRepo.deleteById(id, opts);
      if (!removed) throw createError(404, 'Review not found');
      await auditService.logEvent({
        eventType: 'review.delete.hard.success',
        actor,
        target: { type: 'Review', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'review.delete.hard.failed',
        actor,
        target: { type: 'Review', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Find reviews by reviewerId
   * @param {String} reviewerId
   * @param {Object} opts
   */
  async findByReviewer(reviewerId, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!reviewerId) throw createError(400, 'reviewerId is required');
    try {
      const items = await ReviewRepo.findByReviewer(reviewerId, opts);
      return (items || []).map(sanitize);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'review.findByReviewer.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Review', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Find reviews by revieweeId
   * @param {String} revieweeId
   * @param {Object} opts
   */
  async findByReviewee(revieweeId, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!revieweeId) throw createError(400, 'revieweeId is required');
    try {
      const items = await ReviewRepo.findByReviewee(revieweeId, opts);
      return (items || []).map(sanitize);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'review.findByReviewee.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Review', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Compute average rating for product/item/reviewee
   * @param {Object} params - { productId, itemId, revieweeId, includeDeleted }
   * @param {Object} opts
   */
  async averageRating(params = {}, opts = {}) {
    const correlationId = opts.correlationId || null;
    try {
      const res = await ReviewRepo.averageRating(params, opts);
      await auditService.logEvent({
        eventType: 'review.average.success',
        actor: actorFromOpts(opts),
        target: { type: 'Review', id: null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { params }
      });
      return res;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'review.average.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Review', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }
}

module.exports = new ReviewService();
