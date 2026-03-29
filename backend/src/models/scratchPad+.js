/**
 * SalesWindow Mongoose model (extended)
 *
 * Additions in this patch:
 * - CRUD helpers for products, product items, pricing_snapshots, pricing_tiers
 * - Helpers to read the complete data picture by traversing head + overflow chain
 * - All new methods accept opts: { session, lean, createOverflowThresholdBytes }
 *
 * Note: This file is an in-place extension of the original model. Existing
 * methods are preserved. New methods are implemented as statics where they
 * operate on a window id, and as instance methods where they operate on a
 * loaded document.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { calculateObjectSize } = (() => {
  try {
    // prefer bson calculateObjectSize when available
    return require('bson');
  } catch (e) {
    return null;
  }
})() || { calculateObjectSize: null };

/* -------------------------
 * Sub-schemas (unchanged)
 * ------------------------- */

const PricingSnapshotSchema = new Schema({
  atInstantPrice: { type: Number, default: 0 },
  discountedPercentage: { type: Number, default: 0, min: 0, max: 100 },
  discountBracket: {
    initial: { type: Number, default: 0 },
    final: { type: Number, default: 0 },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  metadata: { type: Schema.Types.Mixed, default: {} }
}, { _id: false });

const PricingTierSchema = new Schema({
  quantity :{ type: Number, default: 0 },
  discountPercentagePerUnitBulk: { type: Number, default: 0 }
}, { _id: false });

const ProductItemSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, required: true, index: true },
    productId: { type: Schema.Types.ObjectId, required: true, index: true },
    pricing_snapshots: { type: [PricingSnapshotSchema], default: [] },
    qtySold: { type: Number, default: 0 },
    qtyAvailable: { type: Number, default: 0 },
    pricing_tiers: { type: [PricingTierSchema], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const ProductSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true, index: true },
    items: { type: [ProductItemSchema], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

/* -------------------------
 * SalesWindow schema (unchanged core)
 * ------------------------- */

const SalesWindowSchema = new Schema(
  {
    window: {
      fromEpoch: { type: Number, required: true, index: true },
      toEpoch: { type: Number, required: true, index: true }
    },
    products: { type: [ProductSchema], default: [] },
    ops_region: { type: String, trim: true, require: true },
    overflow_id: { type: Schema.Types.ObjectId, ref: 'SalesWindow', default: null },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true }
  }
);

SalesWindowSchema.index({ 'window.fromEpoch': 1, 'window.toEpoch': 1 }, { name: 'window_range_idx' });

/* -------------------------
 * Helpers (extended)
 * ------------------------- */

function approximateJsonSize(obj) {
  try {
    if (calculateObjectSize && typeof calculateObjectSize.calculateObjectSize === 'function') {
      // bson package exposes calculateObjectSize as a function on the module
      return calculateObjectSize.calculateObjectSize(obj);
    }
    if (calculateObjectSize && typeof calculateObjectSize === 'function') {
      // fallback if require('bson') returned the function directly
      return calculateObjectSize(obj);
    }
    return Buffer.byteLength(JSON.stringify(obj), 'utf8');
  } catch (e) {
    return 0;
  }
}

function findProductIndex(products, productId) {
  if (!Array.isArray(products)) return -1;
  return products.findIndex((p) => String(p.productId) === String(productId));
}

function findItemIndex(product, itemId) {
  if (!product || !Array.isArray(product.items)) return -1;
  return product.items.findIndex((it) => String(it.itemId) === String(itemId));
}

/* -------------------------
 * Existing statics preserved (getLastWindow, getWindowChain, createOverflowWindow, upsertPricingSnapshot, listPricingSnapshots)
 * ------------------------- */

/* (For brevity in this patch we assume the original implementations of these
   statics are present here unchanged. In your codebase they remain as before.)
   We'll re-declare the ones we rely on below if needed. */

/* -------------------------
 * New: Read helpers that merge head + overflow chain into a single "complete" view
 * ------------------------- */

/**
 * Retrieve the full chain (head + overflow docs) and produce a merged view
 * that consolidates products and items across the chain.
 *
 * - For each productId, items are merged by itemId.
 * - pricing_snapshots from later windows are appended after earlier ones (head first).
 * - Each snapshot in the merged view includes a sourceWindowId and windowFrom for traceability.
 *
 * @param {ObjectId|String} startWindowId
 * @param {Object} opts - { lean: boolean, session }
 * @returns {Object} { windows: [...], merged: { products: [...] } }
 */
