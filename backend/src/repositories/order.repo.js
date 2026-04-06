// src/repositories/order.repo.js
//
// Repository for Order model
// - Thin persistence layer around Mongoose model
// - Accepts opts for session, select, populate, pagination, upsert, etc.
// - Returns plain objects (lean) where appropriate.
// - Provides convenience methods to manipulate items in a draft/cart:
//   addItem, setItemQuantity, updateItem, removeItem, extractSaveForLater
// - These methods prefer using model instance helpers when available and
//   ensure session propagation via doc.$session(session).

const mongoose = require('mongoose');
const Order = require('../models/order.model');

class OrderRepository {
  /**
   * Create an order document. If session provided, creation will use it.
   *
   * @param {Object} payload
   * @param {Object} [opts] - { session }
   * @returns {Promise<Object>} created document (plain object)
   */
  async create(payload = {}, opts = {}) {
    const doc = { ...payload };
    if (opts.session) {
      const created = await Order.create([doc], { session: opts.session });
      return created[0] && created[0].toObject ? created[0].toObject() : created[0];
    }
    const created = await Order.create(doc);
    return created && created.toObject ? created.toObject() : created;
  }

  /**
   * Find by Mongo _id
   * @param {String|ObjectId} id
   * @param {Object} [opts] - { select, populate, lean }
   * @returns {Promise<Object|null>}
   */
  async findById(id, opts = {}) {
    if (!id) return null;
    const q = Order.findById(id);
    if (opts.select) q.select(opts.select);
    if (opts.populate) q.populate(opts.populate);
    if (opts.lean) return q.lean().exec();
    return q.lean().exec();
  }

  /**
   * Find document instance (not lean) - internal helper
   * @param {String|ObjectId} id
   * @returns {Promise<Document|null>}
   */
  async _findDocById(id) {
    if (!id) return null;
    return Order.findById(id).exec();
  }

  /**
   * Generic findOne
   * @param {Object} filter
   * @param {Object} [opts] - { select, populate, lean }
   * @returns {Promise<Object|null>}
   */
  async findOne(filter = {}, opts = {}) {
    const f = { ...filter };
    const q = Order.findOne(f);
    if (opts.select) q.select(opts.select);
    if (opts.populate) q.populate(opts.populate);
    if (opts.lean) return q.lean().exec();
    return q.lean().exec();
  }

  /**
   * Find many with optional pagination and sorting
   * @param {Object} filter
   * @param {Object} [opts] - { page, limit, sort, select, populate, lean }
   * @returns {Promise<Array>}
   */
  async find(filter = {}, opts = {}) {
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
    const skip = (page - 1) * limit;

    const f = { ...filter };

    const q = Order.find(f);
    if (opts.select) q.select(opts.select);
    if (opts.sort) q.sort(opts.sort);
    if (opts.populate) q.populate(opts.populate);
    q.skip(skip).limit(limit);
    if (opts.lean) return q.lean().exec();
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
    
    try {
      const [items, total] = await Promise.all([
        Order.find(f)
          .select(opts.select || '')
          .sort(opts.sort || { createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate(opts.populate || '')
          .lean()
          .exec(),
        Order.countDocuments(f).exec()
      ]);
      return {
        items,
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit))
      };
    } catch (error) {
      console.log("\nFetch pagination of orders repo error ", error);
    }
  }

  /**
   * Update by _id
   * @param {String|ObjectId} id
   * @param {Object} update
   * @param {Object} [opts] - { new: true, populate, lean }
   * @returns {Promise<Object|null>}
   */
  async updateById(id, update = {}, opts = { new: true }) {
    if (!id) return null;
    const payload = { ...update, updatedAt: Date.now() };
    const q = Order.findByIdAndUpdate(id, payload, { new: !!opts.new, runValidators: true });
    if (opts.populate) q.populate(opts.populate);
    if (opts.lean) return q.lean().exec();
    return q.lean().exec();
  }

  /**
   * Update one by filter
   * @param {Object} filter
   * @param {Object} update
   * @param {Object} [opts] - { upsert: false, new: true, populate, lean }
   * @returns {Promise<Object|null>}
   */
  async updateOne(filter = {}, update = {}, opts = { upsert: false, new: true }) {
    const f = { ...filter };
    const payload = { ...update, updatedAt: Date.now() };
    const q = Order.findOneAndUpdate(f, payload, {
      upsert: !!opts.upsert,
      new: !!opts.new,
      runValidators: true,
      setDefaultsOnInsert: true
    });
    if (opts.populate) q.populate(opts.populate);
    if (opts.lean) return q.lean().exec();
    return q.lean().exec();
  }

