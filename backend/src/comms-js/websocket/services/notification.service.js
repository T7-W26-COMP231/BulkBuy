// src/comms-js/services/notification.service.js
// High-level notification service
// - Creates notification messages (per-user or broadcast) using notification.meta
// - Emits notifications to connected sockets via socketService
// - Records delivery best-effort

const notificationMeta = require('../models/notification.metadata');
const socketService = require('../socketService');
const socketRegistry = require('../socketRegistry');
const logger = require('pino')({ level: process.env.LOG_LEVEL || 'info' });

/**
 * createAndPushNotifications(opts)
 * - Creates notification Message docs (one per user for intendedFor=user)
 * - Immediately attempts to emit to connected sockets
 *
 * opts:
 *  - intendedFor: 'user'|'region'|'role'|'all'
 *  - targetUserIds: Array<ObjectId> (for user-targeted)
 *  - region, role, payload, subject, details, fromUserId, expiresAt
 *
 * Returns created message doc(s)
 */
async function createAndPushNotifications(opts = {}) {
  const { intendedFor = 'user' } = opts;
  const api = socketService.initSocket ? null : null; // noop placeholder to satisfy linter

  // create message(s)
  const created = await notificationMeta.createNotificationMessage(opts);

  // normalize to array
  const createdArray = Array.isArray(created) ? created : [created];

  // attempt to emit each created message
  const io = socketService.initSocket ? null : null; // noop placeholder
  const runtime = socketService && socketService.registry ? socketService : null;
  const svc = (await import('../websocket/socketService').catch(() => null)) || null;

  // get runtime API (if socketService was initialized elsewhere, require and use its api)
  let runtimeApi = null;
  try {
    // require at runtime to avoid circular requires during boot
    const ss = require('../websocket/socketService');
    runtimeApi = ss && ss.initSocket ? null : (ss && ss.registry ? ss : null);
  } catch (e) {
    runtimeApi = null;
  }

  // Best-effort emit for each created message
  await Promise.all(createdArray.map(async (msg) => {
    try {
      const meta = msg.metadata && msg.metadata.notification ? msg.metadata.notification : null;
      if (!meta) return;

      if (meta.intendedFor === 'user' && Array.isArray(meta.targetUserIds) && meta.targetUserIds.length > 0) {
        // emit to each target user
        await Promise.all(meta.targetUserIds.map(async (uid) => {
          try {
            // resolve socket ids via registry
            const socketIds = await socketRegistry.getSocketIdsForUserId(uid);
            if (!socketIds || socketIds.length === 0) return;
            // emit to sockets
            socketIds.forEach((sid) => {
              try {
                const ioInstance = require('../websocket/socketService')._io || null;
                // prefer using socketService API if available
                const ss = require('../websocket/socketService');
                const api = ss && ss.initSocket ? null : (ss && ss.registry ? ss : null);
                // direct emit via global io if available
                const { io } = require('../websocket/socketService')._runtime || {};
                // safe emit: try socketRegistry -> io
                const s = (require('../websocket/socketService')._runtime && require('../websocket/socketService')._runtime.io)
                  ? require('../websocket/socketService')._runtime.io.sockets.sockets.get(sid)
                  : null;
                if (s && s.connected) {
                  s.emit('notification', notificationMeta.buildNotificationForEmit(msg));
                } else {
                  // fallback: if socketService exposes emitToSockets
                  try {
                    const handlers = require('../websocket/socketHandlers');
                    handlers.emitToSockets([sid], 'notification', notificationMeta.buildNotificationForEmit(msg));
                  } catch (e) {
                    // swallow
                  }
                }
                // record delivery best-effort
                notificationMeta.recordDelivery(msg._id, sid).catch((e) => logger.debug({ err: e && e.message }, 'recordDelivery failed'));
              } catch (e) {
                logger.debug({ err: e && e.message }, 'emit per-socket failed');
              }
            });
          } catch (e) {
            logger.debug({ err: e && e.message }, 'emit to user failed');
          }
        }));
      } else if (meta.intendedFor === 'region' && meta.region) {
        // region broadcast
        try {
          const handlers = require('../websocket/socketHandlers');
          handlers.emitToRegion(meta.region, 'notification', notificationMeta.buildNotificationForEmit(msg));
        } catch (e) {
          logger.debug({ err: e && e.message }, 'emitToRegion failed');
        }
      } else if (meta.intendedFor === 'role' && meta.role) {
        // role broadcast: use room naming convention from rooms module
        try {
          const rooms = require('../websocket/rooms');
          const roomName = rooms.roleRoom(meta.role);
          const handlers = require('../websocket/socketHandlers');
          handlers.emitToSockets([roomName], 'notification', notificationMeta.buildNotificationForEmit(msg));
        } catch (e) {
          logger.debug({ err: e && e.message }, 'emitToRole failed');
        }
      } else {
        // global broadcast
        try {
          const handlers = require('../websocket/socketHandlers');
          handlers.emitToAll('notification', notificationMeta.buildNotificationForEmit(msg));
        } catch (e) {
          logger.debug({ err: e && e.message }, 'emitToAll failed');
        }
      }
    } catch (err) {
      logger.warn({ err: err && err.message }, 'createAndPushNotifications: emit failed (non-fatal)');
    }
  }));

  return created;
}

module.exports = {
  createAndPushNotifications
};