SalesWindowSchema.statics.getCompleteWindowData = async function getCompleteWindowData(startWindowId, opts = {}) {
  if (!startWindowId) return { windows: [], merged: { products: [] } };
  const session = opts.session || null;
  const lean = !!opts.lean;

  // reuse getWindowChain if present
  const windows = await this.getWindowChain(startWindowId, { lean: true, session });

  // merged map: productId -> { productId, items: Map(itemId -> item) }
  const productMap = new Map();

  for (const w of windows) {
    if (!Array.isArray(w.products)) continue;
    for (const p of w.products) {
      const pid = String(p.productId);
      if (!productMap.has(pid)) {
        productMap.set(pid, {
          productId: p.productId,
          items: new Map(),
          metadata: Object.assign({}, p.metadata || {})
        });
      }
      const targetProduct = productMap.get(pid);

      if (!Array.isArray(p.items)) continue;
      for (const it of p.items) {
        const iid = String(it.itemId);
        if (!targetProduct.items.has(iid)) {
          // clone item but keep snapshots as array with source info
          const cloned = {
            itemId: it.itemId,
            productId: it.productId,
            pricing_snapshots: [],
            pricing_tiers: Array.isArray(it.pricing_tiers) ? it.pricing_tiers.slice() : [],
            qtySold: it.qtySold || 0,
            qtyAvailable: it.qtyAvailable || 0,
            metadata: Object.assign({}, it.metadata || {}),
            createdAt: it.createdAt || null,
            updatedAt: it.updatedAt || null
          };
          targetProduct.items.set(iid, cloned);
        }
        const targetItem = targetProduct.items.get(iid);

        // append snapshots with provenance
        if (Array.isArray(it.pricing_snapshots)) {
          for (const s of it.pricing_snapshots) {
            const snapshotWithMeta = Object.assign({}, s, {
              sourceWindowId: w._id,
              windowFrom: w.window && w.window.fromEpoch
            });
            targetItem.pricing_snapshots.push(snapshotWithMeta);
          }
        }
      }
    }
  }

  // convert maps back to arrays
  const mergedProducts = [];
  for (const [pid, pObj] of productMap.entries()) {
    const itemsArr = [];
    for (const [iid, itObj] of pObj.items.entries()) {
      itemsArr.push(itObj);
    }
    mergedProducts.push({
      productId: pObj.productId,
      items: itemsArr,
      metadata: pObj.metadata
    });
  }

  return { windows, merged: { products: mergedProducts } };
};

/* -------------------------
 * New: CRUD statics for products
 * ------------------------- */

/**
 * Add a product container to a SalesWindow document.
 * payload: { productId, items?, metadata? }
 */
SalesWindowSchema.statics.addProduct = async function addProduct(windowId, payload = {}, opts = {}) {
  if (!windowId) throw new Error('windowId is required');
  if (!payload || !payload.productId) throw new Error('payload.productId is required');
  const session = opts.session || null;

  const doc = await this.findById(windowId).session(session).exec();
  if (!doc) throw new Error('SalesWindow not found');

  const existingIndex = findProductIndex(doc.products, payload.productId);
  if (existingIndex !== -1) {
    throw new Error('product already exists in window');
  }

  const newProduct = {
    productId: payload.productId,
    items: Array.isArray(payload.items) ? payload.items : [],
    metadata: payload.metadata || {}
  };

  doc.products.push(newProduct);
  await doc.save({ session });
  return newProduct;
};

/**
 * Update product metadata or replace items array (partial update).
 * update: { metadata?, items? }
 */
SalesWindowSchema.statics.updateProduct = async function updateProduct(windowId, productId, update = {}, opts = {}) {
  if (!windowId || !productId) throw new Error('windowId and productId are required');
  const session = opts.session || null;

  const doc = await this.findById(windowId).session(session).exec();
  if (!doc) throw new Error('SalesWindow not found');

  const pIndex = findProductIndex(doc.products, productId);
  if (pIndex === -1) throw new Error('product not found');

  const product = doc.products[pIndex];
  if (update.metadata !== undefined) product.metadata = update.metadata;
  if (update.items !== undefined) product.items = Array.isArray(update.items) ? update.items : product.items;
  await doc.save({ session });
  return product;
};

/**
 * Remove a product container (and all its items) from a SalesWindow.
 */
