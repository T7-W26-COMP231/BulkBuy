// src/models/salesWindow.model.js
/**
 * SalesWindow Mongoose model
 *
 * Purpose
 * - Represents a time-bounded sales window containing product -> item snapshots.
 * - Supports CRUD plus helpers to add/remove/update items and pricing snapshots.
 * - When adding an item without an explicit pricing_snapshot, defaults are taken
 *   from the most recent previous SalesWindow (if available).
 * - Supports overflow chaining: if a document grows too large, an overflow
 *   SalesWindow can be created and linked via overflow_id.
 *
 * Notes
 * - This implementation uses Maps for flexible product/item keys.
 * - Pricing snapshots and metadata are stored as Mixed to allow arbitrary shapes.
 * - The overflow mechanism is best-effort and uses a JSON-size heuristic.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

/* -------------------------
 * Sub-schemas
 * ------------------------- */

/* Pricing snapshot schema
 * - atInstantPrice: price at the time the snapshot was taken (number)
 * - discountedPercentage: percentage discount applied (0-100)
 * - discountBracket: range or bracket that produced the discount (initial, final)
 * - meta: optional extra fields (currency, promoCode, etc.)
 */
const PricingSnapshotSchema = new Schema({
  atInstantPrice: { type: Number, default: 0 },
  discountedPercentage: { type: Number, default: 0, min: 0, max: 100 },
  discountBracket: {
    initial: { type: Number, default: 0 },
    final: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  metadata: { type: Schema.Types.Mixed, default: {} }
}, { _id: false });


/* Item snapshot stored under a product */
const ProductItemSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, required: true, index: true },
    pricing_snapshots: { type: [PricingSnapshotSchema], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

/* Product container: holds a map/array of items */
const ProductSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true, index: true },
    items: { type: [ProductItemSchema], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

/* SalesWindow schema */
const SalesWindowSchema = new Schema(
  {
    window: {
      fromEpoch: { type: Number, required: true, index: true }, // epoch ms
      toEpoch: { type: Number, required: true, index: true } // epoch ms
    },

    /**
     * products: array of ProductSchema
     * - Each product contains items array
     * - Using arrays (not nested Maps) keeps queries and updates simpler with mongoose
     */
    products: { type: [ProductSchema], default: [] },

    /**
     * overflow_id: reference to another SalesWindow document used when this doc
     * would exceed size limits. This forms a linked list of overflow windows.
     */
    overflow_id: { type: Schema.Types.ObjectId, ref: 'SalesWindow', default: null },

    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true }
  }
);

/* -------------------------
 * Indexes
 * ------------------------- */
SalesWindowSchema.index({ 'window.fromEpoch': 1, 'window.toEpoch': 1 }, { name: 'window_range_idx' });

/* -------------------------
 * Helpers / Utilities
 * ------------------------- */

/**
 * Approximate JSON size (bytes) of a document.
 * This is a heuristic used to decide when to create overflow docs.
 */
function approximateJsonSize(obj) {
  try {
    return Buffer.byteLength(JSON.stringify(obj), 'utf8');
  } catch (e) {
    return 0;
  }
}

/**
 * Find product container by productId (returns index or -1)
 */
function findProductIndex(products, productId) {
  if (!Array.isArray(products)) return -1;
  return products.findIndex((p) => String(p.productId) === String(productId));
}

/**
 * Find item index within a product by itemId (returns index or -1)
 */
function findItemIndex(product, itemId) {
  if (!product || !Array.isArray(product.items)) return -1;
  return product.items.findIndex((it) => String(it.itemId) === String(itemId));
}

/* -------------------------
 * Static methods
 * ------------------------- */

/**
 * Get the most recent SalesWindow before a given epoch (or overall latest)
 * @param {Number|null} beforeEpoch - epoch ms; if omitted, returns latest window
 * @param {Object} opts - mongoose query options
 */
SalesWindowSchema.statics.getLastWindow = async function getLastWindow(beforeEpoch = null, opts = {}) {
  const q = this.findOne(beforeEpoch ? { 'window.fromEpoch': { $lt: beforeEpoch } } : {})
    .sort({ 'window.fromEpoch': -1 });
  if (opts.lean) q.lean();
  return q.exec();
};

/**
 * Fetch a window and its overflow chain (head first).
 * @param {ObjectId|String} windowId
 * @param {Object} opts - { lean: boolean, session }
 * @returns {Array} windows array [headWindow, overflow1, overflow2, ...]
 */
SalesWindowSchema.statics.getWindowChain = async function getWindowChain(windowId, opts = {}) {
  if (!windowId) return [];
  const session = opts.session || null;
  const lean = !!opts.lean;

  const windows = [];
  let currentId = windowId;

  while (currentId) {
    const q = this.findById(currentId);
    if (lean) q.lean();
    if (session) q.session(session);
    const doc = await q.exec();
    if (!doc) break;
    windows.push(doc);
    const next = doc.overflow_id;
    if (!next || String(next) === String(currentId)) break;
    currentId = next;
  }

  return windows;
};

