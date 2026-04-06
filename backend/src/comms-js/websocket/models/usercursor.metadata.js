// src/models/usercursor.metadata.js
// Helpers for storing a per-user notification cursor inside Config.metadata.notificationCursor
// - No separate collection; uses Config model's metadata map
// - Atomic advanceCursor uses $max to ensure monotonic lastSeq
// - Lightweight API: getCursor, getLastSeq, advanceCursor, resetCursor

const mongoose = require('mongoose');
const Config = require('../../../models/config.model'); // canonical Config model

/**
 * Path used inside Config.metadata
 */
const CURSOR_PATH = 'metadata.notificationCursor';

/**
 * getCursor(userId)
 * - Returns the embedded cursor object or null if none exists.
 * - Cursor shape: { lastSeq: Number, updatedAt: Date, source: String, meta: Mixed }
 */
async function getCursor(userId) {
  if (!userId) return null;
  const cfg = await Config.findOne({ userId: mongoose.Types.ObjectId(userId) })
    .select(CURSOR_PATH)
    .lean()
    .exec();
  return cfg && cfg.metadata && cfg.metadata.notificationCursor ? cfg.metadata.notificationCursor : null;
}

/**
 * getLastSeq(userId)
 * - Convenience: returns numeric lastSeq (0 if not present)
 */
async function getLastSeq(userId) {
  const cursor = await getCursor(userId);
  return cursor && typeof cursor.lastSeq === 'number' ? cursor.lastSeq : 0;
}

/**
 * advanceCursor(userId, seq, opts)
 * - Atomically sets lastSeq = max(current, seq) and updates updatedAt and optional source/meta.
 * - Returns the updated cursor object (as stored in Config.metadata.notificationCursor).
 *
 * opts:
 *  - source: string (e.g., 'socket'|'rest'|'job')
 *  - meta: object (optional extra metadata)
 */
async function advanceCursor(userId, seq, opts = {}) {
  if (!userId) throw new Error('userId required');
  const nSeq = Number(seq || 0);
  if (!Number.isFinite(nSeq) || nSeq < 0) throw new Error('seq must be a non-negative number');

  const setObj = {
    [`${CURSOR_PATH}.updatedAt`]: new Date()
  };
  if (opts.source) setObj[`${CURSOR_PATH}.source`] = String(opts.source);
  if (opts.meta) setObj[`${CURSOR_PATH}.meta`] = opts.meta;

  // Use $max to ensure monotonicity and $setOnInsert to initialize structure if missing
  const update = {
    $max: { [`${CURSOR_PATH}.lastSeq`]: nSeq },
    $set: setObj,
    $setOnInsert: { [`${CURSOR_PATH}.lastSeq`]: nSeq, [`${CURSOR_PATH}.createdAt`]: new Date() }
  };

  const options = { new: true, upsert: true, setDefaultsOnInsert: true };
  const doc = await Config.findOneAndUpdate(
    { userId: mongoose.Types.ObjectId(userId) },
    update,
    options
  ).select(CURSOR_PATH).lean().exec();

  return doc && doc.metadata ? doc.metadata.notificationCursor : null;
}

/**
 * resetCursor(userId)
 * - For admin/testing: resets lastSeq to 0 and updates updatedAt
 */
async function resetCursor(userId) {
  if (!userId) throw new Error('userId required');
  const update = {
    $set: {
      [`${CURSOR_PATH}.lastSeq`]: 0,
      [`${CURSOR_PATH}.updatedAt`]: new Date()
    }
  };
  const options = { new: true };
  const doc = await Config.findOneAndUpdate(
    { userId: mongoose.Types.ObjectId(userId) },
    update,
    options
  ).select(CURSOR_PATH).lean().exec();

  return doc && doc.metadata ? doc.metadata.notificationCursor : null;
}

module.exports = {
  getCursor,
  getLastSeq,
  advanceCursor,
  resetCursor
};
