// src/comms-js/websocket/socketHandlers.js
// Socket event handlers and server-side emit helpers.
// - Attach connection handlers to a Socket.IO server instance
// - Map/unmap sockets, join rooms, and provide emit helpers for targeted and region broadcasts
// - Minimal, robust, and safe: no PII in logs, best-effort non-blocking operations

const socketRegistry = require('./socketRegistry');
const rooms = require('./rooms'); // expected helpers: regionRoom, roleRoom, joinRoomsForUser, leaveRoomsForUser
const debug = require('debug')('comms:socketHandlers');
const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// structured connect logger (non-PII)
const { logSocketConnect } = require('./logSocketConnect');

let ioInstance = null;

/* -------------------------
 * Registry adapters
 * ------------------------- */

async function resolveSocketIdsForUserIds(userIds = []) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  if (typeof socketRegistry.getSocketIdsForUserIds === 'function') {
    return socketRegistry.getSocketIdsForUserIds(userIds);
  }
  if (typeof socketRegistry.getSocketIdsForUserId === 'function') {
    const results = await Promise.all(userIds.map((u) => socketRegistry.getSocketIdsForUserId(u).catch(() => [])));
    return results.flat();
  }
  throw new Error('socketRegistry missing getSocketIdsForUserIds/getSocketIdsForUserId');
}

async function resolveSocketIdsForUserId(userId) {
  if (!userId) return [];
  if (typeof socketRegistry.getSocketIdsForUserId === 'function') {
    return socketRegistry.getSocketIdsForUserId(userId);
  }
  if (typeof socketRegistry.getSocketIdsForUserIds === 'function') {
    const arr = await socketRegistry.getSocketIdsForUserIds([userId]);
    return Array.isArray(arr) ? arr : [];
  }
  throw new Error('socketRegistry missing getSocketIdsForUserId/getSocketIdsForUserIds');
}

/* -------------------------
 * Attach handlers
 * ------------------------- */

function attachHandlers(io, opts={}) {
  if (!io) throw new Error('Socket.IO instance required');
  ioInstance = io;

  io.on('connection', (socket) => {
    onConnect(socket, opts).catch((err) => {
      logger.warn({ err: err && err.message }, 'socket onConnect error; disconnecting socket');
      try { socket.disconnect(true); } catch (e) { /* ignore */ }
    });
  });

  return {
    emitToSockets,
    emitToUsers,
    emitToRegion,
    emitToAll,
    disconnectUserSockets
  };
}

/* -------------------------
 * Per-socket lifecycle
 * ------------------------- */

