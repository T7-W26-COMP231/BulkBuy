// src/comms-js/controllers/notifications.controller.js
// Extended: create notification(s) and admin broadcast endpoints.
// - POST /api/comms/create  -> create notification(s) (authenticated)
// - POST /api/comms/broadcast -> admin-only global broadcast (rate-limited)

const createError = require('http-errors');
const UserCursor = require('../models/usercursor.metadata');
const notificationMeta = require('../models/notification.metadata');
const notificationService = require('../services/notification.service');
const logger = require('pino')({ level: process.env.LOG_LEVEL || 'info' });

/**
 * GET /api/comms/missed
 */
async function getMissedNotifications(req, res, next) {
  try {
    const user = req.user;
    if (!user || !user._id) return next(createError(401, 'Unauthorized'));

    const sinceSeq = Number(req.query.sinceSeq || 0);
    const limit = Math.min(Number(req.query.limit || 200), 1000);

    const items = await notificationMeta.findMissedForUser(user._id, sinceSeq, limit);
    const nextSeq = items.length ? items[items.length - 1].metadata.notification.seq : sinceSeq;
    return res.json({ items, nextSeq });
  } catch (err) {
    logger.warn({ err: err && err.message }, 'getMissedNotifications failed');
    return next(err);
  }
}

/**
 * POST /api/comms/ack
 * Body: { seq: Number }
 *
 * Advances the per-user cursor stored in Config.metadata.notificationCursor (via UserCursor helper).
 */
async function ackNotifications(req, res, next) {
  try {
    const user = req.user;
    if (!user || !user._id) return next(createError(401, 'Unauthorized'));

    const seq = Number(req.body.seq);
    if (!Number.isFinite(seq) || seq < 0) return next(createError(400, 'seq is required and must be a non-negative number'));

    // advanceCursor updates Config.metadata.notificationCursor using $max to avoid regressions
    const updatedCursor = await UserCursor.advanceCursor(user._id, seq, { source: 'rest' });

    const lastSeq = updatedCursor && typeof updatedCursor.lastSeq === 'number' ? updatedCursor.lastSeq : seq;
    return res.json({ ok: true, lastSeq });
  } catch (err) {
    logger.warn({ err: err && err.message }, 'ackNotifications failed');
    return next(err);
  }
}

/**
 * POST /api/comms/create
 * Body (JSON):
 *  - intendedFor: 'user'|'region'|'role'|'all'   (default 'user')
 *  - targetUserIds: [ObjectId]                   (required for intendedFor === 'user')
 *  - region, role, payload, subject, details, fromUserId, expiresAt
 *
 * Creates notification message(s) and attempts immediate delivery (best-effort).
 * Auth required.
 */
async function createNotification(req, res, next) {
  try {
    const user = req.user;
    if (!user || !user._id) return next(createError(401, 'Unauthorized'));

    const body = req.body || {};
    const intendedFor = body.intendedFor || 'user';

    // Basic validation
    if (intendedFor === 'user') {
      if (!Array.isArray(body.targetUserIds) || body.targetUserIds.length === 0) {
        return next(createError(400, 'targetUserIds (array) required for intendedFor=user'));
      }
    }

    // Build opts for helper
    const opts = {
      intendedFor,
      targetUserIds: body.targetUserIds || null,
      region: body.region || null,
      role: body.role || null,
      payload: body.payload || {},
      subject: body.subject || '',
      details: body.details || '',
      fromUserId: body.fromUserId || user._id,
      expiresAt: body.expiresAt || null,
      autoSeq: body.autoSeq !== false // default true
    };

    // Create and push (best-effort emit)
    const created = await notificationService.createAndPushNotifications(opts);

    return res.status(201).json({ ok: true, created });
  } catch (err) {
    logger.warn({ err: err && err.message }, 'createNotification failed');
    return next(err);
  }
}

/**
 * POST /api/comms/broadcast
 * Body (JSON):
 *  - event: string (optional, default 'notification')
 *  - payload: object
 *  - region: string (optional) -> if provided, treated as region broadcast
 *  - role: string (optional) -> if provided, treated as role broadcast
 *
 * Admin-only endpoint. Rate-limit this route in middleware.
 */
async function broadcastAll(req, res, next) {
  try {
    // requireRole middleware should have validated admin; double-check
    const user = req.user;
    if (!user || !user._id) return next(createError(401, 'Unauthorized'));
    if (!user.roles || !user.roles.includes('administrator')) return next(createError(403, 'Forbidden'));

    const { event = 'notification', payload = {}, region = null, role = null } = req.body || {};

    // If region or role provided, create a region/role notification and emit to that scope
    if (region || role) {
      const intendedFor = region ? 'region' : 'role';
      const opts = {
        intendedFor,
        targetUserIds: null,
        region: region || null,
        role: role || null,
        payload,
        subject: `Broadcast ${intendedFor}`,
        details: '',
        fromUserId: user._id,
        autoSeq: false
      };
      const created = await notificationMeta.createNotificationMessage(opts);
      // emit via handlers
      const handlers = require('../websocket/socketHandlers');
      if (intendedFor === 'region') handlers.emitToRegion(region, event, notificationMeta.buildNotificationForEmit(created));
      else {
        // role room convention
        const rooms = require('../websocket/rooms');
        const roomName = rooms.roleRoom(role);
        handlers.emitToRegion(roomName, event, notificationMeta.buildNotificationForEmit(created));
      }
      return res.json({ ok: true, scope: intendedFor, created });
    }

    // Global broadcast: use socketHandlers.emitToAll
    const handlers = require('../websocket/socketHandlers');
    handlers.emitToAll(event, payload);

    // Optionally persist a Message for audit (create a single 'all' notification)
    try {
      await notificationMeta.createNotificationMessage({
        intendedFor: 'all',
        payload,
        subject: 'Global broadcast',
        details: '',
        fromUserId: user._id,
        autoSeq: false
      });
    } catch (e) {
      logger.debug({ err: e && e.message }, 'broadcast: failed to persist audit message (non-fatal)');
    }

    return res.json({ ok: true, broadcast: true });
  } catch (err) {
    logger.warn({ err: err && err.message }, 'broadcastAll failed');
    return next(err);
  }
}

module.exports = {
  getMissedNotifications,
  ackNotifications,
  createNotification,
  broadcastAll
};
