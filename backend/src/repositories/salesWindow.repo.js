// src/repositories/salesWindow.repo.js
/**
 * Repository for SalesWindow model
 * - Thin persistence layer that encapsulates common queries and update patterns
 * - Accepts opts: { session, new, select, populate, lean, runValidators, arrayFilters }
 *
 * Usage:
 *   const repo = require('../repositories/salesWindow.repo');
 *   await repo.create(payload);
 *   await repo.addOrUpdateItem(windowId, productId, itemId, payload);
 */

const mongoose = require('mongoose');
const createError = require('http-errors');
const SalesWindow = require('../models/salesWindow.model');

function normalizeOpts(opts = {}) {
  return {
    session: opts.session || null,
    new: !!opts.new,
    select: opts.select || null,
    populate: opts.populate || null,
    lean: !!opts.lean,
    runValidators: opts.runValidators !== undefined ? !!opts.runValidators : true,
    arrayFilters: opts.arrayFilters || null
  };
}

class SalesWindowRepo {
  /* -------------------------
   * Create
   * ------------------------- */

  async create(payload = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!payload || typeof payload !== 'object') throw createError(400, 'payload is required');
    if (o.session) {
      const docs = await SalesWindow.create([payload], { session: o.session });
      return o.lean ? docs[0].toObject() : docs[0];
    }
    const doc = await SalesWindow.create(payload);
    return o.lean && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  }

  /* -------------------------
   * Read
   * ------------------------- */

  async findById(id, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) return null;
    const q = SalesWindow.findById(id);
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.session) q.session(o.session);
    if (o.lean) q.lean();
    return q.exec();
  }

  async findByWindowRange(fromEpoch, toEpoch, opts = {}) {
    const o = normalizeOpts(opts);
    const filter = {
      'window.fromEpoch': { $gte: Number(fromEpoch) },
      'window.toEpoch': { $lte: Number(toEpoch) }
    };
    const q = SalesWindow.find(filter);
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.session) q.session(o.session);
    if (o.lean) q.lean();
    return q.exec();
  }

  async findLatestBefore(epochMs = null, opts = {}) {
    const o = normalizeOpts(opts);
    const q = epochMs
      ? SalesWindow.findOne({ 'window.fromEpoch': { $lt: Number(epochMs) } }).sort({ 'window.fromEpoch': -1 })
      : SalesWindow.findOne({}).sort({ 'window.fromEpoch': -1 });
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.session) q.session(o.session);
    if (o.lean) q.lean();
    return q.exec();
  }

  async findByFilter(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const q = SalesWindow.find(filter || {});
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.session) q.session(o.session);
    if (o.lean) q.lean();
    return q.exec();
  }

  async paginate(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
    const skip = (page - 1) * limit;

    const countQuery = SalesWindow.countDocuments(filter);
    let findQuery = SalesWindow.find(filter).skip(skip).limit(limit).sort(opts.sort || { 'window.fromEpoch': -1 });

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

  /* -------------------------
   * Update
   * ------------------------- */

  async updateById(id, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update is required');

    const updateOpts = { new: !!o.new, session: o.session, runValidators: o.runValidators };
    if (o.arrayFilters) updateOpts.arrayFilters = o.arrayFilters;

    let q = SalesWindow.findByIdAndUpdate(id, update, updateOpts);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Add or update an item snapshot under a product in a SalesWindow document.
   * This delegates to the model instance method when possible to keep logic centralized.
   *
   * @param {String|ObjectId} windowId
   * @param {String|ObjectId} productId
   * @param {String|ObjectId} itemId
   * @param {Object} payload
   * @param {Object} opts
   */
  async addOrUpdateItem(windowId, productId, itemId, payload = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!windowId) throw createError(400, 'windowId is required');
    if (!productId) throw createError(400, 'productId is required');
    if (!itemId) throw createError(400, 'itemId is required');

    // Load document (with session if provided)
    const doc = await SalesWindow.findById(windowId).session(o.session || null);
    if (!doc) return null;

    // Use instance method which handles defaults and overflow logic
    const result = await doc.addOrUpdateItem(productId, itemId, payload, { session: o.session, createOverflowThresholdBytes: opts.createOverflowThresholdBytes });
    return result;
  }

  /**
   * Remove an item from a product in a SalesWindow document.
   */
  async removeItem(windowId, productId, itemId, opts = {}) {
    const o = normalizeOpts(opts);
    if (!windowId) throw createError(400, 'windowId is required');
    if (!productId) throw createError(400, 'productId is required');
    if (!itemId) throw createError(400, 'itemId is required');

    const doc = await SalesWindow.findById(windowId).session(o.session || null);
    if (!doc) return null;
    const removed = await doc.removeItem(productId, itemId, { session: o.session });
    return removed;
  }

  /**
   * Get item snapshot from a SalesWindow document, optionally falling back to last window.
   */
  async getItemSnapshot(windowId, productId, itemId, opts = {}) {
    const o = normalizeOpts(opts);
    if (!windowId) throw createError(400, 'windowId is required');
    if (!productId) throw createError(400, 'productId is required');
    if (!itemId) throw createError(400, 'itemId is required');

    const doc = await SalesWindow.findById(windowId).session(o.session || null);
    if (!doc) return null;
    const snapshot = await doc.getItemSnapshot(productId, itemId, { fallbackToLastWindow: !!opts.fallbackToLastWindow });
    return snapshot;
  }

  /* -------------------------
   * Upsert / Bulk / Delete
   * ------------------------- */

  async upsert(filter = {}, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!filter || Object.keys(filter).length === 0) throw createError(400, 'filter is required');

    const q = SalesWindow.findOneAndUpdate(filter, update, {
      upsert: true,
      new: !!o.new,
      setDefaultsOnInsert: true,
      runValidators: o.runValidators,
      session: o.session
    });

    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();
    return q.exec();
  }

  async bulkInsert(docs = [], opts = {}) {
    if (!Array.isArray(docs) || docs.length === 0) return [];
    const options = { ordered: false };
    if (opts.session) options.session = opts.session;
    return SalesWindow.insertMany(docs, options);
  }

  async deleteById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const o = normalizeOpts(opts);
    const q = SalesWindow.findByIdAndDelete(id);
    if (o.session) q.session(o.session);
    return q.exec();
  }

  async count(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const q = SalesWindow.countDocuments(filter || {});
    if (o.session) q.session(o.session);
    return q.exec();
  }

  async startSession() {
    return mongoose.startSession();
  }

  /**
   * Traverse overflow chain starting from a window id and return array of windows (including start).
   * Useful when windows are split due to overflow.
   */
  async getOverflowChain(startWindowId, opts = {}) {
    const o = normalizeOpts(opts);
    const chain = [];
    let currentId = startWindowId;
    while (currentId) {
      const doc = await this.findById(currentId, { session: o.session, lean: true });
      if (!doc) break;
      chain.push(doc);
      currentId = doc.overflow_id || null;
    }
    return chain;
  }
}

module.exports = new SalesWindowRepo();