/**
 * Create a new overflow SalesWindow and link it from the source window.
 * This will create a new document and set source.overflow_id to the new id.
 * Returns the newly created SalesWindow document.
 */
SalesWindowSchema.statics.createOverflowWindow = async function createOverflowWindow(sourceWindowId, initialPayload = {}, opts = {}) {
  const session = opts.session || null;
  const payload = {
    window: initialPayload.window || { fromEpoch: Date.now(), toEpoch: Date.now() },
    products: initialPayload.products || [],
    metadata: initialPayload.metadata || {}
  };

  const created = await this.create([payload], { session });
  const newDoc = created[0];

  await this.findByIdAndUpdate(
    sourceWindowId,
    { $set: { overflow_id: newDoc._id } },
    { session, new: true }
  ).exec();

  return newDoc;
};

/**
 * Upsert (add or update) a single pricing snapshot for a product item within a specific window.
 * If the item does not exist in the window, it will be created with the provided snapshot.
 *
 * @param {ObjectId|String} windowId
 * @param {ObjectId|String} productId
 * @param {ObjectId|String} itemId
 * @param {Object} snapshot - pricing snapshot object
 * @param {Object} opts - { session }
 */
SalesWindowSchema.statics.upsertPricingSnapshot = async function upsertPricingSnapshot(windowId, productId, itemId, snapshot = {}, opts = {}) {
  if (!windowId || !productId || !itemId) throw new Error('windowId, productId and itemId are required');
  const session = opts.session || null;
  const win = await this.findById(windowId).session(session).exec();
  if (!win) throw new Error('SalesWindow not found');

  // ensure product exists
  let pIndex = findProductIndex(win.products, productId);
  if (pIndex === -1) {
    win.products.push({ productId, items: [], metadata: {} });
    pIndex = win.products.length - 1;
  }
  const product = win.products[pIndex];

  // ensure item exists
  let itIndex = findItemIndex(product, itemId);
  const now = new Date();
  if (itIndex === -1) {
    const newItem = {
      itemId,
      pricing_snapshots: [{ ...snapshot, createdAt: now, updatedAt: now }],
      metadata: {},
      createdAt: now,
      updatedAt: now
    };
    product.items.push(newItem);
  } else {
    const existing = product.items[itIndex];
    existing.pricing_snapshots = existing.pricing_snapshots || [];
    existing.pricing_snapshots.push({ ...snapshot, createdAt: now, updatedAt: now });
    existing.updatedAt = now;
  }

  await win.save({ session });
  return true;
};

/**
 * List pricing snapshots for a given product item.
 * By default lists snapshots within a single window; set opts.includeOverflow = true to collect across head + overflow chain.
 *
 * @param {ObjectId|String} productId
 * @param {ObjectId|String} itemId
 * @param {Object} opts - { windowId, includeOverflow: boolean, limit: number, beforeEpoch, session }
 * @returns {Array} array of snapshots (ordered by window order: head then overflow)
 */
SalesWindowSchema.statics.listPricingSnapshots = async function listPricingSnapshots(productId, itemId, opts = {}) {
  const includeOverflow = opts.includeOverflow !== undefined ? !!opts.includeOverflow : true;
  const limit = Number(opts.limit) || 0;

  if (includeOverflow) {
    const startWindowId = opts.windowId || null;
    let windows;
    if (startWindowId) {
      windows = await this.getWindowChain(startWindowId, { lean: true, session: opts.session });
    } else {
      const q = this.find({ 'products.productId': productId }).sort({ 'window.fromEpoch': -1 });
      if (opts.beforeEpoch) q.where('window.fromEpoch').lt(opts.beforeEpoch);
      if (opts.session) q.session(opts.session);
      q.lean();
      windows = await q.exec();
    }

    const snapshots = [];
    for (const w of windows) {
      if (!Array.isArray(w.products)) continue;
      const pIndex = findProductIndex(w.products, productId);
      if (pIndex === -1) continue;
      const product = w.products[pIndex];
      const itIndex = findItemIndex(product, itemId);
      if (itIndex === -1) continue;
      const item = product.items[itIndex];
      if (Array.isArray(item.pricing_snapshots)) {
        for (const s of item.pricing_snapshots) {
          snapshots.push(Object.assign({ windowId: w._id, windowFrom: w.window && w.window.fromEpoch }, s));
          if (limit && snapshots.length >= limit) return snapshots;
        }
      }
    }
    return snapshots;
  } else {
    if (!opts.windowId) throw new Error('windowId is required when includeOverflow is false');
    const w = await this.findById(opts.windowId).lean().exec();
    if (!w || !Array.isArray(w.products)) return [];
    const pIndex = findProductIndex(w.products, productId);
    if (pIndex === -1) return [];
    const product = w.products[pIndex];
    const itIndex = findItemIndex(product, itemId);
    if (itIndex === -1) return [];
    const item = product.items[itIndex];
    return Array.isArray(item.pricing_snapshots) ? item.pricing_snapshots.slice(0, limit || undefined) : [];
  }
};

