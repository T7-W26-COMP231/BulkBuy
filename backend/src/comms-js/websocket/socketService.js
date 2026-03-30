// src/comms-js/websocket/socketService.js
// High-level Socket.IO initializer and runtime API for the comms subsystem.
// - Wires auth, registry, rooms, and handlers into a Socket.IO instance
// - Supports optional Redis adapter for horizontal scaling
// - Exposes a small API used by services/controllers: emitToUsers, emitToSockets, emitToRegion, emitToAll, disconnectUserSockets, shutdown

const { Server } = require('socket.io');
const socketRegistry = require('./socketRegistry');
const { initSocketAuth } = require('./socketAuth');
const socketHandlers = require('./socketHandlers');
const rooms = require('./rooms');

const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

let io = null;
let handlersApi = null;
let authApi = null;
let initialized = false;

/**
 * initSocket
 * - server: Node http(s) server instance (required)
 * - opts:
 *    - path: socket path (default '/')
 *    - cors: cors options for Socket.IO
 *    - redisClient: optional ioredis/node-redis v4 client for adapter
 *    - jwtSecret: required for JWT socket auth
 *    - logger: optional logger
 *
 * Returns: { io, api } where api contains emit helpers and lifecycle methods.
 */
async function initSocket(server, opts = {}) {
  if (initialized) {
    return { io, api: buildApi() };
  }
  if (!server) throw new Error('HTTP server instance is required to initialize sockets');

  // const {
  //   path = '/',
  //   cors = { origin: config.clientUrl || "http://localhost:5173/" || '*' || true, credentials: true } || { origin: true, credentials: true },
  //   redisClient = null,
  //   jwtSecret = process.env.ACCESS_SECRET,
  //   logger: customLogger = null
  // } = opts;

  const {
    path = '/socket.io',
    cors = { origin: true, credentials: true },
    redisClient = null,
    jwtSecret = process.env.JWT_SECRET,
    logger: customLogger = null
  } = opts;


  // if (customLogger) {
  //   // allow injection of a different logger
  //   // eslint-disable-next-line no-unused-vars
  //   logger = customLogger;
  // }

  // create Socket.IO server
  io = new Server(server, {
    path,
    cors,
    maxHttpBufferSize: 1e6 // 1MB default payload cap; adjust as needed
  });

  logger.info('socketService: io created', { path: typeof io.path === 'function' ? io.path() : path, httpServerEqualsProvided: !!(io.httpServer === server) });

  // optional Redis adapter for multi-instance deployments
  if (redisClient) {
    try {
      // dynamic require to avoid hard dependency when not used
      // adapter factory expects pubClient, subClient
      const { createAdapter } = require('@socket.io/redis-adapter');
      const pubClient = redisClient.duplicate ? redisClient.duplicate() : redisClient;
      const subClient = redisClient.duplicate ? redisClient.duplicate() : redisClient;
      await Promise.all([pubClient.connect?.(), subClient.connect?.()].filter(Boolean));
      io.adapter(createAdapter(pubClient, subClient));
      // wire registry to use redis for cross-instance lookups if desired
      try { socketRegistry.useRedis(redisClient); } catch (e) { logger.warn({ err: e && e.message }, 'socketService: registry.useRedis failed'); }
      logger.info('Socket.IO Redis adapter configured');
    } catch (err) {
      logger.warn({ err: err && err.message }, 'socketService: failed to configure Redis adapter; continuing with in-memory adapter');
    }
  }

  // init auth middleware (uses existing verifyAccess helper)
  authApi = initSocketAuth(io, {jwtSecret: process.env.JWT_SECRET, accessToken : opts?.accessToken, tokenField: 'token', logger, cacheTtl: 30 * 1000 });

  // attach handlers (connection lifecycle, emit helpers)
  handlersApi = socketHandlers.attachHandlers(io);

  initialized = true;

  logger.info('Socket service initialized');

  return { io, api: buildApi(io, handlersApi) };
}

/* -------------------------
 * API helpers (thin wrappers)
 * ------------------------- */

function buildApi() {
  if (!io || !handlersApi) throw new Error('socketService not initialized');
  return {
    io,
    emitToSockets: handlersApi.emitToSockets,
    emitToUsers: handlersApi.emitToUsers,
    emitToRegion: handlersApi.emitToRegion,
    emitToAll: handlersApi.emitToAll || ((event, payload) => { io.emit(event, payload); return { sent: 'broadcast' }; }),
    disconnectUserSockets: handlersApi.disconnectUserSockets,
    getConnectedUsers: () => socketRegistry.getConnectedUsers(),
    // graceful shutdown helper
    shutdown: async () => shutdown()
  };
}

/* -------------------------
 * Graceful shutdown
 * ------------------------- */

async function shutdown(timeoutMs = 5000) {
  if (!io) return;
  try {
    logger.info('Shutting down socket service: closing connections');
    // prevent new connections
    io.close();

    // clear registry and stop stale cleanup if any
    try {
      socketRegistry.stopStaleCleanup && socketRegistry.stopStaleCleanup();
      socketRegistry.clear && socketRegistry.clear();
    } catch (e) {
      logger.debug({ err: e && e.message }, 'socketService: registry cleanup error');
    }

    // allow a short grace period for sockets to close
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  } catch (err) {
    logger.warn({ err: err && err.message }, 'socketService.shutdown encountered an error');
  } finally {
    io = null;
    handlersApi = null;
    initialized = false;
    logger.info('Socket service shutdown complete');
  }
}

/* -------------------------
 * Convenience: disconnect all sockets for a user
 * - Delegates to handlersApi.disconnectUserSockets which uses registry + io
 * ------------------------- */
async function disconnectUserSockets(userId) {
  if (!initialized) throw new Error('socketService not initialized');
  if (!userId) return { disconnected: 0 };
  return handlersApi.disconnectUserSockets(userId);
}

/* -------------------------
 * Exports
 * ------------------------- */

module.exports = {
  initSocket,
  disconnectUserSockets,
  shutdown,
  // expose registry for advanced usage (read-only operations)
  registry: socketRegistry
};