SalesWindowSchema.statics.removeProduct = async function removeProduct(windowId, productId, opts = {}) {
  if (!windowId || !productId) throw new Error('windowId and productId are required');
  const session = opts.session || null;

  const doc = await this.findById(windowId).session(session).exec();
  if (!doc) throw new Error('SalesWindow not found');

  const before = doc.products.length;
  doc.products = doc.products.filter((p) => String(p.productId) !== String(productId));
  if (doc.products.length === before) return false;

  await doc.save({ session });
  return true;
};

/* -------------------------
 * New: CRUD statics for product items
 * ------------------------- */

/**
 * Add a product item under a product. If product doesn't exist, it will be created.
 * itemPayload: { itemId, productId (optional), pricing_snapshots?, pricing_tiers?, metadata? }
 */
SalesWindowSchema.statics.addProductItem = async function addProductItem(windowId, productId, itemPayload = {}, opts = {}) {
  if (!windowId || !productId) throw new Error('windowId and productId are required');
  if (!itemPayload || !itemPayload.itemId) throw new Error('itemPayload.itemId is required');
  const session = opts.session || null;

  const doc = await this.findById(windowId).session(session).exec();
  if (!doc) throw new Error('SalesWindow not found');

  let pIndex = findProductIndex(doc.products, productId);
  if (pIndex === -1) {
    doc.products.push({ productId, items: [], metadata: {} });
    pIndex = doc.products.length - 1;
  }
  const product = doc.products[pIndex];

  const itIndex = findItemIndex(product, itemPayload.itemId);
  if (itIndex !== -1) throw new Error('item already exists');

  const now = new Date();
  const newItem = {
    itemId: itemPayload.itemId,
    productId,
    pricing_snapshots: Array.isArray(itemPayload.pricing_snapshots) ? itemPayload.pricing_snapshots.map(s => Object.assign({ createdAt: now, updatedAt: now }, s)) : [],
    pricing_tiers: Array.isArray(itemPayload.pricing_tiers) ? itemPayload.pricing_tiers.slice() : [],
    qtySold: itemPayload.qtySold || 0,
    qtyAvailable: itemPayload.qtyAvailable || 0,
    metadata: itemPayload.metadata || {},
    createdAt: now,
    updatedAt: now
  };

  product.items.push(newItem);
  await doc.save({ session });

  // overflow check (reuse instance overflow heuristic)
  const approxSize = approximateJsonSize(doc.toObject ? doc.toObject() : doc);
  const threshold = Number(opts.createOverflowThresholdBytes) || 100 * 1024;
  if (approxSize > threshold) {
    // move product to overflow (best-effort using existing createOverflowWindow)
    const movedProduct = doc.products.splice(pIndex, 1)[0];
    const overflowDoc = await this.createOverflowWindow(doc._id, { window: doc.window, products: [movedProduct], metadata: {} }, { session });
    await doc.save({ session });
    return { movedToOverflow: true, overflowId: overflowDoc._id, item: newItem };
  }

  return { movedToOverflow: false, item: newItem };
};

/**
 * Update an existing product item (partial).
 * update: { pricing_snapshots?, pricing_tiers?, metadata?, qtySold?, qtyAvailable? }
 */
SalesWindowSchema.statics.updateProductItem = async function updateProductItem(windowId, productId, itemId, update = {}, opts = {}) {
  if (!windowId || !productId || !itemId) throw new Error('windowId, productId and itemId are required');
  const session = opts.session || null;

  const doc = await this.findById(windowId).session(session).exec();
  if (!doc) throw new Error('SalesWindow not found');

  const pIndex = findProductIndex(doc.products, productId);
  if (pIndex === -1) throw new Error('product not found');

  const product = doc.products[pIndex];
  const itIndex = findItemIndex(product, itemId);
  if (itIndex === -1) throw new Error('item not found');

  const item = product.items[itIndex];
  const now = new Date();

  if (update.pricing_snapshots !== undefined) {
    item.pricing_snapshots = Array.isArray(update.pricing_snapshots)
      ? update.pricing_snapshots.map(s => Object.assign({ createdAt: now, updatedAt: now }, s))
      : item.pricing_snapshots;
  }
  if (update.pricing_tiers !== undefined) item.pricing_tiers = Array.isArray(update.pricing_tiers) ? update.pricing_tiers.slice() : item.pricing_tiers;
  if (update.metadata !== undefined) item.metadata = update.metadata;
  if (update.qtySold !== undefined) item.qtySold = update.qtySold;
  if (update.qtyAvailable !== undefined) item.qtyAvailable = update.qtyAvailable;

  item.updatedAt = now;
  await doc.save({ session });
  return item;
};

