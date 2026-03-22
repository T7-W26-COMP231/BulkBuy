// src/repositories/aggregation.repo.js
const mongoose = require('mongoose');
const Aggregation = require('../models/aggregation.model');

class AggregationRepository {
  /**
   * Create an aggregation document. If session provided, creation will use it.
   *
   * @param {Object} payload
   * @param {Object} [opts] - { session }
   * @returns {Promise<Object>} created document (plain object)
   */
  async create(payload = {}, opts = {}) {
    const doc = { ...payload };
    if (opts.session) {
      const created = await Aggregation.create([doc], { session: opts.session });
      return created[0] && created[0].toObject ? created[0].toObject() : created[0];
    }
    const created = await Aggregation.create(doc);
    return created && created.toObject ? created.toObject() : created;
  }

  /**
   * Find by Mongo _id
   * @param {String|ObjectId} id
   * @param {Object} [opts] - { select, populate }
   * @returns {Promise<Object|null>}
   */
  async findById(id, opts = {}) {
    if (!id) return null;
    const q = Aggregation.findById(id);
    if (opts.select) q.select(opts.select);
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Generic findOne
   * @param {Object} filter
   * @param {Object} [opts] - { select, populate }
   * @returns {Promise<Object|null>}
   */
  async findOne(filter = {}, opts = {}) {
    const f = { ...filter };
    const q = Aggregation.findOne(f);
    if (opts.select) q.select(opts.select);
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Find many with optional pagination and sorting
   * @param {Object} filter
   * @param {Object} [opts] - { page, limit, sort, select, populate }
   * @returns {Promise<Array>}
   */
  async find(filter = {}, opts = {}) {
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
    const skip = (page - 1) * limit;

    const f = { ...filter };

    const q = Aggregation.find(f);
    if (opts.select) q.select(opts.select);
    if (opts.sort) q.sort(opts.sort);
    if (opts.populate) q.populate(opts.populate);
    q.skip(skip).limit(limit);
    return q.lean().exec();
  }

  /**
   * Paginate with total count
   * @param {Object} filter
   * @param {Object} [opts] - { page, limit, sort, select, populate }
   * @returns {Promise<Object>} { items, total, page, limit, pages }
   */
  async paginate(filter = {}, opts = {}) {
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
    const skip = (page - 1) * limit;

    const f = { ...filter };

    const [items, total] = await Promise.all([
      Aggregation.find(f)
        .select(opts.select || '')
        .sort(opts.sort || { updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(opts.populate || '')
        .lean()
        .exec(),
      Aggregation.countDocuments(f).exec()
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
   * @param {Object} [opts] - { new: true, populate }
   * @returns {Promise<Object|null>}
   */
  async updateById(id, update = {}, opts = { new: true }) {
    if (!id) return null;
    const payload = { ...update, updatedAt: Date.now() };
    const q = Aggregation.findByIdAndUpdate(id, payload, { new: !!opts.new, runValidators: true });
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Update one by filter
   * @param {Object} filter
   * @param {Object} update
   * @param {Object} [opts] - { upsert: false, new: true, populate }
   * @returns {Promise<Object|null>}
   */
  async updateOne(filter = {}, update = {}, opts = { upsert: false, new: true }) {
    const f = { ...filter };
    const payload = { ...update, updatedAt: Date.now() };
    const q = Aggregation.findOneAndUpdate(f, payload, {
      upsert: !!opts.upsert,
      new: !!opts.new,
      runValidators: true,
      setDefaultsOnInsert: true
    });
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Add an order id to aggregation.orders (idempotent)
   * @param {String|ObjectId} aggregationId
   * @param {String|ObjectId} orderId
   * @returns {Promise<Object|null>}
   */
  async addOrder(aggregationId, orderId) {
    if (!aggregationId || !orderId) return null;
    return Aggregation.findByIdAndUpdate(
      aggregationId,
      { $addToSet: { orders: orderId }, updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).lean().exec();
  }

  /**
   * Mark aggregation as processed
   * @param {String|ObjectId} aggregationId
   * @returns {Promise<Object|null>}
   */
  async markProcessed(aggregationId) {
    if (!aggregationId) return null;
    return Aggregation.findByIdAndUpdate(
      aggregationId,
      { status: 'processed', updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).lean().exec();
  }

  /**
   * Find aggregations that include a specific itemId
   * @param {ObjectId|String} itemId
   * @param {Object} [opts] - { select, populate, includeSuspended=false }
   * @returns {Promise<Array>}
   */
  async findByItemId(itemId, opts = {}) {
    if (!itemId) return [];
    const f = { 'itemDtos.itemId': itemId };
    if (!opts.includeSuspended) f.status = { $ne: 'suspended' };
    const q = Aggregation.find(f);
    if (opts.select) q.select(opts.select);
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Hard delete by _id (permanent removal)
   * @param {String|ObjectId} id
   * @returns {Promise<Object|null>}
   */
  async hardDeleteById(id) {
    if (!id) return null;
    return Aggregation.findByIdAndDelete(id).lean().exec();
  }

  /**
   * Alias deleteById -> hardDeleteById for backward compatibility.
   * @param {String|ObjectId} id
   */
  async deleteById(id) {
    return this.hardDeleteById(id);
  }

  /**
   * Count documents matching filter
   * @param {Object} filter
   * @returns {Promise<Number>}
   */
  async count(filter = {}) {
    const f = { ...filter };
    return Aggregation.countDocuments(f).exec();
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
   * Bulk insert (ordered=false to continue on errors)
   * @param {Array<Object>} docs
   * @param {Object} [opts] - { session }
   * @returns {Promise<Array>}
   */
  async bulkInsert(docs = [], opts = {}) {
    if (!Array.isArray(docs) || docs.length === 0) return [];
    const options = { ordered: false };
    if (opts.session) options.session = opts.session;
    return Aggregation.insertMany(docs, options);
  }
}

module.exports = new AggregationRepository();
