// src/comms-js/user.access/user.access.js
// Centralized user lookup and recipient resolution utilities for the comms subsystem.
// - Wraps UserRepository and Config model
// - Integrates with socketService runtime registry
// - Single authoritative region lookup with optional role and search/pagination options
// - Returns lean/safe user objects suitable for templates and recipient resolution

const mongoose = require('mongoose');

const UserRepo = require('../../repositories/user.repo');
const Config = require('../../models/config.model');
const socketService = require('../websocket/socketRegistry'); // must export registry helpers: mapSocketToUser, unmapSocket, getSocketIdsForUserIds, getConnectedUsers

// const LRU = require('lru-cache');
// const shortCache = new LRU({ max: 500, ttl: 30 * 1000 }); // 30s cache for hot lookups

// New way (v7+)
const { LRUCache } = require('lru-cache');
const shortCache = new LRUCache({ max: 500, ttl: 30 * 1000 }); // 30s cache for hot lookups

// Old way (v6 and below) - CAUSES ERROR
// const LRU = require('lru-cache'); 

// New way (v7+)
// const { LRUCache } = require('lru-cache');
// const options = {
//   max: 500, // The maximum number of items allowed in the cache
//   ttl: 1000 * 60 * 5, // Items live for 5 minutes
// };
// const cache = new LRUCache(options);

/* -------------------------
 * Basic lookups
 * ------------------------- */

/**
 * getUserById
 * @param {String|ObjectId} userId
 * @param {Object} opts - { populate, includeDeleted }
 * @returns {Promise<Object|null>}
 */
async function getUserById(userId, opts = {}) {
  if (!userId) return null;
  return UserRepo.findById(userId, { populate: opts.populate || '', includeDeleted: !!opts.includeDeleted });
}

/**
 * getUsersByIds
 * @param {Array<String|ObjectId>} userIds
 * @param {Object} opts - { populate, limit }
 * @returns {Promise<Array>}
 */
async function getUsersByIds(userIds = [], opts = {}) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const limit = opts.limit || userIds.length;
  return UserRepo.find({ _id: { $in: userIds } }, { limit, populate: opts.populate || 'config' });
}

/**
 * getEmailsByIds
 * @param {Array<String|ObjectId>} userIds
 * @returns {Promise<Array<String>>} deduped email addresses
 */
async function getEmailsByIds(userIds = []) {
  const users = await getUsersByIds(userIds);
  const emails = users
    .flatMap(u => (Array.isArray(u.emails) ? u.emails.map(e => e.address) : []))
    .filter(Boolean);
  return Array.from(new Set(emails.map(e => String(e).toLowerCase().trim())));
}

/* -------------------------
 * Socket mapping helpers (delegates to socketService)
 * ------------------------- */

function mapSocketToUser(socketId, userId) {
  return socketService.mapSocketToUser(socketId, userId);
}

function unmapSocket(socketId) {
  return socketService.unmapSocket(socketId);
}

function getSocketIdsByUserIds(userIds = []) {
  return socketService.getSocketIdsForUserIds(userIds);
}

function getConnectedUsers() {
  return socketService.getConnectedUsers(); // [{ userId, socketIds }]
}

/* -------------------------
 * Role and region helpers
 * ------------------------- */

/**
 * getUsersByRole
 * - Returns lean user objects for a given role.
 * - Cached briefly to speed repeated lookups.
 *
 * @param {String} roleName
 * @param {Object} opts - { limit, includeDeleted }
 * @returns {Promise<Array>}
 */
async function getUsersByRole(roleName, opts = {}) {
  if (!roleName) return [];
  const cacheKey = `role:${roleName}:limit:${opts.limit || 'none'}:incdel:${!!opts.includeDeleted}`;
  const cached = shortCache.get(cacheKey);
  if (cached) return cached;

  const filter = { role: roleName };
  if (!opts.includeDeleted) filter.deleted = false;

  const users = await UserRepo.find(filter, { limit: opts.limit || 1000, populate: opts.populate || 'config' });
  shortCache.set(cacheKey, users);
  return users;
}

/**
 * getAllUsersInRegion
 * - Single authoritative method to return users associated with a region.
 * - Sources checked: Config.ops_region and user.addresses[].region.
 * - Optional role filter and flexible search/pagination options.
 *
 * @param {String} regionId
 * @param {Object} opts
 *   - includeDeleted: Boolean (default false)
 *   - role: String|null (optional role filter)
 *   - limit: Number (optional)
 *   - skip: Number (optional)
 *   - useCache: Boolean (default true)
 *   - search: String|null (optional text search applied to firstName/lastName)
 *   - populate: String|null (populate option forwarded to repo)
 * @returns {Promise<Array>} lean user objects
 */
