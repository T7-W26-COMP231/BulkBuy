// src/models/aggregation.model.js
//
// Mongoose model for Aggregation
// - Timestamps stored as epoch milliseconds (Number) to match project convention.
// - Contains itemDtos with pricing snapshots and supplier references.
// - Includes common indexes, pre-save timestamp maintenance, and a few helpful statics.

const mongoose = require('mongoose');

const { Schema } = mongoose;

/* -------------------------
 * Sub-schemas
 * ------------------------- */

const SalesWindowSchema = new Schema({
  from: { type: Number, default: null }, // epoch ms
  to: { type: Number, default: null } // epoch ms
}, { _id: false });

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
  meta: { type: Schema.Types.Mixed, default: {} }
}, { _id: false });

const ItemDtoSchema = new Schema({
  itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
  pricingSnapshot: { type: PricingSnapshotSchema, default: () => ({}) },
  supplierId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  salesWindow: { type: [SalesWindowSchema], default: [] }
}, { _id: false });

/* -------------------------
 * Aggregation schema
 * ------------------------- */

const AggregationSchema = new Schema({
  itemDtos: { type: [ItemDtoSchema], default: [] },

  orders: { type: [Schema.Types.ObjectId], ref: 'Order', default: [] },

  ops_region: { type: String, trim: true, default: null },

  status: {
    type: String,
    enum: ['in_process', 'pending', 'processed', 'suspended', 'closed'],
    default: 'pending',
    index: true
  },

  metadata: { type: Map, of: Schema.Types.Mixed, default: {} },

  // Audit timestamps (epoch ms)
  createdAt: { type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now() }
}, {
  collection: 'aggregations',
  toJSON: { virtuals: true, versionKey: false },
  toObject: { virtuals: true, versionKey: false }
});

/* -------------------------
 * Virtuals
 * ------------------------- */

AggregationSchema.virtual('itemCount').get(function () {
  return Array.isArray(this.itemDtos) ? this.itemDtos.length : 0;
});

/* -------------------------
 * Indexes
 * ------------------------- */

AggregationSchema.index({ ops_region: 1, status: 1 });
AggregationSchema.index({ 'itemDtos.itemId': 1 });
AggregationSchema.index({ createdAt: -1 });

/* -------------------------
 * Pre-save hook
 * ------------------------- */

AggregationSchema.pre('save', function () {
  const now = Date.now();
  if (!this.createdAt) this.createdAt = now;
  this.updatedAt = now;
});

/* -------------------------
 * Statics / Helpers
 * ------------------------- */

/**
 * findByItemId
 * - Find aggregations that include a specific itemId.
 *
 * @param {ObjectId|String} itemId
 * @param {Object} [opts] - { select, populate, includeSuspended=false }
 * @returns {Query}
 */
AggregationSchema.statics.findByItemId = function (itemId, opts = {}) {
  if (!itemId) return Promise.resolve([]);
  const f = { 'itemDtos.itemId': itemId };
  if (!opts.includeSuspended) f.status = { $ne: 'suspended' };
  const q = this.find(f);
  if (opts.select) q.select(opts.select);
  if (opts.populate) q.populate(opts.populate);
  return q.lean().exec();
};

/**
 * addOrder
 * - Append an order id to the aggregation.orders array.
 *
 * @param {ObjectId|String} aggregationId
 * @param {ObjectId|String} orderId
 * @returns {Promise<Object|null>}
 */
AggregationSchema.statics.addOrder = function (aggregationId, orderId) {
  if (!aggregationId || !orderId) return Promise.resolve(null);
  return this.findByIdAndUpdate(
    aggregationId,
    { $addToSet: { orders: orderId }, updatedAt: Date.now() },
    { new: true, runValidators: true }
  ).lean().exec();
};

/**
 * markProcessed
 * - Mark aggregation as processed and set updatedAt.
 *
 * @param {ObjectId|String} aggregationId
 * @returns {Promise<Object|null>}
 */
AggregationSchema.statics.markProcessed = function (aggregationId) {
  if (!aggregationId) return Promise.resolve(null);
  return this.findByIdAndUpdate(
    aggregationId,
    { status: 'processed', updatedAt: Date.now() },
    { new: true, runValidators: true }
  ).lean().exec();
};

/* -------------------------
 * Instance methods
 * ------------------------- */

/**
 * pushItemDto
 * - Add an itemDto to the aggregation instance and save.
 *
 * @param {Object} itemDto
 */
AggregationSchema.methods.pushItemDto = async function (itemDto = {}) {
  this.itemDtos = this.itemDtos || [];
  this.itemDtos.push(itemDto);
  this.updatedAt = Date.now();
  return this.save();
};

/* -------------------------
 * Export model
 * ------------------------- */

module.exports = mongoose.models.Aggregation || mongoose.model('Aggregation', AggregationSchema);