  /**
   * Add a message id to order.messages (idempotent)
   * @param {String|ObjectId} orderId
   * @param {String|ObjectId} messageId
   * @returns {Promise<Object|null>}
   */
  async addMessage(orderId, messageId) {
    if (!orderId || !messageId) return null;
    return Order.findByIdAndUpdate(
      orderId,
      { $addToSet: { messages: messageId }, updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).lean().exec();
  }

  /**
   * Update order status atomically
   * @param {String|ObjectId} orderId
   * @param {String} status
   * @returns {Promise<Object|null>}
   */
  async updateStatus(orderId, status) {
    if (!orderId || !status) return null;
    return Order.findByIdAndUpdate(
      orderId,
      { status, updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).lean().exec();
  }

  /**
   * Find orders for a user with pagination
   * @param {String|ObjectId} userId
   * @param {Object} [opts] - { page, limit, sort, select, populate, lean }
   * @returns {Promise<Array>}
   */
  async findByUserId(userId, opts = {}) {
    if (!userId) return [];
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
    const skip = (page - 1) * limit;
    const q = Order.find({ userId });
    if (opts.select) q.select(opts.select);
    if (opts.sort) q.sort(opts.sort);
    if (opts.populate) q.populate(opts.populate);
    q.skip(skip).limit(limit);
    if (opts.lean) return q.lean().exec();
    return q.lean().exec();
  }

  /**
   * Set item quantity on an order (uses instance helper when available).
   * If quantity === 0 the item is removed.
   *
   * @param {String|ObjectId} orderId
   * @param {String|ObjectId} itemId
   * @param {Number} quantity
   * @param {Object} [opts] - { session, populate, lean }
   * @returns {Promise<Object|null>} updated order (plain)
   */
  async setItemQuantity(orderId, itemId, quantity, opts = {}) {
    if (!orderId || !itemId) return null;
    const doc = await this._findDocById(orderId);
    if (!doc) return null;
    if (opts.session) doc.$session(opts.session);
    // prefer instance method if present
    if (typeof doc.setItemQuantity === 'function') {
      const updatedDoc = await doc.setItemQuantity(itemId, quantity);
      return Order.findById(updatedDoc._id).select(opts.select || '').populate(opts.populate || '').lean().exec();
    }
    // fallback: manual update
    const idx = doc.items.findIndex((it) => String(it.itemId) === String(itemId));
    if (idx === -1) {
      if (Number(quantity) === 0) {
        return doc.toObject ? doc.toObject() : doc;
      }
      throw new Error('item not found in order');
    }
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 0) throw new Error('quantity must be integer >= 0');
    if (q === 0) {
      doc.items.splice(idx, 1);
    } else {
      doc.items[idx].quantity = q;
    }
    doc.updatedAt = Date.now();
    await doc.save({ session: opts.session });
    return Order.findById(doc._id).select(opts.select || '').populate(opts.populate || '').lean().exec();
  }

  /**
   * Update item attributes (quantity, saveForLater, pricingSnapshot).
   * If quantity <= 0 the item is removed.
   *
   * @param {String|ObjectId} orderId
   * @param {String|ObjectId} itemId
   * @param {Object} changes - { quantity?: Number, saveForLater?: Boolean, pricingSnapshot?: Object }
   * @param {Object} [opts] - { session, populate, lean }
   * @returns {Promise<Object|null>} updated order (plain)
   */
  async updateItem(orderId, itemId, changes = {}, opts = {}) {
    if (!orderId || !itemId) return null;
    const doc = await this._findDocById(orderId);
    if (!doc) return null;
    if (opts.session) doc.$session(opts.session);

    if (typeof doc.updateItem === 'function') {
      const updatedDoc = await doc.updateItem(itemId, changes);
      return Order.findById(updatedDoc._id).select(opts.select || '').populate(opts.populate || '').lean().exec();
    }

    // fallback manual merge
    const idx = doc.items.findIndex((it) => String(it.itemId) === String(itemId));
    if (idx === -1) throw new Error('item not found in order');

    if (Object.prototype.hasOwnProperty.call(changes, 'quantity')) {
      const q = Number(changes.quantity);
      if (!Number.isInteger(q) || q < 0) throw new Error('quantity must be integer >= 0');
      if (q === 0) {
        doc.items.splice(idx, 1);
        doc.updatedAt = Date.now();
        await doc.save({ session: opts.session });
        return Order.findById(doc._id).select(opts.select || '').populate(opts.populate || '').lean().exec();
      }
      doc.items[idx].quantity = q;
    }

    if (Object.prototype.hasOwnProperty.call(changes, 'saveForLater')) {
      doc.items[idx].saveForLater = !!changes.saveForLater;
    }

    if (changes.pricingSnapshot && typeof changes.pricingSnapshot === 'object') {
      doc.items[idx].pricingSnapshot = Object.assign({}, doc.items[idx].pricingSnapshot || {}, changes.pricingSnapshot);
    }

    doc.updatedAt = Date.now();
    await doc.save({ session: opts.session });
    return Order.findById(doc._id).select(opts.select || '').populate(opts.populate || '').lean().exec();
  }

  /**
   * Add or increment an item in the order (cart).
   * Uses model instance helper when available to preserve business logic.
   *
   * @param {String|ObjectId} orderId
   * @param {Object} item - { productId, itemId, pricingSnapshot?, saveForLater?, quantity? }
   * @param {Object} [opts] - { session, populate, lean }
   * @returns {Promise<Object|null>} updated order (plain)
   */
  async addItem(orderId, item = {}, opts = {}) {
    if (!orderId || !item || !item.itemId || !item.productId) return null;
    const doc = await this._findDocById(orderId);
    if (!doc) return null;
    if (opts.session) doc.$session(opts.session);

    if (typeof doc.addItem === 'function') {
      const updatedDoc = await doc.addItem(item);
      return Order.findById(updatedDoc._id).select(opts.select || '').populate(opts.populate || '').lean().exec();
    }

    // fallback manual add
    const idx = doc.items.findIndex((it) => String(it.itemId) === String(item.itemId));
    if (idx === -1) {
      doc.items.push({
        productId: item.productId,
        itemId: item.itemId,
        pricingSnapshot: item.pricingSnapshot || {},
        saveForLater: !!item.saveForLater,
        quantity: item.quantity || 1
      });
    } else {
      doc.items[idx].quantity = (doc.items[idx].quantity || 0) + (item.quantity || 1);
      if (typeof item.saveForLater === 'boolean') doc.items[idx].saveForLater = !!item.saveForLater;
      if (item.pricingSnapshot && typeof item.pricingSnapshot === 'object') {
        doc.items[idx].pricingSnapshot = Object.assign({}, doc.items[idx].pricingSnapshot || {}, item.pricingSnapshot);
      }
    }
    doc.updatedAt = Date.now();
    await doc.save({ session: opts.session });
    return Order.findById(doc._id).select(opts.select || '').populate(opts.populate || '').lean().exec();
  }

  /**
   * Remove an item from the order
   *
   * @param {String|ObjectId} orderId
   * @param {String|ObjectId} itemId
   * @param {Object} [opts] - { session, populate, lean }
   * @returns {Promise<Object|null>} updated order (plain)
   */
  async removeItem(orderId, itemId, opts = {}) {
    if (!orderId || !itemId) return null;
    const doc = await this._findDocById(orderId);
    if (!doc) return null;
    if (opts.session) doc.$session(opts.session);

    if (typeof doc.removeItem === 'function') {
      const updatedDoc = await doc.removeItem(itemId);
      return Order.findById(updatedDoc._id).select(opts.select || '').populate(opts.populate || '').lean().exec();
    }

    doc.items = (doc.items || []).filter((it) => String(it.itemId) !== String(itemId));
    doc.updatedAt = Date.now();
    await doc.save({ session: opts.session });
    return Order.findById(doc._id).select(opts.select || '').populate(opts.populate || '').lean().exec();
  }

  /**
   * Extract items marked saveForLater and remove them from the order.
   * Returns { saved: Array, order: Object } where order is the updated order (plain).
   *
   * @param {String|ObjectId} orderId
   * @param {Object} [opts] - { session, populate, lean }
   * @returns {Promise<Object|null>}
   */
  async extractSaveForLater(orderId, opts = {}) {
    if (!orderId) return null;
    const doc = await this._findDocById(orderId);
    if (!doc) return null;
    if (opts.session) doc.$session(opts.session);

    if (typeof doc.extractSaveForLater === 'function') {
      const { saved, order: orderPromise } = doc.extractSaveForLater();
      const savedOrder = await orderPromise;
      const plainOrder = await Order.findById(savedOrder._id).select(opts.select || '').populate(opts.populate || '').lean().exec();
      return { saved, order: plainOrder };
    }

    const saved = (doc.items || []).filter((it) => it.saveForLater);
    doc.items = (doc.items || []).filter((it) => !it.saveForLater);
    doc.updatedAt = Date.now();
    await doc.save({ session: opts.session });
    const plainOrder = await Order.findById(doc._id).select(opts.select || '').populate(opts.populate || '').lean().exec();
    return { saved, order: plainOrder };
  }

  /* -------------------------
   * Item-level helpers (atomic, session-aware) - new names for clarity
   * ------------------------- */

  /**
   * addItemToOrder(orderId, item, opts)
   * - Uses instance helper when available; otherwise performs safe fallback.
   * - Returns updated order (plain object) or null.
   */
  async addItemToOrder(orderId, item = {}, opts = {}) {
    return this.addItem(orderId, item, opts);
  }

  /**
   * updateOrderItem(orderId, itemId, changes, opts)
   * - Uses instance helper when available; otherwise performs safe fallback.
   * - Returns updated order (plain) or null.
   */
  async updateOrderItem(orderId, itemId, changes = {}, opts = {}) {
    return this.updateItem(orderId, itemId, changes, opts);
  }

  /**
   * removeOrderItem(orderId, itemId, opts)
   * - Uses instance helper when available; otherwise performs safe fallback.
   * - Returns updated order (plain) or null.
   */
  async removeOrderItem(orderId, itemId, opts = {}) {
    return this.removeItem(orderId, itemId, opts);
  }

  /* -------------------------
   * Draft management helpers
   * ------------------------- */

  /**
   * findOrCreateDraftForUserRegion(userId, region, opts)
   * - Finds latest draft for user+region or creates one atomically.
   * - Returns plain order object.
   */
  async findOrCreateDraftForUserRegion(userId, region, opts = {}) {
    if (!userId) throw new Error('userId is required');
    const filter = { userId, ops_region: region || null, status: 'draft' };
    // Try to find existing draft
    const existing = await Order.findOne(filter).sort({ createdAt: -1 }).lean().exec();
    if (existing) return existing;

    // Create new draft atomically
    const doc = {
      userId,
      ops_region: region || null,
      items: [],
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (opts.session) {
      const created = await Order.create([doc], { session: opts.session });
      return created[0] && created[0].toObject ? created[0].toObject() : created[0];
    }

    const created = await Order.create(doc);
    return created && created.toObject ? created.toObject() : created;
  }

  /**
   * moveSaveForLaterToDraft(sourceOrderId, targetDraftId, opts)
   * - Extracts saveForLater items from source order and appends them to target draft.
   * - Returns { sourceOrder, targetDraft } plain objects.
   */
  async moveSaveForLaterToDraft(sourceOrderId, targetDraftId, opts = {}) {
    if (!sourceOrderId || !targetDraftId) throw new Error('sourceOrderId and targetDraftId are required');
    const session = opts.session || null;

    // Load docs
    const sourceDoc = await this._findDocById(sourceOrderId);
    if (!sourceDoc) throw new Error('source order not found');
    if (session) sourceDoc.$session(session);

    const targetDoc = await this._findDocById(targetDraftId);
    if (!targetDoc) throw new Error('target draft not found');
    if (session) targetDoc.$session(session);

    // Extract saveForLater
    const saved = (sourceDoc.items || []).filter((it) => it.saveForLater);
    if (saved.length === 0) {
      // nothing to move
      return {
        sourceOrder: sourceDoc.toObject ? sourceDoc.toObject() : sourceDoc,
        targetDraft: targetDoc.toObject ? targetDoc.toObject() : targetDoc
      };
    }

    // Remove saved items from source
    sourceDoc.items = (sourceDoc.items || []).filter((it) => !it.saveForLater);
    sourceDoc.updatedAt = Date.now();

    // Append to target (avoid duplicates by itemId)
    const existingItemIds = new Set((targetDoc.items || []).map((it) => String(it.itemId)));
    for (const it of saved) {
      if (!existingItemIds.has(String(it.itemId))) {
        targetDoc.items.push({
          productId: it.productId,
          itemId: it.itemId,
          pricingSnapshot: it.pricingSnapshot || {},
          saveForLater: true,
          quantity: it.quantity || 1
        });
      }
    }
    targetDoc.updatedAt = Date.now();

    // Save both
    await sourceDoc.save({ session });
    await targetDoc.save({ session });

    const plainSource = await Order.findById(sourceDoc._id).lean().exec();
    const plainTarget = await Order.findById(targetDoc._id).lean().exec();
    return { sourceOrder: plainSource, targetDraft: plainTarget };
  }

  /**
   * Hard delete by _id (permanent removal)
   * @param {String|ObjectId} id
   * @returns {Promise<Object|null>}
   */
  async hardDeleteById(id) {
    if (!id) return null;
    return Order.findByIdAndDelete(id).lean().exec();
  }

  /**
   * Count documents matching filter
   * @param {Object} filter
   * @returns {Promise<Number>}
   */
  async count(filter = {}) {
    const f = { ...filter };
    return Order.countDocuments(f).exec();
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
    return Order.insertMany(docs, options);
  }
}

module.exports = new OrderRepository();