/**
 * Remove an item from a product (delegates to instance method removeItem if present).
 */
SalesWindowSchema.statics.removeProductItem = async function removeProductItem(windowId, productId, itemId, opts = {}) {
  if (!windowId || !productId || !itemId) throw new Error('windowId, productId and itemId are required');
  const session = opts.session || null;

  const doc = await this.findById(windowId).session(session).exec();
  if (!doc) throw new Error('SalesWindow not found');

  // reuse instance method if available
  if (typeof doc.removeItem === 'function') {
    return doc.removeItem(productId, itemId, { session });
  }

  // fallback
  const pIndex = findProductIndex(doc.products, productId);
  if (pIndex === -1) return false;
  const product = doc.products[pIndex];
  const before = product.items.length;
  product.items = product.items.filter((it) => String(it.itemId) !== String(itemId));
  if (product.items.length === before) return false;
  if (product.items.length === 0) {
    doc.products = doc.products.filter((p) => String(p.productId) !== String(productId));
  }
  await doc.save({ session });
  return true;
};

/* -------------------------
 * New: CRUD statics for pricing_tiers
 * ------------------------- */

/**
 * Add a pricing tier to an item
 * tier: { quantity, discountPercentagePerUnitBulk }
 */
SalesWindowSchema.statics.addPricingTier = async function addPricingTier(windowId, productId, itemId, tier = {}, opts = {}) {
  if (!windowId || !productId || !itemId) throw new Error('windowId, productId and itemId are required');
  const session = opts.session || null;

  const doc = await this.findById(windowId).session(session).exec();
  if (!doc) throw new Error('SalesWindow not found');

  const pIndex = findProductIndex(doc.products, productId);
  if (pIndex === -1) throw new Error('product not found');

  const product = doc.products[pIndex];
  const itIndex = findItemIndex(product, itemId);
  if (itIndex === -1) throw new Error('item not found');

  const item = product.items[itIndex];
  item.pricing_tiers = item.pricing_tiers || [];
  item.pricing_tiers.push({
    quantity: Number(tier.quantity) || 0,
    discountPercentagePerUnitBulk: Number(tier.discountPercentagePerUnitBulk) || 0
  });
  item.updatedAt = new Date();
  await doc.save({ session });
  return item.pricing_tiers[item.pricing_tiers.length - 1];
};

/**
 * Update a pricing tier by index
 */
SalesWindowSchema.statics.updatePricingTier = async function updatePricingTier(windowId, productId, itemId, tierIndex, update = {}, opts = {}) {
  if (!windowId || !productId || !itemId) throw new Error('windowId, productId and itemId are required');
  const session = opts.session || null;

  const doc = await this.findById(windowId).session(session).exec();
  if (!doc) throw new Error('SalesWindow not found');

  const pIndex = findProductIndex(doc.products, productId);
  if (pIndex === -1) throw new Error('product not found');

  const product = doc.products[pIndex];
  const itIndex = findItemIndex(product, itemId);
  if (itIndex === -1) throw new Error('item not found');

  const item = product.items[itIndex];
  if (!Array.isArray(item.pricing_tiers) || tierIndex < 0 || tierIndex >= item.pricing_tiers.length) {
    throw new Error('pricing tier not found');
  }

  const tier = item.pricing_tiers[tierIndex];
  if (update.quantity !== undefined) tier.quantity = Number(update.quantity);
  if (update.discountPercentagePerUnitBulk !== undefined) tier.discountPercentagePerUnitBulk = Number(update.discountPercentagePerUnitBulk);
  item.updatedAt = new Date();
  await doc.save({ session });
  return tier;
};

/**
 * Remove a pricing tier by index
 */
