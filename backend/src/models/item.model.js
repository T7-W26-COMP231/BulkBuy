// src/models/item.model.js
/**
 * Item Mongoose model
 *
 * Fields:
 * - sku: String (unique, indexed)
 * - title, slug, description, shortDescription
 * - brand: { id, name }
 * - categories: [ObjectId]
 * - tags: [String]
 * - images: [ObjectId] (S3file refs)
 * - media: [{ type: 'video'|'image', s3: ObjectId }]
 * - price: [{ list, sale, currency, effectiveFrom, effectiveTo }]
 * - pricingTiers: [{ minQty, price, currency }]
 * - inventory: { stock, reserved, backorder, warehouses: [{ id, qty }] }
 * - variants: [{ sku, attributes, price, inventory }]
 * - weight, dimensions, shipping, taxClass
 * - ratings: { avg, count }
 * - reviews: [ObjectId]
 * - relatedProducts: [ObjectId]
 * - seller: { id, name }
 * - metadata: Map<string, mixed>
 * - status: enum('active','suspended','draft')
 * - ops_region: String
 * - published: Boolean
 * - createdAt, updatedAt: timestamps
 *
 * Includes:
 * - slug generation from title
 * - helper methods for inventory adjustments and price resolution
 * - text index for search
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const slugify = require('slugify');

const MEDIA_TYPES = ['video', 'image'];
const STATUS_ENUM = ['active', 'suspended', 'draft'];

const PriceSchema = new Schema(
  {
    list: { type: Number, required: true, min: 0 },
    sale: { type: Number, default: null, min: 0 },
    currency: { type: String, required: true, trim: true, uppercase: true },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null }
  },
  { _id: false }
);

const PricingTierSchema = new Schema(
  {
    minQty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, trim: true, uppercase: true }
  },
  { _id: false }
);

const WarehouseSchema = new Schema(
  {
    id: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    qty: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const InventorySchema = new Schema(
  {
    stock: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    backorder: { type: Boolean, default: false },
    warehouses: { type: [WarehouseSchema], default: [] }
  },
  { _id: false }
);

const VariantSchema = new Schema(
  {
    sku: { type: String, trim: true },
    attributes: { type: Map, of: String, default: {} },
    price: { type: [PriceSchema], default: [] },
    inventory: { type: InventorySchema, default: () => ({}) }
  },
  { _id: false }
);

const MediaSchema = new Schema(
  {
    type: { type: String, enum: MEDIA_TYPES, required: true },
    s3: { type: Schema.Types.ObjectId, ref: 'S3file', required: true }
  },
  { _id: false }
);

const WeightSchema = new Schema(
  {
    value: { type: Number, required: false, min: 0 },
    unit: { type: String, trim: true, default: 'kg' }
  },
  { _id: false }
);

const DimensionsSchema = new Schema(
  {
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    unit: { type: String, trim: true, default: 'cm' }
  },
  { _id: false }
);

const BrandSchema = new Schema(
  {
    id: { type: Schema.Types.ObjectId, ref: 'Brand' },
    name: { type: String, trim: true }
  },
  { _id: false }
);

const SellerSchema = new Schema(
  {
    id: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, trim: true }
  },
  { _id: false }
);

const RatingsSchema = new Schema(
  {
    avg: { type: Number, default: 0, min: 0 },
    count: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const ItemSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true, index: true, trim: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    shortDescription: { type: String, default: '' },

    brand: { type: BrandSchema, default: () => ({}) },
    categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    tags: [{ type: String, trim: true }],

    //images: [{ type: Schema.Types.ObjectId, ref: 'S3file' }],
    images: [{ type: String, trim: true }],
    media: { type: [MediaSchema], default: [] },

    price: { type: [PriceSchema], default: [] },
    pricingTiers: { type: [PricingTierSchema], default: [] },

    inventory: { type: InventorySchema, default: () => ({}) },

    variants: { type: [VariantSchema], default: [] },

    weight: { type: WeightSchema, default: () => ({}) },
    dimensions: { type: DimensionsSchema, default: () => ({}) },
    shipping: {
      class: { type: String, trim: true, default: '' },
      freightClass: { type: String, trim: true, default: '' },
      shipsFrom: { type: String, trim: true, default: '' }
    },

    taxClass: { type: String, trim: true, default: '' },

    ratings: { type: RatingsSchema, default: () => ({}) },
    reviews: [{ type: Schema.Types.ObjectId, ref: 'Review' }],

    relatedProducts: [{ type: Schema.Types.ObjectId, ref: 'Item' }],

    seller: { type: SellerSchema, default: () => ({}) },

    metadata: { type: Map, of: Schema.Types.Mixed, default: {} },

    status: { type: String, enum: STATUS_ENUM, default: 'draft', index: true },

    ops_region: { type: String, trim: true, default: '' },

    published: { type: Boolean, default: false, index: true }
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
ItemSchema.index({ title: 'text', description: 'text', shortDescription: 'text', 'brand.name': 'text' });
// Removed duplicate schema.index({ sku: 1 }) and schema.index({ slug: 1 }) because sku and slug already declare unique/index at field level
ItemSchema.index({ ops_region: 1 });
ItemSchema.index({ 'pricingTiers.minQty': 1 });

/* -------------------------
 * Pre-save hooks
 * ------------------------- */
