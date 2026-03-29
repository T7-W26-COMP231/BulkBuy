// src/repositories/salesWindow.repo.js
/**
 * SalesWindow repository (polished, full surface)
 *
 * Purpose
 * - Thin persistence layer that exposes every model static/instance helper in a
 *   session/transaction-aware way.
 * - All methods are non-disruptive and delegate to the model where overflow/dedupe
 *   logic lives.
 *
 * Exposed methods (surface)
 * - create, createWindow, createOverflowWindow
 * - findById, findByWindowRange, findByFilter, findLatestBefore, paginate
 * - updateById, upsert, deleteById, count
 * - bulkInsert, bulkInsertProducts, bulkInsertItems
 * - addProduct, addProductItem, addPricingSnapshot, addPricingTier
 * - addOrUpdateItem, removeItem, getItemSnapshot
 * - upsertPricingSnapshot, listPricingSnapshots, listPricingTiers (if present)
 * - listProducts, listProductItems, listPricingSnapshots
 * - getWindowChain, getOverflowChain
 * - scheduleAutoRollover, cancelAutoRollover
 * - startSession
 *
 * Notes
 * - Methods accept opts: { session, useTransaction, lean, new, select, populate, runValidators, arrayFilters, createOverflowThresholdBytes, defaultDurationMs, bufferMs, optInAutoRollover }
 * - If opts.useTransaction === true and no opts.session provided, repo will start a session and commit/abort.
 * - This file intentionally mirrors model method names so callers can use repo as drop-in.
 */

const mongoose = require("mongoose");
const createError = require("http-errors");
const SalesWindow = require("../models/salesWindow.model");

function normalizeOpts(opts = {}) {
  return {
    session: opts.session || null,
    useTransaction: !!opts.useTransaction,
    new: !!opts.new,
    select: opts.select || null,
    populate: opts.populate || null,
    lean: !!opts.lean,
    runValidators:
      opts.runValidators !== undefined ? !!opts.runValidators : true,
    arrayFilters: opts.arrayFilters || null,
    createOverflowThresholdBytes:
      opts.createOverflowThresholdBytes || undefined,
    defaultDurationMs: opts.defaultDurationMs || undefined,
    bufferMs: opts.bufferMs || undefined,
    optInAutoRollover: !!opts.optInAutoRollover,
  };
}

class SalesWindowRepo {
  constructor(model = SalesWindow) {
    this.Model = model;
  }

  /* -------------------------
   * Session / transaction helpers
   * ------------------------- */
  async _maybeStartSession(opts = {}) {
    const o = normalizeOpts(opts);
    if (o.session) return { session: o.session, started: false };
    if (o.useTransaction) {
      const session = await mongoose.startSession();
      session.startTransaction();
      return { session, started: true };
    }
    return { session: null, started: false };
  }

  async _maybeCommitSession(sessionInfo) {
    if (!sessionInfo) return;
    const { session, started } = sessionInfo;
    if (!session) return;
    try {
      if (started) await session.commitTransaction();
    } finally {
      session.endSession();
    }
  }

  async _maybeAbortSession(sessionInfo) {
    if (!sessionInfo) return;
    const { session, started } = sessionInfo;
    if (!session) return;
    try {
      if (started) await session.abortTransaction();
    } finally {
      session.endSession();
    }
  }

  /* -------------------------
   * Create
   * ------------------------- */

  async create(payload = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!payload || typeof payload !== "object")
      throw createError(400, "payload is required");

    if (o.session) {
      const docs = await this.Model.create([payload], { session: o.session });
      return o.lean ? docs[0].toObject() : docs[0];
    }

