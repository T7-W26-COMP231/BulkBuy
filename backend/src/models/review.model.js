// src/models/review.model.js
/**
 * Review Mongoose model
 *
 * Fields:
 * - reviewerId: ObjectId (user who wrote the review)
 * - revieweeId: ObjectId (user being reviewed)
 * - productId: ObjectId (optional)
 * - itemId: ObjectId (optional)
 * - messageId: ObjectId (optional, link to Message)
 * - rating: Number (1-5)
 * - ops_region: String
 * - status: enum: draft | submitted | deleted
 * - metadata: Map<string, mixed>
 * - internalNotes: String (internal use)
 * - deleted: Boolean (soft delete)
 * - createdAt, updatedAt: timestamps
 *
 * Includes:
 * - validation and sensible defaults
 * - instance helpers (publish, softDelete)
 * - static helpers (findActiveById)
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const { generateDefaultIdStr } = require('./generateDefaultIdStr');

const STATUS_ENUM = ['draft', 'submitted', 'deleted'];

function docToJSON(doc, ret) {
  // remove internal fields from JSON output
  delete ret.internalNotes;
  delete ret.deleted;
  // remove empty metadata for cleanliness
  if (ret.metadata && Object.keys(ret.metadata).length === 0) delete ret.metadata;
  return ret;
}

const ReviewSchema = new Schema(
  {
    _id: { type: String, required: true, trim: true }, // only for testing
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    revieweeId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null, index: true },
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', default: null, index: true },
    messageId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    rating: {
      type: Number,
      required: true,
      min: [1, 'rating must be >= 1'],
      max: [5, 'rating must be <= 5'],
      validate: {
        validator: Number.isFinite,
        message: 'rating must be a number'
      }
    },
    ops_region: { type: String, trim: true, default: '' },
    status: { type: String, enum: STATUS_ENUM, default: 'draft', index: true },
    metadata: { type: Map, of: Schema.Types.Mixed, default: {} },
    internalNotes: { type: String, trim: true, default: '' },
    deleted: { type: Boolean, default: false, index: true }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false, transform: docToJSON },
    toObject: { virtuals: true }
  }
);

/* Indexes for common queries */
ReviewSchema.index({ reviewerId: 1, revieweeId: 1, productId: 1 });
ReviewSchema.index({ rating: -1, createdAt: -1 });


ReviewSchema.pre('validate', async function () {
  // 1. Only run if the schema expects a String for _id
  if (this.schema.path('_id').instance !== 'String') return;

  // 2. Only generate if no _id exists (is undefined or null)
  if (!this._id) {
    // If generateDefaultId throws the "max attempts" error, 
    // Mongoose will catch it and stop the save automatically.
    this._id = await generateDefaultIdStr(this, { length: 20 });
  }
});

/* Instance methods */

/**
 * Publish the review (transition draft -> submitted)
 * @param {Object} opts - optional mongoose save options (e.g., { session })
 */
ReviewSchema.methods.publish = async function publish(opts = {}) {
  if (this.status === 'submitted') return this;
  this.status = 'submitted';
  if (opts && opts.session) await this.save({ session: opts.session });
  else await this.save();
  return this;
};

/**
 * Soft delete the review
 * @param {String|null} deletedBy
 * @param {Object} opts
 */
ReviewSchema.methods.softDelete = async function softDelete(deletedBy = null, opts = {}) {
  if (!this.deleted) {
    this.deleted = true;
    this.status = 'deleted';
    if (deletedBy) this.metadata = this.metadata || new Map();
    if (deletedBy) this.metadata.set('deletedBy', deletedBy);
    if (opts && opts.session) await this.save({ session: opts.session });
    else await this.save();
  }
  return this;
};

/* Static helpers */

/**
 * Find active (non-deleted) review by id
 */
ReviewSchema.statics.findActiveById = function findActiveById(id, opts = {}) {
  const query = { _id: id, deleted: false };
  return this.findOne(query, null, opts);
};

/**
 * Soft delete by id
 */
ReviewSchema.statics.softDeleteById = function softDeleteById(id, deletedBy = null, opts = {}) {
  const update = { deleted: true, status: 'deleted' };
  if (deletedBy) update['metadata.deletedBy'] = deletedBy;
  return this.findByIdAndUpdate(id, update, { new: true, ...opts });
};

/* Virtual: short summary */
ReviewSchema.virtual('summary').get(function summary() {
  const r = { rating: this.rating, reviewerId: this.reviewerId, revieweeId: this.revieweeId };
  if (this.productId) r.productId = this.productId;
  return r;
});

// ReviewSchema.plugin(require('./castLegacyIds'));

module.exports = mongoose.model('Review', ReviewSchema);
