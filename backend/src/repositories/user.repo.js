// src/repositories/user.repo.js
/**
 * User repository
 *
 * Note: "Mongoose model for application users."
 * Note: "Includes password hashing (bcrypt), auth helpers, soft/hard delete helpers, safe public projection, and search utilities."
 *
 * Responsibilities:
 * - Create users (with unique userId generation when needed)
 * - When creating a user, also create a Config document for that user and attach the config _id to the user.config field
 * - Provide find, paginate, update, soft/hard delete, upsert, bulk insert, and session helpers
 *
 * Behavior:
 * - All read methods return lean objects
 * - create supports session-aware transactions; when a session is provided, user+config creation and linking occur inside the session
 * - On non-session failures during create, repository attempts cleanup to avoid orphans
 */

const mongoose = require('mongoose');
const createError = require('http-errors');
const User = require('../models/user.model');
const Config = require('../models/config.model');

class UserRepository {
  constructor() {
    this.User = User;
    this.Config = Config;
  }

  /* -------------------------
   * Helpers
   * ------------------------- */
  _toPlain(doc) {
    return doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  }

  _normalizeOpts(opts = {}) {
    return {
      session: opts.session || null,
      lean: !!opts.lean,
      select: opts.select || null,
      populate: opts.populate || null,
      includeDeleted: !!opts.includeDeleted,
      new: !!opts.new,
      upsert: !!opts.upsert
    };
  }

  /* -------------------------
   * Create
   * ------------------------- */

  /**
   * Create a user document. If userId is not provided, repository will attempt
   * to generate a unique 16-digit userId (retries on duplicate key).
   *
   * When a user is created, a Config document is also created for that user
   * and the user document is updated with the config _id (field: config).
   *
   * @param {Object} payload
   * @param {Object} [opts] - { session }
   * @param {Number} [maxAttempts=5]
   * @returns {Promise<Object>} created user document (plain object)
   */
  async create(payload = {}, opts = {}, maxAttempts = 5) {
    if (!payload || typeof payload !== 'object') throw createError(400, 'payload is required');
    const session = opts.session || null;
    const doc = { ...payload };

    // If userId provided, create directly (support session)
    if (doc.userId) {
      let created;
      if (session) {
        const docs = await User.create([doc], { session });
        created = docs[0];
      } else {
        created = await User.create(doc);
      }
      const createdObj = this._toPlain(created);

      // Create config and attach config _id
      try {
        const configPayload = { userId: createdObj._id };
        let configDoc;
        if (session) {
          const configs = await Config.create([configPayload], { session });
          configDoc = configs[0];
          await User.findByIdAndUpdate(createdObj._id, { config: configDoc._id }, { new: true, session }).exec();
          const updated = await User.findById(createdObj._id).lean().exec();
          return updated;
        } else {
          configDoc = await Config.create(configPayload);
          const updated = await User.findByIdAndUpdate(createdObj._id, { config: configDoc._id }, { new: true }).lean().exec();
          return updated || createdObj;
        }
      } catch (err) {
        // If config creation failed and no session, attempt to cleanup created user to avoid orphan
        if (!session) {
          try { await User.findByIdAndDelete(createdObj._id).exec(); } catch (e) { /* ignore cleanup errors */ }
        }
        throw err;
      }
    }

    // If no session, prefer model helper that handles retries and hashing hooks
    if (!session) {
      const created = await User.createWithUniqueUserId(doc, maxAttempts);
      const createdObj = this._toPlain(created);

      // Create config and attach config _id
      try {
        const configPayload = { userId: createdObj._id };
        const configDoc = await Config.create(configPayload);
        const updated = await User.findByIdAndUpdate(createdObj._id, { config: configDoc._id }, { new: true }).lean().exec();
        return updated || createdObj;
      } catch (err) {
        // cleanup created user if config creation fails
        try { await User.findByIdAndDelete(createdObj._id).exec(); } catch (e) { /* ignore cleanup errors */ }
        throw err;
      }
    }

    // Session-aware creation with retry loop
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const ts = Date.now().toString().slice(-8);
      const rand = Math.floor(Math.random() * 1e8).toString().padStart(8, '0');
      doc.userId = `${ts}${rand}`;
      try {
        const createdArr = await User.create([doc], { session });
        const created = createdArr[0];
        const createdObj = this._toPlain(created);

        // Create config within same session and update user
        const configPayload = { userId: createdObj._id };
        const configArr = await Config.create([configPayload], { session });
        const configDoc = configArr[0];

        await User.findByIdAndUpdate(createdObj._id, { config: configDoc._id }, { new: true, session }).exec();
        const updated = await User.findById(createdObj._id).lean().exec();
        return updated;
      } catch (err) {
        // Duplicate key on userId -> retry
        if (err && err.code === 11000 && /userId/.test(err.message)) {
          doc.userId = undefined;
          continue;
        }
        throw err;
      }
    }

