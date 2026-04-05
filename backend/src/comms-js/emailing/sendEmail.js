// src/comms/emailing/sendEmail.js
// Factory that returns sendEmail(runtime, renderer, deps) => async function sendEmail(opts)
// - runtime: object returned by initEmailService (expects enqueue, sendNow, renderTemplate, getStats)
// - renderer: { renderTemplate(nameOrObj, data, opts) } (optional; runtime may already expose renderTemplate)
// - deps: { logger, userAccess } optional helpers

const assert = require('assert');

module.exports = function sendEmailFactory(runtime, renderer, deps = {}) {
  if (!runtime) throw new Error('sendEmailFactory requires runtime (initEmailService result)');
  const log = (deps && deps.logger) || (runtime && runtime._internals && runtime._internals.cfg && runtime._internals.cfg.logger) || console;

  // prefer renderer from runtime if available
  const tplRenderer = (runtime && typeof runtime.renderTemplate === 'function') ? runtime.renderTemplate : (renderer && typeof renderer.renderTemplate === 'function' ? renderer.renderTemplate : null);

  /**
   * sendEmail
   * @param {Object} opts
   *   - to: string | string[] (required)
   *   - template: string | { name, subjectTemplate, htmlTemplate, textTemplate } | { subject, html, text }
   *   - data: object applied to template
   *   - meta: { idempotencyKey, from, headers, source } optional
   *   - immediate: boolean (true => sendNow, default false => enqueue)
   *   - timeoutMs: number optional for immediate sends
   *
   * @returns {Promise<{ ok: boolean, id?: string, info?: any, error?: string }>}
   */
  return async function sendEmail(opts = {}) {
    try {
      // Basic validation
      if (!opts || typeof opts !== 'object') throw new Error('opts object required');
      const { to, template = {}, data = {}, meta = {}, immediate = false, timeoutMs = 30000 } = opts;

      if (!to || (Array.isArray(to) && to.length === 0)) {
        return { ok: false, error: '"to" is required and must be an email or array of emails' };
      }

      // Normalize recipients to string or comma list for nodemailer
      const normalizedTo = Array.isArray(to) ? to.map(t => String(t).trim()).filter(Boolean).join(',') : String(to).trim();

      // Render template using renderer (runtime or provided)
      let rendered = { subject: '', html: '', text: '' };
      if (tplRenderer) {
        try {
          rendered = await tplRenderer(template, data, { allowHtml: true });
          // ensure strings
          rendered.subject = rendered.subject ? String(rendered.subject) : '';
          rendered.html = rendered.html ? String(rendered.html) : '';
          rendered.text = rendered.text ? String(rendered.text) : '';
        } catch (err) {
          log.warn && log.warn({ err: err && err.message }, 'sendEmail: template render failed');
          return { ok: false, error: `template render failed: ${err && err.message}` };
        }
      } else {
        // Fallback: if template is object with subject/html/text, use directly
        if (typeof template === 'object') {
          rendered.subject = template.subject || template.subjectTemplate || '';
          rendered.html = template.html || template.htmlTemplate || '';
          rendered.text = template.text || template.textTemplate || '';
        }
      }

      // Compose mail options
      const mailOpts = {
        from: meta.from || (runtime && runtime._internals && runtime._internals.cfg && runtime._internals.cfg.from) || undefined,
        to: normalizedTo,
        subject: rendered.subject || meta.subject || '',
        html: rendered.html || '',
        text: rendered.text || ''
      };

      // Attach headers if provided
      if (meta.headers && typeof meta.headers === 'object') {
        mailOpts.headers = Object.assign({}, meta.headers);
      }

      // Idempotency key
      const idempotencyKey = meta.idempotencyKey || (meta.idempotency && meta.idempotency.key) || (() => {
        // deterministic-ish key
        const payload = { to: normalizedTo, subject: mailOpts.subject, html: mailOpts.html, text: mailOpts.text };
        return require('crypto').createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
      })();

      // Immediate send vs enqueue
      if (immediate && typeof runtime.sendNow === 'function') {
        try {
          const res = await runtime.sendNow(mailOpts, { meta, timeoutMs });
          if (res && res.ok) {
            log.info && log.info({ idempotencyKey, to: normalizedTo, messageId: res.info && res.info.messageId }, 'sendEmail: immediate send success');
            return { ok: true, id: idempotencyKey, info: res.info };
          }
          log.warn && log.warn({ idempotencyKey, to: normalizedTo, err: res && res.error }, 'sendEmail: immediate send failed');
          return { ok: false, error: res && res.error ? res.error : 'immediate send failed' };
        } catch (err) {
          log.error && log.error({ err: err && err.message }, 'sendEmail: immediate send exception');
          return { ok: false, error: err && err.message ? err.message : String(err) };
        }
      }

      // Enqueue for background delivery
      if (typeof runtime.enqueue !== 'function') {
        return { ok: false, error: 'email runtime does not support enqueue' };
      }

      try {
        const q = runtime.enqueue(mailOpts, Object.assign({}, meta, { idempotencyKey }));
        log.debug && log.debug({ idempotencyKey, to: normalizedTo }, 'sendEmail: enqueued');
        return { ok: true, id: q.id };
      } catch (err) {
        log.error && log.error({ err: err && err.message }, 'sendEmail: enqueue failed');
        return { ok: false, error: err && err.message ? err.message : String(err) };
      }
    } catch (err) {
      // Unexpected error
      (deps && deps.logger && deps.logger.error) ? deps.logger.error({ err: err && err.message }, 'sendEmail: unexpected') : console.error(err);
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  };
};
