// src/models/salesWindow.model.js
/**
 * SalesWindow Mongoose model
 *
 * Purpose
 * - Represents a time-bounded sales window containing product -> item snapshots.
 * - A "window" is the head document plus its overflow chain (linked via overflow_id).
 * - Heads are marked with isHead: true; overflow documents have isHead: false.
 * - All CRUD and helpers are overflow-aware via attached extras.
 *
 * Member annotations
 * - window: { fromEpoch, toEpoch } epoch ms
 * - products: [ ProductSchema ] where ProductSchema contains items: [ ProductItemSchema ]
 * - ops_region: operational region string (dedupe scope)
 * - overflow_id: ObjectId | null (links to overflow doc)
 * - isHead: boolean (true for head windows, false for overflow docs)
 * - metadata: Mixed
 *
 * Notes
 * - Pre-save hook updates nested timestamps (no next()).
 * - Extras attach overflow-aware statics and instance helpers; if extras fail to load, model still exports.
 *
 * Added statics:
 * - upsertPricingSnapshot(windowId, productId, itemId, snapshot, { session })
 * - removeItem(productId, itemId, { session })
 *
 * These are implemented as best-effort, atomic updates using MongoDB arrayFilters.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const createError = require('http-errors');

/* -------------------------
 * Sub-schemas (member annotations)
 * ------------------------- */

/**
 * PricingSnapshotSchema
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

/**
 * PricingTierSchema
 */
const PricingTierSchema = new Schema({//pricing tier are set before product go live 
  // New admin pricing bracket fields
  minQty: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },

  // Backward-compatible legacy fields
  quantity: { type: Number, default: 0 },
  discountPercentagePerUnitBulk: { type: Number, default: 0 },// this should be rellfected in frontend, the only change is changining in frontend is pricing sncapshots and quanityt

  metadata: { type: Schema.Types.Mixed, default: {} }
}, { _id: false });

/**
 * ProductItemSchema
 */

const ProductItemSchema = new Schema({
  itemId: { type: Schema.Types.ObjectId, required: true, index: true },
  productId: { type: Schema.Types.ObjectId, required: true, index: true },
  pricing_snapshots: { type: [PricingSnapshotSchema], default: [] }, // the first one is the initial price setter, first pricing snapshot initial one 

  qtySold: { type: Number, default: 0 }, //
  qtyAvailable: { type: Number, default: 0 },

  pricing_tiers: { type: [PricingTierSchema], default: [] },
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

/**
 * ProductSchema
 */
const ProductSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, required: true, index: true },
  items: { type: [ProductItemSchema], default: [] },
  metadata: { type: Schema.Types.Mixed, default: {} }
}, { _id: false });

/* -------------------------
 * SalesWindow schema (member annotations)
 * ------------------------- */

const SalesWindowSchema = new Schema({
  window: {
    fromEpoch: { type: Number, required: true, index: true },
    toEpoch: { type: Number, required: true, index: true }
  },
  products: { type: [ProductSchema], default: [] },//this is just referece it doesn't have all info
  ops_region: { type: String, trim: true, required: true },
  overflow_id: { type: Schema.Types.ObjectId, ref: 'SalesWindow', default: null },

  // overflow_id: is  
  // when mongodb document 
  // let says we have 2000 products then mongo limit changed then we gonna create new document but to connect them we can use it

  isHead: { type: Boolean, default: true, index: true }, //first sales window created is head, all other refrence them is like overflow 

  metadata: { type: Schema.Types.Mixed, default: {} }

}, {
  timestamps: true,
  toJSON: { virtuals: true, versionKey: false },
  toObject: { virtuals: true }
});

SalesWindowSchema.index({ 'window.fromEpoch': 1, 'window.toEpoch': 1 }, { name: 'window_range_idx' });

/* -------------------------
 * Pre-save hook (preserve existing behavior)
 * ------------------------- */
SalesWindowSchema.pre('save', function () {
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
});

/* -------------------------
 * Model statics: upsertPricingSnapshot, removeItem
 * ------------------------- */

