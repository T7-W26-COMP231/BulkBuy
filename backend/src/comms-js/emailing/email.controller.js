// src/comms/emailing/email.controller.js
/**
 * Email controller
 *
 * Exposes HTTP handlers for the emailService business API:
 *  - POST /api/comms/email/send         -> send a single email
 *  - POST /api/comms/email/bulk         -> send bulk emails (queued)
 *  - POST /api/comms/email/to-recipients-> resolve recipients and send
 *  - GET  /api/comms/email/stats        -> runtime stats (admin)
 *  - POST /api/comms/email/shutdown     -> graceful shutdown (admin)
 *
 * Handlers are defensive and return friendly JSON shapes:
 *  { ok: true, ... } on success
 *  Errors are forwarded to next(err) so express error middleware can format responses.
 */

const createError = require("http-errors");
const pino = require("pino");
const emailService = require("./emailService");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

/**
 * POST /api/comms/email/send
 * Body:
 *  {
 *    to: string | [string],
 *    template: object | string,
 *    data: object,
 *    meta: object,
 *    immediate: boolean
 *  }
 */
async function sendEmail(req, res, next) {
  try {
    const body = req.body || {};
    // Basic validation (more thorough validation lives in validators)
    if (!body.to) return next(createError(400, "to is required"));
    // Delegate to service
    const result = await emailService.sendEmail({
      to: body.to,
      template: body.template || {},
      data: body.data || {},
      meta: body.meta || {},
      immediate: Boolean(body.immediate),
    });
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    logger.warn({ err: err && err.message }, "email.send failed");
    return next(err);
  }
}

/**
 * POST /api/comms/email/bulk
 * Body:
 *  {
 *    recipients: [{ to, data }] | [string],
 *    template: object | string,
 *    dataList: [object],
 *    chunkSize: number,
 *    dedupe: boolean,
 *    idempotencyPrefix: string,
 *    meta: object
 *  }
 */
async function sendBulk(req, res, next) {
  try {
    const body = req.body || {};
    const recipients = body.recipients || [];
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return next(createError(400, "recipients array is required for bulk send"));
    }

    const opts = {
      recipients,
      template: body.template || {},
      dataList: Array.isArray(body.dataList) ? body.dataList : [],
      chunkSize: Number(body.chunkSize || 100),
      dedupe: body.dedupe !== false,
      idempotencyPrefix: body.idempotencyPrefix || "bulk",
      meta: body.meta || {},
    };

    const result = await emailService.sendBulk(opts);
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    logger.warn({ err: err && err.message }, "email.bulk failed");
    return next(err);
  }
}

/**
 * POST /api/comms/email/to-recipients
 * Body:
 *  {
 *    spec: object (recipient spec for resolver),
 *    template: object | string,
 *    data: object | [object],
 *    opts: object
 *  }
 *
 * This endpoint resolves recipients (via userAccess) and then delegates to sendBulk.
 */
async function sendToRecipients(req, res, next) {
  try {
    const body = req.body || {};
    const spec = body.spec || {};
    if (!spec) return next(createError(400, "spec is required"));

    const template = body.template || {};
    const data = body.data || {};
    const opts = Object.assign({}, body.opts || {});

    const result = await emailService.sendToRecipients(spec, template, data, opts);
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    logger.warn({ err: err && err.message }, "email.sendToRecipients failed");
    return next(err);
  }
}

/**
 * GET /api/comms/email/stats
 * Admin-only: returns runtime stats from emailService.getStats()
 */
async function getStats(req, res, next) {
  try {
    // requireRole('administrator') should be applied at route level
    const stats = emailService.getStats();
    return res.status(200).json({ ok: true, stats });
  } catch (err) {
    logger.warn({ err: err && err.message }, "email.stats failed");
    return next(err);
  }
}

/**
 * POST /api/comms/email/shutdown
 * Admin-only: gracefully shutdown runtime (useful for maintenance)
 * Body: { force: boolean } (optional)
 */
async function shutdown(req, res, next) {
  try {
    // requireRole('administrator') should be applied at route level
    const opts = req.body || {};
    await emailService.shutdown(opts);
    return res.status(200).json({ ok: true, shutdown: true });
  } catch (err) {
    logger.warn({ err: err && err.message }, "email.shutdown failed");
    return next(err);
  }
}

/* Export handlers */
module.exports = {
  sendEmail,
  sendBulk,
  sendToRecipients,
  getStats,
  shutdown,
};
