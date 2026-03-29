// src/controllers/auth.controller.js
const authService = require('../services/auth.service');
const auditService = require('../services/audit.service');
const { registerSchema, loginSchema } = require('../validators/user.validators');
const { requireRole, requireAnyRole } = require('../middleware/rbac.middleware');

/**
 * POST /auth/register
 */
// async function register(req, res) {
//   const correlationId = req.correlationId || null;
//   const { error, value } = registerSchema.validate(req.body);
//   if (error || !(requireRole('administrator'))) {
//     await auditService.logEvent({
//       eventType: 'auth.register.failed.validation',
//       actor: { userId: null, role: null },
//       target: { type: 'User', id: null },
//       outcome: 'failure',
//       severity: 'warning',
//       correlationId,
//       details: { validation: error.message }
//     });
//     return res.status(400).json({ message: error.message });
//   }

//   try {
//     const { user, accessToken, refreshToken } = await authService.register(value, correlationId);

//     await auditService.logEvent({
//       eventType: 'auth.register.success',
//       actor: { userId: user.userId || user._id || null, role: user.role || null },
//       target: { type: 'User', id: user.userId || user._id || null },
//       outcome: 'success',
//       severity: 'info',
//       correlationId,
//       details: { email: (value.email || '').toLowerCase() }
//     });

//     // Return tokens and sanitized user. Controller chooses cookie semantics.
//     return res.status(201).json({ user, accessToken, refreshToken });
//   } catch (err) {
//     await auditService.logEvent({
//       eventType: 'auth.register.failed',
//       actor: { userId: null, role: null },
//       target: { type: 'User', id: null },
//       outcome: 'failure',
//       severity: err.status && err.status >= 500 ? 'error' : 'warning',
//       correlationId,
//       details: { message: err.message }
//     });
//     return res.status(err.status || 500).json({ message: err.message });
//   }
// }

async function register(req, res) {
  const correlationId = req.correlationId || null;
  console.log("📨 req.body:", JSON.stringify(req.body, null, 2)); // ← ADD THIS

  const { error, value } = registerSchema.validate(req.body);
  console.log("✅ validated value:", JSON.stringify(value, null, 2)); // ← ADD THIS
  console.log("❌ validation error:", error?.message); // ← ADD THIS

  // ❌ REMOVE this broken condition
  // if (error || !(requireRole('administrator'))) {

  // ✅ CORRECT
  if (error) {
    return res.status(400).json({ message: error.details?.[0]?.message || error.message });
  }

  try {
    // ✅ Normalize flat email → emails array before saving
    if (value.email && (!value.emails || value.emails.length === 0)) {
      value.emails = [{ address: value.email, primary: true, verified: false }];
      delete value.email;
    }

    const { user, accessToken, refreshToken } = await authService.register(value, correlationId);
    return res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
}

/**
 * POST /auth/login
 */
async function login(req, res) {
  const correlationId = req.correlationId || null;
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    await auditService.logEvent({
      eventType: 'auth.login.failed.validation',
      actor: { userId: null, role: null },
      target: { type: 'User', id: null },
      outcome: 'failure',
      severity: 'warning',
      correlationId,
      details: { validation: error.message }
    });
    return res.status(400).json({ message: error.message });
  }

  try {
    const { user, accessToken, refreshToken } = await authService.login(value, correlationId);

    // set refresh token as httpOnly cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: parseInt(process.env.REFRESH_COOKIE_MAX_AGE_MS || String(7 * 24 * 60 * 60 * 1000), 10)
    };
    res.cookie('refreshToken', refreshToken, cookieOptions);

    await auditService.logEvent({
      eventType: 'auth.login.success',
      actor: { userId: user.userId || user._id || null, role: user.role || null },
      target: { type: 'User', id: user.userId || user._id || null },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });

    return res.status(200).json({ accessToken, user });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'auth.login.failed',
      actor: { userId: null, role: null },
      target: { type: 'User', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ message: err.message });
  }
}

/**
 * POST /auth/refresh
 * - Reads refresh token from cookie or body.refreshToken
 * - Returns new access + refresh tokens and optionally user
 */
async function refresh(req, res) {
  const correlationId = req.correlationId || null;
  const refreshToken = (req.cookies && req.cookies.refreshToken) || req.body && req.body.refreshToken;

  if (!refreshToken) {
    await auditService.logEvent({
      eventType: 'auth.refresh.failed.validation',
      actor: { userId: null, role: null },
      target: { type: 'User', id: null },
      outcome: 'failure',
      severity: 'warning',
      correlationId,
      details: { reason: 'no_refresh_token' }
    });
    return res.status(400).json({ message: 'refreshToken is required' });
  }

  try {
    const { accessToken, refreshToken: newRefresh, user } = await authService.refreshTokens(refreshToken, correlationId);

    // update cookie if present
    if (req.cookies) {
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: parseInt(process.env.REFRESH_COOKIE_MAX_AGE_MS || String(7 * 24 * 60 * 60 * 1000), 10)
      };
      res.cookie('refreshToken', newRefresh, cookieOptions);
    }

    await auditService.logEvent({
      eventType: 'auth.refresh.success',
      actor: { userId: user && (user.userId || user._id) || null, role: user && user.role || null },
      target: { type: 'User', id: user && (user.userId || user._id) || null },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });

    return res.status(200).json({ accessToken, refreshToken: newRefresh, user });
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
    return res.status(err.status || 500).json({ message: err.message });
  }
}

/**
 * POST /auth/logout
 * Requires authentication middleware to populate req.user (optional).
 */
async function logout(req, res) {
  const correlationId = req.correlationId || null;
  try {
    const refreshToken = req.cookies && req.cookies.refreshToken;
    const userId = req.user && req.user.userId;

    if (userId && refreshToken) {
      await authService.logout(userId, refreshToken, correlationId);
      await auditService.logEvent({
        eventType: 'auth.logout.success',
        actor: { userId, role: req.user.role || null },
        target: { type: 'User', id: userId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
    } else {
      await auditService.logEvent({
        eventType: 'auth.logout.attempt',
        actor: { userId: userId || null, role: req.user && req.user.role },
        target: { type: 'User', id: userId || null },
        outcome: 'partial',
        severity: 'info',
        correlationId,
        details: { hasRefreshToken: Boolean(refreshToken) }
      });
    }

    res.clearCookie('refreshToken');
    return res.status(200).json({ message: 'Logged out' });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'auth.logout.failed',
      actor: { userId: req.user && req.user.userId || null, role: req.user && req.user.role || null },
      target: { type: 'User', id: req.user && req.user.userId || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(500).json({ message: 'Logout failed' });
  }
}

/**
 * GET /auth/me
 * Protected endpoint. requireAuth middleware should populate req.user.
 */
async function me(req, res) {
  const correlationId = req.correlationId || null;
  const user = req.user || null;
  if (!user) {
    await auditService.logEvent({
      eventType: 'auth.me.failed',
      actor: { userId: null, role: null },
      target: { type: 'User', id: null },
      outcome: 'failure',
      severity: 'warn',
      correlationId,
      details: { reason: 'not_authenticated' }
    });
    return res.status(401).json({ message: 'Not authenticated' });
  }

  await auditService.logEvent({
    eventType: 'auth.me.success',
    actor: { userId: user.userId || user._id || null, role: user.role || null },
    target: { type: 'User', id: user.userId || user._id || null },
    outcome: 'success',
    severity: 'info',
    correlationId,
    details: {}
  });

  return res.status(200).json({ user });
}

module.exports = { register, login, refresh, logout, me };
