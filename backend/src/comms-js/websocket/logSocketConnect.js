// src/comms-js/websocket/utils/logSocketConnect.js
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Only use pretty printing if we are NOT in production
  transport: process.env.NODE_ENV !== 'production' 
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          messageFormat: '{hostname} - {msg}',
          ignore: 'pid,time,level',
        },
      } 
    : undefined,
});

/**
 * shortId - produce a short, non-PII socket id for logs
 */
function shortId(fullId) {
  if (!fullId) return null;
  return String(fullId).slice(0, 10);
}

/**
 * safeRemoteAddr - sanitize remote address (strip port, mask last octet)
 */
function safeRemoteAddr(handshake) {
  try {
    const forwarded = handshake && (handshake.headers && (handshake.headers['x-forwarded-for'] || handshake.headers['x-forwarded']));
    const addr = forwarded || handshake && (handshake.address || handshake.address?.ip || handshake.address?.address);
    if (!addr) return null;
    const ip = String(addr).split(',')[0].trim().split(':')[0];
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = 'x';
      return parts.join('.');
    }
    return ip;
  } catch (e) {
    return null;
  }
}

/**
 * buildRoomsList - normalize rooms array for logging (shorten and filter)
 */
function buildRoomsList(socket) {
  try {
    if (!socket || !socket.rooms) return null;
    // socket.rooms is a Set in recent socket.io; convert to array and remove the socket id itself
    const arr = Array.from(socket.rooms || []);
    return arr.filter((r) => r && r !== socket.id).slice(0, 10);
  } catch (e) {
    return null;
  }
}

/**
 * logSocketConnect(ioSocket, opts)
 * - ioSocket: socket instance
 * - opts: { user, correlationId }
 */
function logSocketConnect(ioSocket, opts = {}) {
  const { user, correlationId } = opts;
  const authState = user && user._id ? 'authenticated' : (ioSocket.handshake && ioSocket.handshake.auth && ioSocket.handshake.auth.token ? 'invalid_token' : 'anonymous');

  const payload = {
    event: 'socket.connect',
    socketId: shortId(ioSocket.id),
    auth: authState,
    userId: user && user._id ? String(user._id) : null,
    roles: user && Array.isArray(user.roles) ? user.roles : null,
    ops_region: user && user.ops_region ? user.ops_region : null,
    rooms: buildRoomsList(ioSocket),
    remoteAddr: safeRemoteAddr(ioSocket.handshake),
    correlationId: correlationId || (ioSocket.handshake && (ioSocket.handshake.headers && (ioSocket.handshake.headers['x-correlation-id'] || ioSocket.handshake.query && ioSocket.handshake.query.correlationId))),
    msg: 'socket connected',
    serverTime: new Date().toISOString()
  };
  const {event, socketId, auth, userId, roles, ops_region, rooms, msg, serverTime } = payload
  logger.info(`[ socket 🟢 ] Authenticated ---|> user : ${user.userId}, ops_region: ${ops_region || "N/A"}`)
}

module.exports = { logSocketConnect };