/* -------------------------
 * Instance methods
 * ------------------------- */

/**
 * Add or update an item snapshot under a product.
 * If pricing_snapshots is omitted, attempt to default from the last SalesWindow.
 *
 * @param {ObjectId|String} productId
 * @param {ObjectId|String} itemId
 * @param {Object} payload - { pricing_snapshots?, metadata? }
 * @param {Object} opts - { session, createOverflowThresholdBytes }
 */
SalesWindowSchema.methods.addOrUpdateItem = async function addOrUpdateItem(productId, itemId, payload = {}, opts = {}) {
  const session = opts.session || null;
  const createOverflowThresholdBytes = Number(opts.createOverflowThresholdBytes) || 100 * 1024; // 100KB default

  // find or create product container
  let pIndex = findProductIndex(this.products, productId);
  if (pIndex === -1) {
    this.products.push({
      productId,
      items: [],
      metadata: {}
    });
    pIndex = this.products.length - 1;
  }
  const product = this.products[pIndex];

  // find item
  let itIndex = findItemIndex(product, itemId);

  // if pricing_snapshots not provided, attempt to default from last window
  let pricingSnapshots = payload.pricing_snapshots;
  if ((pricingSnapshots === undefined || pricingSnapshots === null) && this.constructor) {
    const lastWindow = await this.constructor.getLastWindow(this.window.fromEpoch, { lean: true });
    if (lastWindow && Array.isArray(lastWindow.products)) {
      const lpIndex = findProductIndex(lastWindow.products, productId);
      if (lpIndex !== -1) {
        const lp = lastWindow.products[lpIndex];
        const liIndex = findItemIndex(lp, itemId);
        if (liIndex !== -1) {
          pricingSnapshots = Array.isArray(lp.items[liIndex].pricing_snapshots) ? lp.items[liIndex].pricing_snapshots.slice() : [];
        }
      }
    }
    if (pricingSnapshots === undefined || pricingSnapshots === null) pricingSnapshots = [];
  }

  const now = new Date();

  if (itIndex === -1) {
    // add new item
    const newItem = {
      itemId,
      pricing_snapshots: Array.isArray(pricingSnapshots) ? pricingSnapshots.map(s => Object.assign({ createdAt: now, updatedAt: now }, s)) : [],
      metadata: payload.metadata || {},
      createdAt: now,
      updatedAt: now
    };
    product.items.push(newItem);
  } else {
    // update existing item
    const existing = product.items[itIndex];
    existing.pricing_snapshots = payload.pricing_snapshots !== undefined
      ? (Array.isArray(payload.pricing_snapshots) ? payload.pricing_snapshots.map(s => Object.assign({ createdAt: now, updatedAt: now }, s)) : existing.pricing_snapshots)
      : existing.pricing_snapshots;
    existing.metadata = payload.metadata !== undefined ? payload.metadata : existing.metadata;
    existing.updatedAt = now;
  }

  // Save and check for overflow size heuristic
  await this.save({ session });

  // If document size exceeds threshold, create overflow and move the modified product into overflow
  const approxSize = approximateJsonSize(this.toObject ? this.toObject() : this);
  if (approxSize > createOverflowThresholdBytes) {
    const movedProduct = this.products.splice(pIndex, 1)[0];

    const overflowDoc = await this.constructor.createOverflowWindow(this._id, { window: this.window, products: [movedProduct], metadata: {} }, { session });

    await this.save({ session });

    return { movedToOverflow: true, overflowId: overflowDoc._id };
  }

  return { movedToOverflow: false };
};

/**
 * Remove an item from a product
 * @param {ObjectId|String} productId
 * @param {ObjectId|String} itemId
 */
SalesWindowSchema.methods.removeItem = async function removeItem(productId, itemId, opts = {}) {
  const session = opts.session || null;
  const pIndex = findProductIndex(this.products, productId);
  if (pIndex === -1) return false;
  const product = this.products[pIndex];
  const before = product.items.length;
  product.items = product.items.filter((it) => String(it.itemId) !== String(itemId));
  if (product.items.length === before) return false;

  // if product has no items left, remove the product container
  if (product.items.length === 0) {
    this.products = this.products.filter((p) => String(p.productId) !== String(productId));
  }

  await this.save({ session });
  return true;
};

