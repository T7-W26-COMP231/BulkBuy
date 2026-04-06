// src/models/order.model.js
//
// Mongoose model for Order
// - Timestamps stored as epoch milliseconds (Number).
// - Contains items with structured pricing snapshots, saveForLater flag, and quantity.
// - Supports address/geo points for orderLocation and deliveryLocation.
// - Includes helpful statics and instance helpers.
//
// Note: status "draft" represents a user's shopping cart. When an order is submitted,
// a new blank draft may be created and saveForLater items carried over.

const mongoose = require('mongoose');

const { Schema } = mongoose;

const { generateDefaultIdStr } = require('./generateDefaultIdStr');

/* -------------------------
 * Sub-schemas
 * ------------------------- */

const GeoPointSchema = new Schema({
  type: {
    type: String,
    enum: ['Point'],
    default: 'Point'
  },
  coordinates: {
    type: [Number], // [lng, lat]
    validate: {
      validator: (v) => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number'),
      message: 'coordinates must be [lng, lat]'
    },
    default: undefined
  }
}, { _id: false });

const AddressSchema = new Schema({
  line1: { type: String, trim: true, default: null },
  line2: { type: String, trim: true, default: null },
  city: { type: String, trim: true, default: null },
  region: { type: String, trim: true, default: null },
  postalCode: { type: String, trim: true, default: null },
  country: { type: String, trim: true, default: null },
  geo: { type: GeoPointSchema, default: undefined }
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
    initial: { type: Number, default: 0 }, // percentages per item
    final: { type: Number, default: 0 }
  },
  createdAt: { type: Number, default: () => Date.now(), index: true },
  meta: { type: Schema.Types.Mixed, default: {} }
}, { _id: false });

const OrderItemSchema = new Schema({
  // productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  // itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },

  productId: { type: String, ref: 'Product', required: true },
  itemId: { type: String, ref: 'Item', required: true },

  pricingSnapshot: { type: [PricingSnapshotSchema], default: [() => ({})] },
  saveForLater: { type: Boolean, default: false },
  quantity: { type: Number, default: 1, min: 1 },
  status: {
    type: String,
    enum: ['active', 'savedForLater'],
    default: 'active',
  },
}, { _id: false });

const SalesWindowSchema = new Schema({
  fromEpoch: { type: Number, default: null }, // epoch ms
  toEpoch: { type: Number, default: null } // epoch ms
}, { _id: false });

/* -------------------------
 * Order schema
 * ------------------------- */

const OrderSchema = new Schema({
  _id: { type: String, required: true, trim: true }, // only for testing
  // userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userId: { type: String, required: true, trim: true, index: true }, // only for testing

  items: { type: [OrderItemSchema], default: [], index: true },

  orderLocation: { type: AddressSchema, default: undefined },
  deliveryLocation: { type: AddressSchema, default: undefined },

  paymentMethod: { type: Schema.Types.Mixed, default: null }, // could be ObjectId or embedded payment reference

  salesWindow: { type: SalesWindowSchema, default: undefined },

  ops_region: { type: String, trim: true, default: null, index: true },

  messages: { type: [Schema.Types.ObjectId], ref: 'Message', default: [] },

  metadata: { type: Map, of: Schema.Types.Mixed, default: {} },
  declineReason: {
    type: String,
    trim: true,
    default: null
  },

  // draft here means in cart. once submitted, a new blank order is created.
  // the cart is always the latest draft order; on new blank cart creation,
  // saveForLater items should be copied over by business logic.
  status: {
    type: String,
    enum: [
      'draft',
      'submitted',
      'approved',
      'declined',
      'cancelled',
      'confirmed',
      'dispatched',
      'fulfilled'
    ],
    default: 'draft',
    index: true
  },

  // Audit timestamps (epoch ms)
  createdAt: { type: Number, default: () => Date.now(), index: true },
  updatedAt: { type: Number, default: () => Date.now() }
}, {
  collection: 'orders',
  toJSON: { virtuals: true, versionKey: false },
  toObject: { virtuals: true, versionKey: false }
});

