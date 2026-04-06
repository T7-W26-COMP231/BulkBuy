// src/models/product.model.js
//
// Mongoose model for Product
// - Timestamps stored as epoch milliseconds (Number).
// - Includes nested schemas for descriptions, item references, and sales prices.
// - Provides indexes for text search and common queries, pre-save timestamp maintenance,
//   soft-delete helpers, and a safe toJSON projection.

const mongoose = require('mongoose');

const { Schema } = mongoose;

const { generateDefaultIdStr } = require('./generateDefaultIdStr');

/* -------------------------
 * Sub-schemas
 * ------------------------- */

const DescriptionSchema = new Schema({
  locale: { type: String, trim: true, default: 'en' },
  title: { type: String, trim: true, default: '' },
  body: { type: String, trim: true, default: '' }
}, { _id: false });

const SalesPriceSchema = new Schema({
  price: { type: Number, required: true },
  currency: { type: String, required: true, trim: true },
  from: { type: Number, required: true }, // epoch ms
  to: { type: Number, required: true } // epoch ms
}, { _id: false });

const ItemRefSchema = new Schema({
  itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
  salesPrices: { type: [SalesPriceSchema], default: [] }
}, { _id: false });

/* -------------------------
 * Product schema
 * ------------------------- */

const ProductSchema = new Schema({
  _id: { type: String, required: true, trim: true }, // only for testing
  // Basic identity
  name: { type: String, required: true, trim: true },

  // Localized descriptions
  descriptions: { type: [DescriptionSchema], default: [] },

  // Items (references to Item documents with pricing snapshots)
  items: { type: [ItemRefSchema], default: [] },

  // Discount scheme (flexible object for tiered rules)
  discountScheme: { type: Schema.Types.Mixed, default: {} },

  // Sales window in epoch ms (from/to)
  salesWindow: {
    fromEpoch: { type: Number, default: null },
    toEpoch: { type: Number, default: null }
  },

  // Operational region
  ops_region: { type: String, trim: true, default: null },

  // Generic metadata
  metadata: { type: Map, of: Schema.Types.Mixed, default: {} },

  // Status lifecycle
  status: {
    type: String,
    enum: ['active', 'inactive', 'deleted', 'suspended', 'on_sale'],
    default: 'active',
    index: true
  },

  // Reviews references
  reviews: [{ type: Schema.Types.ObjectId, ref: 'Review' }],

  // Soft-delete fields (optional)
  deleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Number, default: null },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

  // Audit timestamps (epoch ms)
  createdAt: { type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now() }
}, {
  collection: 'products',
  toJSON: { virtuals: true, versionKey: false },
  toObject: { virtuals: true, versionKey: false }
});

/* -------------------------
 * Virtuals
 * ------------------------- */

ProductSchema.virtual('shortDescription').get(function () {
  if (!this.descriptions || this.descriptions.length === 0) return '';
  const en = this.descriptions.find((d) => d.locale === 'en');
  const src = en || this.descriptions[0];
  return (src && src.body) ? String(src.body).slice(0, 200) : '';
});

/* -------------------------
 * Indexes
 * ------------------------- */

// Text index for name and description titles/bodies to support search
ProductSchema.index({
  name: 'text',
  'descriptions.title': 'text',
  'descriptions.body': 'text'
}, { name: 'ProductTextIndex', default_language: 'english' });

// Index on ops_region + status for common queries
ProductSchema.index({ ops_region: 1, status: 1 });

/* -------------------------
 * Pre-save hook
 * ------------------------- */

ProductSchema.pre('save', function () {
  const now = Date.now();
  if (!this.createdAt) this.createdAt = now;
  this.updatedAt = now;
});


ProductSchema.pre('validate', async function () {
  // 1. Only run if the schema expects a String for _id
  if (this.schema.path('_id').instance !== 'String') return;

  // 2. Only generate if no _id exists (is undefined or null)
  if (!this._id) {
    // If generateDefaultId throws the "max attempts" error, 
    // Mongoose will catch it and stop the save automatically.
    this._id = await generateDefaultIdStr(this, { length: 20 });
  }
});

/* -------------------------
 * Statics / Helpers
 * ------------------------- */

/**
 * findByItemId
 * - Convenience to find products that include a specific itemId in items array.
 *
 * @param {ObjectId|String} itemId
 * @param {Object} opts - { select, populate, includeDeleted=false }
 * @returns {Promise<Array|Null>}
 */
ProductSchema.statics.findByItemId = function (itemId, opts = {}) {
  if (!itemId) return Promise.resolve([]);
  const includeDeleted = !!opts.includeDeleted;
  const filter = { 'items.itemId': itemId };
  if (!includeDeleted) filter.deleted = false;
  const q = this.find(filter);
  if (opts.select) q.select(opts.select);
  if (opts.populate) q.populate(opts.populate);
  return q.lean().exec();
};

/**
 * publicSearch
 * - Simple search helper for public product listings.
 *
 * @param {String|null} q
 * @param {Object} opts - { limit, skip, sort, filters }
 * @returns {Promise<{ total: number, results: Array }>}
 */
ProductSchema.statics.publicSearch = async function (q = null, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const skip = Math.max(Number(opts.skip) || 0, 0);
  const sort = opts.sort || { score: { $meta: 'textScore' }, updatedAt: -1 };
  const filters = opts.filters && typeof opts.filters === 'object' ? opts.filters : {};

  const baseQuery = Object.assign({}, filters, { status: 'active', deleted: false });

  let query;
  if (q && String(q).trim().length > 0) {
    query = Object.assign({}, baseQuery, { $text: { $search: String(q).trim() } });
  } else {
    query = baseQuery;
  }

  const projection = opts.select || {};

  const [total, docs] = await Promise.all([
    this.countDocuments(query).exec(),
    this.find(query, projection)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec()
  ]);

  return { total: Number(total || 0), results: docs || [] };
};

/* -------------------------
 * Query helpers
 * ------------------------- */

ProductSchema.query.notDeleted = function () {
  return this.where({ deleted: false });
};

/* -------------------------
 * Instance methods
 * ------------------------- */

/**
 * softDelete
 * - Marks the product as deleted (soft delete).
 *
 * @param {ObjectId|String|null} deletedBy
 */
ProductSchema.methods.softDelete = async function (deletedBy = null) {
  this.deleted = true;
  this.deletedAt = Date.now();
  this.deletedBy = deletedBy || null;
  this.status = 'deleted';
  this.updatedAt = Date.now();
  await this.save();
  return this;
};

/* -------------------------
 * Export model
 * ------------------------- */

// ProductSchema.plugin(require('./castLegacyIds'));

module.exports = mongoose.models.Product || mongoose.model('Product', ProductSchema);
