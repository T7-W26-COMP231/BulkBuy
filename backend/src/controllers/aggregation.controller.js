// src/controllers/aggregation.controller.js
const createError = require('http-errors');
const AggregationService = require('../services/aggregation.service');

/**
 * Standard response wrapper
 * @param {Object} res
 * @param {Number} status
 * @param {Object} payload
 */
function send(res, status, payload) {
  return res.status(status).json(payload);
}

/**
 * Async wrapper to forward errors to express error handler
 * @param {Function} fn async route handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Build common opts (actor, correlationId, session)
 */
function buildOpts(req = {}) {
  return {
    session: req.app && req.app.locals && req.app.locals.session,
    actor: req.user,
    correlationId: req.headers && (req.headers['x-correlation-id'] || req.headers['x-request-id']) || null
  };
}

const AggregationController = {
  /**
   * POST /aggregations
   */
  createAggregation: asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const opts = buildOpts(req);
    const created = await AggregationService.createAggregation(payload, opts);
    return send(res, 201, { success: true, data: created });
  }),

  /**
   * GET /aggregations/:id
   */
  getById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw createError(400, 'id is required');
    const opts = {
      select: req.query.select,
      populate: req.query.populate
    };
    const agg = await AggregationService.getById(id, opts);
    return send(res, 200, { success: true, data: agg });
  }),

  /**
   * GET /aggregations/by-item/:itemId
   */
  findByItemId: asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    if (!itemId) throw createError(400, 'itemId is required');
    const opts = {
      select: req.query.select,
      populate: req.query.populate,
      includeSuspended: req.query.includeSuspended === 'true'
    };
    const results = await AggregationService.findByItemId(itemId, opts);
    return send(res, 200, { success: true, items: results });
  }),

  /**
   * GET /aggregations
   * Query: ?page=1&limit=25&sort=updatedAt:-1&filter={"status":"pending"}
   */
  listAggregations: asyncHandler(async (req, res) => {
    let filter = {};
    try {
      filter = req.query.filter ? JSON.parse(req.query.filter) : {};
    } catch (err) {
      throw createError(400, 'Invalid filter JSON');
    }
    const opts = {
      page: req.query.page,
      limit: req.query.limit,
      sort: req.query.sort,
      select: req.query.select,
      populate: req.query.populate
    };
    const result = await AggregationService.listAggregations(filter, opts);
    return send(res, 200, { success: true, ...result });
  }),

  /**
   * PATCH /aggregations/:id
   */
  updateById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const update = req.body || {};
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');
    const opts = Object.assign({ new: true }, {
      populate: req.query.populate,
      actor: req.user,
      correlationId: req.headers['x-correlation-id'] || null
    });
    const updated = await AggregationService.updateById(id, update, opts);
    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * PATCH /aggregations
   * Body: { filter, update, opts }
   */
  updateOne: asyncHandler(async (req, res) => {
    const body = req.body || {};
    const filter = body.filter || {};
    const update = body.update || {};
    const opts = Object.assign({}, body.opts || {}, {
      actor: req.user,
      correlationId: req.headers['x-correlation-id'] || null
    });
    const updated = await AggregationService.updateOne(filter, update, opts);
    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * POST /aggregations/:id/add-order
   * Body: { orderId }
   */
  addOrder: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { orderId } = req.body || {};
    if (!id || !orderId) throw createError(400, 'aggregation id and orderId are required');
    const opts = buildOpts(req);
    const updated = await AggregationService.addOrder(id, orderId, opts);
    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * POST /aggregations/:id/mark-processed
   */
  markProcessed: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw createError(400, 'aggregation id is required');
    const opts = buildOpts(req);
    const updated = await AggregationService.markProcessed(id, opts);
    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * DELETE /aggregations/:id/hard
   * Hard delete (admin usage)
   */
  hardDeleteById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw createError(400, 'id is required');
    const opts = buildOpts(req);
    const removed = await AggregationService.hardDeleteById(id, opts);
    return send(res, 200, { success: true, data: removed });
  }),

  /**
   * POST /aggregations/bulk
   */
  bulkCreate: asyncHandler(async (req, res) => {
    const docs = req.body;
    if (!Array.isArray(docs) || docs.length === 0) {
      throw createError(400, 'Request body must be a non-empty array of aggregation objects');
    }
    const opts = buildOpts(req);
    const inserted = await AggregationService.bulkCreate(docs, opts);
    return send(res, 201, { success: true, data: inserted });
  })
};

module.exports = AggregationController;