/* -------------------------
 * Virtuals
 * ------------------------- */

OrderSchema.virtual('itemCount').get(function () {
  return Array.isArray(this.items) ? this.items.reduce((sum, it) => sum + (it.quantity || 0), 0) : 0;
});

OrderSchema.virtual('totalAmount').get(function () {
  if (!Array.isArray(this.items)) return 0;
  return this.items.reduce((sum, it) => {
    const price = (it.pricingSnapshot && typeof it.pricingSnapshot.atInstantPrice === 'number') ? it.pricingSnapshot.atInstantPrice : 0;
    const qty = it.quantity || 0;
    const discountPct = (it.pricingSnapshot && typeof it.pricingSnapshot.discountedPercentage === 'number') ? it.pricingSnapshot.discountedPercentage : 0;
    const line = price * qty * (1 - (discountPct / 100));
    return sum + line;
  }, 0);
});

/* -------------------------
 * Indexes
 * ------------------------- */

// 2dsphere index for delivery location geo if present
OrderSchema.index({ 'deliveryLocation.geo': '2dsphere' });
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ ops_region: 1, status: 1 });

/* -------------------------
 * Pre-save hook
 * ------------------------- */

OrderSchema.pre('save', function () {
  const now = Date.now();
  if (!this.createdAt) this.createdAt = now;
  this.updatedAt = now;
});


