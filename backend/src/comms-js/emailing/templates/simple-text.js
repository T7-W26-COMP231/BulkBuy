// src/comms/emailing/templates/simple-text.js
// Simple, polished function-style template for generic messages.
// - payload: { subject, greeting, recipientName, bodyHtml, bodyText, signatureLine, attachments, order (optional) }
// - opts: { allowHtml=true, sanitizeOptions={}, templateObj=null, helpers={} }
// - Returns: { subject, html, text, attachments }

let Handlebars = null;
let sanitizeHtml = null;
try { Handlebars = require('handlebars'); } catch (e) { Handlebars = null; }
try { sanitizeHtml = require('sanitize-html'); } catch (e) { sanitizeHtml = null; }

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitize(html, allowHtml = true, opts = {}) {
  if (!html) return '';
  if (!allowHtml) {
    if (sanitizeHtml) return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
    return String(html).replace(/<\/?[^>]+(>|$)/g, '');
  }
  if (sanitizeHtml) {
    const defaults = { allowedTags: ['b','i','em','strong','a','p','ul','ol','li','br','span'], allowedAttributes: { a: ['href','target'] }, allowedSchemes: ['http','https','mailto'] };
    return sanitizeHtml(html, Object.assign({}, defaults, opts || {}));
  }
  return String(html);
}

const HTML_TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"/><title>{{subject}}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#222}.container{max-width:680px;margin:18px auto;padding:18px;border:1px solid #f0f0f0;border-radius:6px;background:#fff}</style>
</head><body>
  <div class="container">
    <p>{{#if greeting}}{{greeting}}{{else}}Hello{{/if}} {{recipientName}},</p>
    <div>{{{bodyHtml}}}</div>
    {{#if attachments}}
      <p style="margin-top:12px"><strong>Attachments included:</strong></p>
      <ul>{{#each attachments}}<li>{{this.filename}}{{#if this.description}} — {{this.description}}{{/if}}</li>{{/each}}</ul>
    {{/if}}
    <p style="color:#666;font-size:13px">{{signatureLine}}</p>
  </div>
</body></html>`;

const TEXT_TEMPLATE = `{{#if greeting}}{{greeting}}{{else}}Hello{{/if}} {{recipientName}},

{{bodyText}}

{{#if attachments}}Attachments:
{{#each attachments}}- {{this.filename}}{{#if this.description}} — {{this.description}}{{/if}}
{{/each}}{{/if}}

{{signatureLine}}`;

module.exports = function renderSimpleText(payload = {}, opts = {}) {
  const { allowHtml = true, sanitizeOptions = {}, templateObj = null, helpers = {} } = opts || {};

  const data = Object.assign({
    subject: '',
    greeting: '',
    recipientName: '',
    bodyHtml: '',
    bodyText: '',
    signatureLine: '',
    attachments: []
  }, payload || {});

  // If payload contains an order and no order.number, ensure _id is used
  if (data.order && !data.order.number && data.order._id) {
    data.order.number = String(data.order._id);
  }

  const tpl = templateObj || { subjectTemplate: data.subject || '', htmlTemplate: HTML_TEMPLATE, textTemplate: TEXT_TEMPLATE, attachments: [] };
  const subjectTpl = tpl.subjectTemplate || tpl.subject || data.subject || '';
  const htmlTpl = tpl.htmlTemplate || HTML_TEMPLATE;
  const textTpl = tpl.textTemplate || TEXT_TEMPLATE;
  const attachments = Array.isArray(tpl.attachments) ? tpl.attachments.slice() : (Array.isArray(data.attachments) ? data.attachments.slice() : []);

  // register helpers if provided
  if (Handlebars && helpers && typeof helpers === 'object') {
    Object.keys(helpers).forEach((k) => {
      if (typeof helpers[k] === 'function') {
        try { Handlebars.registerHelper(k, helpers[k]); } catch (e) { /* ignore */ }
      }
    });
  }

  let subject = '';
  let html = '';
  let text = '';

  try {
    if (Handlebars) {
      subject = Handlebars.compile(subjectTpl)(data);
      html = Handlebars.compile(htmlTpl)(data);
      text = Handlebars.compile(textTpl)(data);
      if (!subject) subject = (data.bodyText ? String(data.bodyText).split('\n')[0].slice(0, 80) : '');
    } else {
      subject = (subjectTpl || data.subject || '').replace(/\{\{\s*subject\s*\}\}/g, data.subject || '');
      html = htmlTpl
        .replace(/\{\{\s*recipientName\s*\}\}/g, escapeHtml(data.recipientName || ''))
        .replace(/\{\{\{\s*bodyHtml\s*\}\}\}/g, data.bodyHtml || '')
        .replace(/\{\{\s*signatureLine\s*\}\}/g, escapeHtml(data.signatureLine || ''));
      text = textTpl
        .replace(/\{\{\s*recipientName\s*\}\}/g, data.recipientName || '')
        .replace(/\{\{\s*bodyText\s*\}\}/g, data.bodyText || '')
        .replace(/\{\{\s*signatureLine\s*\}\}/g, data.signatureLine || '');
      if (!subject) subject = (data.bodyText ? String(data.bodyText).split('\n')[0].slice(0, 80) : '');
    }
  } catch (err) {
    html = `<div><pre>${escapeHtml(String(data.bodyText || data.bodyHtml || ''))}</pre></div>`;
    text = String(data.bodyText || data.bodyHtml || '');
    subject = subject || (data.bodyText ? String(data.bodyText).split('\n')[0].slice(0, 80) : '');
  }

  const finalHtml = sanitize(html, allowHtml, sanitizeOptions);
  const finalText = (text && String(text).trim().length > 0) ? text : finalHtml.replace(/<\/?[^>]+(>|$)/g, '');

  return {
    subject: String(subject || '').trim(),
    html: finalHtml,
    text: String(finalText || '').trim(),
    attachments
  };
};
