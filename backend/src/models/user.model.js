// src/models/user.model.js
//
// Mongoose model for application users.
// - Stores epoch ms timestamps.
// - Includes password hashing (bcrypt), auth helpers, soft/hard delete helpers,
//   safe public projection, and search utilities.

const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const { Schema } = mongoose;

/* -------------------------
 * Sub-schemas
 * ------------------------- */

const EmailSchema = new Schema({
  address: { type: String, required: true, lowercase: true, trim: true },
  verified: { type: Boolean, default: false },
  primary: { type: Boolean, default: false },
  verifiedAt: { type: Number, default: null } // epoch ms
}, { _id: false });

const PhoneSchema = new Schema({
  number: { type: String, required: true, trim: true },
  type: { type: String, enum: ['mobile', 'home', 'work', 'other'], default: 'mobile' },
  verified: { type: Boolean, default: false },
  verifiedAt: { type: Number, default: null } // epoch ms
}, { _id: false });

const AddressSchema = new Schema({
  label: { type: String, trim: true },
  line1: { type: String, trim: true },
  line2: { type: String, trim: true },
  city: { type: String, trim: true },
  region: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  country: { type: String, trim: true }
}, { _id: false });

const PaymentMethodSchema = new Schema({
  type: { type: String, required: true },
  detailsRef: { type: Schema.Types.ObjectId, ref: 'PaymentVault' },
  last4: { type: String, trim: true },
  provider: { type: String, trim: true },
  tokenRef: { type: String, trim: true },
  expiry: { type: String, trim: true },
  isDefault: { type: Boolean, default: false }
}, { _id: false });

/* -------------------------
 * Helper: generate a 16-digit userId (timestamp + random)
 * ------------------------- */
function generateUserId() {
  const ts = Date.now().toString().slice(-8); // last 8 digits of epoch ms
  const rand = Math.floor(Math.random() * 1e8).toString().padStart(8, '0');
  return `${ts}${rand}`;
}

/* -------------------------
 * User schema
 * ------------------------- */
const UserSchema = new Schema({
  userId: { type: String, unique: true, index: true }, // 16-digit human-friendly id

  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },

  // authentication
  passwordHash: { type: String, select: false, default: null },

  // role and lifecycle status
  role: { type: String, enum: ['customer', 'administrator', 'supplier'], default: 'customer' },
  status: { type: String, enum: ['active', 'inactive', 'deleted', 'suspended', 'member'], default: 'active' },

  // contact collections
  emails: { type: [EmailSchema], default: [] },
  phones: { type: [PhoneSchema], default: [] },
  addresses: { type: [AddressSchema], default: [] },

  // references and methods
  config: { type: Schema.Types.ObjectId, ref: 'Config' },
  paymentMethods: { type: [PaymentMethodSchema], default: [] },

  avatar: { type: Schema.Types.ObjectId, ref: 'S3file' },

  // soft-delete metadata (epoch ms)
  deleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Number, default: null },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

  // tokens, relations, metadata
  refreshTokens: [{ tokenHash: String, createdAt: Number }],
  reviews: [{ type: Schema.Types.ObjectId, ref: 'Review' }],
  metadata: { type: Map, of: Schema.Types.Mixed, default: {} },

  // audit timestamps as epoch ms
  createdAt: { type: Number, default: () => Date.now() },
  updatedAt: { type: Number, default: () => Date.now() }
}, {
  toJSON: { virtuals: true, versionKey: false },
  toObject: { virtuals: true, versionKey: false }
});

/* -------------------------
 * Virtuals
 * ------------------------- */
UserSchema.virtual('fullName').get(function () {
  const fn = this.firstName || '';
  const ln = this.lastName || '';
  return `${fn}${fn && ln ? ' ' : ''}${ln}`.trim();
});

/* -------------------------
 * Indexes
 * ------------------------- */
// Partial unique index on emails.address to allow users without emails
UserSchema.index(
  { 'emails.address': 1 },
  { unique: true, partialFilterExpression: { 'emails.address': { $exists: true, $ne: '' } } }
);

/* -------------------------
 * Pre-save hook
 * - Ensure userId exists
 * - Maintain epoch-based createdAt/updatedAt
 * - Hash passwordHash if it appears to be a plain password
 * ------------------------- */
UserSchema.pre('save', async function () {
  const now = Date.now();
  if (!this.userId) {
    this.userId = generateUserId();
  }
  if (!this.createdAt) {
    this.createdAt = now;
  }
  this.updatedAt = now;

  // Hash passwordHash if modified and not already a bcrypt hash
  if (this.isModified('passwordHash') && this.passwordHash) {
    const maybeHash = String(this.passwordHash || '');
    if (!maybeHash.startsWith('$2a$') && !maybeHash.startsWith('$2b$') && !maybeHash.startsWith('$2y$')) {
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
      try {
        this.passwordHash = await bcrypt.hash(maybeHash, saltRounds);
      } catch (err) {
        throw new Error(`User pre-save: password hashing failed: ${err.message}`);
      }
    }
  }
});

