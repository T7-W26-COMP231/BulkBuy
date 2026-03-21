// src/services/auth.service.js
//
// Authentication service
// - Token generation and verification (access + refresh) using src/utils/jwt.helper.js
// - High-level auth flows: register, login, logout, refresh
// - Delegates user persistence/credential checks to user.service
// - Emits audit events via audit.service
//
// Expectations:
// - userService implements: register, authenticate, logout (optional), findById (optional), validateRefreshToken (optional)
// - Controllers handle cookie semantics (setting/clearing refresh cookie).
//
// Exports:
// - generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken
// - register, login, logout, refreshTokens

const createError = require('http-errors');
const jwtHelper = require('../utils/jwt.helper');
const userService = require('./user.service');
const auditService = require('./audit.service');

/**
 * Build audit actor from opts (best-effort).
 */
function actorFromOpts(opts = {}) {
  if (!opts) return { userId: null, role: null };
  if (opts.actor) return opts.actor;
  if (opts.user) return { userId: opts.user.userId || opts.user._id || null, role: opts.user.role || null };
  return { userId: null, role: null };
}

/**
 * Build minimal token payload from user object
 * @param {Object} user
 * @returns {{userId: String|null, role: String|null}}
 */
function tokenPayloadFromUser(user = {}) {
  const userId = user.userId || user._id || user.id || null;
  const role = user.role || null;
  return { userId, role };
}

/* -------------------------
 * Token helpers (thin wrappers around jwt.helper)
 * ------------------------- */

/**
 * Generate access token (JWT)
 * @param {Object} payload
 * @returns {String}
 */
function generateAccessToken(payload = {}) {
  return jwtHelper.signAccess(payload);
}

/**
 * Generate refresh token (JWT)
 * @param {Object} payload
 * @returns {String}
 */
function generateRefreshToken(payload = {}) {
  return jwtHelper.signRefresh(payload);
}

/**
 * Verify access token
 * @param {String} token
 * @returns {Object} decoded payload
 * @throws 401 on invalid/expired token
 */
function verifyAccessToken(token) {
  try {
    return jwtHelper.verifyAccess(token);
  } catch (err) {
    throw createError(401, 'Invalid or expired access token');
  }
}

/**
 * Verify refresh token
 * @param {String} token
 * @returns {Object} decoded payload
 * @throws 401 on invalid/expired token
 */
function verifyRefreshToken(token) {
  try {
    return jwtHelper.verifyRefresh(token);
  } catch (err) {
    throw createError(401, 'Invalid or expired refresh token');
  }
}

/* -------------------------
 * High-level flows
 * ------------------------- */

/**
 * Register a new user and return { user, accessToken, refreshToken }
 * Delegates to userService.register for persistence and validation.
 *
 * @param {Object} userData
 * @param {String|null} correlationId
 * @returns {Promise<{user, accessToken, refreshToken}>}
 */
async function register(userData = {}, correlationId = null) {
  const actor = { userId: null, role: null };
  try {
    const created = await userService.createUser(userData, {actor, correlationId});

    const payload = tokenPayloadFromUser(created);
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await auditService.logEvent({
      eventType: 'auth.register.success',
      actor,
      target: { type: 'User', id: payload.userId },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { email: (userData.email || '').toLowerCase() }
    });

    return { user: created, accessToken, refreshToken };
  } catch (err) {
    await auditService.logEvent({
      eventType: 'auth.register.failed',
      actor,
      target: { type: 'User', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    throw err;
  }
}

/**
 * Authenticate credentials and return { user, accessToken, refreshToken }
 * Delegates to userService.authenticate which should validate password and return user.
 *
 * @param {Object} credentials - { email, password }
 * @param {String|null} correlationId
 * @returns {Promise<{user, accessToken, refreshToken}>}
 */
async function login(credentials = {}, correlationId = null) {
  const actor = { userId: null, role: null };
  try {
    const { user } = await userService.authenticate(credentials, correlationId);

    const payload = tokenPayloadFromUser(user);
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await auditService.logEvent({
      eventType: 'auth.login.success',
      actor: { userId: payload.userId, role: payload.role },
      target: { type: 'User', id: payload.userId },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });

    return { user, accessToken, refreshToken };
  } catch (err) {
    await auditService.logEvent({
      eventType: 'auth.login.failed',
      actor,
      target: { type: 'User', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    throw err;
  }
}

/**
 * Logout a user by revoking refresh token (if userService supports it).
 * Returns true on success.
 *
 * @param {String|ObjectId} userId
 * @param {String} refreshToken
 * @param {String|null} correlationId
 * @returns {Promise<Boolean>}
 */
async function logout(userId, refreshToken, correlationId = null) {
  const actor = actorFromOpts({ user: { userId } });
  try {
    if (userId && refreshToken && typeof userService.logout === 'function') {
      await userService.logout(userId, refreshToken, correlationId);
    }

    await auditService.logEvent({
      eventType: 'auth.logout.success',
      actor,
      target: { type: 'User', id: userId || null },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });

    return true;
  } catch (err) {
    await auditService.logEvent({
      eventType: 'auth.logout.failed',
      actor,
      target: { type: 'User', id: userId || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    throw err;
  }
}

/**
 * Refresh tokens using a valid refresh token.
 * - Verifies refresh token
 * - Optionally checks server-side revocation via userService.validateRefreshToken
 * - Issues new access + refresh tokens
 *
 * @param {String} refreshToken
 * @param {String|null} correlationId
 * @returns {Promise<{accessToken, refreshToken, user}>}
 */
async function refreshTokens(refreshToken, correlationId = null) {
  if (!refreshToken) throw createError(400, 'refreshToken is required');

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const userId = decoded.userId;

    // optional server-side check (e.g., token revocation list)
    if (typeof userService.validateRefreshToken === 'function') {
      const ok = await userService.validateRefreshToken(userId, refreshToken);
      if (!ok) throw createError(401, 'Refresh token revoked');
    }

    // fetch latest user record if available
    let user = null;
    if (typeof userService.findById === 'function') {
      try {
        user = await userService.findById(userId);
      } catch (e) {
        // ignore not found here; we'll still issue tokens based on decoded payload
        user = null;
      }
    }

    const payload = tokenPayloadFromUser(user || decoded);
    const newAccess = generateAccessToken(payload);
    const newRefresh = generateRefreshToken(payload);

    await auditService.logEvent({
      eventType: 'auth.refresh.success',
      actor: { userId: payload.userId, role: payload.role },
      target: { type: 'User', id: payload.userId },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });

    return { accessToken: newAccess, refreshToken: newRefresh, user };
  } catch (err) {
    await auditService.logEvent({
      eventType: 'auth.refresh.failed',
      actor: { userId: null, role: null },
      target: { type: 'User', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    throw err;
  }
}

/* -------------------------
 * Exports
 * ------------------------- */

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  register,
  login,
  logout,
  refreshTokens
};
