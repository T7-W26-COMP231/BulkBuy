// src/models/supply.model.js
/**
 * Supply Mongoose model
 *
 * Fields:
 * - supplierId: ObjectId (required)
 * - requesterId: ObjectId (optional)
 * - items: [{ itemId, quotes: [{ pricePerBulkUnit, numberOfBulkUnits, discountingScheme, isAccepted, createdAt }] }]
 * - deliveryLocation: embedded address
 * - status: enum: quote | accepted | dispatched | cancelled | delivered | received
 * - ops_region: string
 * - metadata: Map<string, mixed>
 * - createdAt, updatedAt: timestamps
 *
 * Includes:
 * - sensible defaults and validation
 * - indexes for common queries
 * - instance helper to return sanitized public JSON
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

//const { generateDefaultIdStr } = require('./generateDefaultIdStr');
const { generateDefaultIdStr, generateRandomId } = require('./generateDefaultIdStr');

const DiscountBracketSchema = new Schema(
  {
    minQty: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, required: true, min: 0, max: 100 },
    description: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const QuoteSchema = new Schema(
  {
    _id: { type: String, default: () => generateRandomId(20) },
    pricePerBulkUnit: { type: Number, required: true, min: 0 },
    numberOfBulkUnits: { type: Number, required: true, min: 1 },
    discountingScheme: { type: [DiscountBracketSchema], default: [] },
    isAccepted: { type: Boolean, default: false },
    meta: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const ItemSchema = new Schema(
  {
    //itemId: { type: Schema.Types.ObjectId, required: true, ref: 'Item' },
    _id: { type: String, default: () => generateRandomId(20) },
    itemId: { type: String, required: true, ref: 'Item' },


    quotes: { type: [QuoteSchema], default: [] },
    requestedQuantity: { type: Number, min: 0 },
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { _id: true }
);

const AddressSchema = new Schema(
  {
    label: { type: String, trim: true, default: '' },
    line1: { type: String, trim: true, default: '' },
    line2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    region: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
    geo: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined } // [lng, lat]
    }
  },
  { _id: false }
);

const STATUS = [
  'draft',
  'quote',
  'pending_review',
  'accepted',
  'dispatched',
  'cancelled',
  'delivered',
  'received'
];

const SupplySchema = new Schema(
  {
    _id: { type: String, required: true, trim: true }, // only for testing

    //supplierId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },

    supplierId: { type: String, required: true, ref: 'User' },


    //requesterId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    requesterId: { type: String, ref: 'User', default: null },


    items: { type: [ItemSchema], required: true, validate: [(v) => Array.isArray(v) && v.length > 0, 'items must be a non-empty array'] },
    deliveryLocation: { type: AddressSchema, default: {} },
    status: { type: String, enum: STATUS, default: 'quote', index: true },
    ops_region: { type: String, trim: true, index: true },
    metadata: { type: Map, of: Schema.Types.Mixed, default: {} },
    internalNotes: { type: String, trim: true, default: '' }, // optional internal-only field
    deleted: { type: Boolean, default: false, index: true }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false, transform: docToJSON },
    toObject: { virtuals: true }
  }
);

/**
 * Transform function used by toJSON to remove internal fields
 */
function docToJSON(doc, ret) {
  // remove internal fields
  delete ret.internalNotes;
  delete ret.deleted;
  // remove any undefined geo coordinates for cleanliness
  if (ret.deliveryLocation && ret.deliveryLocation.geo && (!ret.deliveryLocation.geo.coordinates || ret.deliveryLocation.geo.coordinates.length === 0)) {
    delete ret.deliveryLocation.geo;
  }
  return ret;
}

/* Indexes */
SupplySchema.index({ supplierId: 1, status: 1, createdAt: -1 });
SupplySchema.index({ 'items.itemId': 1 });
SupplySchema.index({ ops_region: 1, status: 1 });


SupplySchema.pre('validate', async function () {
  // 1. Only run if the schema expects a String for _id
  if (this.schema.path('_id').instance !== 'String') return;

  // 2. Only generate if no _id exists (is undefined or null)
  if (!this._id) {
    // If generateDefaultId throws the "max attempts" error, 
    // Mongoose will catch it and stop the save automatically.
    this._id = await generateDefaultIdStr(this, { length: 20 });
  }
});

/* Instance helpers */

/**
 * Return a sanitized public representation of the supply
 */
SupplySchema.methods.toPublicJSON = function toPublicJSON() {
  const obj = this.toJSON();
  // ensure no sensitive internal fields are exposed
  if (obj.metadata && obj.metadata._internal) delete obj.metadata._internal;
  return obj;
};

/**
 * Add a quote to a specific item (in-memory change; caller should persist)
 * @param {ObjectId|String} itemId
 * @param {Object} quote
 * @returns {Object} the pushed quote
 */
SupplySchema.methods.addQuoteToItem = function addQuoteToItem(itemId, quote = {}) {
  const item = (this.items || []).find((it) => String(it.itemId) === String(itemId));
  if (!item) throw new Error('Item not found');
  const q = Object.assign({}, quote, { createdAt: new Date() });
  item.quotes.push(q);
  return q;
};

/**
 * Accept a quote for an item by quote id or index
 * - If quoteId provided, accepts that quote
 * - If index provided, accepts by index
 * - Unsets isAccepted on other quotes
 *
 * Caller should save the document after calling this method.
 */
SupplySchema.methods.acceptQuoteForItem = function acceptQuoteForItem(itemId, { quoteId = null, quoteIndex = null } = {}) {
  const item = (this.items || []).find((it) => String(it.itemId) === String(itemId));
  if (!item) throw new Error('Item not found');

  let idx = -1;
  if (quoteId) {
    idx = (item.quotes || []).findIndex((q) => String(q._id || q.id) === String(quoteId));
  } else if (typeof quoteIndex === 'number') {
    idx = quoteIndex;
  } else {
    idx = 0;
  }

  if (idx < 0 || idx >= (item.quotes || []).length) throw new Error('Quote not found');

  item.quotes = (item.quotes || []).map((q, i) => {
    const copy = q.toObject ? q.toObject() : { ...q };
    copy.isAccepted = i === idx;
    return copy;
  });

  return item.quotes[idx];
};

/* Static helpers */

/**
 * Safe find by id that excludes soft-deleted documents by default
 */
SupplySchema.statics.findActiveById = function findActiveById(id, opts = {}) {
  const query = { _id: id, deleted: false };
  return this.findOne(query, null, opts);
};

/**
 * Soft delete helper
 */
SupplySchema.statics.softDeleteById = function softDeleteById(id, deletedBy = null) {
  return this.findByIdAndUpdate(id, { deleted: true, 'metadata.deletedBy': deletedBy }, { new: true });
};


// SupplySchema.plugin(require('./castLegacyIds'));

module.exports = mongoose.model('Supply', SupplySchema);