async function onConnect(socket, opts={}) {
  const user = socket.user || null;
  debug('socket connected', socket.id);

  // Structured log for both anonymous and authenticated connections
  try {
    const correlationId = socket.handshake && socket.handshake.headers && (socket.handshake.headers['x-correlation-id'] || (socket.handshake.query && socket.handshake.query.correlationId));
    logSocketConnect(socket, { user, correlationId });
  } catch (e) {
    logger.debug({ err: e && e.message }, 'logSocketConnect failed (non-fatal)');
  }

  // === New: console log every connection (anonymous or authenticated) ===
  try {
    const userId = user && (user._id || user.userId) ? (user._id || user.userId) : 'anonymous';
    // server console output for quick visibility
    console.log(`[socket] connected -> socketId=[ ${socket.id} ], user=[ ${userId} ]`);
  } catch (e) {
    logger.debug({ err: e && e.message }, 'console.log on connect failed (non-fatal)');
  }

  // If authenticated, map and join rooms
  if (user) {
    try {
      if (typeof socketRegistry.mapSocketToUser === 'function') {
        await socketRegistry.mapSocketToUser(socket.id, String(user._id));
      } else {
        logger.debug('socketRegistry.mapSocketToUser not implemented; skipping mapping');
      }
    } catch (err) {
      logger.warn({ err: err && err.message }, 'mapSocketToUser failed (non-fatal)');
    }

    try {
      if (typeof rooms.joinRoomsForUser === 'function') {
        await rooms.joinRoomsForUser(socket, user);
      } else {
        logger.debug('rooms.joinRoomsForUser not implemented; skipping room join');
      }
    } catch (err) {
      logger.warn({ err: err && err.message }, 'joinRoomsForUser failed (non-fatal)');
    }
  }

  // Emit a safe connected ack (no PII)
  try {
    socket.emit('connected', { socketId: socket.id, serverTime: Date.now() });
  } catch (err) {
    logger.warn({ err: err && err.message }, 'failed to emit connected ack');
  }

  // Emit a minimal welcome message on connect (safe for anonymous and authenticated sockets)
  try {
    const welcome = {
      id: `welcome-${Date.now()}`,
      type: 'system',
      scope: user ? 'user' : 'public',
      payload: { message: user ? 'Welcome back' : 'Welcome', socketId: socket.id },
      createdAt: new Date().toISOString()
    };
    socket.emit('welcome', welcome);
  } catch (err) {
    logger.debug({ err: err && err.message }, 'failed to emit welcome on connect (non-fatal)');
  }

  // Attach common listeners and upgrade handlers
  setupCommonListeners(socket, opts);

  // Disconnect cleanup
  socket.on('disconnect', (reason) => {
    onDisconnect(socket, reason).catch((err) => {
      logger.warn({ err: err && err.message }, 'onDisconnect cleanup error');
    });
  });
}

/* -------------------------
 * Common listeners (lightweight)
 * ------------------------- */

