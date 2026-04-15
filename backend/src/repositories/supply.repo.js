// src/repositories/supply.repo.js
//
// Mongoose-backed repository for Supply model
// - Provides CRUD, pagination, and item-level helpers (read/update/remove items)
// - Accepts opts: { session, new, select, populate, includeDeleted, arrayFilters, lean }
// - Returns Mongoose documents by default; callers may call .toObject() if needed.

const mongoose = require('mongoose');
const Supply = require('../models/supply.model');
const createError = require('http-errors');

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

class SupplyRepo {
  /**
   * Create a supply document
   * @param {Object} payload
   * @param {Object} opts
   */
  async create(payload = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (o.session) {
      return Supply.create([payload], { session: o.session }).then((docs) => docs[0]);
    }
    return Supply.create(payload);
  }

  /**
   * Bulk insert (ordered=false to continue on errors)
   * @param {Array} docs
   * @param {Object} opts
   */
  async bulkInsert(docs = [], opts = {}) {
    if (!Array.isArray(docs) || docs.length === 0) return [];
    const options = { ordered: false };
    if (opts.session) options.session = opts.session;
    return Supply.insertMany(docs, options);
  }

  /**
   * Count documents matching filter
   * @param {Object} filter
   * @param {Object} opts
   */
  async count(filter = {}, opts = {}) {
    const f = { ...filter };
    if (!opts || !opts.includeDeleted) f.deleted = false;
    const q = Supply.countDocuments(f);
    if (opts && opts.session) q.session(opts.session);
    return q.exec();
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
    let q = Supply.findOne(query);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.session) q = q.session(o.session);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Paginate supplies
   * @param {Object} filter
   * @param {Object} opts - { page, limit, sort, select, populate, includeDeleted, session }
   */
  async paginate(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const page = parseInt(opts.page || 1, 10) || 1;
    const limit = parseInt(opts.limit || 25, 10) || 25;
    const skip = (page - 1) * limit;

    const baseFilter = { ...filter };
    if (!o.includeDeleted) baseFilter.deleted = false;

    const countQuery = Supply.countDocuments(baseFilter);
    const findQuery = Supply.find(baseFilter).skip(skip).limit(limit).sort(opts.sort || { createdAt: -1 });

    if (o.select) findQuery.select(o.select);
    if (o.populate) findQuery.populate(o.populate);
    if (o.session) {
      findQuery.session(o.session);
      countQuery.session(o.session);
    }
    if (o.lean) findQuery.lean();

    const [total, items] = await Promise.all([countQuery.exec(), findQuery.exec()]);
    const pages = Math.ceil(total / limit) || 1;
    return { items, total, page, limit, pages };
  }

  /**
   * Update by id
   * Supports arrayFilters via opts.arrayFilters for positional updates
   * @param {String|ObjectId} id
   * @param {Object} update
   * @param {Object} opts - { new, session, select, populate, arrayFilters }
   */
  async updateById(id, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) throw createError(400, 'id is required');
    const query = { _id: id };
    if (!o.includeDeleted) query.deleted = false;

    const updateOpts = { new: !!o.new, session: o.session, runValidators: true };
    if (o.arrayFilters) updateOpts.arrayFilters = o.arrayFilters;

    let q = Supply.findOneAndUpdate(query, update, updateOpts);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Update one document matching filter
   * @param {Object} filter
   * @param {Object} update
   * @param {Object} opts
   */
  async updateOne(filter = {}, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!filter || Object.keys(filter).length === 0) throw createError(400, 'filter is required');
    const query = { ...filter };
    if (!o.includeDeleted) query.deleted = false;

    const updateOpts = { session: o.session, runValidators: true };
    if (o.arrayFilters) updateOpts.arrayFilters = o.arrayFilters;

