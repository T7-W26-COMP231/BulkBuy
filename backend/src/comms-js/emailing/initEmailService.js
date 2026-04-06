// src/comms/emailing/initEmailService.js
// Low-level email runtime initializer
// - Creates and verifies Nodemailer transporter (SMTP or Gmail OAuth2)
// - In-memory FIFO queue with concurrency-controlled workers
// - Token-bucket rate limiter (maxPerMinute)
// - Robust sendWithRetries used by workers and immediate sends
// - Exposes a small runtime API: { transporter, start, stop, enqueue, sendNow, renderTemplate, getStats, shutdown }
// - No business logic (templates/recipient resolution) here; intended to be composed by the higher-level email surface

const nodemailer = require('nodemailer');
const pino = require('pino');
const crypto = require('crypto');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const DEFAULTS = {
  provider: 'smtp', // 'smtp' | 'gmail'
  smtp: null,       // { host, port, secure, auth: { user, pass } }
  gmail: null,      // { user, clientId, clientSecret, refreshToken }
  from: null,
  concurrency: 3,
  rate: { maxPerMinute: 100 },
  retry: { attempts: 3, factor: 2, minMs: 500, maxMs: 30000 },
  verifyOnInit: true,
  templateRenderer: null // optional: { renderTemplate(nameOrObj, data, opts) }
};

function makeId(payload) {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify(payload || {}));
  return h.digest('hex').slice(0, 16);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/**
 * initEmailService(userConfig)
 * - userConfig: overrides DEFAULTS
 * - returns runtime API (async)
 */
