// src/controllers/product.controller.js
const createError = require('http-errors');
const ProductService = require('../services/product.service');

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

const ProductController = {
  /**
   * POST /products
   */
  createProduct: asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const opts = {
      session: req.app && req.app.locals && req.app.locals.session,
      actor: req.user,
      correlationId: req.headers['x-correlation-id'] || null
    };
    const created = await ProductService.createProduct(payload, opts);
    return send(res, 201, { success: true, data: created });
  }),

  /**
   * GET /products/:id
   */
  getProductById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw createError(400, 'id is required');
    const opts = {
      select: req.query.select,
      populate: req.query.populate,
      includeDeleted: req.query.includeDeleted === 'true'
    };
    const product = await ProductService.getProductById(id, opts);
    return send(res, 200, { success: true, data: product });
  }),

  /**
   * GET /products/by-item/:itemId
   */
  findByItemId: asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    if (!itemId) throw createError(400, 'itemId is required');
    const opts = {
      select: req.query.select,
      populate: req.query.populate,
      includeDeleted: req.query.includeDeleted === 'true'
    };
    const results = await ProductService.findByItemId(itemId, opts);
    return send(res, 200, { success: true, items: results });
  }),

  /**
   * GET /products
   * Query: ?page=1&limit=25&sort=updatedAt:-1&filter={"status":"active"}
   */
  listProducts: asyncHandler(async (req, res) => {
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
      populate: req.query.populate,
      includeDeleted: req.query.includeDeleted === 'true'
    };
    const result = await ProductService.listProducts(filter, opts);
    return send(res, 200, { success: true, ...result });
  }),

  /**
   * POST /products/search
   * Body: { filters, page, limit, sort, select, populate }
   */
  searchProducts: asyncHandler(async (req, res) => {
    const body = req.body || {};
    const filters = body.filters || {};
    const opts = {
      page: body.page || req.query.page,
      limit: body.limit || req.query.limit,
      sort: body.sort || req.query.sort,
      select: body.select || req.query.select,
      populate: body.populate || req.query.populate,
      includeDeleted: body.includeDeleted === true || req.query.includeDeleted === 'true'
    };
    const result = await ProductService.listProducts(filters, opts);
    return send(res, 200, { success: true, ...result });
  }),

  /**
   * GET /products/public-search
   * Query: ?q=term&page=1&limit=20&filters={"ops_region":"na"}
   */
  publicSearch: asyncHandler(async (req, res) => {
    const q = req.query.q || null;
    let filters;
    try {
      filters = req.query.filters ? JSON.parse(req.query.filters) : undefined;
    } catch (err) {
      throw createError(400, 'Invalid filters JSON');
    }
    const opts = {
      page: req.query.page,
      limit: req.query.limit,
      sort: req.query.sort,
      select: req.query.select,
      populate: req.query.populate,
      filters
    };
    const result = await ProductService.publicSearch(q, opts);
    return send(res, 200, { success: true, ...result });
  }),

  /**
   * PATCH /products/:id
   */
  updateProductById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const update = req.body || {};
    if (!id) throw createError(400, 'id is required');
    const opts = {
      new: true,
      populate: req.query.populate,
      includeDeleted: req.query.includeDeleted === 'true',
      actor: req.user,
      correlationId: req.headers['x-correlation-id'] || null
    };
    const updated = await ProductService.updateById(id, update, opts);
    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * PATCH /products
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
    const updated = await ProductService.updateOne(filter, update, opts);
    return send(res, 200, { success: true, data: updated });
  }),

  /**
   * DELETE /products/:id
   * Soft delete
   */
  deleteProductById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw createError(400, 'id is required');
    const deletedBy = req.user ? req.user._id : null;
    const opts = { actor: req.user, correlationId: req.headers['x-correlation-id'] || null };
    const deleted = await ProductService.deleteProductById(id, deletedBy, opts);
    return send(res, 200, { success: true, data: deleted });
  }),

  /**
   * POST /products/:id/restore
   */
  restoreProductById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw createError(400, 'id is required');
    const opts = { actor: req.user, correlationId: req.headers['x-correlation-id'] || null };
    const restored = await ProductService.restoreProductById(id, opts);
    return send(res, 200, { success: true, data: restored });
  }),

  /**
   * DELETE /products/:id/hard
   * Hard delete (admin usage)
   */
  hardDeleteById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw createError(400, 'id is required');
    const opts = { actor: req.user, correlationId: req.headers['x-correlation-id'] || null };
    const removed = await ProductService.hardDeleteById(id, opts);
    return send(res, 200, { success: true, data: removed });
  }),

  /**
   * POST /products/bulk
   */
  bulkCreate: asyncHandler(async (req, res) => {
    const docs = req.body;
    if (!Array.isArray(docs) || docs.length === 0) {
      throw createError(400, 'Request body must be a non-empty array of product objects');
    }
    const opts = {
      session: req.app && req.app.locals && req.app.locals.session,
      actor: req.user,
      correlationId: req.headers['x-correlation-id'] || null
    };
    const inserted = await ProductService.bulkCreate(docs, opts);
    return send(res, 201, { success: true, data: inserted });
  })
};

module.exports = ProductController;