    const doc = await this.Model.create(payload);
    return o.lean && typeof doc.toObject === "function" ? doc.toObject() : doc;
  }

  async createWindow(payload = {}, opts = {}) {
    const sessionInfo = await this._maybeStartSession(opts);
    const session = sessionInfo.session || null;
    try {
      const created = await this.Model.createWindow(
        payload,
        Object.assign({}, opts, { session }),
      );
      await this._maybeCommitSession(sessionInfo);
      return created;
    } catch (err) {
      await this._maybeAbortSession(sessionInfo);
      throw err;
    }
  }

  async createOverflowWindow(sourceWindowId, payload = {}, opts = {}) {
    const sessionInfo = await this._maybeStartSession(opts);
    const session = sessionInfo.session || null;
    try {
      const created = await this.Model.createOverflowWindow(
        sourceWindowId,
        payload,
        { session },
      );
      await this._maybeCommitSession(sessionInfo);
      return created;
    } catch (err) {
      await this._maybeAbortSession(sessionInfo);
      throw err;
    }
  }

  /* -------------------------
   * Read
   * ------------------------- */

  async findById(id, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) return null;
    const q = this.Model.findById(id);
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.session) q.session(o.session);
    if (o.lean) q.lean();
    return q.exec();
  }

  async findByWindowRange(fromEpoch, toEpoch, opts = {}) {
    const o = normalizeOpts(opts);
    const filter = {
      "window.fromEpoch": { $gte: Number(fromEpoch) },
      "window.toEpoch": { $lte: Number(toEpoch) },
    };
    const q = this.Model.find(filter);
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.session) q.session(o.session);
    if (o.lean) q.lean();
    return q.exec();
  }

  async findByFilter(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const q = this.Model.find(filter || {});
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.session) q.session(o.session);
    if (o.lean) q.lean();
    return q.exec();
  }

  async findLatestBefore(epochMs = null, opts = {}) {
    const o = normalizeOpts(opts);
    const q = epochMs
      ? this.Model.findOne({
          "window.fromEpoch": { $lt: Number(epochMs) },
        }).sort({ "window.fromEpoch": -1 })
      : this.Model.findOne({}).sort({ "window.fromEpoch": -1 });
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

    const countQuery = this.Model.countDocuments(filter);
    let findQuery = this.Model.find(filter)
      .skip(skip)
      .limit(limit)
      .sort(opts.sort || { "window.fromEpoch": -1 });

    if (o.select) findQuery = findQuery.select(o.select);
    if (o.populate) findQuery = findQuery.populate(o.populate);
    if (o.session) {
      findQuery = findQuery.session(o.session);
      countQuery.session(o.session);
    }
    if (o.lean) findQuery = findQuery.lean();

    const [total, items] = await Promise.all([
      countQuery.exec(),
      findQuery.exec(),
    ]);
    const pages = Math.max(1, Math.ceil(total / limit));
    return { items, total, page, limit, pages };
  }

  /* -------------------------
   * Update
   * ------------------------- */

  async updateById(id, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) throw createError(400, "id is required");
    if (!update || typeof update !== "object")
      throw createError(400, "update is required");

    const updateOpts = {
      new: !!o.new,
      session: o.session,
      runValidators: o.runValidators,
    };
    if (o.arrayFilters) updateOpts.arrayFilters = o.arrayFilters;

    let q = this.Model.findByIdAndUpdate(id, update, updateOpts);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  async upsert(filter = {}, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!filter || Object.keys(filter).length === 0)
      throw createError(400, "filter is required");

    const q = this.Model.findOneAndUpdate(filter, update, {
      upsert: true,
      new: !!o.new,
      setDefaultsOnInsert: true,
      runValidators: o.runValidators,
      session: o.session,
    });

    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();
    return q.exec();
  }

  /* -------------------------
   * Delete / count / bulk
   * ------------------------- */

  async deleteById(id, opts = {}) {
    if (!id) throw createError(400, "id is required");
    const o = normalizeOpts(opts);
    const q = this.Model.findByIdAndDelete(id);
    if (o.session) q.session(o.session);
    return q.exec();
  }

  async count(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const q = this.Model.countDocuments(filter || {});
    if (o.session) q.session(o.session);
    return q.exec();
  }

  async bulkInsert(docs = [], opts = {}) {
    if (!Array.isArray(docs) || docs.length === 0) return [];
    const options = { ordered: false };
    const o = normalizeOpts(opts);
    if (o.session) options.session = o.session;

    return this.Model.insertMany(docs, options);

    // This returns the full documents from Mongoose
    // const insertedDocs = await this.Model.insertMany(docs, options);
    // // Map to your specific format: [{_id: ..., ops_region: ...}]
    // return insertedDocs.map((doc) => ({
    //   _id: doc._id,
    //   ops_region: doc.ops_region,
    // }));
  }

  async bulkInsertProducts(windowId, products = [], opts = {}) {
    const sessionInfo = await this._maybeStartSession(opts);
    const session = sessionInfo.session || null;
    try {
      const res = await this.Model.bulkInsertProducts(
        windowId,
        products,
        Object.assign({}, opts, { session }),
      );
      await this._maybeCommitSession(sessionInfo);
      return res;
    } catch (err) {
      await this._maybeAbortSession(sessionInfo);
      throw err;
    }
  }

  async bulkInsertItems(windowId, productId, items = [], opts = {}) {
    const sessionInfo = await this._maybeStartSession(opts);
    const session = sessionInfo.session || null;
    try {
      const res = await this.Model.bulkInsertItems(
        windowId,
        productId,
        items,
        Object.assign({}, opts, { session }),
      );
      await this._maybeCommitSession(sessionInfo);
      return res;
    } catch (err) {
      await this._maybeAbortSession(sessionInfo);
      throw err;
    }
  }

  /* -------------------------
   * Product / Item / Pricing helpers (delegates to model)
   * - addProduct, addProductItem, addPricingSnapshot, addPricingTier
   * - addOrUpdateItem (instance method), removeItem, getItemSnapshot
   * ------------------------- */

  async addProduct(windowId, payload = {}, opts = {}) {
    const sessionInfo = await this._maybeStartSession(opts);
    const session = sessionInfo.session || null;
    try {
      const res = await this.Model.addProduct(
        windowId,
        payload,
        Object.assign({}, opts, { session }),
      );
      await this._maybeCommitSession(sessionInfo);
      return res;
    } catch (err) {
      await this._maybeAbortSession(sessionInfo);
      throw err;
    }
  }

  async addProductItem(windowId, productId, itemPayload = {}, opts = {}) {
    const sessionInfo = await this._maybeStartSession(opts);
    const session = sessionInfo.session || null;
    try {
      const res = await this.Model.addProductItem(
        windowId,
        productId,
        itemPayload,
        Object.assign({}, opts, { session }),
      );
      await this._maybeCommitSession(sessionInfo);
      return res;
    } catch (err) {
      await this._maybeAbortSession(sessionInfo);
      throw err;
    }
  }

  async addPricingSnapshot(
    windowId,
    productId,
    itemId,
    snapshot = {},
    opts = {},
  ) {
    const sessionInfo = await this._maybeStartSession(opts);
    const session = sessionInfo.session || null;
    try {
      const res = await this.Model.addPricingSnapshot(
        windowId,
        productId,
        itemId,
        snapshot,
        Object.assign({}, opts, { session }),
      );
      await this._maybeCommitSession(sessionInfo);
      return res;
    } catch (err) {
      await this._maybeAbortSession(sessionInfo);
      throw err;
    }
  }

  async addPricingTier(windowId, productId, itemId, tier = {}, opts = {}) {
    const sessionInfo = await this._maybeStartSession(opts);
    const session = sessionInfo.session || null;
    try {
      const res = await this.Model.addPricingTier(
        windowId,
        productId,
        itemId,
        tier,
        Object.assign({}, opts, { session }),
      );
      await this._maybeCommitSession(sessionInfo);
      return res;
    } catch (err) {
      await this._maybeAbortSession(sessionInfo);
      throw err;
    }
  }

  async addOrUpdateItem(windowId, productId, itemId, payload = {}, opts = {}) {
    const sessionInfo = await this._maybeStartSession(opts);
    const session = sessionInfo.session || null;
    try {
      const doc = await this.Model.findById(windowId).session(session).exec();
      if (!doc) {
        await this._maybeCommitSession(sessionInfo);
        return null;
      }
      const res = await doc.addOrUpdateItem(productId, itemId, payload, {
        session,
        createOverflowThresholdBytes: opts.createOverflowThresholdBytes,
      });
      await this._maybeCommitSession(sessionInfo);
      return res;
    } catch (err) {
      await this._maybeAbortSession(sessionInfo);
      throw err;
    }
  }

  async removeItem(windowId, productId, itemId, opts = {}) {
    const sessionInfo = await this._maybeStartSession(opts);
    const session = sessionInfo.session || null;
    try {
      const doc = await this.Model.findById(windowId).session(session).exec();
      if (!doc) {
        await this._maybeCommitSession(sessionInfo);
        return null;
      }
      const res = await doc.removeItem(productId, itemId, { session });
      await this._maybeCommitSession(sessionInfo);
      return res;
    } catch (err) {
      await this._maybeAbortSession(sessionInfo);
      throw err;
    }
  }

  async getItemSnapshot(windowId, productId, itemId, opts = {}) {
    const o = normalizeOpts(opts);
    if (!windowId) throw createError(400, "windowId is required");
    if (!productId) throw createError(400, "productId is required");
    if (!itemId) throw createError(400, "itemId is required");

    const doc = await this.Model.findById(windowId)
      .session(o.session || null)
      .exec();
    if (!doc) return null;
    return doc.getItemSnapshot(productId, itemId, {
      fallbackToLastWindow: !!opts.fallbackToLastWindow,
      includeOverflow: opts.includeOverflow,
    });
  }

  /* -------------------------
   * Pricing snapshot statics / lists
   * ------------------------- */

  async upsertPricingSnapshot(
    windowId,
    productId,
    itemId,
    snapshot = {},
    opts = {},
  ) {
    const o = normalizeOpts(opts);
    return this.Model.upsertPricingSnapshot(
      windowId,
      productId,
      itemId,
      snapshot,
      { session: o.session },
    );
  }

  async listPricingSnapshots(productId, itemId, opts = {}) {
    return this.Model.listPricingSnapshots(productId, itemId, opts);
  }

  /* -------------------------
   * Read helpers that return merged views
   * ------------------------- */

  async listProducts(windowId, opts = {}) {
    const o = normalizeOpts(opts);
    return this.Model.listProducts(windowId, {
      session: o.session,
      lean: o.lean,
    });
  }

  async listProductItems(windowId, productId, opts = {}) {
    const o = normalizeOpts(opts);
    return this.Model.listProductItems(windowId, productId, {
      session: o.session,
      lean: o.lean,
    });
  }

  async listPricingTiers(windowId, productId, itemId, opts = {}) {
    // model may not have a dedicated listPricingTiers static; fallback to merged read
    const items = await this.listProductItems(windowId, productId, opts);
    const it = (items || []).find((i) => String(i.itemId) === String(itemId));
    return it ? it.pricing_tiers || [] : [];
  }

  /* -------------------------
   * Overflow chain helpers
   * ------------------------- */

  async getWindowChain(windowId, opts = {}) {
    const o = normalizeOpts(opts);
    return this.Model.getWindowChain(windowId, {
      session: o.session,
      lean: o.lean,
    });
  }

  async getOverflowChain(startWindowId, opts = {}) {
    return this.getWindowChain(startWindowId, opts);
  }

  /* -------------------------
   * Auto-rollover scheduling (explicit)
   * ------------------------- */

  async scheduleAutoRollover(windowId, opts = {}) {
    const o = normalizeOpts(opts);
    if (!windowId) throw createError(400, "windowId is required");
    return this.Model.scheduleAutoRollover(windowId, {
      session: o.session,
      defaultDurationMs: o.defaultDurationMs,
      bufferMs: o.bufferMs,
    });
  }

  async cancelAutoRollover(windowId) {
    if (!windowId) throw createError(400, "windowId is required");
    return this.Model.cancelAutoRollover(windowId);
  }

  /* -------------------------
   * Misc
   * ------------------------- */

  async startSession() {
    return mongoose.startSession();
  }
}

/* Export single repo instance for backwards compatibility */
module.exports = new SalesWindowRepo();
