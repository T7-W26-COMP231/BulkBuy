// src/comms/emailing/emailService.js
// High-level email service (business layer).
// - Composes runtime via initEmailService and uses renderTemplate for templating.
// - Exposes: init(config), sendEmail(opts), sendBulk(opts), sendToRecipients(spec, template, data, opts), shutdown(), getStats()
// - Delegates heavy work to specialized modules (sendEmail, sendBulk, sendToRecipients factories if present).
// - Non-disruptive: if factories are missing, provides sensible defaults that use renderer/runtime.

const pino = require('pino');
const assert = require('assert');

const initEmailService = require('./initEmailService'); // runtime factory
const defaultRenderer = require('./renderTemplate'); // { renderTemplate(name, payload, opts, deps) }
const userAccess = require('../user.access/user.access'); // resolveRecipients helper (optional)

// Business factories (may be factory functions or direct functions)
let sendEmailFactory;
let sendBulkFactory;
let sendToRecipientsFactory;

try { sendEmailFactory = require('./sendEmail'); } catch (e) { sendEmailFactory = null; }
try { sendBulkFactory = require('./sendBulk'); } catch (e) { sendBulkFactory = null; }
try { sendToRecipientsFactory = require('./sendToRecipients'); } catch (e) { sendToRecipientsFactory = null; }

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

/* Module state */
let runtime = null;
let services = {
  sendEmail: null,
  sendBulk: null,
  sendToRecipients: null
};
let initialized = false;
let runtimeConfig = null;

/* Helpers */
function ensureInitialized() {
  if (!initialized || !runtime) throw new Error('emailService not initialized. Call init(config) first.');
}

function makeId(seed = {}) {
  try {
    const s = JSON.stringify(seed);
    return require('crypto').createHash('sha1').update(s).digest('hex').slice(0, 12);
  } catch (e) {
    return String(Date.now()).slice(-12);
  }
}

/**
 * init(config)
 * - config forwarded to initEmailService
 * - config.templateRenderer optional; if not provided, uses default renderTemplate
 * - returns module.exports for convenience
 */