    return Supply.findOneAndUpdate(query, update, { ...updateOpts, new: !!o.new }).exec();
  }

  /**
   * Delete by id (hard delete)
   * @param {String|ObjectId} id
   */
  async deleteById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const o = normalizeOpts(opts);
    const q = Supply.findByIdAndDelete(id);
    if (o.session) q.session(o.session);
    return q.exec();
  }

  /**
   * Soft delete by id (mark deleted)
   * @param {String|ObjectId} id
   * @param {String|null} deletedBy
   */
  async softDeleteById(id, deletedBy = null, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const o = normalizeOpts(opts);
    const update = { deleted: true };
    if (deletedBy) update['metadata.deletedBy'] = deletedBy;
    const q = Supply.findByIdAndUpdate(id, update, { new: true, session: o.session });
    if (o.lean) q.lean();
    return q.exec();
  }

  /* -------------------------
   * Item-level helpers
   * ------------------------- */

  /**
   * Read a specific item from a supply
   * @param {String|ObjectId} supplyId
   * @param {String|ObjectId} itemId
   * @param {Object} opts
   * @returns item object or null
   */
  async getItem(supplyId, itemId, opts = {}) {
    if (!supplyId || !itemId) throw createError(400, 'supplyId and itemId are required');
    const o = normalizeOpts(opts);
    const supply = await this.findById(supplyId, { select: 'items', includeDeleted: o.includeDeleted, session: o.session, lean: true });
    if (!supply) return null;
    const item = (supply.items || []).find((it) => String(it.itemId) === String(itemId));
    return item || null;
  }

  /**
   * Add or push an item to supply.items
   * @param {String|ObjectId} supplyId
   * @param {Object} itemPayload
   * @param {Object} opts
   * @returns updated supply doc
   */
  async addItem(supplyId, itemPayload = {}, opts = {}) {
    if (!supplyId || !itemPayload || typeof itemPayload !== 'object') throw createError(400, 'supplyId and itemPayload are required');
    const o = normalizeOpts(opts);

    // Use atomic $push
    const update = { $push: { items: itemPayload } };
    const updateOpts = { new: true, session: o.session };
    const q = Supply.findByIdAndUpdate(supplyId, update, updateOpts);
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();
    const updated = await q.exec();
    return updated;
  }

  /**
   * Update an item inside supply.items
   * - Supports full replacement of item object or partial updates using dot notation
   * - If updatePayload contains fields for nested arrays (e.g., quotes), caller should pass arrayFilters via opts.arrayFilters
   *
   * @param {String|ObjectId} supplyId
   * @param {String|ObjectId} itemId
   * @param {Object} updatePayload - either partial fields to merge into the matched item or a replacement object when opts.replaceItem === true
   * @param {Object} opts - { replaceItem, arrayFilters, new, session, select, populate, lean }
   */
  async updateItem(supplyId, itemId, updatePayload = {}, opts = {}) {
    if (!supplyId || !itemId) throw createError(400, 'supplyId and itemId are required');
    const o = normalizeOpts(opts);

    if (o.new === undefined) o.new = true;

    if (opts.replaceItem) {
      // Replace the entire item object (preserve itemId)
      const replacement = { ...updatePayload, itemId };
      const updated = await Supply.findOneAndUpdate(
        { _id: supplyId, deleted: false, 'items.itemId': itemId },
        { $set: { 'items.$': replacement } },
        { new: !!o.new, session: o.session }
      )
        .select(o.select)
        .populate(o.populate)
        .lean(o.lean)
        .exec();
      return updated;
    }

    // Partial update: prefix fields with items.$[it].
    // Build $set object
    const setOps = {};
    for (const [k, v] of Object.entries(updatePayload)) {
      setOps[`items.$[it].${k}`] = v;
    }

    const update = { $set: setOps };
    const updateOpts = { new: !!o.new, session: o.session };
    if (opts.arrayFilters) updateOpts.arrayFilters = opts.arrayFilters;
    // default array filter to match itemId
    if (!updateOpts.arrayFilters) updateOpts.arrayFilters = [{ 'it.itemId': mongoose.Types.ObjectId(itemId) }];

    const q = Supply.findOneAndUpdate({ _id: supplyId, deleted: false }, update, updateOpts);
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();
    const updated = await q.exec();
    return updated;
  }

  /**
   * Remove an item from supply.items by itemId
   * @param {String|ObjectId} supplyId
   * @param {String|ObjectId} itemId
   * @param {Object} opts
   */
  async removeItem(supplyId, itemId, opts = {}) {
    if (!supplyId || !itemId) throw createError(400, 'supplyId and itemId are required');
    const o = normalizeOpts(opts);
    const update = { $pull: { items: { itemId: mongoose.Types.ObjectId(itemId) } } };
    const updateOpts = { new: true, session: o.session };
    const q = Supply.findByIdAndUpdate(supplyId, update, updateOpts);
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();
    const updated = await q.exec();
    return updated;
  }

  /**
   * Add a quote to a specific item using atomic update with arrayFilters
   * @param {String|ObjectId} supplyId
   * @param {String|ObjectId} itemId
   * @param {Object} quotePayload
   * @param {Object} opts - { new, session, select, populate }
   */
  async addQuoteToItem(supplyId, itemId, quotePayload = {}, opts = {}) {
    if (!supplyId || !itemId || !quotePayload) throw createError(400, 'supplyId, itemId and quotePayload are required');
    const o = normalizeOpts(opts);
    //const update = { $push: { 'items.$[it].quotes': quotePayload } };
    const update = { $set: { 'items.$[it].quotes': [quotePayload] } };

    const updateOpts = { new: !!o.new, session: o.session, arrayFilters: [{ 'it.itemId': itemId }] };
    const q = Supply.findOneAndUpdate({ _id: supplyId, deleted: false }, update, updateOpts);
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();
    const updated = await q.exec();
    return updated;
  }

  /**
   * Accept a quote for an item by quoteId or quoteIndex (non-atomic: loads doc, mutates, saves)
   * This approach ensures consistent isAccepted semantics across quotes.
   *
   * @param {String|ObjectId} supplyId
   * @param {String|ObjectId} itemId
   * @param {Object} opts - { quoteId, quoteIndex, session, new, select, populate, lean }
   */
  async acceptQuote(supplyId, itemId, { quoteId = null, quoteIndex = null } = {}, opts = {}) {
    if (!supplyId || !itemId) throw createError(400, 'supplyId and itemId are required');
    const o = normalizeOpts(opts);

    // Load document with session if provided
    const docQuery = Supply.findOne({ _id: supplyId, deleted: false });
    if (o.session) docQuery.session(o.session);
    if (o.select) docQuery.select(o.select);
    if (o.populate) docQuery.populate(o.populate);
    if (o.lean) docQuery.lean();

    const supply = await docQuery.exec();
    if (!supply) throw createError(404, 'Supply not found');

    const item = (supply.items || []).find((it) => String(it.itemId) === String(itemId));
    if (!item) throw createError(404, 'Item not found');

    let idx = -1;
    if (quoteId) {
      idx = (item.quotes || []).findIndex((q) => String(q._id || q.id) === String(quoteId));
    } else if (typeof quoteIndex === 'number') {
      idx = quoteIndex;
    } else {
      idx = 0;
    }

    if (idx < 0 || idx >= (item.quotes || []).length) throw createError(404, 'Quote not found');

    // Set isAccepted flags
    item.quotes = (item.quotes || []).map((q, i) => {
      // If doc is lean, q may be plain object; ensure we return plain object
      const copy = q.toObject ? q.toObject() : { ...q };
      copy.isAccepted = i === idx;
      return copy;
    });

    // Save document (use session if provided)
    if (o.session) {
      await supply.save({ session: o.session });
    } else {
      await supply.save();
    }

    // Optionally re-query to return fresh doc with populate/select
    if (o.select || o.populate || o.lean) {
      return this.findById(supplyId, opts);
    }
    return supply;
  }
}

module.exports = new SupplyRepo();