SalesWindowSchema.statics.removePricingTier = async function removePricingTier(windowId, productId, itemId, tierIndex, opts = {}) {
  if (!windowId || !productId || !itemId) throw new Error('windowId, productId and itemId are required');
  const session = opts.session || null;

  const doc = await this.findById(windowId).session(session).exec();
  if (!doc) throw new Error('SalesWindow not found');

  const pIndex = findProductIndex(doc.products, productId);
  if (pIndex === -1) throw new Error('product not found');

  const product = doc.products[pIndex];
  const itIndex = findItemIndex(product, itemId);
  if (itIndex === -1) throw new Error('item not found');

  const item = product.items[itIndex];
  if (!Array.isArray(item.pricing_tiers) || tierIndex < 0 || tierIndex >= item.pricing_tiers.length) {
    throw new Error('pricing tier not found');
  }

  const removed = item.pricing_tiers.splice(tierIndex, 1);
  item.updatedAt = new Date();
  await doc.save({ session });
  return removed[0] || null;
};

/* -------------------------
 * New: CRUD statics for pricing_snapshots (fine-grained)
 * ------------------------- */

/**
 * Add a pricing snapshot to an item (appends)
 * Delegates to upsertPricingSnapshot when appropriate.
 */
SalesWindowSchema.statics.addPricingSnapshot = async function addPricingSnapshot(windowId, productId, itemId, snapshot = {}, opts = {}) {
  // reuse existing upsertPricingSnapshot which handles creation if item missing
  return this.upsertPricingSnapshot(windowId, productId, itemId, snapshot, opts);
};

/**
 * Update a pricing snapshot by index within a specific window document.
 * Note: this updates the snapshot in the specified window only.
 */
SalesWindowSchema.statics.updatePricingSnapshot = async function updatePricingSnapshot(windowId, productId, itemId, snapshotIndex, update = {}, opts = {}) {
  if (!windowId || !productId || !itemId) throw new Error('windowId, productId and itemId are required');
  const session = opts.session || null;

  const doc = await this.findById(windowId).session(session).exec();
  if (!doc) throw new Error('SalesWindow not found');

  const pIndex = findProductIndex(doc.products, productId);
  if (pIndex === -1) throw new Error('product not found');

  const product = doc.products[pIndex];
  const itIndex = findItemIndex(product, itemId);
  if (itIndex === -1) throw new Error('item not found');

  const item = product.items[itIndex];
  if (!Array.isArray(item.pricing_snapshots) || snapshotIndex < 0 || snapshotIndex >= item.pricing_snapshots.length) {
    throw new Error('pricing snapshot not found');
  }

  const snap = item.pricing_snapshots[snapshotIndex];
  if (update.atInstantPrice !== undefined) snap.atInstantPrice = Number(update.atInstantPrice);
  if (update.discountedPercentage !== undefined) snap.discountedPercentage = Number(update.discountedPercentage);
  if (update.discountBracket !== undefined) snap.discountBracket = update.discountBracket;
  if (update.metadata !== undefined) snap.metadata = update.metadata;
  snap.updatedAt = new Date();

  item.updatedAt = new Date();
  await doc.save({ session });
  return snap;
};

/**
 * Remove a pricing snapshot by index within a specific window document.
 */
SalesWindowSchema.statics.removePricingSnapshot = async function removePricingSnapshot(windowId, productId, itemId, snapshotIndex, opts = {}) {
  if (!windowId || !productId || !itemId) throw new Error('windowId, productId and itemId are required');
  const session = opts.session || null;

  const doc = await this.findById(windowId).session(session).exec();
  if (!doc) throw new Error('SalesWindow not found');

  const pIndex = findProductIndex(doc.products, productId);
  if (pIndex === -1) throw new Error('product not found');

  const product = doc.products[pIndex];
  const itIndex = findItemIndex(product, itemId);
  if (itIndex === -1) throw new Error('item not found');

  const item = product.items[itIndex];
  if (!Array.isArray(item.pricing_snapshots) || snapshotIndex < 0 || snapshotIndex >= item.pricing_snapshots.length) {
    throw new Error('pricing snapshot not found');
  }

  const removed = item.pricing_snapshots.splice(snapshotIndex, 1);
  item.updatedAt = new Date();
  await doc.save({ session });
  return removed[0] || null;
};

/* -------------------------
 * Instance methods (preserve addOrUpdateItem, removeItem, getItemSnapshot, appendUpdatedLastSnapshot)
 * ------------------------- */

/* (Original instance methods remain unchanged and are expected to be present here.
   They include addOrUpdateItem, removeItem, getItemSnapshot, appendUpdatedLastSnapshot.)
   This patch does not remove them; it complements them with statics above. */

/* -------------------------
 * Pre hooks (unchanged)
 * ------------------------- */

SalesWindowSchema.pre('save', function (next) {
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
