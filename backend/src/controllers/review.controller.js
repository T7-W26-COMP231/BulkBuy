// src/controllers/review.controller.js
/**
 * Review controller
 * - Thin HTTP layer that delegates to review.service
 * - Propagates actor and correlationId, records audit events for failures/successes
 */

const reviewService = require('../services/review.service');
const auditService = require('../services/audit.service');

function actorFromReq(req = {}) {
  const user = req.user || null;
  return {
    userId: user && (user.userId || user._id) || null,
    role: user && user.role || null
  };
}

/* POST /reviews */
async function createReview(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const payload = req.body;
    const created = await reviewService.createReview(payload, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'review.create.success',
      actor,
      target: { type: 'Review', id: created._id || created.id || null },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });
    return res.status(201).json({ success: true, data: created });
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
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /reviews */
async function listReviews(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const page = req.query.page;
    const limit = req.query.limit;
    const filter = req.query.filter ? JSON.parse(req.query.filter) : {};
    const result = await reviewService.listReviews(filter, { page, limit, correlationId, actor });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'review.list.failed',
      actor,
      target: { type: 'Review', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(500).json({ success: false, message: err.message });
  }
}

/* GET /reviews/:id */
async function getById(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const doc = await reviewService.getById(id, { correlationId, actor });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'review.get.failed',
      actor,
      target: { type: 'Review', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* PATCH /reviews/:id */
async function updateById(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const update = req.body;
    const updated = await reviewService.updateById(id, update, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'review.update.failed',
      actor,
      target: { type: 'Review', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /reviews/:id/publish */
async function publishReview(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const updated = await reviewService.publishReview(id, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'review.publish.success',
      actor,
      target: { type: 'Review', id },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'review.publish.failed',
      actor,
      target: { type: 'Review', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /reviews/:id/soft-delete */
async function softDelete(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const deletedBy = actor.userId || null;
    const removed = await reviewService.softDeleteById(id, deletedBy, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'review.delete.soft.success',
      actor,
      target: { type: 'Review', id },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });
    return res.status(200).json({ success: true, data: removed });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'review.delete.soft.failed',
      actor,
      target: { type: 'Review', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* DELETE /reviews/:id/hard */
async function hardDelete(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const removed = await reviewService.hardDeleteById(id, { actor, correlationId });
    await auditService.logEvent({
      eventType: 'review.delete.hard.success',
      actor,
      target: { type: 'Review', id },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });
    return res.status(200).json({ success: true, data: removed });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'review.delete.hard.failed',
      actor,
      target: { type: 'Review', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /reviews/by-reviewer/:reviewerId */
async function findByReviewer(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const reviewerId = req.params.reviewerId;
    const items = await reviewService.findByReviewer(reviewerId, { actor, correlationId });
    return res.status(200).json({ success: true, items });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'review.findByReviewer.failed',
      actor,
      target: { type: 'Review', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /reviews/by-reviewee/:revieweeId */
async function findByReviewee(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const revieweeId = req.params.revieweeId;
    const items = await reviewService.findByReviewee(revieweeId, { actor, correlationId });
    return res.status(200).json({ success: true, items });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'review.findByReviewee.failed',
      actor,
      target: { type: 'Review', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /reviews/average - query params: productId, itemId, revieweeId */
async function averageRating(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const params = {
      productId: req.query.productId,
      itemId: req.query.itemId,
      revieweeId: req.query.revieweeId,
      includeDeleted: req.query.includeDeleted === 'true'
    };
    const result = await reviewService.averageRating(params, { actor, correlationId });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'review.average.failed',
      actor,
      target: { type: 'Review', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  createReview,
  listReviews,
  getById,
  updateById,
  publishReview,
  softDelete,
  hardDelete,
  findByReviewer,
  findByReviewee,
  averageRating
};
