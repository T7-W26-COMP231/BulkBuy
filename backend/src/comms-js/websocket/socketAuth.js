// src/comms-js/websocket/socketAuth.js
// Socket.io authentication middleware and token verification helpers.
// - Supports JWT tokens (handshake.auth.token) or session token (handshake.auth.sessionToken).
// - Attaches sanitized user info to socket.user on success.
// - Uses UserRepository to validate user existence and load minimal prefs.
// - Caches recent token -> userId mappings for performance.

const jwt = require('jsonwebtoken');
// LRU compatibility shim: support lru-cache v6/v7 and provide a Map TTL fallback
let LRU;
try {
  LRU = require('lru-cache');
  if (LRU && typeof LRU !== 'function' && LRU.default) LRU = LRU.default;
} catch (e) {
  LRU = null;
}

const UserRepo = require('../../repositories/user.repo');
const Config = require('../../models/config.model');
const socketRegistry = require('./socketRegistry');

const DEFAULT_CACHE_TTL = 30 * 1000; // 30s

function createCache(opts = {}) {
  if (LRU && typeof LRU === 'function') {
    return new LRU(opts);
  }
  const ttl = opts && opts.ttl ? opts.ttl : DEFAULT_CACHE_TTL;
  const map = new Map();
  return {
    get(key) {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (entry.expiry && Date.now() > entry.expiry) { map.delete(key); return undefined; }
      return entry.value;
    },
    set(key, value) { map.set(key, { value, expiry: ttl ? Date.now() + ttl : null }); },
    del(key) { map.delete(key); },
    has(key) { return this.get(key) !== undefined; }
  };
}

/**
 * verifyJwtToken
 * - Verifies a JWT and returns the decoded payload.
 * - Throws on invalid/expired token.
 *
 * @param {String} token
 * @param {String} secret
 * @returns {Object} decoded payload
 */
function verifyJwtToken(token, secret) {
  if (!token) throw new Error('token required');
  if (!secret) throw new Error('jwt secret required');
  // jwt.verify will throw on invalid/expired
  return jwt.verify(token, secret);
}

/**
 * initSocketAuth
 * - Attaches an authentication middleware to the provided io instance.
 * - Options:
 *   - jwtSecret: string (required for JWT auth)
 *   - tokenField: string (handshake.auth field to look for token, default 'token')
 *   - sessionField: string (handshake.auth field for session token, default 'sessionToken')
 *   - logger: optional logger with .warn/.info/.error
 *   - cacheTtl: ms for token->user cache
 *
 * Usage:
 *   initSocketAuth(io, { jwtSecret, logger });
 *
 * @param {Object} io - socket.io server instance
 * @param {Object} opts
 */
