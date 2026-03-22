// src/repositories/product.repo.js
const mongoose = require('mongoose');
const Product = require('../models/product.model');

class ProductRepository {
  /**
   * Create a product document. If session provided, creation will use it.
   *
   * @param {Object} payload
   * @param {Object} [opts] - { session }
   * @returns {Promise<Object>} created document (plain object)
   */
  async create(payload = {}, opts = {}) {
    const doc = { ...payload };
    if (opts.session) {
      const created = await Product.create([doc], { session: opts.session });
      return created[0] && created[0].toObject ? created[0].toObject() : created[0];
    }
    const created = await Product.create(doc);
    return created && created.toObject ? created.toObject() : created;
  }

  /**
   * Find by Mongo _id
   * @param {String|ObjectId} id
   * @param {Object} [opts] - { select, populate, includeDeleted=false }
   * @returns {Promise<Object|null>}
   */
  async findById(id, opts = {}) {
    if (!id) return null;
    const includeDeleted = !!opts.includeDeleted;
    const q = Product.findById(id);
    if (!includeDeleted) q.where({ deleted: false });
    if (opts.select) q.select(opts.select);
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Generic findOne
   * @param {Object} filter
   * @param {Object} [opts] - { select, populate, includeDeleted=false }
   * @returns {Promise<Object|null>}
   */
  async findOne(filter = {}, opts = {}) {
    const f = { ...filter };
    if (!opts.includeDeleted) f.deleted = false;
    const q = Product.findOne(f);
    if (opts.select) q.select(opts.select);
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Find many with optional pagination and sorting
   * @param {Object} filter
   * @param {Object} [opts] - { page, limit, sort, select, populate, includeDeleted=false }
   * @returns {Promise<Array>}
   */
  async find(filter = {}, opts = {}) {
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
    const skip = (page - 1) * limit;

    const f = { ...filter };
    if (!opts.includeDeleted) f.deleted = false;

    const q = Product.find(f);
    if (opts.select) q.select(opts.select);
    if (opts.sort) q.sort(opts.sort);
    if (opts.populate) q.populate(opts.populate);
    q.skip(skip).limit(limit);
    return q.lean().exec();
  }

  /**
   * Paginate with total count
   * @param {Object} filter
   * @param {Object} [opts] - { page, limit, sort, select, populate, includeDeleted=false }
   * @returns {Promise<Object>} { items, total, page, limit, pages }
   */
  async paginate(filter = {}, opts = {}) {
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
    const skip = (page - 1) * limit;

    const f = { ...filter };
    if (!opts.includeDeleted) f.deleted = false;

    const [items, total] = await Promise.all([
      Product.find(f)
        .select(opts.select || '')
        .sort(opts.sort || { updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(opts.populate || '')
        .lean()
        .exec(),
      Product.countDocuments(f).exec()
    ]);

    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit))
    };
  }

  /**
   * Update by _id
   * @param {String|ObjectId} id
   * @param {Object} update
   * @param {Object} [opts] - { new: true, populate, includeDeleted=false }
   * @returns {Promise<Object|null>}
   */
  async updateById(id, update = {}, opts = { new: true }) {
    if (!id) return null;
    const payload = { ...update, updatedAt: Date.now() };
    const q = Product.findByIdAndUpdate(id, payload, { new: !!opts.new, runValidators: true });
    if (!opts.includeDeleted) q.where({ deleted: false });
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Update one by filter
   * @param {Object} filter
   * @param {Object} update
   * @param {Object} [opts] - { upsert: false, new: true, populate, includeDeleted=false }
   * @returns {Promise<Object|null>}
   */
  async updateOne(filter, update, opts = { upsert: false, new: true }) {
    const f = { ...filter };
    if (!opts.includeDeleted) f.deleted = false;
    const payload = { ...update, updatedAt: Date.now() };
    const q = Product.findOneAndUpdate(f, payload, {
      upsert: !!opts.upsert,
      new: !!opts.new,
      runValidators: true,
      setDefaultsOnInsert: true
    });
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Soft delete by _id (marks deleted=true)
   * @param {String|ObjectId} id
   * @param {String|ObjectId|null} deletedBy
   * @returns {Promise<Object|null>}
   */
  async softDeleteById(id, deletedBy = null) {
    if (!id) return null;
    const update = {
      deleted: true,
      deletedAt: Date.now(),
      deletedBy: deletedBy || null,
      status: 'deleted',
      updatedAt: Date.now()
    };
    const q = Product.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    return q.lean().exec();
  }

  /**
   * Restore a soft-deleted product
   * @param {String|ObjectId} id
   * @returns {Promise<Object|null>}
   */
  async restoreById(id) {
    if (!id) return null;
    const update = {
      deleted: false,
      deletedAt: null,
      deletedBy: null,
      status: 'active',
      updatedAt: Date.now()
    };
    const q = Product.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    return q.lean().exec();
  }

  /**
   * Hard delete by _id (permanent removal)
   * Admin-only usage expected; service layer should not expose this.
   * @param {String|ObjectId} id
   * @returns {Promise<Object|null>}
   */
  async hardDeleteById(id) {
    if (!id) return null;
    return Product.findByIdAndDelete(id).lean().exec();
  }

  /**
   * Alias deleteById -> hardDeleteById for backward compatibility.
   * Use with caution.
   * @param {String|ObjectId} id
   */
  async deleteById(id) {
    return this.hardDeleteById(id);
  }

  /**
   * Count documents matching filter
   * @param {Object} filter
   * @param {Object} [opts] - { includeDeleted=false }
   * @returns {Promise<Number>}
   */
  async count(filter = {}, opts = {}) {
    const f = { ...filter };
    if (!opts.includeDeleted) f.deleted = false;
    return Product.countDocuments(f).exec();
  }

  /**
   * Start a mongoose session for transactions
   * Caller is responsible for committing/aborting the session.
   * @returns {Promise<ClientSession>}
   */
  async startSession() {
    return mongoose.startSession();
  }

  /**
   * Upsert by filter
   * @param {Object} filter
   * @param {Object} update
   * @param {Object} [opts] - { populate, includeDeleted=false }
   * @returns {Promise<Object|null>}
   */
  async upsert(filter, update, opts = {}) {
    const f = { ...filter };
    if (!opts.includeDeleted) f.deleted = false;
    const payload = { ...update, updatedAt: Date.now() };
    const q = Product.findOneAndUpdate(f, payload, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: true
    });
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Find products that include a specific itemId
   * @param {ObjectId|String} itemId
   * @param {Object} [opts] - { select, populate, includeDeleted=false }
   * @returns {Promise<Array>}
   */
  async findByItemId(itemId, opts = {}) {
    if (!itemId) return [];
    const f = { 'items.itemId': itemId };
    if (!opts.includeDeleted) f.deleted = false;
    const q = Product.find(f);
    if (opts.select) q.select(opts.select);
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Public search helper (delegates to model static)
   * @param {String|null} q
   * @param {Object} opts - { limit, skip, sort, filters }
   * @returns {Promise<{ total: number, results: Array }>}
   */
  async publicSearch(q = null, opts = {}) {
    return Product.publicSearch(q, opts);
  }

  /**
   * Bulk insert (ordered=false to continue on errors)
   * @param {Array<Object>} docs
   * @param {Object} [opts] - { session }
   * @returns {Promise<Array>}
   */
  async bulkInsert(docs = [], opts = {}) {
    if (!Array.isArray(docs) || docs.length === 0) return [];
    const options = { ordered: false };
    if (opts.session) options.session = opts.session;
    return Product.insertMany(docs, options);
  }
}

module.exports = new ProductRepository();
