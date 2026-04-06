// src/comms-js/websocket/socketRegistry.js
// In-memory socket <-> user registry with optional Redis-backed adapter for multi-instance deployments.
// - Default: fast in-memory Maps
// - Optional: pass a Redis client to enable cross-instance lookups (uses simple key/sets pattern)
// - Exposes a small event emitter for monitoring hooks

const EventEmitter = require('events');

const DEFAULT_USER_SET_PREFIX = 'comms:user_sockets:'; // key per user -> set of socketIds
const DEFAULT_SOCKET_HASH = 'comms:socket_user'; // hash socketId -> userId

class SocketRegistry extends EventEmitter {
  constructor() {
    super();
    // in-memory structures
    this.socketToUser = new Map(); // socketId -> userId
    this.userToSockets = new Map(); // userId -> Set(socketId)

    // redis adapter (optional)
    this.redis = null;
    this.redisPrefix = DEFAULT_USER_SET_PREFIX;
    this.redisSocketHash = DEFAULT_SOCKET_HASH;

    // small housekeeping
    this._staleCleanupInterval = null;
    this._staleTimeoutMs = 1000 * 60 * 60 * 24; // 24h default stale threshold (not strictly enforced)
  }

  /* -------------------------
   * Redis adapter
   * ------------------------- */

  /**
   * useRedis(redisClient, opts)
   * - Enables Redis-backed registry. The redisClient must support async commands (ioredis or node-redis v4).
   * - opts: { prefix, socketHash }
   */
  useRedis(redisClient, opts = {}) {
    if (!redisClient) throw new Error('redisClient is required');
    this.redis = redisClient;
    if (opts.prefix) this.redisPrefix = opts.prefix;
    if (opts.socketHash) this.redisSocketHash = opts.socketHash;
    return this;
  }

  /* -------------------------
   * Mapping helpers (in-memory + optional redis)
   * ------------------------- */

  /**
   * mapSocketToUser(socketId, userId)
   * - Record mapping in-memory and in Redis (if enabled).
   */
  async mapSocketToUser(socketId, userId) {
    if (!socketId || !userId) return;

    // in-memory
    this.socketToUser.set(socketId, String(userId));
    if (!this.userToSockets.has(String(userId))) this.userToSockets.set(String(userId), new Set());
    this.userToSockets.get(String(userId)).add(socketId);

    // redis (best-effort)
    if (this.redis) {
      try {
        const userKey = `${this.redisPrefix}${userId}`;
        // add socketId to user set and set socket->user mapping
        await Promise.all([
          this.redis.sAdd(userKey, socketId),
          this.redis.hSet(this.redisSocketHash, socketId, String(userId))
        ]);
      } catch (err) {
        // do not throw; emit warning for monitoring
        this.emit('warn', { op: 'mapSocketToUser.redis', error: err });
      }
    }

    this.emit('mapped', { socketId, userId });
  }

  /**
   * unmapSocket(socketId)
   * - Remove mapping in-memory and in Redis (if enabled).
   * - Returns the userId that was mapped (or null).
   */
  async unmapSocket(socketId) {
    if (!socketId) return null;
    const userId = this.socketToUser.get(socketId) || null;

    // in-memory cleanup
    this.socketToUser.delete(socketId);
    if (userId && this.userToSockets.has(userId)) {
      const set = this.userToSockets.get(userId);
      set.delete(socketId);
      if (set.size === 0) this.userToSockets.delete(userId);
    }

    // redis cleanup (best-effort)
    if (this.redis && userId) {
      try {
        const userKey = `${this.redisPrefix}${userId}`;
        await Promise.all([
          this.redis.sRem(userKey, socketId),
          this.redis.hDel(this.redisSocketHash, socketId)
        ]);
      } catch (err) {
        this.emit('warn', { op: 'unmapSocket.redis', error: err });
      }
    }

    this.emit('unmapped', { socketId, userId });
    return userId;
  }