OrderSchema.pre('validate', async function () {
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
 * Statics
 * ------------------------- */

/**
 * findByUserId
 * @param {ObjectId|String} userId
 * @param {Object} [opts] - { page, limit, sort, select, populate }
 */
OrderSchema.statics.findByUserId = function (userId, opts = {}) {
  if (!userId) return Promise.resolve([]);
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
  const skip = (page - 1) * limit;
  const q = this.find({ userId });
  if (opts.select) q.select(opts.select);
  if (opts.sort) q.sort(opts.sort);
  if (opts.populate) q.populate(opts.populate);
  q.skip(skip).limit(limit);
  return q.lean().exec();
};

/**
 * updateStatus
 * - Atomically set status and updatedAt
 */
OrderSchema.statics.updateStatus = function (orderId, status) {
  if (!orderId || !status) return Promise.resolve(null);
  return this.findByIdAndUpdate(orderId, { status, updatedAt: Date.now() }, { new: true, runValidators: true }).lean().exec();
};

/* -------------------------
 * Instance methods
 * ------------------------- */

/**
 * addItem
 * - Adds or increments an item in the order
 * - If item.saveForLater === true, it will be stored with that flag.
 */
OrderSchema.methods.addItem = async function (item) {
  if (!item || !item.itemId || !item.productId) throw new Error('item.productId and item.itemId are required');
  const idx = this.items.findIndex((it) => String(it.itemId) === String(item.itemId));
  if (idx === -1) {
    this.items.push({
      productId: item.productId,
      itemId: item.itemId,
      pricingSnapshot: item.pricingSnapshot || {},
      saveForLater: !!item.saveForLater,
      quantity: item.quantity || 1
    });
  } else {
    // increment quantity
    this.items[idx].quantity = (this.items[idx].quantity || 0) + (item.quantity || 1);
    // update saveForLater flag if explicitly provided
    if (typeof item.saveForLater === 'boolean') {
      this.items[idx].saveForLater = !!item.saveForLater;
    }
    // merge pricing snapshot (prefer incoming fields)
    if (item.pricingSnapshot && typeof item.pricingSnapshot === 'object') {
      this.items[idx].pricingSnapshot = Object.assign({}, this.items[idx].pricingSnapshot || {}, item.pricingSnapshot);
    }
  }
  this.updatedAt = Date.now();
  return this.save();
};

/**
 * setItemQuantity
 * - Set the quantity for a specific item.
 * - If quantity <= 0 the item is removed from the order (cart).
 *
 * @param {ObjectId|String} itemId
 * @param {Number} quantity  integer >= 0
 * @returns {Promise<Document>} saved order document
 */
OrderSchema.methods.setItemQuantity = async function (itemId, quantity) {
  if (!itemId) throw new Error('itemId is required');
  const q = Number(quantity);
  if (!Number.isInteger(q) || q < 0) throw new Error('quantity must be an integer >= 0');

  const idx = this.items.findIndex((it) => String(it.itemId) === String(itemId));
  if (idx === -1) {
    // If setting quantity to 0 for a non-existing item, nothing to do.
    if (q === 0) return this;
    // If item not present and quantity > 0, cannot set quantity without productId/pricingSnapshot.
    throw new Error('item not found in order');
  }

  if (q === 0) {
    // remove item
    this.items.splice(idx, 1);
  } else {
    this.items[idx].quantity = q;
  }

  this.updatedAt = Date.now();
  return this.save();
};

/**
 * updateItem
 * - Update item attributes in-place: quantity, saveForLater, pricingSnapshot.
 * - If quantity is provided and <= 0 the item is removed.
 * - Returns the saved order document.
 *
 * @param {ObjectId|String} itemId
 * @param {Object} changes - { quantity?: Number, saveForLater?: Boolean, pricingSnapshot?: Object }
 * @returns {Promise<Document>}
 */
OrderSchema.methods.updateItem = async function (itemId, changes = {}) {
  if (!itemId) throw new Error('itemId is required');
  if (!changes || typeof changes !== 'object') throw new Error('changes must be an object');

  const idx = this.items.findIndex((it) => String(it.itemId) === String(itemId));
  if (idx === -1) throw new Error('item not found in order');

  // Handle quantity
  if (Object.prototype.hasOwnProperty.call(changes, 'quantity')) {
    const q = Number(changes.quantity);
    if (!Number.isInteger(q) || q < 0) throw new Error('quantity must be an integer >= 0');
    if (q === 0) {
      // remove item
      this.items.splice(idx, 1);
      this.updatedAt = Date.now();
      return this.save();
    }
    this.items[idx].quantity = q;
  }

  // Handle saveForLater
  if (Object.prototype.hasOwnProperty.call(changes, 'saveForLater')) {
    this.items[idx].saveForLater = !!changes.saveForLater;
  }

  // Handle pricingSnapshot merge (prefer incoming fields)
  if (changes.pricingSnapshot && typeof changes.pricingSnapshot === 'object') {
    this.items[idx].pricingSnapshot = Object.assign({}, this.items[idx].pricingSnapshot || {}, changes.pricingSnapshot);
  }

  this.updatedAt = Date.now();
  return this.save();
};

/**
 * removeItem
 * - Remove an item by itemId
 */
OrderSchema.methods.removeItem = async function (itemId) {
  if (!itemId) throw new Error('itemId is required');
  this.items = (this.items || []).filter((it) => String(it.itemId) !== String(itemId));
  this.updatedAt = Date.now();
  return this.save();
};

/**
 * extractSaveForLater
 * - Return items marked saveForLater and remove them from this order.
 * - Useful when creating a new blank draft and carrying over saved items.
 *
 * Returns an object: { saved: Array, order: Promise }
 * - saved: array of item objects that were saved
 * - order: promise resolving to the saved order document after removal
 */
OrderSchema.methods.extractSaveForLater = function () {
  const saved = (this.items || []).filter((it) => it.saveForLater);
  this.items = (this.items || []).filter((it) => !it.saveForLater);
  this.updatedAt = Date.now();
  return { saved, order: this.save() };
};

/* -------------------------
 * Export model
 * ------------------------- */

// OrderSchema.plugin(require('./castLegacyIds'));

module.exports = mongoose.models.Order || mongoose.model('Order', OrderSchema);