ItemSchema.pre('validate', function () {
  // Ensure slug exists and is unique-ish; caller should handle uniqueness collisions
  try {
    if (!this.slug && this.title) {
      const base = slugify(this.title, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
      this.slug = `${base}`.slice(0, 200);
    }
  } catch (error) {
    throw new Error(`item alidation failed: ${error.message}`)
  }
});

/* -------------------------
 * Instance methods
 * ------------------------- */

/**
 * Resolve price for a given date (defaults to now)
 * Returns the best applicable price object { list, sale, currency, effectiveFrom, effectiveTo }
 */
ItemSchema.methods.getPriceAt = function getPriceAt(date = new Date()) {
  const ts = date instanceof Date ? date : new Date(date);
  // Prefer sale price if within effective window, otherwise list price
  const candidates = (this.price || []).filter((p) => {
    const fromOk = !p.effectiveFrom || new Date(p.effectiveFrom) <= ts;
    const toOk = !p.effectiveTo || new Date(p.effectiveTo) >= ts;
    return fromOk && toOk;
  });

  if (candidates.length === 0) return null;

  // Prefer lowest sale price if available, otherwise lowest list
  const withSale = candidates.filter((c) => c.sale !== null && c.sale !== undefined);
  const pick = withSale.length ? withSale.reduce((a, b) => (a.sale < b.sale ? a : b)) : candidates.reduce((a, b) => (a.list < b.list ? a : b));
  return pick;
};

/**
 * Adjust stock by delta (positive to add, negative to remove)
 * Returns updated inventory object
 */
ItemSchema.methods.adjustStock = async function adjustStock(delta = 0) {
  if (!Number.isFinite(delta)) throw new Error('delta must be a number');
  this.inventory = this.inventory || { stock: 0, reserved: 0, backorder: false, warehouses: [] };
  const newStock = (this.inventory.stock || 0) + Number(delta);
  this.inventory.stock = Math.max(0, newStock);
  await this.save();
  return this.inventory;
};

/**
 * Reserve quantity (increments reserved if available)
 * Returns updated inventory
 */
ItemSchema.methods.reserve = async function reserve(qty = 1) {
  qty = Number(qty) || 0;
  if (qty <= 0) throw new Error('qty must be > 0');
  this.inventory = this.inventory || { stock: 0, reserved: 0, backorder: false, warehouses: [] };
  const available = (this.inventory.stock || 0) - (this.inventory.reserved || 0);
  if (available < qty && !this.inventory.backorder) {
    throw new Error('insufficient stock to reserve');
  }
  this.inventory.reserved = (this.inventory.reserved || 0) + qty;
  await this.save();
  return this.inventory;
};

/**
 * Release reserved quantity
 */
ItemSchema.methods.release = async function release(qty = 1) {
  qty = Number(qty) || 0;
  if (qty <= 0) throw new Error('qty must be > 0');
  this.inventory = this.inventory || { stock: 0, reserved: 0, backorder: false, warehouses: [] };
  this.inventory.reserved = Math.max(0, (this.inventory.reserved || 0) - qty);
  await this.save();
  return this.inventory;
};

/**
 * Apply a rating (recalculate avg and count)
 */
ItemSchema.methods.applyRating = async function applyRating(rating = 0) {
  rating = Number(rating) || 0;
  if (rating <= 0) throw new Error('rating must be > 0');
  this.ratings = this.ratings || { avg: 0, count: 0 };
  const total = (this.ratings.avg || 0) * (this.ratings.count || 0);
  const newCount = (this.ratings.count || 0) + 1;
  const newAvg = (total + rating) / newCount;
  this.ratings.avg = Number(newAvg.toFixed(2));
  this.ratings.count = newCount;
  await this.save();
  return this.ratings;
};

/* -------------------------
 * Static helpers
 * ------------------------- */

/**
 * Find by SKU
 */
ItemSchema.statics.findBySku = function findBySku(sku, opts = {}) {
  if (!sku) return Promise.resolve(null);
  const q = this.findOne({ sku: String(sku).trim() });
  if (opts.select) q.select(opts.select);
  if (opts.populate) q.populate(opts.populate);
  return q.lean().exec();
};

/**
 * Simple public search wrapper
 */
ItemSchema.statics.publicSearch = async function publicSearch(q = null, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const skip = Math.max(Number(opts.skip) || 0, 0);
  const sort = opts.sort || { updatedAt: -1 };
  const filters = opts.filters && typeof opts.filters === 'object' ? opts.filters : {};

  const baseQuery = Object.assign({}, filters, { status: 'active', published: true });

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
 * Virtuals
 * ------------------------- */
ItemSchema.virtual('summary').get(function () {
  return {
    _id: this._id,
    sku: this.sku,
    title: this.title,
    price: (this.price && this.price.length ? this.price[0].list : null),
    published: this.published,
    ops_region: this.ops_region
  };
});

/* -------------------------
 * Export model
 * ------------------------- */
module.exports = mongoose.models.Item || mongoose.model('Item', ItemSchema);
