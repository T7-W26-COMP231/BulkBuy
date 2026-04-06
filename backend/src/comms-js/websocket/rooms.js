// src/comms-js/websocket/rooms.js
// Room helpers for the comms subsystem
// - Canonical room name helpers: regionRoom, roleRoom
// - Per-socket join/leave helpers: joinRegionRoom, leaveRegionRoom, joinRoleRoom, leaveRoleRoom
// - Bulk helpers for user membership: joinRoomsForUser, leaveRoomsForUser
// - Minimal, defensive, and testable: no PII in logs, tolerant of missing data

const debug = require('debug')('comms:rooms');
const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

/**
 * Room naming conventions
 * - regionRoom('north') -> 'region:north'
 * - roleRoom('moderator') -> 'role:moderator'
 *
 * Keep names short and stable so they can be used across processes/adapters.
 */
function regionRoom(regionId) {
  if (!regionId) return null;
  return `region:${String(regionId)}`;
}

function roleRoom(roleName) {
  if (!roleName) return null;
  return `role:${String(roleName)}`;
}

/* -------------------------
 * Per-socket room operations
 * ------------------------- */

/**
 * joinRegionRoom(socket, regionId)
 * - Adds the socket to the canonical region room.
 */
async function joinRegionRoom(socket, regionId) {
  if (!socket || !regionId) return;
  const room = regionRoom(regionId);
  try {
    await socket.join(room);
    debug('socket joined region room', { sid: socket.id, room });
  } catch (err) {
    logger.warn({ err: err && err.message, sid: socket && socket.id, room }, 'joinRegionRoom failed');
  }
}

/**
 * leaveRegionRoom(socket, regionId)
 * - Removes the socket from the canonical region room.
 */
async function leaveRegionRoom(socket, regionId) {
  if (!socket || !regionId) return;
  const room = regionRoom(regionId);
  try {
    await socket.leave(room);
    debug('socket left region room', { sid: socket.id, room });
  } catch (err) {
    logger.warn({ err: err && err.message, sid: socket && socket.id, room }, 'leaveRegionRoom failed');
  }
}

/**
 * joinRoleRoom(socket, roleName)
 */
async function joinRoleRoom(socket, roleName) {
  if (!socket || !roleName) return;
  const room = roleRoom(roleName);
  try {
    await socket.join(room);
    debug('socket joined role room', { sid: socket.id, room });
  } catch (err) {
    logger.warn({ err: err && err.message, sid: socket && socket.id, room }, 'joinRoleRoom failed');
  }
}

/**
 * leaveRoleRoom(socket, roleName)
 */
async function leaveRoleRoom(socket, roleName) {
  if (!socket || !roleName) return;
  const room = roleRoom(roleName);
  try {
    await socket.leave(room);
    debug('socket left role room', { sid: socket.id, room });
  } catch (err) {
    logger.warn({ err: err && err.message, sid: socket && socket.id, room }, 'leaveRoleRoom failed');
  }
}

/* -------------------------
 * Bulk helpers for user membership
 * ------------------------- */

/**
 * joinRoomsForUser(socket, user)
 * - Adds socket to rooms derived from user object:
 *   - region(s): user.ops_region or user.regions (support both shapes)
 *   - roles: user.roles (array)
 *
 * Accepts flexible user shapes; does not mutate user.
 */
async function joinRoomsForUser(socket, user) {
  if (!socket || !user) return;
  try {
    // regions: support single ops_region or array user.regions
    const regions = [];
    if (user.ops_region) regions.push(user.ops_region);
    if (Array.isArray(user.regions)) regions.push(...user.regions);

    // join each region room
    await Promise.all(regions.filter(Boolean).map((r) => joinRegionRoom(socket, r)));

    // roles: join role rooms
    if (Array.isArray(user.roles)) {
      await Promise.all(user.roles.filter(Boolean).map((role) => joinRoleRoom(socket, role)));
    }

    debug('joined rooms for user', { sid: socket.id, userId: user._id ? String(user._id) : undefined });
  } catch (err) {
    logger.warn({ err: err && err.message, sid: socket && socket.id }, 'joinRoomsForUser failed (non-fatal)');
  }
}

/**
 * leaveRoomsForUser(socket, user)
 * - Removes socket from rooms derived from user object.
 */
async function leaveRoomsForUser(socket, user) {
  if (!socket || !user) return;
  try {
    const regions = [];
    if (user.ops_region) regions.push(user.ops_region);
    if (Array.isArray(user.regions)) regions.push(...user.regions);

    await Promise.all(regions.filter(Boolean).map((r) => leaveRegionRoom(socket, r)));

    if (Array.isArray(user.roles)) {
      await Promise.all(user.roles.filter(Boolean).map((role) => leaveRoleRoom(socket, role)));
    }

    debug('left rooms for user', { sid: socket.id, userId: user._id ? String(user._id) : undefined });
  } catch (err) {
    logger.warn({ err: err && err.message, sid: socket && socket.id }, 'leaveRoomsForUser failed (non-fatal)');
  }
}

/* -------------------------
 * Exports
 * ------------------------- */

module.exports = {
  regionRoom,
  roleRoom,
  joinRegionRoom,
  leaveRegionRoom,
  joinRoleRoom,
  leaveRoleRoom,
  joinRoomsForUser,
  leaveRoomsForUser
};