function initSocketAuth(io, opts = {}) {
  const {
    jwtSecret,
    tokenField = 'token',
    sessionField = 'sessionToken',
    logger = console,
    cacheTtl = DEFAULT_CACHE_TTL
  } = opts;

  if (!io) throw new Error('io instance is required');

  // token -> { userId, roles, expiresAt } cache (LRU if available, otherwise Map TTL fallback)
  const tokenCache = createCache({ max: 1000, ttl: cacheTtl });

  // middleware
  io.use(async (socket, next) => {
    try {
      
      const auth = socket.handshake && socket.handshake.auth ? socket.handshake.auth : {};
      const rawToken = auth[tokenField] || auth.token || opts?.accessToken || null;
      const sessionToken = auth[sessionField] || null;

      if (!rawToken && !sessionToken) {
        const err = new Error('Authentication required');
        err.data = { code: 'AUTH_REQUIRED' };
        return next(err);
      }

      // Prefer JWT token if present
      let payload = null;
      let cacheKey = null;

      if (rawToken) {
        cacheKey = `jwt:${rawToken}`;
        const cached = tokenCache.get(cacheKey);
        if (cached) {
          payload = cached;
        } else {
          if (!jwtSecret) {
            logger.warn && logger.warn('socketAuth: jwtSecret not provided; rejecting token auth');
            const err = new Error('Server misconfiguration: jwt secret missing');
            err.data = { code: 'SERVER_ERROR' };
            return next(err);
          }
          try {
            const decoded = verifyJwtToken(rawToken, jwtSecret);
            payload = decoded;
            tokenCache.set(cacheKey, payload);
          } catch (err) {
            logger.warn && logger.warn('socketAuth: jwt verify failed', err.message);
            const e = new Error('Invalid token');
            e.data = { code: 'INVALID_TOKEN' };
            return next(e);
          }
        }
      } else if (sessionToken) {
        // session token flow (custom): attempt to resolve to userId via repository
        cacheKey = `session:${sessionToken}`;
        const cached = tokenCache.get(cacheKey);
        if (cached) {
          payload = cached;
        } else {
          // Implement your session lookup here. For now, assume sessionToken is a userId or user.userId
          // Try to find user by userId or by _id
          let user = null;
          try {
            user = await UserRepo.findByUserId(sessionToken, { includeDeleted: false });
            if (!user) user = await UserRepo.findById(sessionToken, { includeDeleted: false });
          } catch (err) {
            logger.warn && logger.warn('socketAuth: session lookup error', err.message);
          }
          if (!user) {
            const e = new Error('Invalid session token');
            e.data = { code: 'INVALID_SESSION' };
            return next(e);
          }
          payload = { userId: user._id, roles: [user.role] };
          tokenCache.set(cacheKey, payload);
        }
      }

      // At this point payload should contain user identification info
      if (!payload) {
        const e = new Error('Authentication failed');
        e.data = { code: 'AUTH_FAILED' };
        return next(e);
      }

      // Normalize userId: payload may contain userId, sub, id, or userId-like fields
      const userId = payload._id || payload.userId || payload.sub || payload.id;
      if (!userId) {
        const e = new Error('Token missing user identifier');
        e.data = { code: 'INVALID_TOKEN_PAYLOAD' };
        return next(e);
      }
      // Load minimal user record to ensure user exists and is not soft-deleted
      let user;
      try {
        // Try repository findById (expects Mongo _id) and findByUserId (human-friendly)
        user = await UserRepo.findById(userId, { includeDeleted: false });
        if (!user) user = await UserRepo.findByUserId(userId, { includeDeleted: false });
      } catch (err) {
        logger.error && logger.error('socketAuth: user lookup error', err.message);
        const e = new Error('Authentication error');
        e.data = { code: 'AUTH_ERROR' };
        return next(e);
      }

      if (!user) {
        const e = new Error('User not found or deleted');
        e.data = { code: 'USER_NOT_FOUND' };
        return next(e);
      }
      // Load user preferences (Config) if available (non-blocking best-effort)
      let prefs = {};
      try {
        const cfg = await Config.findByUserId(user._id).lean().exec().catch(() => null);
        if (cfg) prefs = cfg;
      } catch (err) {
        // ignore prefs load errors
      }

      // Attach sanitized user info to socket
      socket.user = {
        _id: user._id,
        userId: user.userId || null,
        roles: Array.isArray(user.roles) ? user.roles : [user.role].filter(Boolean),
        role: user.role || null,
        prefs
      };

      // Map socket -> user in registry (best-effort; do not block connection on redis errors)
      try {
        // registry expects string ids
        await socketRegistry.mapSocketToUser(socket.id, String(user._id));
      } catch (err) {
        // log but continue
        logger.warn && logger.warn('socketAuth: registry.mapSocketToUser failed', err.message);
      }

      return next();
    } catch (err) {
      // Unexpected error
      const e = new Error('Authentication error');
      e.data = { code: 'AUTH_ERROR' };
      return next(e);
    }
  });

  // Return a small helper to validate tokens programmatically if needed
  return {
    verifyToken: async (token) => {
      if (!token) throw new Error('token required');
      const cacheKey = `jwt:${token}`;
      const cached = tokenCache.get(cacheKey);
      if (cached) return cached;
      const decoded = verifyJwtToken(token, jwtSecret);
      tokenCache.set(cacheKey, decoded);
      return decoded;
    },
    _tokenCache: tokenCache
  };
}

module.exports = {
  initSocketAuth
};
