// src/models/message.model.js
/**
 * Message Mongoose model
 *
 * Fields:
 * - avatar: ObjectId (S3 file reference)
 * - type: enum: issue_wall | email | notification | order | review
 * - recipients: { all: Boolean, users: [ObjectId] }
 * - fromUserId: ObjectId (optional)
 * - subject: String
 * - details: String
 * - attachments: [ObjectId] (S3 file refs)
 * - ops_region: String
 * - status: enum: draft | submitted | deleted | read | unread
 * - replyTo: ObjectId (optional)
 * - metadata: Map<string, mixed>
 * - createdAt, updatedAt: timestamps
 *
 * Includes:
 * - validation and sensible defaults
 * - instance helpers for common operations
 * - toPublicJSON sanitizer
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const { generateDefaultIdStr } = require('./generateDefaultIdStr');

const TYPE_ENUM = ['issue_wall', 'email', 'notification', 'order', 'review', 'system'];
const STATUS_ENUM = ['draft', 'submitted', 'read', 'unread'];

const RecipientsSchema = new Schema(
  {
    all: { type: Boolean, default: false },
    users: [{ type: Schema.Types.ObjectId, ref: 'User' }]
  },
  { _id: false }
);

const MessageSchema = new Schema(
  {
    _id: { type: String, required: true, trim: true }, // only for testing
    avatar: { type: Schema.Types.ObjectId, ref: 'S3File', default: null },
    type: { type: String, enum: TYPE_ENUM, required: true, index: true },
    recipients: { type: RecipientsSchema, default: () => ({ all: false, users: [] }) },
    fromUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    subject: { type: String, trim: true, default: '' },
    details: { type: String, trim: true, default: '' },
    attachments: [{ type: Schema.Types.ObjectId, ref: 'S3File' }],
    ops_region: { type: String, trim: true, index: true, default: '' },
    status: { type: String, enum: STATUS_ENUM, default: 'draft', index: true },
    replyTo: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
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

/* Transform function used by toJSON to remove internal fields */
function docToJSON(doc, ret) {
  delete ret.internalNotes;
  delete ret.deleted;
  // remove empty maps for cleanliness
  if (ret.metadata && Object.keys(ret.metadata).length === 0) delete ret.metadata;
  return ret;
}

/* Indexes */
MessageSchema.index({ type: 1, status: 1, createdAt: -1 });
MessageSchema.index({ 'recipients.users': 1 });
MessageSchema.index({ fromUserId: 1 });


MessageSchema.pre('validate', async function () {
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
 * Return sanitized public representation
 */
MessageSchema.methods.toPublicJSON = function toPublicJSON() {
  const obj = this.toJSON();
  // ensure no internal metadata leaks
  if (obj.metadata && obj.metadata._internal) delete obj.metadata._internal;
  return obj;
};

/**
 * Mark message as read
 * @param {Object} opts - { session }
 */
MessageSchema.methods.markRead = async function markRead(opts = {}) {
  if (this.status !== 'read') {
    this.status = 'read';
    await this.save(opts);
  }
  return this;
};

/**
 * Mark message as unread
 */
MessageSchema.methods.markUnread = async function markUnread(opts = {}) {
  if (this.status !== 'unread') {
    this.status = 'unread';
    await this.save(opts);
  }
  return this;
};

/**
 * Soft delete message
 */
MessageSchema.methods.markDeleted = async function markDeleted(opts = {}) {
  if (!this.deleted) {
    this.deleted = true;
    this.status = 'deleted';
    await this.save(opts);
  }
  return this;
};

/**
 * Add an attachment (push)
 * @param {ObjectId} fileId
 */
MessageSchema.methods.addAttachment = async function addAttachment(fileId, opts = {}) {
  if (!fileId) throw new Error('fileId is required');
  this.attachments = this.attachments || [];
  this.attachments.push(fileId);
  await this.save(opts);
  return this;
};

/**
 * Remove an attachment by id
 * @param {ObjectId} fileId
 */
MessageSchema.methods.removeAttachment = async function removeAttachment(fileId, opts = {}) {
  if (!fileId) throw new Error('fileId is required');
  this.attachments = (this.attachments || []).filter((a) => String(a) !== String(fileId));
  await this.save(opts);
  return this;
};

/**
 * Add recipient user
 * @param {ObjectId} userId
 */
MessageSchema.methods.addRecipient = async function addRecipient(userId, opts = {}) {
  if (!userId) throw new Error('userId is required');
  this.recipients = this.recipients || { all: false, users: [] };
  const exists = (this.recipients.users || []).some((u) => String(u) === String(userId));
  if (!exists) {
    this.recipients.users.push(userId);
    await this.save(opts);
  }
  return this;
};

/**
 * Remove recipient user
 * @param {ObjectId} userId
 */
MessageSchema.methods.removeRecipient = async function removeRecipient(userId, opts = {}) {
  if (!userId) throw new Error('userId is required');
  this.recipients.users = (this.recipients.users || []).filter((u) => String(u) !== String(userId));
  await this.save(opts);
  return this;
};

/* Static helpers */

/**
 * Find active (non-deleted) message by id
 */
MessageSchema.statics.findActiveById = function findActiveById(id, opts = {}) {
  const query = { _id: id, deleted: false };
  return this.findOne(query, null, opts);
};

/**
 * Soft delete by id
 */
MessageSchema.statics.softDeleteById = function softDeleteById(id, deletedBy = null, opts = {}) {
  const update = { deleted: true, status: 'deleted' };
  if (deletedBy) update['metadata.deletedBy'] = deletedBy;
  return this.findByIdAndUpdate(id, update, { new: true, ...opts });
};

// MessageSchema.plugin(require('./castLegacyIds'));

module.exports = mongoose.model('Message', MessageSchema);
