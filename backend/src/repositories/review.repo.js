// src/repositories/review.repo.js
/**
 * Mongoose-backed repository for Review model
 * - Provides CRUD, pagination, and common query helpers
 * - Accepts opts: { session, new, select, populate, includeDeleted, lean, arrayFilters }
 * - Returns Mongoose documents by default; callers may call .toObject() if needed.
 */

const mongoose = require('mongoose');
const createError = require('http-errors');
const Review = require('../models/review.model');

function normalizeOpts(opts = {}) {
  return {
    session: opts.session || null,
    new: opts.new || false,
    select: opts.select || null,
    populate: opts.populate || null,
    includeDeleted: !!opts.includeDeleted,
    arrayFilters: opts.arrayFilters || null,
    lean: !!opts.lean
  };
}

class ReviewRepo {
  /**
   * Create a review
   * @param {Object} payload
   * @param {Object} opts
   */
  async create(payload = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!payload || typeof payload !== 'object') throw createError(400, 'payload is required');
    if (o.session) {
      const docs = await Review.create([payload], { session: o.session });
      return docs[0];
    }
    return Review.create(payload);
  }

  /**
   * Find by id (optionally includeDeleted)
   * @param {String|ObjectId} id
   * @param {Object} opts
   */
  async findById(id, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) throw createError(400, 'id is required');
    const query = o.includeDeleted ? { _id: id } : { _id: id, deleted: false };
    let q = Review.findOne(query);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.session) q = q.session(o.session);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Paginate reviews
   * @param {Object} filter
   * @param {Object} opts - { page, limit, sort, select, populate, includeDeleted, session, lean }
   */
  async paginate(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const page = parseInt(opts.page || 1, 10) || 1;
    const limit = parseInt(opts.limit || 25, 10) || 25;
    const skip = (page - 1) * limit;

    const baseFilter = { ...filter };
    if (!o.includeDeleted) baseFilter.deleted = false;

    const countQuery = Review.countDocuments(baseFilter);
    let findQuery = Review.find(baseFilter).skip(skip).limit(limit).sort(opts.sort || { createdAt: -1 });

    if (o.select) findQuery = findQuery.select(o.select);
    if (o.populate) findQuery = findQuery.populate(o.populate);
    if (o.session) {
      findQuery = findQuery.session(o.session);
      countQuery.session(o.session);
    }
    if (o.lean) findQuery = findQuery.lean();

    const [total, items] = await Promise.all([countQuery.exec(), findQuery.exec()]);
    const pages = Math.max(1, Math.ceil(total / limit));
    return { items, total, page, limit, pages };
  }

  /**
   * Update by id
   * @param {String|ObjectId} id
   * @param {Object} update
   * @param {Object} opts
   */
  async updateById(id, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update is required');

    const query = { _id: id };
    if (!o.includeDeleted) query.deleted = false;

    const updateOpts = { new: !!o.new, session: o.session, runValidators: true };
    if (o.arrayFilters) updateOpts.arrayFilters = o.arrayFilters;

    let q = Review.findOneAndUpdate(query, update, updateOpts);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Update one by filter
   * @param {Object} filter
   * @param {Object} update
   * @param {Object} opts
   */
  async updateOne(filter = {}, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!filter || Object.keys(filter).length === 0) throw createError(400, 'filter is required');
    const query = { ...filter };
    if (!o.includeDeleted) query.deleted = false;

    const updateOpts = { session: o.session, runValidators: true, new: !!o.new };
    if (o.arrayFilters) updateOpts.arrayFilters = o.arrayFilters;

    return Review.findOneAndUpdate(query, update, updateOpts).exec();
  }

  /**
   * Hard delete by id
   * @param {String|ObjectId} id
   * @param {Object} opts
   */
  async deleteById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const o = normalizeOpts(opts);
    const q = Review.findByIdAndDelete(id);
    if (o.session) q.session(o.session);
    return q.exec();
  }

  /**
   * Soft delete by id
   * @param {String|ObjectId} id
   * @param {String|null} deletedBy
   * @param {Object} opts
   */
  async softDeleteById(id, deletedBy = null, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const o = normalizeOpts(opts);
    const update = { deleted: true, status: 'deleted' };
    if (deletedBy) update['metadata.deletedBy'] = deletedBy;
    const q = Review.findByIdAndUpdate(id, update, { new: true, session: o.session });
    if (o.lean) q.lean();
    return q.exec();
  }

  /**
   * Find by filter
   * @param {Object} filter
   * @param {Object} opts
   */
  async findByFilter(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const baseFilter = { ...filter };
    if (!o.includeDeleted) baseFilter.deleted = false;
    let q = Review.find(baseFilter);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.session) q = q.session(o.session);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Find reviews by reviewerId
   * @param {String|ObjectId} reviewerId
   * @param {Object} opts
   */
  async findByReviewer(reviewerId, opts = {}) {
    if (!reviewerId) throw createError(400, 'reviewerId is required');
    return this.findByFilter({ reviewerId }, opts);
  }

  /**
   * Find reviews by revieweeId
   * @param {String|ObjectId} revieweeId
   * @param {Object} opts
   */
  async findByReviewee(revieweeId, opts = {}) {
    if (!revieweeId) throw createError(400, 'revieweeId is required');
    return this.findByFilter({ revieweeId }, opts);
  }

  /**
   * Compute average rating for a product or item
   * @param {Object} params - { productId, itemId, revieweeId, includeDeleted }
   * @param {Object} opts
   */
  async averageRating(params = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const match = { deleted: false };
    if (params.productId) match.productId = mongoose.Types.ObjectId(params.productId);
    if (params.itemId) match.itemId = mongoose.Types.ObjectId(params.itemId);
    if (params.revieweeId) match.revieweeId = mongoose.Types.ObjectId(params.revieweeId);
    if (params.includeDeleted) delete match.deleted;

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 }
        }
      }
    ];

    if (o.session) pipeline.forEach((stage) => { /* aggregation session handled below */ });

    const agg = Review.aggregate(pipeline);
    if (o.session) agg.session(o.session);
    const res = await agg.exec();
    if (!res || res.length === 0) return { avgRating: null, count: 0 };
    return { avgRating: res[0].avgRating, count: res[0].count };
  }
}

module.exports = new ReviewRepo();
