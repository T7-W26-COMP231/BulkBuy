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

/* Item snapshot stored under a product */
const ProductItemSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, required: true, index: true },
    pricing_snapshot: { type: Schema.Types.Mixed, default: {} },
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
  // created is an array when using create with array
  const newDoc = created[0];

  // link from source
  await this.findByIdAndUpdate(
    sourceWindowId,
    { $set: { overflow_id: newDoc._id } },
    { session, new: true }
  ).exec();

  return newDoc;
};

/* -------------------------
 * Instance methods
 * ------------------------- */

/**
 * Add or update an item snapshot under a product.
 * If pricing_snapshot is omitted, attempt to default from the last SalesWindow.
 *
 * @param {ObjectId|String} productId
 * @param {ObjectId|String} itemId
 * @param {Object} payload - { pricing_snapshot?, metadata? }
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

  // if pricing_snapshot not provided, attempt to default from last window
  let pricingSnapshot = payload.pricing_snapshot;
  if ((pricingSnapshot === undefined || pricingSnapshot === null) && this.constructor) {
    // find last window before this.window.fromEpoch
    const lastWindow = await this.constructor.getLastWindow(this.window.fromEpoch, { lean: true });
    if (lastWindow && Array.isArray(lastWindow.products)) {
      const lpIndex = findProductIndex(lastWindow.products, productId);
      if (lpIndex !== -1) {
        const lp = lastWindow.products[lpIndex];
        const liIndex = findItemIndex(lp, itemId);
        if (liIndex !== -1) {
          pricingSnapshot = lp.items[liIndex].pricing_snapshot || {};
        }
      }
    }
    // fallback to empty object
    if (pricingSnapshot === undefined || pricingSnapshot === null) pricingSnapshot = {};
  }

  const now = new Date();

  if (itIndex === -1) {
    // add new item
    const newItem = {
      itemId,
      pricing_snapshot: pricingSnapshot,
      metadata: payload.metadata || {},
      createdAt: now,
      updatedAt: now
    };
    product.items.push(newItem);
  } else {
    // update existing item
    const existing = product.items[itIndex];
    existing.pricing_snapshot = payload.pricing_snapshot !== undefined ? payload.pricing_snapshot : existing.pricing_snapshot;
    existing.metadata = payload.metadata !== undefined ? payload.metadata : existing.metadata;
    existing.updatedAt = now;
  }

  // Save and check for overflow size heuristic
  await this.save({ session });

  // If document size exceeds threshold, create overflow and move last product/items into overflow
  const approxSize = approximateJsonSize(this.toObject ? this.toObject() : this);
  if (approxSize > createOverflowThresholdBytes) {
    // Prepare payload for overflow: move the last product added (or the largest product)
    // Strategy: move the product we just modified (productId) into a new overflow doc
    const movedProduct = this.products.splice(pIndex, 1)[0];

    // create overflow doc
    const overflowDoc = await this.constructor.createOverflowWindow(this._id, { window: this.window, products: [movedProduct], metadata: {} }, { session });

    // persist the removal from source window
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
 * If not present in this window, optionally look up the last window.
 *
 * @param {ObjectId|String} productId
 * @param {ObjectId|String} itemId
 * @param {Object} opts - { fallbackToLastWindow: boolean }
 */
SalesWindowSchema.methods.getItemSnapshot = async function getItemSnapshot(productId, itemId, opts = {}) {
  const fallback = !!opts.fallbackToLastWindow;
  const pIndex = findProductIndex(this.products, productId);
  if (pIndex !== -1) {
    const product = this.products[pIndex];
    const itIndex = findItemIndex(product, itemId);
    if (itIndex !== -1) {
      return product.items[itIndex];
    }
  }

  if (!fallback) return null;

  // fallback to last window
  const lastWindow = await this.constructor.getLastWindow(this.window.fromEpoch, { lean: true });
  if (!lastWindow || !Array.isArray(lastWindow.products)) return null;
  const lpIndex = findProductIndex(lastWindow.products, productId);
  if (lpIndex === -1) return null;
  const lp = lastWindow.products[lpIndex];
  const liIndex = findItemIndex(lp, itemId);
  if (liIndex === -1) return null;
  return lp.items[liIndex];
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