/**
 * upsertPricingSnapshot(windowId, productId, itemId, snapshot, { session })
 *
 * - Adds a pricing snapshot to the specified item inside the specified window.
 * - Uses arrayFilters to target the nested item.
 * - Returns the updated item object (including pricing_snapshots array) on success.
 * - Throws 404 if the window/product/item path is not found.
 */
SalesWindowSchema.statics.upsertPricingSnapshot = async function (windowId, productId, itemId, snapshot = {}, opts = {}) {
  if (!windowId) throw createError(400, 'windowId is required');
  if (!productId) throw createError(400, 'productId is required');
  if (!itemId) throw createError(400, 'itemId is required');
  if (!snapshot || typeof snapshot !== 'object') throw createError(400, 'snapshot is required');

  const now = new Date();
  const snap = Object.assign({}, snapshot, { createdAt: snapshot.createdAt ? new Date(snapshot.createdAt) : now, updatedAt: now });

  const filter = {
    _id: windowId,
    'products.productId': productId,
    'products.items.itemId': itemId
  };

  const update = {
    $push: { 'products.$[p].items.$[it].pricing_snapshots': snap },
    $set: { updatedAt: now }
  };

  const arrayFilters = [
    { 'p.productId': mongoose.Types.ObjectId(String(productId)) },
    { 'it.itemId': mongoose.Types.ObjectId(String(itemId)) }
  ];

  const options = { new: true, arrayFilters, session: opts.session || null };

  const updatedDoc = await this.findOneAndUpdate(filter, update, options).exec();
  if (!updatedDoc) {
    // Not found: either window or product/item path missing
    throw createError(404, 'window/product/item not found');
  }

  // locate and return the updated item
  const prod = (updatedDoc.products || []).find((p) => String(p.productId) === String(productId));
  if (!prod) throw createError(404, 'product not found after update');
  const item = (prod.items || []).find((it) => String(it.itemId) === String(itemId));
  if (!item) throw createError(404, 'item not found after update');

  return { ...item, ops_region: this.ops_region };
};

/**
 * removeItem(productId, itemId, { session })
 *
 * - Removes the item (by itemId) from all products matching productId across all windows.
 * - Returns an object { matchedCount, modifiedCount } similar to updateMany result.
 * - If you want to restrict to a specific window, call repository/service method that accepts windowId.
 */
SalesWindowSchema.statics.removeItem = async function (productId, itemId, opts = {}) {
  if (!productId) throw createError(400, 'productId is required');
  if (!itemId) throw createError(400, 'itemId is required');

  // Pull the item from any product that matches productId
  const filter = { 'products.productId': productId };
  const update = { $pull: { 'products.$[p].items': { itemId: mongoose.Types.ObjectId(String(itemId)) } } };
  const arrayFilters = [{ 'p.productId': mongoose.Types.ObjectId(String(productId)) }];
  const options = { arrayFilters, session: opts.session || null, multi: true };

  // Use updateMany to affect all windows that contain the product
  const res = await this.updateMany(filter, update, options).exec();

  // res is a WriteOpResult-like object; normalize return
  return {
    matchedCount: res.matchedCount !== undefined ? res.matchedCount : (res.n || 0),
    modifiedCount: res.modifiedCount !== undefined ? res.modifiedCount : (res.nModified || 0),
    ops_region: this.ops_region
  };
};

/* -------------------------
 * Load extras (non-disruptive)
 * ------------------------- */
try {
  const attachExtras = require('./salesWindow.model.extras');
  if (typeof attachExtras === 'function') attachExtras(SalesWindowSchema, mongoose);
  else if (attachExtras && typeof attachExtras.attach === 'function') attachExtras.attach(SalesWindowSchema, mongoose);
} catch (err) {
  // Non-disruptive: log and continue.
  // eslint-disable-next-line no-console
  console.warn('salesWindow.model.extras not loaded:', err && err.message);
}

/* -------------------------
 * Export model
 * ------------------------- */
module.exports = mongoose.models.SalesWindow || mongoose.model('SalesWindow', SalesWindowSchema);
