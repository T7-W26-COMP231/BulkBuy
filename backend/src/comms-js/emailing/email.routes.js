// src/comms/emailing/email.routes.js
/**
 * Email routes
 *
 * Mount under: app.use('/api/comms/email', router)
 *
 * Routes:
 *  POST  /send           -> send a single email (auth required)
 *  POST  /bulk           -> send bulk emails (auth required)
 *  POST  /to-recipients  -> resolve recipients and send (auth required)
 *  GET   /stats          -> runtime stats (admin only)
 *  POST  /shutdown       -> graceful shutdown (admin only)
 *
 * Notes:
 * - Uses requireAuth and requireRole middleware from the app.
 * - Uses optional validation middleware (validators.email.*) where available.
 * - Rate-limit bulk endpoint to protect runtime (adjust window/max as needed).
 */

const express = require('express');
const router = express.Router();

const emailCtrl = require('./email.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');
const rateLimit = require('../../middleware/rateLimit.middleware');

// Optional validators (implement or replace with your validation library)
let validators = {};
try {
  validators = require('./email.validators');
} catch (e) {
  validators = {};
}

/* Rate limiters */
const bulkRateLimiter = rateLimit ? rateLimit({ windowMs: 60 * 1000, max: 10 }) : (req, res, next) => next();

/* POST /send
 * Body: { to, template, data, meta, immediate }
 */
router.post(
  'em/send',
  requireAuth,
  validators.validateSend ? validators.validateSend : (req, res, next) => next(),
  async (req, res, next) => emailCtrl.sendEmail(req, res, next)
);

/* POST /bulk
 * Body: { recipients, template, dataList, chunkSize, dedupe, idempotencyPrefix, meta }
 * Rate-limited to avoid accidental overload
 */
router.post(
  'em/bulk',
  requireAuth,
  bulkRateLimiter,
  validators.validateBulk ? validators.validateBulk : (req, res, next) => next(),
  async (req, res, next) => emailCtrl.sendBulk(req, res, next)
);

/* POST /to-recipients
 * Body: { spec, template, data, opts }
 * Resolves recipients via user access and delegates to bulk send
 */
router.post(
  'em/to-recipients',
  requireAuth,
  validators.validateToRecipients ? validators.validateToRecipients : (req, res, next) => next(),
  async (req, res, next) => emailCtrl.sendToRecipients(req, res, next)
);

/* GET /stats
 * Admin-only: returns runtime stats
 */
router.get(
  'em/stats',
  requireAuth,
  requireRole('administrator'),
  async (req, res, next) => emailCtrl.getStats(req, res, next)
);

/* POST /shutdown
 * Admin-only: graceful shutdown (body: { force: boolean } optional)
 */
router.post(
  'em/shutdown',
  requireAuth,
  requireRole('administrator'),
  async (req, res, next) => emailCtrl.shutdown(req, res, next)
);

module.exports = router;
