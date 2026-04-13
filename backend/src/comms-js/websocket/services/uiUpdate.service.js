// src/comms-js/services/uiUpdate.service.js
const socketHandlers = require('../../websocket/socketHandlers');
const rooms = require('../../websocket/rooms');
const notificationMeta = require('../models/notification.metadata'); // optional audit
const logger = require('pino')({ level: process.env.LOG_LEVEL || 'info' });

/**
 * buildUiUpdatePayload
 * - action: string (e.g., 'refreshActivity')
 * - payload: object
 * - opts: { scope: 'user'|'region'|'role'|'all', targetUserIds, region, role, seq }
 */
function buildUiUpdatePayload(action, payload = {}, opts = {}) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const seq = opts.seq || null;
  return {
    id,
    type: 'ui:update',
    action,
    scope: opts.scope || 'all',
    target: {
      userIds: opts.targetUserIds || null,
      region: opts.region || null,
      role: opts.role || null
    },
    metadata: seq ? { notification: { seq } } : {},
    payload,
    createdAt: new Date().toISOString()
  };
}

/**
 * emitUiUpdate
 * - Emits ui:update according to scope.
 * - opts: { scope, targetUserIds, region, role, seq, persistAudit }
 */
async function emitUiUpdate(action, payload = {}, opts = {}) {
  try {
    const msg = buildUiUpdatePayload(action, payload, opts);

    switch (opts.scope) {
      case 'user':
        if (Array.isArray(opts.targetUserIds) && opts.targetUserIds.length) {
          await socketHandlers.emitToUsers(opts.targetUserIds, 'ui:update', msg);
        }
        break;
      case 'region':
        if (opts.region) {
          socketHandlers.emitToRegion(opts.region, 'ui:update', msg);
        }
        break;
      case 'role':
        if (opts.role) {
          const room = rooms.roleRoom(opts.role);
          // emitToRegion accepts a room name; reuse for role-room emits
          socketHandlers.emitToRegion(room, 'ui:update', msg);
        }
        break;
      default:
        socketHandlers.emitToAll('ui:update', msg);
    }

    // optional: persist audit message for traceability
    if (opts.persistAudit && typeof notificationMeta.createNotificationMessage === 'function') {
      try {
        await notificationMeta.createNotificationMessage({
          intendedFor: opts.scope || 'all',
          payload: msg.payload,
          subject: `UI update ${action}`,
          details: JSON.stringify({ action, scope: opts.scope }),
          fromUserId: opts.fromUserId || null,
          autoSeq: !!opts.seq
        });
      } catch (e) {
        logger.debug({ err: e && e.message }, 'uiUpdate: audit persist failed (non-fatal)');
      }
    }

    return { ok: true, msgId: msg.id };
  } catch (err) {
    logger.warn({ err: err && err.message }, 'emitUiUpdate failed');
    return { ok: false, error: err && err.message };
  }
}

module.exports = { emitUiUpdate, buildUiUpdatePayload };