/**
 * Get an item snapshot for a product/item
 * If not present in this window, optionally look up the overflow chain or the last window.
 *
 * @param {ObjectId|String} productId
 * @param {ObjectId|String} itemId
 * @param {Object} opts - { fallbackToLastWindow: boolean, includeOverflow: boolean }
 */
SalesWindowSchema.methods.getItemSnapshot = async function getItemSnapshot(productId, itemId, opts = {}) {
  const fallback = !!opts.fallbackToLastWindow;
  const includeOverflow = opts.includeOverflow !== undefined ? !!opts.includeOverflow : fallback;

  // check current window first
  const pIndex = findProductIndex(this.products, productId);
  if (pIndex !== -1) {
    const product = this.products[pIndex];
    const itIndex = findItemIndex(product, itemId);
    if (itIndex !== -1) {
      return product.items[itIndex];
    }
  }

  if (!includeOverflow) return null;

  // traverse overflow chain starting from this window's overflow_id
  let nextId = this.overflow_id;
  while (nextId) {
    const nextWin = await this.constructor.findById(nextId).lean().exec();
    if (!nextWin) break;
    const pIdx = findProductIndex(nextWin.products, productId);
    if (pIdx !== -1) {
      const itIdx = findItemIndex(nextWin.products[pIdx], itemId);
      if (itIdx !== -1) return nextWin.products[pIdx].items[itIdx];
    }
    if (!nextWin.overflow_id || String(nextWin.overflow_id) === String(nextId)) break;
    nextId = nextWin.overflow_id;
  }

  // fallback to last window before this.window.fromEpoch if requested
  if (fallback) {
    const lastWindow = await this.constructor.getLastWindow(this.window.fromEpoch, { lean: true });
    if (lastWindow && Array.isArray(lastWindow.products)) {
      const lpIndex = findProductIndex(lastWindow.products, productId);
      if (lpIndex !== -1) {
        const liIndex = findItemIndex(lastWindow.products[lpIndex], itemId);
        if (liIndex !== -1) return lastWindow.products[lpIndex].items[liIndex];
      }
    }
  }

  return null;
};

/**
 * Clone the last pricing snapshot for an item, change atInstantPrice, and append as a new snapshot.
 * Ensures the sales window has not ended before modifying.
 *
 * @param {ObjectId|String} productId
 * @param {ObjectId|String} itemId
 * @param {Number} newAtInstantPrice
 * @param {Object} opts - { session }
 * @returns {Object} the newly added pricing snapshot
 */
SalesWindowSchema.methods.appendUpdatedLastSnapshot = async function appendUpdatedLastSnapshot(productId, itemId, newAtInstantPrice, opts = {}) {
  const session = opts.session || null;

  // ensure window not passed
  const nowMs = Date.now();
  if (this.window && typeof this.window.toEpoch === 'number' && nowMs > Number(this.window.toEpoch)) {
    throw new Error('cannot modify snapshots: sales window has already ended');
  }

  // find product and item
  const pIndex = findProductIndex(this.products, productId);
  if (pIndex === -1) throw new Error('product not found in this window');
  const product = this.products[pIndex];
  const itIndex = findItemIndex(product, itemId);
  if (itIndex === -1) throw new Error('item not found in this product');

  const item = product.items[itIndex];
  item.pricing_snapshots = item.pricing_snapshots || [];

  const now = new Date();

  // take last snapshot if present, otherwise start from an empty base
  const last = item.pricing_snapshots.length ? item.pricing_snapshots[item.pricing_snapshots.length - 1] : null;
  const base = last ? Object.assign({}, last) : { atInstantPrice: 0, discountedPercentage: 0, discountBracket: { initial: 0, final: 0 }, metadata: {} };

  // create new snapshot with updated atInstantPrice and fresh timestamps
  const newSnapshot = Object.assign({}, base, { atInstantPrice: Number(newAtInstantPrice), createdAt: now, updatedAt: now });

  // append and persist
  item.pricing_snapshots.push(newSnapshot);
  item.updatedAt = now;
  await this.save({ session });

  return newSnapshot;
};


/* -------------------------
 * Pre hooks
 * ------------------------- */

SalesWindowSchema.pre('save', function (next) {
  // ensure updatedAt on nested items
  if (Array.isArray(this.products)) {
    const now = new Date();
    this.products.forEach((p) => {
      if (Array.isArray(p.items)) {
        p.items.forEach((it) => {
          if (!it.createdAt) it.createdAt = now;
          it.updatedAt = now;
        });
      }
    });
  }
  next();
});

/* -------------------------
 * Export model
 * ------------------------- */

module.exports = mongoose.models.SalesWindow || mongoose.model('SalesWindow', SalesWindowSchema);