async function initEmailService(userConfig = {}) {
  const cfg = Object.assign({}, DEFAULTS, userConfig || {});

  // Create transporter
  let transporter;
  if (cfg.provider === 'gmail' && cfg.gmail) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: cfg.gmail.user,
        clientId: cfg.gmail.clientId,
        clientSecret: cfg.gmail.clientSecret,
        refreshToken: cfg.gmail.refreshToken
      }
    });
  } else if (cfg.smtp) {
    transporter = nodemailer.createTransport(Object.assign({}, cfg.smtp));
  } else {
    transporter = nodemailer.createTransport({ sendmail: true });
  }

  // Optionally verify transporter (non-fatal)
  if (cfg.verifyOnInit) {
    try {
      // verify may reject; log but continue
      // eslint-disable-next-line no-await-in-loop
      await transporter.verify();
      logger.info('initEmailService: transporter verified');
    } catch (err) {
      logger.warn({ err: err && err.message }, 'initEmailService: transporter verification failed (continuing)');
    }
  }

  // Runtime state
  let running = false;
  let queue = []; // FIFO: { id, mailOpts, meta, attempts }
  let activeWorkers = 0;
  let shutdownRequested = false;

  // Token bucket
  let tokens = 0;
  let tokenRefillTimer = null;
  const perMinute = Number(cfg.rate && cfg.rate.maxPerMinute) || DEFAULTS.rate.maxPerMinute;
  const perSecond = perMinute / 60;

  function startTokenRefill() {
    tokens = Math.floor(perSecond);
    const refillMs = 1000;
    tokenRefillTimer = setInterval(() => {
      tokens = clamp(tokens + perSecond, 0, perMinute);
    }, refillMs);
  }
  function stopTokenRefill() {
    if (tokenRefillTimer) {
      clearInterval(tokenRefillTimer);
      tokenRefillTimer = null;
    }
  }

  // sendWithRetries used by workers and sendNow
  async function sendWithRetries(mailOpts, opts = {}) {
    const retryCfg = cfg.retry || DEFAULTS.retry;
    const attemptsLimit = Number(retryCfg.attempts || DEFAULTS.retry.attempts);
    const factor = Number(retryCfg.factor || DEFAULTS.retry.factor);
    const minMs = Number(retryCfg.minMs || DEFAULTS.retry.minMs);
    const maxMs = Number(retryCfg.maxMs || DEFAULTS.retry.maxMs);

    const backoff = (n) => clamp(Math.round(minMs * Math.pow(factor, Math.max(0, n - 1))), minMs, maxMs);

    let attempt = 0;
    let lastErr = null;

    while (attempt < attemptsLimit && !shutdownRequested) {
      attempt += 1;

      // wait for token (simple blocking wait)
      const tokenStart = Date.now();
      while (tokens < 1 && !shutdownRequested) {
        await sleep(100);
        // safety: break long waits after 60s to avoid infinite block
        if (Date.now() - tokenStart > 60 * 1000) break;
      }
      if (shutdownRequested) break;
      tokens = Math.max(0, tokens - 1);

      try {
        logger.debug({ to: mailOpts.to, attempt }, 'initEmailService: sending mail attempt');
        const info = await transporter.sendMail(mailOpts);
        logger.info({ to: mailOpts.to, messageId: info && info.messageId }, 'initEmailService: mail sent');
        return { ok: true, info };
      } catch (err) {
        lastErr = err;
        logger.warn({ to: mailOpts.to, attempt, err: err && err.message }, 'initEmailService: send failed');
        if (attempt >= attemptsLimit) break;
        await sleep(backoff(attempt));
      }
    }

    return { ok: false, error: lastErr ? (lastErr.message || String(lastErr)) : 'failed' };
  }

  // Worker loop
  async function workerLoop() {
    if (activeWorkers >= (cfg.concurrency || DEFAULTS.concurrency)) return;
    activeWorkers += 1;
    try {
      while (!shutdownRequested) {
        const item = queue.shift();
        if (!item) break;
        // eslint-disable-next-line no-await-in-loop
        await sendWithRetries(item.mailOpts, { meta: item.meta });
      }
    } finally {
      activeWorkers = Math.max(0, activeWorkers - 1);
    }
  }

  /* Public runtime API */

  async function start() {
    if (running) return;
    running = true;
    shutdownRequested = false;
    startTokenRefill();
    // kick initial workers
    for (let i = 0; i < (cfg.concurrency || DEFAULTS.concurrency); i += 1) {
      // do not await to allow parallelism
      // eslint-disable-next-line no-await-in-loop
      await workerLoop();
    }
    logger.info({ concurrency: cfg.concurrency, rate: cfg.rate }, 'initEmailService: started');
  }

  async function stop() {
    if (!running) return;
    shutdownRequested = true;
    stopTokenRefill();
    const startTime = Date.now();
    while (activeWorkers > 0 && Date.now() - startTime < 3000) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    running = false;
    logger.info('initEmailService: stopped');
  }

  /**
   * enqueue(mailOpts, meta)
   * - mailOpts: nodemailer sendMail options { from, to, subject, text, html, headers }
   * - meta: optional metadata (idempotencyKey, source, etc.)
   * - returns { queued: true, id }
   */
  function enqueue(mailOpts = {}, meta = {}) {
    if (!running) throw new Error('initEmailService not started');
    if (!mailOpts || !mailOpts.to) throw new Error('mailOpts.to required');

    const id = meta.idempotencyKey || makeId({ to: mailOpts.to, subject: mailOpts.subject, html: mailOpts.html, text: mailOpts.text });
    queue.push({ id, mailOpts, meta, attempts: 0 });

    // spawn workers if idle
    for (let i = 0; i < (cfg.concurrency || DEFAULTS.concurrency); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      workerLoop();
    }

    return { queued: true, id };
  }

  /**
   * sendNow(mailOpts, opts)
   * - immediate send with retries (bypasses queue)
   * - returns { ok, info|error }
   */
  async function sendNow(mailOpts = {}, opts = {}) {
    if (!running) throw new Error('initEmailService not started');
    if (!mailOpts || !mailOpts.to) throw new Error('mailOpts.to required');
    return sendWithRetries(mailOpts, opts);
  }

  /**
   * renderTemplate(templateNameOrObj, data, opts)
   * - delegates to provided templateRenderer if available; otherwise simple fallback
   * - returns { subject, html, text }
   */
  async function renderTemplate(templateNameOrObj, data = {}, opts = {}) {
    if (cfg.templateRenderer && typeof cfg.templateRenderer.renderTemplate === 'function') {
      return cfg.templateRenderer.renderTemplate(templateNameOrObj, data, opts);
    }
    // fallback simple renderer
    const safeRender = (tpl) => {
      if (!tpl) return '';
      return String(tpl).replace(/\{\{\s*([\w.$]+)\s*\}\}/g, (m, key) => {
        const parts = key.split('.');
        let val = data;
        for (const p of parts) {
          if (val == null) return '';
          val = val[p];
        }
        return val == null ? '' : String(val);
      });
    };
    const t = templateNameOrObj || {};
    const subject = safeRender(t.subjectTemplate || t.subject || '');
    const html = safeRender(t.htmlTemplate || t.html || '');
    const text = safeRender(t.textTemplate || t.text || '') || (html ? html.replace(/<\/?[^>]+(>|$)/g, '').trim() : '');
    return { subject, html, text };
  }

  function getStats() {
    return {
      running,
      queueLength: queue.length,
      activeWorkers,
      tokens: Math.floor(tokens)
    };
  }

  async function shutdown(opts = {}) {
    const { timeoutMs = 5000 } = opts || {};
    if (!running) return;
    shutdownRequested = true;
    stopTokenRefill();
    const startTime = Date.now();
    while ((queue.length > 0 || activeWorkers > 0) && (Date.now() - startTime) < timeoutMs) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    if (queue.length > 0) {
      logger.warn({ remaining: queue.length }, 'initEmailService: shutdown dropping remaining queued items');
      queue = [];
    }
    running = false;
    transporter = null;
    shutdownRequested = false;
    logger.info('initEmailService: shutdown complete');
  }

  // Return runtime API
  return {
    transporter,
    start,
    stop,
    enqueue,
    sendNow,
    renderTemplate,
    getStats,
    shutdown,
    _internals: { cfg } // for tests/inspection
  };
}

module.exports = initEmailService;
