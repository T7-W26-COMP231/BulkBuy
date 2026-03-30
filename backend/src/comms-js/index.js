// src/comms-js/index.js
// Top-level initializer for the comms subsystem.
// - Lightweight wiring around websocket/socketService
// - Exposes initComms and closeComms for server bootstrap
// - Returns the Socket.IO instance and a small runtime API

const socketService = require('./websocket/socketService');
const pino = require('pino');

let logger = pino({ level: process.env.LOG_LEVEL || 'info' });
let runtime = {
  initialized: false,
  io: null,
  api: null
};

/**
 * initComms
 * - Bootstraps the comms subsystem and attaches Socket.IO to the provided HTTP server.
 *
 * @param {Object} opts
 *   - server: required Node http(s) server instance
 *   - redisClient: optional Redis client for adapter
 *   - jwtSecret: optional JWT secret (defaults to process.env.ACCESS_SECRET)
 *   - path: optional socket path (default '/')
 *   - cors: optional CORS options for Socket.IO
 *   - logger: optional logger (pino-compatible)
 *
 * @returns {Promise<{ io, api }>}
 */
async function initComms(opts = {}) {
  if (runtime.initialized) {
    return { io: runtime.io, api: runtime.api };
  }

  const {
    server,
    redisClient = null,
    jwtSecret = process.env.ACCESS_SECRET,
    path, // = '/',
    cors, // = { origin: true, credentials: true },
    logger: customLogger = null
  } = opts;

  if (!server) {
    throw new Error('initComms requires an HTTP server instance (server)');
  }

  if (customLogger) logger = customLogger;

  // try {
  //   const { io, api } = await socketService.initSocket(server, {
  //     path,
  //     cors,
  //     redisClient,
  //     jwtSecret,
  //     logger
  //   });

  //   logger.info('initComms: result', { hasIo: !!(result && result.io), ioPath: result && result.io && typeof result.io.path === 'function' ? result.io.path() : null, ioHttpServerEqualsProvided: !!(result && result.io && result.io.httpServer === server) });

  //   runtime.initialized = true;
  //   runtime.io = io;
  //   runtime.api = api;

  //   logger.info('comms subsystem initialized');
  //   return { io, api };
  // } catch (err) {
  //   logger.error({ err: err && err.message }, 'Failed to initialize comms subsystem');
  //   throw err;
  // }

    try {
    // call socketService and keep the raw result for inspection
    const result = await socketService.initSocket(server, {
      path,
      cors,
      redisClient,
      jwtSecret,
      logger
    });

    // normalize result
    let io = result && result.io;
    let api = result && result.api;

    // debug log about what we received
    logger.info('initComms: socketService returned', {
      hasResult: !!result,
      hasIo: !!io,
      ioPath: io && typeof io.path === 'function' ? io.path() : null,
      ioHttpServerEqualsProvided: !!(io && io.httpServer === server)
    });

    // If socketService created an io attached to a different HTTP server,
    // re-create/reattach Socket.IO to the provided server on the expected path.
    if (io && io.httpServer && io.httpServer !== server) {
      logger.warn('socketService created its own HTTP server; reattaching Socket.IO to provided server');
      const { Server } = require('socket.io');
      io = new Server(server, {
        path: path || '/socket.io',
        cors: {
          origin: (cors && cors.origin) || 'http://localhost:3000',
          methods: (cors && cors.methods) || ['GET','POST'],
          credentials: !!(cors && cors.credentials)
        }
      });

      // attach shared handlers so the new io behaves like the original
      try {
        const socketHandlers = require('./websocket/socketHandlers');
        if (socketHandlers && typeof socketHandlers.attachHandlers === 'function') {
          socketHandlers.attachHandlers(io);
        } else {
          logger.warn('socketHandlers.attachHandlers not found; handlers not attached');
        }
      } catch (e) {
        logger.warn({ err: e && e.message }, 'Failed to attach socket handlers after reattach');
      }

      api = api || null;
    }

    runtime.initialized = true;
    runtime.io = io;
    runtime.api = api;

    logger.info('comms subsystem initialized');
    return { io, api };
  } catch (err) {
    logger.error({ err: err && err.message }, 'Failed to initialize comms subsystem');
    throw err;
  }


}

/**
 * closeComms
 * - Gracefully shuts down the comms subsystem and clears runtime state.
 *
 * @param {Object} opts - { timeoutMs } optional graceful timeout
 * @returns {Promise<void>}
 */
async function closeComms(opts = {}) {
  const { timeoutMs = 5000 } = opts;
  if (!runtime.initialized) return;

  try {
    await socketService.shutdown(timeoutMs);
    runtime.initialized = false;
    runtime.io = null;
    runtime.api = null;
    logger.info('comms subsystem closed');
  } catch (err) {
    logger.warn({ err: err && err.message }, 'Error while closing comms subsystem');
    throw err;
  }
}

/**
 * getStatus
 * - Lightweight runtime status for health checks or admin endpoints.
 *
 * @returns {{ initialized: Boolean, connectedCount: Number|null }}
 */
function getStatus() {
  if (!runtime.initialized || !runtime.api) {
    return { initialized: false, connectedCount: null };
  }
  try {
    const connected = runtime.api.getConnectedUsers();
    return { initialized: true, connectedCount: Array.isArray(connected) ? connected.length : null };
  } catch (err) {
    return { initialized: true, connectedCount: null };
  }
}

module.exports = {
  initComms,
  closeComms,
  getStatus,
  // expose internals for advanced usage (read-only)
  _runtime: runtime
};