    throw new Error('Failed to create user: could not generate unique userId');
  }

  /* -------------------------
   * Read helpers
   * ------------------------- */

  /**
   * Find by Mongo _id
   * @param {String|ObjectId} id
   * @param {Object} [opts] - { select, populate, includeDeleted=false }
   * @returns {Promise<Object|null>}
   */
  async findById(id, opts = {}) {
    if (!id) return null;
    const includeDeleted = !!opts.includeDeleted;
    const q = User.findById(id);
    if (!includeDeleted) q.where({ deleted: false });
    if (opts.select) q.select(opts.select);
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Find by userId (human-friendly id)
   */
  async findByUserId(userId, opts = {}) {
    if (!userId) return null;
    const includeDeleted = !!opts.includeDeleted;
    const filter = { userId };
    if (!includeDeleted) filter.deleted = false;
    const q = User.findOne(filter);
    if (opts.select) q.select(opts.select);
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Find a user by email address
   */
  async findByEmail(email, opts = {}) {
    if (!email) return null;
    const includeDeleted = !!opts.includeDeleted;
    const filter = { 'emails.address': String(email).toLowerCase().trim() };
    if (!includeDeleted) filter.deleted = false;
    const q = User.findOne(filter);
    if (opts.select) q.select(opts.select);
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Generic findOne
   */
  async findOne(filter = {}, opts = {}) {
    const f = { ...filter };
    if (!opts.includeDeleted) f.deleted = false;
    const q = User.findOne(f);
    if (opts.select) q.select(opts.select);
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Find many with optional pagination and sorting
   */
  async find(filter = {}, opts = {}) {
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
    const skip = (page - 1) * limit;

    const f = { ...filter };
    if (!opts.includeDeleted) f.deleted = false;

    const q = User.find(f);
    if (opts.select) q.select(opts.select);
    if (opts.sort) q.sort(opts.sort);
    if (opts.populate) q.populate(opts.populate);
    q.skip(skip).limit(limit);
    return q.lean().exec();
  }

  /**
   * Paginate with total count
   */
  async paginate(filter = {}, opts = {}) {
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
    const skip = (page - 1) * limit;

    const f = { ...filter };
    if (!opts.includeDeleted) f.deleted = false;

    const [items, total] = await Promise.all([
      User.find(f)
        .select(opts.select || '')
        .sort(opts.sort || { createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(opts.populate || '')
        .lean()
        .exec(),
      User.countDocuments(f).exec()
    ]);

    return {
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit))
    };
  }

  /* -------------------------
   * Update helpers
   * ------------------------- */

  /**
   * Update by _id
   */
  async updateById(id, update = {}, opts = { new: true }) {
    if (!id) return null;
    const payload = { ...update, updatedAt: Date.now() };
    const q = User.findByIdAndUpdate(id, payload, { new: !!opts.new, runValidators: true });
    if (!opts.includeDeleted) q.where({ deleted: false });
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Update one by filter
   */
  async updateOne(filter, update, opts = { upsert: false, new: true }) {
    const f = { ...filter };
    if (!opts.includeDeleted) f.deleted = false;
    const payload = { ...update, updatedAt: Date.now() };
    const q = User.findOneAndUpdate(f, payload, {
      upsert: !!opts.upsert,
      new: !!opts.new,
      runValidators: true,
      setDefaultsOnInsert: true
    });
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /* -------------------------
   * Delete / restore
   * ------------------------- */

  /**
   * Soft delete by _id (marks deleted=true)
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
    const q = User.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    return q.lean().exec();
  }

  /**
   * Restore a soft-deleted user
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
    const q = User.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    return q.lean().exec();
  }

  /**
   * Hard delete by _id (permanent removal)
   */
  async hardDeleteById(id) {
    if (!id) return null;
    return User.findByIdAndDelete(id).lean().exec();
  }

  async deleteById(id) {
    return this.hardDeleteById(id);
  }

  /* -------------------------
   * Utilities
   * ------------------------- */

  /**
   * Count documents matching filter
   */
  async count(filter = {}, opts = {}) {
    const f = { ...filter };
    if (!opts.includeDeleted) f.deleted = false;
    return User.countDocuments(f).exec();
  }

  /**
   * Start a mongoose session for transactions
   */
  async startSession() {
    return mongoose.startSession();
  }

  /**
   * Upsert by filter
   */
  async upsert(filter, update, opts = {}) {
    const f = { ...filter };
    if (!opts.includeDeleted) f.deleted = false;
    const payload = { ...update, updatedAt: Date.now() };
    const q = User.findOneAndUpdate(f, payload, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: true
    });
    if (opts.populate) q.populate(opts.populate);
    return q.lean().exec();
  }

  /**
   * Bulk insert (ordered=false to continue on errors)
   */
  async bulkInsert(docs = [], opts = {}) {
    if (!Array.isArray(docs) || docs.length === 0) return [];
    const options = { ordered: false };
    if (opts.session) options.session = opts.session;
    return User.insertMany(docs, options);
  }
}

module.exports = new UserRepository();
