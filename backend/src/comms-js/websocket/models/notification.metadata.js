// src/comms-js/models/notification.meta.js
// Helpers for working with notification metadata stored under Message.metadata.notification
// - Does NOT modify the Message model; stores everything nested under metadata.notification
// - intendedFor === 'user' uses a plural `targetUserIds` array (required for user-targeted messages)
// - Creates one Message per target user to keep per-user seq atomic (but stores metadata.notification.targetUserIds as an array)
// - Provides atomic per-user seq generation, builders, create helper (uses existing Message model), queries, and delivery bookkeeping

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const createError = require('http-errors');

const Message = require('../../../models/message.model'); // existing Message model (unchanged)

// Counter collection for per-user sequence numbers (atomic increments)
const CounterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 }
}, { collection: 'message_notification_counters', versionKey: false });

const Counter = mongoose.models.MessageNotificationCounter || mongoose.model('MessageNotificationCounter', CounterSchema);

/**
 * getNextSeqForUser(userId)
 * - Atomically increments and returns the next sequence number for a user.
 */
async function getNextSeqForUser(userId) {
  if (!userId) throw createError(400, 'userId required for seq generation');
  const key = `user:${String(userId)}`;
  const res = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean().exec();
  return res.seq;
}

/**
 * buildNotificationMeta(opts)
 * - Returns a plain object suitable for storing at Message.metadata.notification
 *
 * opts:
 *  - intendedFor: 'user'|'region'|'role'|'all' (default 'user')
 *  - targetUserIds: Array<ObjectId> (for user-targeted messages)
 *  - region: string|null
 *  - role: string|null
 *  - seq: number (per-user seq)
 *  - payload: object
 *  - expiresAt: Date|null
 */
function buildNotificationMeta(opts = {}) {
  const {
    intendedFor = 'user',
    targetUserIds = [],
    region = null,
    role = null,
    seq = 0,
    payload = {},
    expiresAt = null,
    id = uuidv4()
  } = opts;

  return {
    id,
    intendedFor,
    // plural list of target user ids (may be single-element)
    targetUserIds: Array.isArray(targetUserIds) ? targetUserIds.map(String) : [],
    region: region || null,
    role: role || null,
    seq: Number(seq || 0),
    payload: payload || {},
    expiresAt: expiresAt || null,
    deliveredTo: []
  };
}

/**
 * createNotificationMessage(opts)
 * - Creates one Message per target user when intendedFor === 'user' and targetUserIds provided.
 * - For region/role/all creates a single Message (seq remains 0).
 *
 * opts:
 *  - intendedFor: 'user'|'region'|'role'|'all'
 *  - targetUserIds: Array<ObjectId> (required for intendedFor === 'user')
 *  - region, role, payload, subject, details, fromUserId, expiresAt
 *  - autoSeq: boolean (if true and intendedFor==='user' will obtain per-user seq)
 *
 * Returns: created Message doc if single target, or array of created Message docs if multiple targets, or single doc for broadcasts.
 */
async function createNotificationMessage(opts = {}) {
  const {
    intendedFor = 'user',
    targetUserIds = null, // plural only (required for user-targeted)
    region = null,
    role = null,
    payload = {},
    subject = '',
    details = '',
    fromUserId = null,
    expiresAt = null,
    autoSeq = true
  } = opts;

  const allowed = ['user', 'region', 'role', 'all'];
  if (!allowed.includes(intendedFor)) throw createError(400, 'invalid intendedFor');

  // USER-TARGETED: require plural array
  if (intendedFor === 'user') {
    if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) {
      throw createError(400, 'targetUserIds (array) required for intendedFor=user');
    }

    // Create one Message per recipient so each message gets its own per-user seq.
    const creates = await Promise.all(targetUserIds.map(async (t) => {
      const userId = mongoose.Types.ObjectId(t);
      const seq = autoSeq ? await getNextSeqForUser(userId) : 0;

      const meta = buildNotificationMeta({
        intendedFor: 'user',
        targetUserIds: [userId],
        region,
        role,
        seq,
        payload,
        expiresAt
      });

      const msg = {
        type: 'notification',
        recipients: { all: false, users: [userId] },
        fromUserId: fromUserId || null,
        subject: subject || '',
        details: details || '',
        metadata: { notification: meta },
        status: 'submitted',
        ops_region: region || ''
      };

      return Message.create(msg);
    }));

    return creates.length === 1 ? creates[0] : creates;
  }

  // BROADCAST (region/role/all): single message, seq = 0
  const meta = buildNotificationMeta({
    intendedFor,
    targetUserIds: [],
    region,
    role,
    seq: 0,
    payload,
    expiresAt
  });

  const msg = {
    type: 'notification',
    recipients: { all: intendedFor === 'all', users: [] },
    fromUserId: fromUserId || null,
    subject: subject || '',
    details: details || '',
    metadata: { notification: meta },
    status: 'submitted',
    ops_region: region || ''
  };

  return Message.create(msg);
}

/**
 * findMissedForUser(userId, sinceSeq = 0, limit = 200)
 * - Query messages where metadata.notification.targetUserIds contains userId and seq > sinceSeq
 * - Returns array of message documents (lean)
 */
async function findMissedForUser(userId, sinceSeq = 0, limit = 200) {
  if (!userId) throw createError(400, 'userId required');
  const q = {
    type: 'notification',
    'metadata.notification.intendedFor': 'user',
    'metadata.notification.targetUserIds': mongoose.Types.ObjectId(userId),
    'metadata.notification.seq': { $gt: Number(sinceSeq || 0) }
  };
  const docs = await Message.find(q)
    .sort({ 'metadata.notification.seq': 1 })
    .limit(Math.min(limit || 200, 1000))
    .lean()
    .exec();
  return docs;
}

/**
 * recordDelivery(messageId, socketId)
 * - Best-effort: appends a delivery record into metadata.notification.deliveredTo
 */
function recordDelivery(messageId, socketId) {
  if (!messageId || !socketId) return Promise.reject(createError(400, 'messageId and socketId required'));
  return Message.findByIdAndUpdate(
    messageId,
    { $push: { 'metadata.notification.deliveredTo': { socketId: String(socketId), deliveredAt: new Date() } } },
    { new: false }
  ).exec();
}

/**
 * buildNotificationForEmit(messageDoc)
 * - Extracts the notification payload to send over socket from a Message document or metadata object
 */
function buildNotificationForEmit(messageDocOrMeta) {
  if (!messageDocOrMeta) return null;
  const meta = messageDocOrMeta.metadata && messageDocOrMeta.metadata.notification
    ? messageDocOrMeta.metadata.notification
    : messageDocOrMeta;
  if (!meta) return null;
  return {
    id: meta.id,
    seq: Number(meta.seq || 0),
    intendedFor: meta.intendedFor || 'user',
    targetUserIds: Array.isArray(meta.targetUserIds) ? meta.targetUserIds.map(String) : [],
    region: meta.region || null,
    role: meta.role || null,
    payload: meta.payload || {},
    expiresAt: meta.expiresAt || null
  };
}

module.exports = {
  getNextSeqForUser,
  buildNotificationMeta,
  createNotificationMessage,
  findMissedForUser,
  recordDelivery,
  buildNotificationForEmit
};