async function init(config = {}) {
  if (initialized) {
    logger.debug('emailService: already initialized');
    return module.exports;
  }

  runtimeConfig = Object.assign({}, config || {});
  const renderer = runtimeConfig.templateRenderer || defaultRenderer;

  // Create runtime (transporter, queue, rate limiter)
  runtime = await initEmailService(Object.assign({}, runtimeConfig, { templateRenderer: renderer }));

  // Start runtime if available
  if (runtime && typeof runtime.start === 'function') {
    await runtime.start();
  }

  // Wire business services. Support two shapes:
  // 1) factory: module.exports = (runtime, renderer, deps) => async function(opts) { ... }
  // 2) direct function: module.exports = async function(opts) { ... }
  try {
    if (typeof sendEmailFactory === 'function') {
      const maybe = sendEmailFactory(runtime, renderer, { userAccess, logger });
      services.sendEmail = typeof maybe === 'function' ? maybe : sendEmailFactory;
    }
  } catch (e) {
    services.sendEmail = sendEmailFactory;
  }

  try {
    if (typeof sendBulkFactory === 'function') {
      const maybe = sendBulkFactory(runtime, renderer, { userAccess, logger });
      services.sendBulk = typeof maybe === 'function' ? maybe : sendBulkFactory;
    }
  } catch (e) {
    services.sendBulk = sendBulkFactory;
  }

  try {
    if (typeof sendToRecipientsFactory === 'function') {
      const maybe = sendToRecipientsFactory(runtime, renderer, { userAccess, logger });
      services.sendToRecipients = typeof maybe === 'function' ? maybe : sendToRecipientsFactory;
    }
  } catch (e) {
    services.sendToRecipients = sendToRecipientsFactory;
  }

  // Provide defaults when factories are missing

  if (!services.sendEmail) {
    services.sendEmail = async function defaultSendEmail(opts = {}) {
      // opts: { to, template, data, meta, immediate }
      const { to, template = {}, data = {}, meta = {}, immediate = false } = opts;
      if (!to) throw new Error('sendEmail: "to" required');

      // renderer may be an object exposing renderTemplate or a function
      const render = (typeof renderer.renderTemplate === 'function') ? renderer.renderTemplate : (renderer.render || renderer);
      if (!render || typeof render !== 'function') throw new Error('no renderer available');

      const rendered = await render(template, data, { allowHtml: true });
      const mailOpts = {
        from: meta.from || runtimeConfig.from || rendered.from,
        to,
        subject: rendered.subject || meta.subject || '',
        html: rendered.html || '',
        text: rendered.text || ''
      };

      if (immediate && runtime && typeof runtime.sendNow === 'function') {
        return runtime.sendNow(mailOpts, { meta });
      }
      if (!runtime || typeof runtime.enqueue !== 'function') {
        throw new Error('runtime enqueue not available');
      }
      return runtime.enqueue(mailOpts, Object.assign({}, meta, { idempotencyKey: meta.idempotencyKey || makeId({ to: mailOpts.to, subject: mailOpts.subject }) }));
    };
  }

  if (!services.sendBulk) {
    services.sendBulk = async function defaultSendBulk(opts = {}) {
      // opts: { recipients, template, dataList, chunkSize, dedupe, idempotencyPrefix, meta }
      const {
        recipients = [], template = {}, dataList = [], chunkSize = 100, dedupe = true, idempotencyPrefix = 'bulk', meta = {}
      } = opts;

      if (!Array.isArray(recipients) || recipients.length === 0) return { queued: 0, deduped: 0, skipped: 0, errors: [] };

      const render = (typeof renderer.renderTemplate === 'function') ? renderer.renderTemplate : (renderer.render || renderer);
      if (!render || typeof render !== 'function') throw new Error('no renderer available');

      const normalized = recipients.map((r, idx) => {
        if (!r) return null;
        if (typeof r === 'string') return { to: String(r).trim(), data: Array.isArray(dataList) ? (dataList[idx] || {}) : (dataList || {}) };
        return { to: String(r.to).trim(), data: r.data || (Array.isArray(dataList) ? (dataList[idx] || {}) : (dataList || {})) };
      }).filter(Boolean);

      const seen = new Set();
      let queued = 0;
      let deduped = 0;
      const errors = [];

      for (const rec of normalized) {
        const key = rec.to.toLowerCase();
        if (dedupe && seen.has(key)) {
          deduped += 1;
          continue;
        }
        seen.add(key);

        try {
          const rendered = await render(template, rec.data || {}, { allowHtml: true });
          const mailOpts = {
            from: meta.from || runtimeConfig.from || rendered.from,
            to: rec.to,
            subject: rendered.subject || meta.subject || '',
            html: rendered.html || '',
            text: rendered.text || ''
          };
          const idempotencyKey = idempotencyPrefix ? `${idempotencyPrefix}:${makeId({ to: rec.to.toLowerCase(), subject: mailOpts.subject })}` : makeId({ to: rec.to.toLowerCase(), subject: mailOpts.subject });
          runtime.enqueue(mailOpts, Object.assign({}, meta, { idempotencyKey }));
          queued += 1;
        } catch (err) {
          errors.push({ to: rec.to, error: err && err.message });
        }
      }

      return { queued, deduped, skipped: Math.max(0, normalized.length - queued - deduped), errors };
    };
  }

  if (!services.sendToRecipients) {
    services.sendToRecipients = async function defaultSendToRecipients(spec = {}, template = {}, data = {}, opts = {}) {
      // resolve recipients via userAccess
      const resolved = await userAccess.resolveRecipients(spec || {});
      const emails = Array.isArray(resolved.emails) ? resolved.emails : [];
      const recipients = emails.map((e, idx) => ({ to: e, data: Array.isArray(data) ? (data[idx] || {}) : (data || {}) }));

      // include explicit spec.emails
      if (spec && spec.emails) {
        const explicit = Array.isArray(spec.emails) ? spec.emails : [spec.emails];
        explicit.forEach((e) => {
          const normalized = String(e || '').trim();
          if (normalized && !recipients.find(r => r.to.toLowerCase() === normalized.toLowerCase())) {
            recipients.push({ to: normalized, data: data || {} });
          }
        });
      }

      return services.sendBulk(Object.assign({}, opts, { recipients, template, dataList: Array.isArray(data) ? data : [] }));
    };
  }

  initialized = true;
  logger.info('emailService: initialized and wired');
  return module.exports;
}

/* Delegated API wrappers */

async function sendEmail(opts = {}) {
  ensureInitialized();
  return services.sendEmail(opts);
}

async function sendBulk(opts = {}) {
  ensureInitialized();
  return services.sendBulk(opts);
}

async function sendToRecipients(spec = {}, template = {}, data = {}, opts = {}) {
  ensureInitialized();
  return services.sendToRecipients(spec, template, data, opts);
}

/* Shutdown and stats */

async function shutdown(opts = {}) {
  if (!initialized) return;
  try {
    if (runtime && typeof runtime.shutdown === 'function') {
      await runtime.shutdown(opts);
    } else if (runtime && typeof runtime.stop === 'function') {
      await runtime.stop();
    }
  } catch (err) {
    logger.warn({ err: err && err.message }, 'emailService.shutdown: runtime error');
  } finally {
    runtime = null;
    services = { sendEmail: null, sendBulk: null, sendToRecipients: null };
    initialized = false;
    logger.info('emailService: shutdown complete');
  }
}

function getStats() {
  if (!runtime) return { initialized: false };
  if (typeof runtime.getStats === 'function') return runtime.getStats();
  return { initialized };
}

/* Exports */
module.exports = {
  init,
  sendEmail,
  sendBulk,
  sendToRecipients,
  shutdown,
  getStats
};