/* -------------------------
 * Statics / Helpers
 * ------------------------- */

/**
 * createWithUniqueUserId
 * - Attempts to create a document while retrying userId generation on duplicate key.
 */
UserSchema.statics.createWithUniqueUserId = async function (doc, maxAttempts = 5) {
  const Model = this;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!doc.userId) doc.userId = generateUserId();
    try {
      const created = await Model.create(doc);
      return created.toObject ? created.toObject() : created;
    } catch (err) {
      if (err && err.code === 11000 && /userId/.test(err.message)) {
        doc.userId = null;
        continue;
      }
      throw err;
    }
  }
  throw new Error('Failed to generate unique userId after multiple attempts');
};

/**
 * findByEmail
 * - Convenience static to find a user by email address (case-insensitive).
 * - Excludes soft-deleted users by default; pass { includeDeleted: true } to include them.
 */
UserSchema.statics.findByEmail = function (email, opts = {}) {
  if (!email) return Promise.resolve(null);
  const includeDeleted = !!opts.includeDeleted;
  const filter = { 'emails.address': String(email).toLowerCase().trim() };
  if (!includeDeleted) filter.deleted = false;
  const q = this.findOne(filter);
  if (opts.select) q.select(opts.select);
  if (opts.populate) q.populate(opts.populate);
  return q.lean().exec();
};

/**
 * findByUserId
 * - Convenience static to find by human-friendly userId.
 */
UserSchema.statics.findByUserId = function (userId, opts = {}) {
  if (!userId) return Promise.resolve(null);
  const includeDeleted = !!opts.includeDeleted;
  const filter = { userId };
  if (!includeDeleted) filter.deleted = false;
  const q = this.findOne(filter);
  if (opts.select) q.select(opts.select);
  if (opts.populate) q.populate(opts.populate);
  return q.lean().exec();
};

/**
 * publicSearch
 * - Simple public search for providers (adjust role filter as needed).
 * - Returns { total, results } with lean docs.
 */
UserSchema.statics.publicSearch = async function (q = null, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const skip = Math.max(Number(opts.skip) || 0, 0);
  const sort = opts.sort || { updatedAt: -1 };
  const filters = opts.filters && typeof opts.filters === 'object' ? opts.filters : {};

  const baseQuery = Object.assign({}, filters, {
    status: 'active',
    deleted: false
  });

  let query;
  if (q && String(q).trim().length > 0) {
    query = Object.assign({}, baseQuery, { $text: { $search: String(q).trim() } });
  } else {
    query = baseQuery;
  }

  const projection = {
    passwordHash: 0,
    refreshTokens: 0,
    metadata: 0
  };

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

/**
 * softDeleteById / restoreById / hardDeleteById
 * - Soft delete marks deleted=true and sets deletedAt (epoch ms).
 * - hardDeleteById performs permanent removal (admin-only usage expected).
 */
UserSchema.statics.softDeleteById = async function (id, deletedBy = null) {
  if (!id) return null;
  const update = {
    deleted: true,
    deletedAt: Date.now(),
    deletedBy: deletedBy || null,
    status: 'deleted',
    updatedAt: Date.now()
  };
  return this.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean().exec();
};

UserSchema.statics.restoreById = async function (id) {
  if (!id) return null;
  const update = {
    deleted: false,
    deletedAt: null,
    deletedBy: null,
    status: 'active',
    updatedAt: Date.now()
  };
  return this.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean().exec();
};

UserSchema.statics.hardDeleteById = async function (id) {
  if (!id) return null;
  return this.findByIdAndDelete(id).lean().exec();
};

/* -------------------------
 * Query helpers
 * ------------------------- */
UserSchema.query.notDeleted = function () {
  return this.where({ deleted: false });
};

/* -------------------------
 * Instance methods
 * ------------------------- */

/**
 * comparePassword
 * - Compare a plain-text password with the stored bcrypt hash.
 * - Ensure the document includes passwordHash (use .select('+passwordHash')) when calling.
 */
UserSchema.methods.comparePassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

/**
 * toPublicJSON
 * - Safe projection for returning user profile data to clients.
 * - Excludes sensitive fields such as passwordHash and refreshTokens.
 */
UserSchema.methods.toPublicJSON = function () {
  return {
    _id: this._id,
    userId: this.userId,
    firstName: this.firstName,
    lastName: this.lastName,
    avatar: this.avatar,
    emails: this.emails,
    phones: this.phones,
    role: this.role,
    status: this.status,
    metadata: this.metadata,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

/**
 * softDelete (instance)
 */
UserSchema.methods.softDelete = async function (deletedBy = null) {
  this.deleted = true;
  this.deletedAt = Date.now();
  this.deletedBy = deletedBy || null;
  this.status = 'deleted';
  this.updatedAt = Date.now();
  await this.save();
  return this;
};

/* -------------------------
 * Text index for public search (optional)
 * ------------------------- */
UserSchema.index({
  firstName: 'text',
  lastName: 'text'
}, { name: 'UserTextIndex', default_language: 'english' });

/* -------------------------
 * Export model
 * ------------------------- */
module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