async function getAllUsersInRegion(regionId, opts = {}) {
  if (!regionId) return [];

  const {
    includeDeleted = false,
    role = null,
    limit = 0,
    skip = 0,
    useCache = true,
    search = null,
    populate = 'config'
  } = opts;

  const cacheKey = `region:all:${regionId}:role:${role || 'any'}:incdel:${includeDeleted}:limit:${limit}:skip:${skip}:search:${search || ''}`;
  if (useCache) {
    const cached = shortCache.get(cacheKey);
    if (cached) return cached;
  }

  // 1) Find userIds from Config where ops_region matches
  const cfgFilter = { ops_region: regionId };
  if (!includeDeleted) cfgFilter.deleted = false;
  const configs = await Config.find(cfgFilter).select('userId').lean().exec();
  const configUserIds = configs.map(c => String(c.userId)).filter(Boolean);

  // 2) Build address-based branch
  const addrBranch = { 'addresses.region': regionId };
  if (!includeDeleted) addrBranch.deleted = false;

  // 3) Build combined user query
  const orClauses = [];

  if (configUserIds.length > 0) {
    const objectIds = configUserIds.map(id => {
      try { return mongoose.Types.ObjectId(id); } catch (e) { return null; }
    }).filter(Boolean);

    if (objectIds.length > 0) {
      const cfgBranch = { _id: { $in: objectIds } };
      if (!includeDeleted) cfgBranch.deleted = false;
      orClauses.push(cfgBranch);
    }
  }

  orClauses.push(addrBranch);

  if (orClauses.length === 0) {
    if (useCache) shortCache.set(cacheKey, []);
    return [];
  }

  // Apply role filter if provided
  let userQuery;
  if (role) {
    userQuery = { $or: orClauses.map(branch => Object.assign({}, branch, { role })) };
  } else {
    userQuery = { $or: orClauses };
  }

  // Apply text search if provided (search against firstName/lastName)
  if (search && String(search).trim().length > 0) {
    const q = String(search).trim();
    // Use $text if text index exists, otherwise fallback to regex on names
    // Prefer $text for performance; repository will pass through the query.
    userQuery = {
      $and: [
        userQuery,
        {
          $or: [
            { $text: { $search: q } },
            { firstName: { $regex: q, $options: 'i' } },
            { lastName: { $regex: q, $options: 'i' } }
          ]
        }
      ]
    };
  }

  // Pagination: repository expects page/limit; convert skip/limit to page
  let users;
  if (limit && Number(limit) > 0) {
    const page = Math.max(1, Math.floor(Number(skip || 0) / Number(limit)) + 1);
    users = await UserRepo.find(userQuery, { page, limit: Number(limit), populate });
  } else {
    // no pagination: fetch all matching users but cap to a safe maximum
    users = await UserRepo.find(userQuery, { limit: 5000, populate });
  }

  // Final role filter as safety (in case role wasn't applied to all branches)
  const filtered = role ? users.filter(u => u.role === role) : users;

  if (useCache) shortCache.set(cacheKey, filtered);
  return filtered;
}

/* -------------------------
 * Preferences and formatting
 * ------------------------- */

/**
 * getUserPreferences
 * - Returns Config for user (ops_region, theme, etc.) or empty object.
 *
 * @param {String|ObjectId} userId
 * @returns {Promise<Object>}
 */
async function getUserPreferences(userId) {
  if (!userId) return {};
  try {
    const cfg = await Config.findByUserId(userId).lean().exec();
    return cfg || {};
  } catch (err) {
    return {};
  }
}

/**
 * formatDisplayName
 * - Returns a consistent display name for templates.
 *
 * @param {Object} user
 * @returns {String}
 */
function formatDisplayName(user) {
  if (!user) return '';
  if (user.displayName) return user.displayName;
  const fn = user.firstName || '';
  const ln = user.lastName || '';
  const name = `${fn}${fn && ln ? ' ' : ''}${ln}`.trim();
  if (name) return name;
  if (user.emails && user.emails[0] && user.emails[0].address) return user.emails[0].address;
  return `user-${user._id}`;
}

/* -------------------------
 * Recipient resolution
 * ------------------------- */

/**
 * resolveRecipients
 * - Accepts flexible spec:
 *   { ids, userIds, region, role, emails, includeDeleted }
 * - Returns { userIds, emails, socketIds }
 *
 * @param {Object} spec
 * @returns {Promise<Object>}
 */
async function resolveRecipients(spec = {}) {
  const ids = new Set();
  const emails = new Set();

  if (!spec) return { userIds: [], emails: [], socketIds: [] };

  if (spec.ids) (Array.isArray(spec.ids) ? spec.ids : [spec.ids]).forEach(i => ids.add(String(i)));
  if (spec.userIds) (Array.isArray(spec.userIds) ? spec.userIds : [spec.userIds]).forEach(i => ids.add(String(i)));

  if (spec.role) {
    const users = await getUsersByRole(spec.role, { includeDeleted: !!spec.includeDeleted });
    users.forEach(u => u._id && ids.add(String(u._id)));
  }

  if (spec.region) {
    // Use unified region lookup to include both config and address-based membership
    const users = await getAllUsersInRegion(spec.region, { includeDeleted: !!spec.includeDeleted, role: spec.role || null, useCache: true });
    users.forEach(u => u._id && ids.add(String(u._id)));
  }

  if (spec.emails) (Array.isArray(spec.emails) ? spec.emails : [spec.emails]).forEach(e => {
    if (e) emails.add(String(e).toLowerCase().trim());
  });

  // Resolve emails from user ids
  if (ids.size > 0) {
    const resolvedEmails = await getEmailsByIds(Array.from(ids));
    resolvedEmails.forEach(e => emails.add(String(e).toLowerCase().trim()));
  }

  // Resolve socket ids for currently connected users
  const socketIds = getSocketIdsByUserIds(Array.from(ids));

  return {
    userIds: Array.from(ids),
    emails: Array.from(emails),
    socketIds: Array.from(socketIds)
  };
}

/* -------------------------
 * Exports
 * ------------------------- */

module.exports = {
  // basic
  getUserById,
  getUsersByIds,
  getEmailsByIds,

  // socket mapping
  mapSocketToUser,
  unmapSocket,
  getSocketIdsByUserIds,
  getConnectedUsers,

  // role/region
  getUsersByRole,
  getAllUsersInRegion,
  getUsersInRegion: getAllUsersInRegion, // alias for compatibility

  // prefs/formatting
  getUserPreferences,
  formatDisplayName,

  // recipient resolution
  resolveRecipients
};
