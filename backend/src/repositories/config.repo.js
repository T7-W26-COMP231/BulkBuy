// src/repositories/config.repo.js
/**
 * Mongoose-backed repository for Config model
 * - Provides CRUD, pagination, and common query helpers
 * - Accepts opts: { session, new, select, populate, includeDeleted, lean, arrayFilters }
 * - Returns Mongoose documents by default; callers may call .toObject() if needed.
 */

const mongoose = require('mongoose');
const createError = require('http-errors');
const Config = require('../models/config.model');

function normalizeOpts(opts = {}) {
  return {
    session: opts.session || null,
    new: !!opts.new,
    select: opts.select || null,
    populate: opts.populate || null,
    includeDeleted: !!opts.includeDeleted,
    arrayFilters: opts.arrayFilters || null,
    lean: !!opts.lean
  };
}

class ConfigRepo {
  /**
   * Create a config
   * @param {Object} payload
   * @param {Object} opts
   */
  async create(payload = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!payload || typeof payload !== 'object') throw createError(400, 'payload is required');
    if (o.session) {
      const docs = await Config.create([payload], { session: o.session });
      return docs[0];
    }
    return Config.create(payload);
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
    let q = Config.findOne(query);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.session) q = q.session(o.session);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Find config by userId (non-deleted by default)
   * @param {String|ObjectId} userId
   * @param {Object} opts
   */
  async findByUserId(userId, opts = {}) {
    const o = normalizeOpts(opts);
    if (!userId) throw createError(400, 'userId is required');
    const query = { userId };
    if (!o.includeDeleted) query.deleted = false;
    let q = Config.findOne(query);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.session) q = q.session(o.session);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Upsert config for a user
   * @param {String|ObjectId} userId
   * @param {Object} payload
   * @param {Object} opts
   */
  async upsertForUser(userId, payload = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!userId) throw createError(400, 'userId is required');
    const update = { $set: payload };
    const options = { new: true, upsert: true, setDefaultsOnInsert: true };
    if (o.session) options.session = o.session;
    let q = Config.findOneAndUpdate({ userId }, update, options);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Paginate configs
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

    const countQuery = Config.countDocuments(baseFilter);
    let findQuery = Config.find(baseFilter).skip(skip).limit(limit).sort(opts.sort || { createdAt: -1 });

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

    let q = Config.findOneAndUpdate(query, update, updateOpts);
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

    return Config.findOneAndUpdate(query, update, updateOpts).exec();
  }

  /**
   * Hard delete by id
   * @param {String|ObjectId} id
   * @param {Object} opts
   */
  async deleteById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const o = normalizeOpts(opts);
    const q = Config.findByIdAndDelete(id);
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
    const update = { deleted: true };
    if (deletedBy) update['metadata.deletedBy'] = deletedBy;
    const q = Config.findByIdAndUpdate(id, update, { new: true, session: o.session });
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
    let q = Config.find(baseFilter);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.session) q = q.session(o.session);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Upsert location for user (convenience)
   * @param {String|ObjectId} userId
   * @param {Object} location
   * @param {Object} opts
   */
  async upsertLocation(userId, location = {}, opts = {}) {
    if (!userId) throw createError(400, 'userId is required');
    const o = normalizeOpts(opts);
    const update = { $set: { location } };
    const options = { new: true, upsert: true, setDefaultsOnInsert: true, session: o.session };
    let q = Config.findOneAndUpdate({ userId }, update, options);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.lean) q = q.lean();
    return q.exec();
  }
}

module.exports = new ConfigRepo();