function setupCommonListeners(socket, opts={}) {
  socket.on('ping', (payload, cb) => {
    if (cb && typeof cb === 'function') cb({ pong: true, ts: Date.now() });
  });

  socket.on('joinRegion', async (regionId, cb) => {
    try {
      if (!regionId) throw new Error('regionId required');
      if (typeof rooms.joinRegionRoom === 'function') {
        await rooms.joinRegionRoom(socket, regionId);
      } else {
        socket.join(rooms.regionRoom ? rooms.regionRoom(regionId) : `region:${regionId}`);
      }
      if (cb) cb({ ok: true });
    } catch (err) {
      logger.warn({ err: err && err.message }, 'joinRegion failed');
      if (cb) cb({ ok: false, error: err.message });
    }
  });

  socket.on('leaveRegion', async (regionId, cb) => {
    try {
      if (!regionId) throw new Error('regionId required');
      if (typeof rooms.leaveRegionRoom === 'function') {
        await rooms.leaveRegionRoom(socket, regionId);
      } else {
        socket.leave(rooms.regionRoom ? rooms.regionRoom(regionId) : `region:${regionId}`);
      }
      if (cb) cb({ ok: true });
    } catch (err) {
      logger.warn({ err: err && err.message }, 'leaveRegion failed');
      if (cb) cb({ ok: false, error: err.message });
    }
  });

  socket.on('ackNotification', async (ack, cb) => {
    // ack: { id, seq } - keep minimal here; persistence happens via REST ack endpoint or dedicated job
    debug('ackNotification', ack);
    if (cb) cb({ ok: true });
  });

  socket.on('clientEvent', (evt, cb) => {
    debug('clientEvent', evt && evt.type);
    if (cb) cb({ ok: true });
  });

  // -------------------------
  // identifyRegion: anonymous socket tells server its region
  // -------------------------
  socket.on('identifyRegion', async (payload = {}, cb) => {
    try {
      const region = payload && payload.region;
      if (!region) {
        if (cb) cb({ ok: false, error: 'region required' });
        return;
      }
      if (typeof rooms.joinRegionRoom === 'function') {
        await rooms.joinRegionRoom(socket, region);
      } else {
        socket.join(rooms.regionRoom ? rooms.regionRoom(region) : `region:${region}`);
      }
      // store announced region on socket (non-persistent)
      socket._announcedRegion = region;
      if (cb) cb({ ok: true });
    } catch (err) {
      logger.warn({ err: err && err.message }, 'identifyRegion failed');
      if (cb) cb({ ok: false, error: err.message });
    }
  });

  // -------------------------
  // identifyUser: upgrade anonymous socket to authenticated user after login
  // - payload: { token } preferred; fallback { userId } only if you trust client
  // - server must implement socketAuthValidateToken(token) to validate tokens
  // -------------------------
  socket.on('identifyUser', async (payload = {}, cb) => {
    try {
      const { token, userId } = payload;
      try {
        if (opts && opts.initSocketAuth && typeof opts.initSocketAuth === 'function') {
          opts.authApi = opts.initSocketAuth(opts.io, {...opts.initsocketAuthOpts, accessToken : token});
        };
      } catch (error) {
        console.log('\nsocket identifyUser error | ', error, "\n");
      }

      // Resolve user: prefer token validation
      let resolvedUser = null;
      if (token && typeof socketAuthValidateToken === 'function') {
        resolvedUser = await socketAuthValidateToken(token);
      } else if (userId) {
        // fallback only when token validation is not available; less secure
        resolvedUser = { _id: userId };
      }

      if (!resolvedUser || !resolvedUser._id) {
        if (cb) cb({ ok: false, error: 'invalid credentials' });
        return;
      }

      // Unmap any previous mapping for this socket (safe, idempotent)
      try {
        if (typeof socketRegistry.unmapSocket === 'function') {
          await socketRegistry.unmapSocket(socket.id).catch(() => {});
        }
      } catch (e) {
        logger.debug({ err: e && e.message }, 'identifyUser: unmapSocket non-fatal');
      }

      // Map socket -> user id
      if (typeof socketRegistry.mapSocketToUser === 'function') {
        await socketRegistry.mapSocketToUser(socket.id, String(resolvedUser._id));
      }

      // Attach user to socket for subsequent handlers
      socket.user = resolvedUser;
      // === New: console log when a socket is upgraded/identified ===
      try {
        console.log(`\n[ socket 🟢 ] identified -> socketId=[ ${socket.id} ] user=[ ${String(resolvedUser._id)} ]\n`);
      } catch (e) {
        logger.debug({ err: e && e.message }, 'console.log on identifyUser failed (non-fatal)');
      }

      // Join rooms for the user (region/roles)
      try {
        if (typeof rooms.joinRoomsForUser === 'function') {
          await rooms.joinRoomsForUser(socket, resolvedUser);
        }
      } catch (e) {
        logger.debug({ err: e && e.message }, 'joinRoomsForUser on identifyUser non-fatal');
      }

      // Send a minimal welcome message (no sensitive data)
      try {
        const welcome = {
          id: `welcome-${Date.now()}`,
          type: 'system',
          scope: 'user',
          payload: { message: 'Welcome back', userId: String(resolvedUser._id) },
          createdAt: new Date().toISOString()
        };
        socket.emit('welcome', welcome);
      } catch (e) {
        logger.debug({ err: e && e.message }, 'failed to emit welcome (non-fatal)');
      }

      if (cb) cb({ ok: true, userId: String(resolvedUser._id) });
    } catch (err) {
      logger.warn({ err: err && err.message }, 'identifyUser failed');
      if (cb) cb({ ok: false, error: err.message });
    }
  });
}

/* -------------------------
 * Disconnect cleanup
 * ------------------------- */