  /**
   * getUserIdBySocket(socketId)
   * - Prefer in-memory; fallback to Redis if enabled.
   */
  async getUserIdBySocket(socketId) {
    if (!socketId) return null;
    const inMem = this.socketToUser.get(socketId);
    if (inMem) return inMem;
    if (!this.redis) return null;

    try {
      const userId = await this.redis.hGet(this.redisSocketHash, socketId);
      if (userId) {
        // populate in-memory for faster future reads
        this.socketToUser.set(socketId, userId);
        if (!this.userToSockets.has(userId)) this.userToSockets.set(userId, new Set());
        this.userToSockets.get(userId).add(socketId);
      }
      return userId || null;
    } catch (err) {
      this.emit('warn', { op: 'getUserIdBySocket.redis', error: err });
      return null;
    }
  }

  /**
   * getSocketIdsForUserId(userId)
   * - Returns array of socketIds for a user.
   * - Combines in-memory and Redis results (deduped).
   */
  async getSocketIdsForUserId(userId) {
    if (!userId) return [];
    const result = new Set();

    // in-memory
    const inMem = this.userToSockets.get(String(userId));
    if (inMem) inMem.forEach(sid => result.add(sid));

    // redis
    if (this.redis) {
      try {
        const userKey = `${this.redisPrefix}${userId}`;
        const redisMembers = await this.redis.sMembers(userKey);
        if (Array.isArray(redisMembers)) redisMembers.forEach(sid => result.add(sid));
      } catch (err) {
        this.emit('warn', { op: 'getSocketIdsForUserId.redis', error: err });
      }
    }

    return Array.from(result);
  }

  /**
   * getSocketIdsForUserIds(userIds)
   * - Convenience for multiple userIds.
   */
  async getSocketIdsForUserIds(userIds = []) {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];
    const promises = userIds.map(uid => this.getSocketIdsForUserId(uid));
    const arrays = await Promise.all(promises);
    const merged = new Set();
    arrays.forEach(arr => (arr || []).forEach(sid => merged.add(sid)));
    return Array.from(merged);
  }

  /**
   * getConnectedUsers()
   * - Returns array of { userId, socketIds } from in-memory registry.
   * - For multi-instance, this only reflects the local instance unless Redis is used and a scan is performed (not implemented here).
   */
  getConnectedUsers() {
    const out = [];
    for (const [userId, sockets] of this.userToSockets.entries()) {
      out.push({ userId, socketIds: Array.from(sockets) });
    }
    return out;
  }

  /* -------------------------
   * Utility / housekeeping
   * ------------------------- */

  /**
   * clear()
   * - Clears in-memory registry. Does not touch Redis.
   */
  clear() {
    this.socketToUser.clear();
    this.userToSockets.clear();
    this.emit('cleared');
  }

  /**
   * startStaleCleanup(intervalMs, staleTimeoutMs)
   * - Optional periodic cleanup to remove obviously stale in-memory entries.
   * - This is conservative: it only clears entries that are missing from Redis when Redis is enabled.
   */
  startStaleCleanup(intervalMs = 60 * 1000, staleTimeoutMs = null) {
    if (this._staleCleanupInterval) clearInterval(this._staleCleanupInterval);
    if (staleTimeoutMs) this._staleTimeoutMs = staleTimeoutMs;

    this._staleCleanupInterval = setInterval(async () => {
      try {
        if (!this.redis) return;
        // verify each in-memory socket exists in redis hash; if not, remove it
        const checks = [];
        for (const socketId of this.socketToUser.keys()) {
          checks.push(
            this.redis.hExists(this.redisSocketHash, socketId).then(exists => ({ socketId, exists }))
          );
        }
        const results = await Promise.all(checks);
        for (const r of results) {
          if (!r.exists) {
            // best-effort unmap locally
            await this.unmapSocket(r.socketId);
          }
        }
      } catch (err) {
        this.emit('warn', { op: 'staleCleanup', error: err });
      }
    }, intervalMs);
  }

  stopStaleCleanup() {
    if (this._staleCleanupInterval) {
      clearInterval(this._staleCleanupInterval);
      this._staleCleanupInterval = null;
    }
  }
}

/* -------------------------
 * Singleton export
 * ------------------------- */

const registry = new SocketRegistry();

module.exports = registry;
