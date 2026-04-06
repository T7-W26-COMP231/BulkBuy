// src/comms/emailing/renderTemplate.js
// Polished renderer that drives function-style templates from templatesRegistry
// and optionally delegates to a renderer adapter (e.g., a templating service).
//
// Exports:
//   renderTemplate(name, payload, opts = {}, deps = {}) => Promise<{ subject, html, text, attachments }>
//
// Behavior:
// - Loads template function from templatesRegistry and calls it with (payload, opts, deps).
// - Accepts template functions that are sync or async.
// - If an external renderer (opts.renderer) is provided and exposes prepareMail or renderTemplate,
//   prefer delegating to it for final rendering (but still normalize and compute attachments).
// - Normalizes output to { subject, html, text, attachments } and always returns both html and text
//   (text may be generated from html if missing).
// - Merges attachments from template output and opts.attachments; deduplicates by filename or id when possible.
// - Provides robust logging and graceful fallbacks.

const templatesRegistry = require('./templatesRegistry');

function isPromise(v) {
  return v && typeof v.then === 'function';
}

function ensureString(v) {
  return v == null ? '' : String(v);
}

function dedupeAttachments(arr = []) {
  const seen = new Set();
  const out = [];
  for (const a of arr || []) {
    // normalize key: prefer id, then filename, then JSON string
    const key = (a && (a.id || a._id || a.filename)) ? String(a.id || a._id || a.filename) : JSON.stringify(a);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}

/**
 * renderTemplate
 * @param {String} name - template name registered in templatesRegistry
 * @param {Object} payload - template payload (order doc, user, etc)
 * @param {Object} opts - { renderer, allowHtml, sanitizeOptions, inlineItemLimit, templateObj, attachments, logger, helpers }
 * @param {Object} deps - { itemRepo, userRepo, ItemModel, UserModel, logger } passed through to templates
 *
 * Returns: Promise<{ subject, html, text, attachments }>
 */
async function renderTemplate(name, payload = {}, opts = {}, deps = {}) {
  const logger = (opts && opts.logger) || (deps && deps.logger) || console;
  if (!name) throw new Error('template name is required');

  // Normalize opts
  const {
    renderer = null,
    attachments: optsAttachments = [],
    allowHtml = true,
    sanitizeOptions = {},
    inlineItemLimit = undefined,
    templateObj = null,
    helpers = {}
  } = opts || {};

  // 1) Get template function
  const tplFn = templatesRegistry.get(name);
  if (!tplFn) throw new Error(`template not found: ${name}`);

  // 2) Call template function (it may be async)
  let tplResult;
  try {
    const res = tplFn(payload, { allowHtml, sanitizeOptions, inlineItemLimit, templateObj, helpers }, deps);
    tplResult = isPromise(res) ? await res : res;
  } catch (err) {
    logger && logger.error && logger.error({ err: err && err.message, template: name }, 'renderTemplate: template function failed');
    throw err;
  }

  if (!tplResult || typeof tplResult !== 'object') {
    throw new Error(`template ${name} returned invalid result`);
  }

  // Normalize template output
  const tplSubject = ensureString(tplResult.subject || tplResult.title || '');
  const tplHtml = tplResult.html || tplResult.bodyHtml || '';
  const tplText = tplResult.text || tplResult.bodyText || '';

  // Merge attachments (template attachments + opts attachments)
  const mergedAttachments = dedupeAttachments([].concat(tplResult.attachments || [], optsAttachments || []));

  // 3) If a renderer adapter is provided, prefer it for final rendering
  //    - prepareMail(templateRef, data, opts) => { subject, html, text, attachments }
  //    - renderTemplate(templateName, data, opts) => { subject, html, text }
  if (renderer && typeof renderer === 'object') {
    try {
      // If renderer.prepareMail exists, call it with templateObj or template name
      if (typeof renderer.prepareMail === 'function') {
        const templateRef = templateObj || name;
        const mail = await renderer.prepareMail(templateRef, payload, {
          allowHtml,
          sanitizeOptions,
          inlineItemLimit,
          attachments: mergedAttachments,
          templateRegistry: templatesRegistry
        });
        // normalize renderer output
        const subject = ensureString(mail && mail.subject ? mail.subject : tplSubject);
        const html = mail && mail.html ? String(mail.html) : String(tplHtml || '');
        const text = mail && mail.text ? String(mail.text) : String(tplText || '');
        const attachments = dedupeAttachments([].concat(mail.attachments || [], mergedAttachments || []));
        return { subject, html, text, attachments };
      }

      // If renderer.renderTemplate exists, call it
      if (typeof renderer.renderTemplate === 'function') {
        const rendered = await renderer.renderTemplate(name, payload, {
          allowHtml,
          sanitizeOptions,
          inlineItemLimit,
          templateObj,
          templateRegistry: templatesRegistry
        });
        const subject = ensureString(rendered && rendered.subject ? rendered.subject : tplSubject);
        const html = rendered && rendered.html ? String(rendered.html) : String(tplHtml || '');
        const text = rendered && rendered.text ? String(rendered.text) : String(tplText || '');
        const attachments = dedupeAttachments([].concat(rendered.attachments || [], mergedAttachments || []));
        return { subject, html, text, attachments };
      }
    } catch (err) {
      logger && logger.warn && logger.warn({ err: err && err.message }, 'renderTemplate: renderer adapter failed, falling back to template output');
      // fall through to using tplResult
    }
  }

  // 4) Ensure both html and text exist. If text missing, derive from html by stripping tags.
  let finalHtml = tplHtml ? String(tplHtml) : '';
  let finalText = tplText ? String(tplText) : '';

  if (!finalText && finalHtml) {
    // crude HTML -> text fallback
    finalText = finalHtml.replace(/<\/?[^>]+(>|$)/g, '');
  }

  // 5) Final normalization and return
  return {
    subject: tplSubject || `Message from ${payload && payload.companyName ? payload.companyName : 'Our Company'}`,
    html: finalHtml,
    text: finalText,
    attachments: mergedAttachments
  };
}

module.exports = {
  renderTemplate,
  // convenience aliases
  render: renderTemplate,
  getTemplate: templatesRegistry.get,
  registerTemplate: templatesRegistry.register,
  listTemplates: templatesRegistry.list
};