async function onDisconnect(socket, reason) {
  debug('socket disconnect', socket.id, reason);
  try {
    if (typeof socketRegistry.unmapSocket === 'function') {
      const userId = await socketRegistry.unmapSocket(socket.id);
      if (userId && socket.user) {
        try {
          if (typeof rooms.leaveRoomsForUser === 'function') {
            await rooms.leaveRoomsForUser(socket, socket.user);
          } else {
            logger.debug('rooms.leaveRoomsForUser not implemented; skipping');
          }
        } catch (err) {
          logger.debug({ err: err && err.message }, 'leaveRoomsForUser error (non-fatal)');
        }
      }
    } else {
      logger.debug('socketRegistry.unmapSocket not implemented; skipping unmap');
    }
  } catch (err) {
    logger.warn({ err: err && err.message }, 'socketRegistry.unmapSocket failed');
  }
}

/* -------------------------
 * Emit helpers
 * ------------------------- */

function emitToSockets(socketIds = [], event, payload = {}) {
  if (!ioInstance) throw new Error('io not initialized');
  if (!Array.isArray(socketIds) || socketIds.length === 0) return { sent: 0 };

  let sent = 0;
  socketIds.forEach((sid) => {
    try {
      const s = ioInstance.sockets.sockets.get(sid);
      if (s && s.connected) {
        s.emit(event, payload);
        sent += 1;
      } else {
        try {
          ioInstance.to(sid).emit(event, payload);
          sent += 1;
        } catch (e) {
          // ignore per-socket failures
        }
      }
    } catch (err) {
      logger.debug({ err: err && err.message, sid }, 'emitToSockets error for sid');
    }
  });

  return { sent };
}

async function emitToUsers(userIds = [], event, payload = {}) {
  if (!ioInstance) throw new Error('io not initialized');
  if (!Array.isArray(userIds) || userIds.length === 0) return { sent: 0 };

  try {
    const socketIds = await resolveSocketIdsForUserIds(userIds);
    return emitToSockets(socketIds, event, payload);
  } catch (err) {
    logger.warn({ err: err && err.message }, 'emitToUsers failed to resolve socket ids');
    return { sent: 0, error: err.message };
  }
}

function emitToRegion(regionId, event, payload = {}) {
  if (!ioInstance) throw new Error('io not initialized');
  if (!regionId) return { sent: 0 };
  const roomName = typeof rooms.regionRoom === 'function' ? rooms.regionRoom(regionId) : `region:${regionId}`;
  try {
    ioInstance.to(roomName).emit(event, payload);
    return { sent: 1, room: roomName };
  } catch (err) {
    logger.warn({ err: err && err.message, regionId }, 'emitToRegion failed');
    return { sent: 0, error: err.message };
  }
}

function emitToAll(event, payload = {}) {
  if (!ioInstance) throw new Error('io not initialized');
  try {
    ioInstance.emit(event, payload);
    return { sent: 'broadcast' };
  } catch (err) {
    logger.warn({ err: err && err.message }, 'emitToAll failed');
    return { sent: 0, error: err.message };
  }
}

/* -------------------------
 * Utility: disconnect user sockets
 * ------------------------- */

async function disconnectUserSockets(userId) {
  if (!ioInstance) throw new Error('io not initialized');
  if (!userId) return { disconnected: 0 };

  try {
    const socketIds = await resolveSocketIdsForUserId(userId);
    let disconnected = 0;
    await Promise.all(socketIds.map(async (sid) => {
      try {
        const s = ioInstance.sockets.sockets.get(sid);
        if (s) {
          s.disconnect(true);
          disconnected += 1;
        }
        if (typeof socketRegistry.unmapSocket === 'function') {
          await socketRegistry.unmapSocket(sid);
        }
      } catch (err) {
        logger.debug({ err: err && err.message, sid }, 'disconnectUserSockets error for sid');
      }
    }));
    return { disconnected };
  } catch (err) {
    logger.warn({ err: err && err.message, userId }, 'disconnectUserSockets failed');
    return { disconnected: 0, error: err.message };
  }
}

/* -------------------------
 * Exports
 * ------------------------- */

module.exports = {
  attachHandlers,
  emitToSockets,
  emitToUsers,
  emitToRegion,
  emitToAll,
  disconnectUserSockets
};
