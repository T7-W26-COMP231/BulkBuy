// src/comms/emailing/sendBulk.js
// Factory: (runtime, renderer, deps) => sendBulk(opts)
// - runtime: initEmailService result (expects enqueue, renderTemplate)
// - renderer: optional { renderTemplate(nameOrObj, data, opts) }
// - deps: optional { logger }
// - sendBulk opts:
//    { recipients, template, dataList, chunkSize, dedupe, idempotencyPrefix, meta }
// - Returns: { ok: true, queued, deduped, skipped, errors }

const crypto = require('crypto');

module.exports = function sendBulkFactory(runtime, renderer, deps = {}) {
  if (!runtime) throw new Error('sendBulkFactory requires runtime (initEmailService result)');
  const logger = (deps && deps.logger) || (runtime && runtime._internals && runtime._internals.cfg && runtime._internals.cfg.logger) || console;
  const tplRenderer = (runtime && typeof runtime.renderTemplate === 'function') ? runtime.renderTemplate : (renderer && typeof renderer.renderTemplate === 'function' ? renderer.renderTemplate : null);

  function makeId(payload) {
    const h = crypto.createHash('sha256');
    h.update(JSON.stringify(payload || {}));
    return h.digest('hex').slice(0, 16);
  }

  function normalizeRecipients(recipients = [], dataList = []) {
    if (!Array.isArray(recipients)) return [];
    return recipients.map((r, idx) => {
      if (!r) return null;
      if (typeof r === 'string') {
        return { to: String(r).trim(), data: Array.isArray(dataList) ? (dataList[idx] || {}) : (dataList || {}) };
      }
      if (r && r.to) {
        return { to: String(r.to).trim(), data: r.data || (Array.isArray(dataList) ? (dataList[idx] || {}) : (dataList || {})) };
      }
      return null;
    }).filter(Boolean);
  }

  /**
   * sendBulk(opts)
   */
  return async function sendBulk(opts = {}) {
    if (!opts || typeof opts !== 'object') throw new Error('sendBulk requires an options object');

    const {
      recipients = [],
      template = {},
      dataList = [],
      chunkSize = 100,
      dedupe = true,
      idempotencyPrefix = 'bulk',
      meta = {}
    } = opts;

    // Basic checks
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return { ok: true, queued: 0, deduped: 0, skipped: 0, errors: [] };
    }
    if (!runtime || typeof runtime.enqueue !== 'function') {
      throw new Error('sendBulk requires runtime.enqueue to be available');
    }

    const normalized = normalizeRecipients(recipients, dataList);
    const seen = new Set();
    const errors = [];
    let queued = 0;
    let deduped = 0;

    // Process in chunks to avoid spikes
    for (let i = 0; i < normalized.length; i += chunkSize) {
      const chunk = normalized.slice(i, i + chunkSize);

      // Render and enqueue each recipient in the chunk
      for (const rec of chunk) {
        try {
          const emailLower = (rec.to || '').toLowerCase();
          if (!emailLower) {
            errors.push({ to: rec.to, error: 'invalid recipient' });
            continue;
          }

          if (dedupe) {
            if (seen.has(emailLower)) {
              deduped += 1;
              continue;
            }
            seen.add(emailLower);
          }

          // Render per-recipient template
          let rendered = { subject: '', html: '', text: '' };
          if (tplRenderer) {
            try {
              rendered = await tplRenderer(template, rec.data || {}, { allowHtml: true });
            } catch (err) {
              logger && logger.warn && logger.warn({ to: rec.to, err: err && err.message }, 'sendBulk: template render failed for recipient');
              errors.push({ to: rec.to, error: `render failed: ${err && err.message}` });
              continue;
            }
          } else if (typeof template === 'object') {
            // fallback simple mapping
            rendered.subject = template.subject || template.subjectTemplate || '';
            rendered.html = template.html || template.htmlTemplate || '';
            rendered.text = template.text || template.textTemplate || '';
          }

          // Compose mail options
          const mailOpts = {
            from: meta.from || (runtime._internals && runtime._internals.cfg && runtime._internals.cfg.from) || undefined,
            to: rec.to,
            subject: rendered.subject || meta.subject || '',
            html: rendered.html || '',
            text: rendered.text || ''
          };

          if (meta.headers && typeof meta.headers === 'object') {
            mailOpts.headers = Object.assign({}, meta.headers);
          }

          // Idempotency key per recipient + template
          const idempotencyKey = idempotencyPrefix
            ? `${idempotencyPrefix}:${makeId({ to: emailLower, subject: mailOpts.subject, html: mailOpts.html, text: mailOpts.text })}`
            : makeId({ to: emailLower, subject: mailOpts.subject, html: mailOpts.html, text: mailOpts.text });

          // Enqueue
          try {
            runtime.enqueue(mailOpts, Object.assign({}, meta, { idempotencyKey }));
            queued += 1;
          } catch (err) {
            logger && logger.error && logger.error({ to: rec.to, err: err && err.message }, 'sendBulk: enqueue failed');
            errors.push({ to: rec.to, error: err && err.message });
          }
        } catch (err) {
          // Catch per-recipient unexpected errors
          logger && logger.error && logger.error({ err: err && err.message }, 'sendBulk: unexpected error for recipient');
          errors.push({ to: (rec && rec.to) || null, error: err && err.message ? err.message : String(err) });
        }
      }

      // allow event loop breathing between chunks
      await new Promise((res) => setImmediate(res));
    }

    const skipped = Math.max(0, normalized.length - queued - deduped);
    return { ok: true, queued, deduped, skipped, errors };
  };
};
