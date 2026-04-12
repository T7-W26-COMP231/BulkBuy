// src/repositories/item.repo.js
/**
 * Mongoose-backed repository for Item model
 * - Provides CRUD, pagination, and common query helpers
 * - Accepts opts: { session, new, select, populate, includeDeleted, lean, arrayFilters }
 * - Returns lean objects by default for read methods
 */

const mongoose = require('mongoose');
const createError = require('http-errors');
const Item = require('../models/item.model');

function normalizeOpts(opts = {}) {
  return {
    session: opts.session || null,
    new: !!opts.new,
    select: opts.select || null,
    populate: opts.populate || null,
    includeDeleted: !!opts.includeDeleted,
    arrayFilters: opts.arrayFilters || null,
    lean: !!opts.lean,
    runValidators: opts.runValidators !== undefined ? !!opts.runValidators : true
  };
}

class ItemRepo {
  /* -------------------------
   * Create
   * ------------------------- */

  /**
   * Create an item
   * @param {Object} payload
   * @param {Object} opts
   */
  async create(payload = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!payload || typeof payload !== 'object') throw createError(400, 'payload is required');

    if (o.session) {
      const docs = await Item.create([payload], { session: o.session });
      return o.lean ? docs[0].toObject() : docs[0];
    }
    const created = await Item.create(payload);
    return o.lean && created.toObject ? created.toObject() : created;
  }

  /* -------------------------
   * Read
   * ------------------------- */

  /**
   * Find by id
   * @param {String|ObjectId} id
   * @param {Object} opts
   */
  async findById(id, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) return null;

    const q = Item.findById(id);

    // Always explicitly select +images to override select:false on schema
    if (o.select) {
      const fields = o.select.includes('images') ? o.select : o.select + ' +images';
      q.select(fields);
    } else {
      q.select('+images');  // ← this is the missing line
    }

    if (!o.includeDeleted) q.where({ status: { $ne: 'deleted' } });
    if (o.populate) q.populate(o.populate);
    if (o.session) q.session(o.session);
    if (o.lean) q.lean();

    return q.exec();
  }

  /**
   * Find by SKU
   * @param {String} sku
   * @param {Object} opts
   */
  async findBySku(sku, opts = {}) {
    const o = normalizeOpts(opts);
    if (!sku) return null;
    const q = Item.findOne({ sku: String(sku).trim() });
    if (!o.includeDeleted) q.where({ status: { $ne: 'deleted' } });
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.session) q.session(o.session);
    if (o.lean) q.lean();
    return q.exec();
  }

  /**
   * Generic find by filter (returns array)
   * @param {Object} filter
   * @param {Object} opts
   */
  async findByFilter(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const base = { ...filter };
    if (!o.includeDeleted) base.status = base.status || { $ne: 'deleted' };
    let q = Item.find(base);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.session) q = q.session(o.session);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Find many with pagination
   * @param {Object} filter
   * @param {Object} opts - { page, limit, sort, select, populate, includeDeleted, session, lean }
   */
  async paginate(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
    const skip = (page - 1) * limit;

    const baseFilter = { ...filter };
    if (!o.includeDeleted) baseFilter.status = baseFilter.status || { $ne: 'deleted' };

    const countQuery = Item.countDocuments(baseFilter);
    let findQuery = Item.find(baseFilter).skip(skip).limit(limit).sort(opts.sort || { createdAt: -1 });

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
   * Marketplace catalog items
   * Public-facing item list for Browse Bulk Items page
   */
  async getCatalogItems(filters = {}, opts = {}) {
    console.log('DB:', Item.db.name, '| Collection:', Item.collection.name);
    const o = normalizeOpts({ ...opts, lean: true });

    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 24);
    const skip = (page - 1) * limit;

    const query = {
      published: true,
      status: 'active'
    };

    if (filters.q) {
      query.$text = { $search: String(filters.q).trim() };
    }

    if (filters.category) {
      query.categories = filters.category;
    }

    if (filters.ops_region) {
      query.ops_region = String(filters.ops_region).trim();
    }

    let findQuery = Item.find(query)
      .skip(skip)
      .limit(limit)
      .sort(opts.sort || { createdAt: -1 });

    if (o.select) findQuery = findQuery.select(o.select);
    if (o.populate) findQuery = findQuery.populate(o.populate);
    if (o.session) findQuery = findQuery.session(o.session);
    if (o.lean) findQuery = findQuery.lean();

    const countQuery = Item.countDocuments(query);
    if (o.session) countQuery.session(o.session);

    const [total, items] = await Promise.all([
      countQuery.exec(),
      findQuery.exec()
    ]);

    const pages = Math.max(1, Math.ceil(total / limit));

    return {
      items,
      total,
      page,
      limit,
      pages
    };
  }

  /* -------------------------
   * Update
   * ------------------------- */

  /**
   * Update by id
   * @param {String|ObjectId} id
   * @param {Object} update
   * @param {Object} opts
   */

  /*async updateById(id, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update is required');

    const query = { _id: id };
    if (!o.includeDeleted) query.status = { $ne: 'deleted' };

    const updateOpts = { new: !!o.new, session: o.session, runValidators: o.runValidators };
    if (o.arrayFilters) updateOpts.arrayFilters = o.arrayFilters;

    let q = Item.findOneAndUpdate(query, update, updateOpts);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.lean) q = q.lean();
    return q.exec();
  }*/

  // item.repo.js — updateById
  async updateById(id, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update is required');

    const query = { _id: id };
    if (!o.includeDeleted) query.status = { $ne: 'deleted' };

    // wrap in $set if caller sent a plain object
    const hasOperator = Object.keys(update).some((k) => k.startsWith('$'));
    const mongoUpdate = hasOperator ? update : { $set: update };

    const updateOpts = {
      returnDocument: 'after',
      session: o.session,
      runValidators: false,
    };
    if (o.arrayFilters) updateOpts.arrayFilters = o.arrayFilters;

    let q = Item.findOneAndUpdate(query, mongoUpdate, updateOpts);
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

    const base = { ...filter };
    if (!o.includeDeleted) base.status = base.status || { $ne: 'deleted' };

    const updateOpts = { session: o.session, runValidators: o.runValidators, new: !!o.new };
    if (o.arrayFilters) updateOpts.arrayFilters = o.arrayFilters;

    let q = Item.findOneAndUpdate(base, update, updateOpts);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /* -------------------------
   * Delete
   * ------------------------- */

  /**
   * Hard delete by id
   * @param {String|ObjectId} id
   * @param {Object} opts
   */
  async deleteById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const o = normalizeOpts(opts);
    const q = Item.findByIdAndDelete(id);
    if (o.session) q.session(o.session);
    return q.exec();
  }

  /**
   * Soft delete by id (marks status = 'deleted')
   * @param {String|ObjectId} id
   * @param {Object} opts
   */
  async softDeleteById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const o = normalizeOpts(opts);
    const update = { status: 'deleted', updatedAt: Date.now() };
    const q = Item.findByIdAndUpdate(id, update, { new: true, session: o.session, runValidators: true });
    if (o.lean) q.lean();
    return q.exec();
  }

  /* -------------------------
   * Inventory helpers (atomic where possible)
   * ------------------------- */

  /**
   * Adjust stock atomically by delta (positive to add, negative to remove)
   * Returns the updated inventory object (lean)
   * @param {String|ObjectId} id
   * @param {Number} delta
   * @param {Object} opts
   */
  async adjustStock(id, delta = 0, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    if (!Number.isFinite(delta)) throw createError(400, 'delta must be a number');
    const o = normalizeOpts(opts);

    // Use $inc and $max to prevent negative stock
    const update = {
      $inc: { 'inventory.stock': Number(delta) },
      $set: { updatedAt: Date.now() }
    };

    // After increment, ensure stock >= 0
    // We will clamp negative values to 0 in a second step if necessary
    let q = Item.findByIdAndUpdate(id, update, { new: true, session: o.session, runValidators: true });
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.lean) q = q.lean();

    const doc = await q.exec();
    if (!doc) return null;

    // Clamp negative stock to 0 if any (best-effort)
    const currentStock = (doc.inventory && doc.inventory.stock) || 0;
    if (currentStock < 0) {
      const fix = await Item.findByIdAndUpdate(id, { $set: { 'inventory.stock': 0, updatedAt: Date.now() } }, { new: true, session: o.session }).lean().exec();
      return fix.inventory;
    }
    return doc.inventory;
  }

  /**
   * Reserve quantity atomically if available (decrements stock or increases reserved)
   * This implementation attempts a conditional update: if available >= qty OR backorder allowed, increment reserved.
   * Returns updated inventory or throws on insufficient stock when backorder is false.
   */
  async reserve(id, qty = 1, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    qty = Number(qty) || 0;
    if (qty <= 0) throw createError(400, 'qty must be > 0');
    const o = normalizeOpts(opts);

    // Try conditional update: only succeed if available >= qty OR backorder true
    // We cannot express "OR backorder true" easily in a single atomic op with availability check,
    // so first attempt to reserve when available, otherwise fetch and check backorder flag.
    const update = {
      $inc: { 'inventory.reserved': qty },
      $set: { updatedAt: Date.now() }
    };

    // Attempt optimistic reservation when available
    const q = Item.findOneAndUpdate(
      { _id: id, $expr: { $gte: [{ $subtract: ['$inventory.stock', '$inventory.reserved'] }, qty] } },
      update,
      { new: true, session: o.session, runValidators: true }
    );

    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();

    let doc = await q.exec();
    if (doc) return doc.inventory;

    // If optimistic reservation failed, check backorder flag
    const current = await Item.findById(id).session(o.session).lean().exec();
    if (!current) return null;
    if (current.inventory && current.inventory.backorder) {
      // allow reservation even if insufficient stock
      const q2 = Item.findByIdAndUpdate(id, update, { new: true, session: o.session, runValidators: true });
      if (o.lean) q2.lean();
      const doc2 = await q2.exec();
      return doc2.inventory;
    }

    throw createError(409, 'insufficient stock to reserve');
  }

  /**
   * Release reserved quantity
   */
  async release(id, qty = 1, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    qty = Number(qty) || 0;
    if (qty <= 0) throw createError(400, 'qty must be > 0');
    const o = normalizeOpts(opts);

    const q = Item.findByIdAndUpdate(id, { $inc: { 'inventory.reserved': -qty }, $set: { updatedAt: Date.now() } }, { new: true, session: o.session, runValidators: true });
    if (o.lean) q.lean();
    const doc = await q.exec();
    if (!doc) return null;
    // Ensure reserved not negative
    if (doc.inventory && doc.inventory.reserved < 0) {
      const fix = await Item.findByIdAndUpdate(id, { $set: { 'inventory.reserved': 0, updatedAt: Date.now() } }, { new: true, session: o.session }).lean().exec();
      return fix.inventory;
    }
    return doc.inventory;
  }

  /* -------------------------
   * Utilities
   * ------------------------- */

  /**
   * Upsert by filter
   */
  async upsert(filter = {}, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!filter || Object.keys(filter).length === 0) throw createError(400, 'filter is required');
    const payload = { ...update, updatedAt: Date.now() };
    const q = Item.findOneAndUpdate(filter, payload, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: o.runValidators,
      session: o.session
    });
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();
    return q.exec();
  }

  /**
   * Bulk insert (ordered=false)
   */
  async bulkInsert(docs = [], opts = {}) {
    try {
      if (!Array.isArray(docs) || docs.length === 0) return [];
      const options = { ordered: false };
      if (opts.session) options.session = opts.session;
      return await Item.insertMany(docs, options);
    } catch (error) {
      throw new Error(`Items bulkInsert failed : ${error.message}`)
    }
  }

  /**
   * Count documents matching filter
   */
  async count(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const f = { ...filter };
    if (!o.includeDeleted) f.status = f.status || { $ne: 'deleted' };
    return Item.countDocuments(f).exec();
  }

  /**
   * Start a mongoose session for transactions
   */
  async startSession() {
    return mongoose.startSession();
  }

  /**
   * Simple public search wrapper delegating to model static
   */
  async publicSearch(q = null, opts = {}) {
    return Item.publicSearch(q, opts);
  }
}

module.exports = new ItemRepo();
