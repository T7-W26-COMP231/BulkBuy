// src/models/config.model.js
/**
 * Config Mongoose model
 *
 * Fields:
 * - userId: ObjectId (unique) — owner of this config
 * - location: { lat: Number, lng: Number, address: String }
 * - theme: enum 'light' | 'dark' | 'system'
 * - isPrivate: Boolean
 * - ops_region: String
 * - metadata: Map<string, mixed>
 * - internalNotes: String (internal use)
 * - deleted: Boolean (soft delete)
 * - createdAt, updatedAt: timestamps
 *
 * Includes:
 * - validation and sensible defaults
 * - instance helpers (setTheme, setLocation, softDelete)
 * - static helpers (findByUserId, upsertForUser)
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const { generateDefaultIdStr } = require('./generateDefaultIdStr');

const THEME_ENUM = ['light', 'dark', 'system'];

function transformToJSON(doc, ret) {
  // remove internal fields from JSON output
  delete ret.internalNotes;
  delete ret.deleted;
  // remove empty metadata for cleanliness
  if (ret.metadata && Object.keys(ret.metadata).length === 0) delete ret.metadata;
  return ret;
}

const LocationSchema = new Schema(
  {
    lat: {
      type: Number,
      required: false,
      min: -90,
      max: 90
    },
    lng: {
      type: Number,
      required: false,
      min: -180,
      max: 180
    },
    address: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const ConfigSchema = new Schema(
  {
    _id: { type: String, required: true, trim: true }, // only for testing
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    location: { type: LocationSchema, default: () => ({}) },
    theme: { type: String, enum: THEME_ENUM, default: 'system' },
    isPrivate: { type: Boolean, default: true, index: true },
    ops_region: { type: String, trim: true, default: '' },
    metadata: { type: Map, of: Schema.Types.Mixed, default: {} },
    internalNotes: { type: String, trim: true, default: '' },
    deleted: { type: Boolean, default: false, index: true }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false, transform: transformToJSON },
    toObject: { virtuals: true }
  }
);

/* Indexes */
ConfigSchema.index({ ops_region: 1 });
// NOTE: Avoid declaring an additional index for `theme` here because the field-level index was removed
// If you prefer an explicit schema index instead, add: ConfigSchema.index({ theme: 1 }); and keep theme without index: true


ConfigSchema.pre('validate', async function () {
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
 * Set theme for this config
 * @param {String} theme
 * @param {Object} opts - optional save options (e.g., { session })
 */
ConfigSchema.methods.setTheme = async function setTheme(theme, opts = {}) {
  if (!THEME_ENUM.includes(theme)) {
    throw new Error(`theme must be one of: ${THEME_ENUM.join(', ')}`);
  }
  this.theme = theme;
  if (opts && opts.session) await this.save({ session: opts.session });
  else await this.save();
  return this;
};

/**
 * Update location
 * @param {Object} loc - { lat, lng, address }
 * @param {Object} opts
 */
ConfigSchema.methods.setLocation = async function setLocation(loc = {}, opts = {}) {
  if (loc.lat !== undefined) {
    const lat = Number(loc.lat);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('lat must be a number between -90 and 90');
    this.location.lat = lat;
  }
  if (loc.lng !== undefined) {
    const lng = Number(loc.lng);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('lng must be a number between -180 and 180');
    this.location.lng = lng;
  }
  if (loc.address !== undefined) this.location.address = String(loc.address).trim();
  if (opts && opts.session) await this.save({ session: opts.session });
  else await this.save();
  return this;
};

/**
 * Soft delete this config
 * @param {String|null} deletedBy
 * @param {Object} opts
 */
ConfigSchema.methods.softDelete = async function softDelete(deletedBy = null, opts = {}) {
  if (!this.deleted) {
    this.deleted = true;
    if (deletedBy) {
      this.metadata = this.metadata || new Map();
      this.metadata.set('deletedBy', deletedBy);
    }
    if (opts && opts.session) await this.save({ session: opts.session });
    else await this.save();
  }
  return this;
};

/* Static helpers */

/**
 * Find config by userId (non-deleted by default)
 * @param {String|ObjectId} userId
 * @param {Object} opts
 */
ConfigSchema.statics.findByUserId = function findByUserId(userId, opts = {}) {
  if (!userId) throw new Error('userId is required');
  const includeDeleted = !!(opts && opts.includeDeleted);
  const query = { userId: userId };
  if (!includeDeleted) query.deleted = false;
  return this.findOne(query, null, opts);
};

/**
 * Upsert config for a user
 * @param {String|ObjectId} userId
 * @param {Object} payload
 * @param {Object} opts
 */
ConfigSchema.statics.upsertForUser = function upsertForUser(userId, payload = {}, opts = {}) {
  if (!userId) throw new Error('userId is required');
  const update = { $set: payload };
  const options = { new: true, upsert: true, setDefaultsOnInsert: true };
  if (opts && opts.session) options.session = opts.session;
  return this.findOneAndUpdate({ userId }, update, options).exec();
};

/* Virtuals */

/**
 * Public summary of config
 */
ConfigSchema.virtual('summary').get(function summary() {
  return {
    userId: this.userId,
    theme: this.theme,
    isPrivate: this.isPrivate,
    ops_region: this.ops_region
  };
});

// ConfigSchema.plugin(require('./castLegacyIds'))

/* Export model safely to avoid recompilation duplicate-index warnings in dev/hot-reload */
module.exports = mongoose.models.Config || mongoose.model('Config', ConfigSchema);
