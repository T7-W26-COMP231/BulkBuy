// src/comms/emailing/sendToRecipients.js
// Factory: (runtime, renderer, deps) => sendToRecipients(spec, template, data, opts)
// - runtime: initEmailService result (used for enqueue/sendNow if needed)
// - renderer: optional { renderTemplate(nameOrObj, data, opts) }
// - deps: { userAccess, sendBulk (optional), logger (optional) }
// - Behavior:
//    * Resolves recipients via userAccess.resolveRecipients(spec)
//    * Builds recipients list (emails) and merges explicit spec.emails
//    * Calls sendBulk to perform dedupe/chunk/enqueue
//    * Returns detailed summary: { ok, summary: { resolvedUserIds, resolvedEmails, socketIds, queued, deduped }, details, errors }
// - Non-disruptive: delegates heavy lifting to userAccess and sendBulk

const assert = require('assert');

module.exports = function sendToRecipientsFactory(runtime, renderer, deps = {}) {
  if (!runtime) throw new Error('sendToRecipientsFactory requires runtime (initEmailService result)');

  const logger = deps.logger || console;
  const userAccess = deps.userAccess;
  if (!userAccess || typeof userAccess.resolveRecipients !== 'function') {
    throw new Error('sendToRecipientsFactory requires deps.userAccess.resolveRecipients');
  }

  // Prefer a provided sendBulk implementation; otherwise try to require the local factory and instantiate it.
  let sendBulkFn = deps.sendBulk;
  if (!sendBulkFn) {
    try {
      // require local sendBulk factory and instantiate with runtime/renderer/logger
      // Note: this will throw if file not present; caller should provide sendBulk in that case.
      // eslint-disable-next-line global-require
      const sendBulkFactory = require('./sendBulk');
      sendBulkFn = sendBulkFactory(runtime, renderer, { logger });
    } catch (e) {
      // leave sendBulkFn undefined; we'll error later if missing
      logger && logger.debug && logger.debug({ err: e && e.message }, 'sendToRecipientsFactory: local sendBulk not available');
    }
  }

  if (!sendBulkFn || typeof sendBulkFn !== 'function') {
    throw new Error('sendToRecipientsFactory requires a sendBulk function (provide via deps.sendBulk or ensure ./sendBulk exists)');
  }

  /**
   * sendToRecipients
   * @param {Object} spec - { ids, userIds, region, role, emails, includeDeleted }
   * @param {String|Object} template - template name or template object
   * @param {Object|Array} data - single data object or array of per-recipient data
   * @param {Object} opts - { chunkSize, dedupe, idempotencyPrefix, meta }
   *
   * @returns {Promise<Object>} { ok, summary, details, errors }
   */
  return async function sendToRecipients(spec = {}, template = {}, data = {}, opts = {}) {
    try {
      // Validate spec shape
      if (!spec || typeof spec !== 'object') spec = {};

      // Resolve recipients via userAccess
      const resolved = await userAccess.resolveRecipients(spec || {});
      const resolvedUserIds = Array.isArray(resolved.userIds) ? resolved.userIds : [];
      const resolvedEmails = Array.isArray(resolved.emails) ? resolved.emails : [];
      const socketIds = Array.isArray(resolved.socketIds) ? resolved.socketIds : [];

      // Build recipients array for sendBulk: array of { to, data }
      const recipients = [];

      // If data is an array, it should align with resolvedEmails order when possible
      const isDataArray = Array.isArray(data);

      for (let i = 0; i < resolvedEmails.length; i += 1) {
        const email = resolvedEmails[i];
        const perData = isDataArray ? (data[i] || {}) : (data || {});
        if (email) recipients.push({ to: String(email).trim(), data: perData });
      }

      // Include explicit emails from spec (if any) that may not be in resolvedEmails
      if (spec.emails) {
        const explicit = Array.isArray(spec.emails) ? spec.emails : [spec.emails];
        for (let i = 0; i < explicit.length; i += 1) {
          const e = explicit[i];
          if (!e) continue;
          const normalized = String(e).trim();
          const exists = recipients.find(r => r.to.toLowerCase() === normalized.toLowerCase());
          if (!exists) {
            const perData = isDataArray ? (data[recipients.length] || {}) : (data || {});
            recipients.push({ to: normalized, data: perData });
          }
        }
      }

      // Nothing to send: return resolved info
      if (!recipients.length) {
        return {
          ok: true,
          summary: {
            resolvedUserIds,
            resolvedEmails,
            socketIds,
            queued: 0,
            deduped: 0
          },
          details: { emailResults: null },
          errors: []
        };
      }

      // Prepare sendBulk options
      const bulkOpts = {
        recipients,
        template,
        dataList: Array.isArray(data) ? data : [],
        chunkSize: opts.chunkSize || 100,
        dedupe: typeof opts.dedupe === 'boolean' ? opts.dedupe : true,
        idempotencyPrefix: opts.idempotencyPrefix || 'recips',
        meta: opts.meta || {}
      };

      // Call sendBulk
      const bulkResult = await sendBulkFn(bulkOpts);

      // Normalize bulkResult shape
      const queued = (bulkResult && (bulkResult.queued || bulkResult.sent || 0)) || 0;
      const deduped = (bulkResult && (bulkResult.deduped || 0)) || 0;
      const errors = Array.isArray(bulkResult && bulkResult.errors) ? bulkResult.errors : (bulkResult && bulkResult.error ? [bulkResult.error] : []);

      const summary = {
        resolvedUserIds,
        resolvedEmails,
        socketIds,
        queued,
        deduped
      };

      const details = {
        emailResults: bulkResult
      };

      return { ok: true, summary, details, errors };
    } catch (err) {
      logger && logger.error && logger.error({ err: err && err.message }, 'sendToRecipients: unexpected error');
      return { ok: false, summary: null, details: null, errors: [err && err.message ? err.message : String(err)] };
    }
  };
};
