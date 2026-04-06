// src/comms/emailing/templates/order-summary.js
// Async, polished order-summary template function.
// - Accepts a Mongoose Order document (or plain object) as payload
// - Enriches each order item from deps.itemRepo (or deps.ItemModel) when available
// - Loads user info from deps.userRepo (or deps.UserModel) using order.userId
// - Uses the LAST pricing snapshot (last element of pricingSnapshot array or the object)
//   to compute per-line price and line totals
// - Uses order._id as the canonical order number
// - Returns Promise<{ subject, html, text, attachments }>
// - opts: { allowHtml=true, sanitizeOptions={}, inlineItemLimit=12, templateObj=null, helpers={} }
// - deps: { itemRepo, ItemModel, userRepo, UserModel, logger }
// - Non-destructive: falls back to order item data if enrichment fails

const crypto = require('crypto');

let Handlebars = null;
let sanitizeHtml = null;
try { Handlebars = require('handlebars'); } catch (e) { Handlebars = null; }
try { sanitizeHtml = require('sanitize-html'); } catch (e) { sanitizeHtml = null; }

const DEFAULT_INLINE_LIMIT = 12;

/* -------------------------
 * Utilities
 * ------------------------- */

function lastSnapshot(ps) {
  if (!ps) return null;
  if (Array.isArray(ps) && ps.length) return ps[ps.length - 1];
  if (typeof ps === 'object') return ps;
  return null;
}

function moneyFmt(amount = 0, currency = 'USD') {
  const n = Number(amount) || 0;
  return `${currency} ${n.toFixed(2)}`;
}

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
    const defaults = {
      allowedTags: ['b','i','em','strong','a','p','ul','ol','li','br','span','table','thead','tbody','tr','th','td','details','summary'],
      allowedAttributes: { a: ['href','target'], span: ['class'], td: ['style'], th: ['style'] },
      allowedSchemes: ['http','https','mailto']
    };
    return sanitizeHtml(html, Object.assign({}, defaults, opts || {}));
  }
  return String(html);
}

/* -------------------------
 * Handlebars helpers
 * ------------------------- */

function registerHelpers() {
  if (!Handlebars || Handlebars._orderHelpersRegistered) return;
  Handlebars.registerHelper('money', (amount, currency) => moneyFmt(amount, currency || 'USD'));
  Handlebars._orderHelpersRegistered = true;
}

/* -------------------------
 * Inline fallback templates
 * ------------------------- */

const SUBJECT_FALLBACK = 'Order {{order.number}} — {{companyName}}';
const HTML_FALLBACK = `<!doctype html>
<html><head><meta charset="utf-8"/><title>{{subject}}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#222}
  .container{max-width:680px;margin:18px auto;padding:18px;border:1px solid #eee;border-radius:6px;background:#fff}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{padding:8px;border-bottom:1px solid #f3f3f3}
  th{border-bottom:2px solid #ddd;text-align:left}
  .total{margin-top:12px;text-align:right}
  .meta{color:#666;font-size:13px}
  .cta{display:inline-block;margin-top:10px;padding:10px 14px;background:#0b74de;color:#fff;text-decoration:none;border-radius:4px}
</style>
</head><body>
  <div class="container">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-weight:700;font-size:18px">{{companyName}}</div>
      <div class="meta">Order <strong>#{{order.number}}</strong><br/>Placed {{order.date}}</div>
    </div>

    <p>Hi {{customer.name}},</p>
    <p>Order status: <strong>{{order.status}}</strong></p>
    <p>Here’s a summary of the items in this order:</p>

    <table>
      <thead>
        <tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Line</th></tr>
      </thead>
      <tbody>
        {{{itemsInline}}}
      </tbody>
    </table>

    {{#if hasMore}}
      <details style="margin-top:12px">
        <summary style="cursor:pointer;color:#0b74de">Show {{moreCount}} more items</summary>
        <table style="margin-top:8px">
          <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Line</th></tr></thead>
          <tbody>
            {{{itemsRemaining}}}
          </tbody>
        </table>
      </details>
    {{/if}}

    <div class="total">
      Subtotal: {{money order.subtotal order.currency}}<br/>
      Shipping: {{money order.shipping order.currency}}<br/>
      <strong>Total: {{money order.total order.currency}}</strong>
    </div>

    <div style="margin-top:14px">
      <div><strong>Shipping to</strong></div>
      <div>{{shipping.name}}</div>
      <div>{{shipping.line1}}</div>
      <div>{{shipping.city}}, {{shipping.region}} {{shipping.postalCode}}</div>
      <div>{{shipping.country}}</div>
    </div>

    {{#if tracking.url}}
      <p style="margin-top:12px">Track: <a href="{{tracking.url}}" target="_blank">{{tracking.number}}</a></p>
    {{/if}}

    <p style="margin-top:12px;color:#666;font-size:13px">If you have questions, reply to this email or visit our <a href="{{supportUrl}}">support center</a>.</p>
    <p style="margin-top:8px"><a class="cta" href="{{orderUrl}}">View order details</a></p>
  </div>
</body></html>`;

const TEXT_FALLBACK = `{{companyName}}
Order #{{order.number}}  •  Placed {{order.date}}
Status: {{order.status}}

Hi {{customer.name}},

Items:
{{itemsText}}

Subtotal: {{money order.subtotal order.currency}}
Shipping: {{money order.shipping order.currency}}
Total: {{money order.total order.currency}}

Shipping to:
{{shipping.name}}
{{shipping.line1}}
{{shipping.city}}, {{shipping.region}} {{shipping.postalCode}}
{{shipping.country}}

View order: {{orderUrl}}

Questions? Reply to this email or visit: {{supportUrl}}

Thanks,
{{companyName}}`;

/* -------------------------
 * Enrichment and computation
 * ------------------------- */

/**
 * Enrich items using deps.itemRepo or deps.ItemModel (optional).
 * Returns array of merged item objects (DB fields preferred).
 */
async function enrichItems(rawItems = [], deps = {}) {
  const itemRepo = deps && deps.itemRepo;
  const ItemModel = deps && deps.ItemModel;
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
  const ids = rawItems
    .map(it => (it && (it.itemId || it._id || it.id) ? String(it.itemId || it._id || it.id) : null))
    .filter(Boolean);
  if (ids.length === 0) return rawItems.map(it => Object.assign({}, it));

  try {
    if (itemRepo && typeof itemRepo.findByFilter === 'function') {
      const found = await itemRepo.findByFilter({ _id: { $in: ids } }, { lean: true });
      const byId = new Map(found.map(f => [String(f._id), f]));
      return rawItems.map(it => {
        const id = String(it.itemId || it._id || it.id || '');
        const full = byId.get(id) || {};
        return Object.assign({}, full, it, { itemId: it.itemId || it._id || it.id || null });
      });
    }
    if (ItemModel && typeof ItemModel.find === 'function') {
      const found = await ItemModel.find({ _id: { $in: ids } }).lean().exec();
      const byId = new Map(found.map(f => [String(f._id), f]));
      return rawItems.map(it => {
        const id = String(it.itemId || it._id || it.id || '');
        const full = byId.get(id) || {};
        return Object.assign({}, full, it, { itemId: it.itemId || it._id || it.id || null });
      });
    }
  } catch (err) {
    if (deps && deps.logger && typeof deps.logger.warn === 'function') {
      deps.logger.warn({ err: err && err.message }, 'order-summary: item enrichment failed; using raw items');
    }
    // fall through to raw items
  }
  return rawItems.map(it => Object.assign({}, it));
}

/* Compute per-item price/line totals using last snapshot */
function computeLineTotals(items = [], defaultCurrency = 'USD') {
  return items.map((it) => {
    const snap = lastSnapshot(it && it.pricingSnapshot);
    const price = (snap && typeof snap.atInstantPrice === 'number') ? snap.atInstantPrice
      : (typeof it.price === 'number' ? it.price : (it.atInstantPrice || 0));
    const discountPct = (snap && typeof snap.discountedPercentage === 'number') ? snap.discountedPercentage
      : (typeof it.discountPct === 'number' ? it.discountPct : 0);
    const qty = Number(it.quantity || it.qty || 0);
    const lineTotal = price * qty * (1 - (Number(discountPct || 0) / 100));
    return Object.assign({}, it, { price, discountPct, qty, lineTotal, currency: it.currency || it.currencyCode || defaultCurrency });
  });
}

/* Build HTML rows for items (start..end exclusive) */
function buildItemRowsHtml(items = [], start = 0, end = items.length) {
  const rows = [];
  for (let i = start; i < end; i += 1) {
    const it = items[i];
    const name = escapeHtml(it.title || it.name || it.productName || it.sku || `Item ${it.itemId || ''}`);
    const sku = it.sku ? ` <small style="color:#888">(${escapeHtml(it.sku)})</small>` : '';
    const qty = escapeHtml(String(it.qty || it.quantity || 0));
    const price = escapeHtml(moneyFmt(it.price || 0, it.currency || 'USD'));
    const line = escapeHtml(moneyFmt(it.lineTotal || 0, it.currency || 'USD'));
    rows.push(`<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${name}${sku}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${qty}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${price}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${line}</td>
    </tr>`);
  }
  return rows.join('');
}

/* Build plain-text lines for all items */
function buildItemsText(items = []) {
  const lines = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const name = it.title || it.name || it.productName || it.sku || `Item ${it.itemId || ''}`;
    const qty = Number(it.qty || it.quantity || 0);
    const price = moneyFmt(it.price || 0, it.currency || 'USD');
    const line = moneyFmt(it.lineTotal || 0, it.currency || 'USD');
    lines.push(`- ${name}  x${qty}  @ ${price}  = ${line}`);
  }
  return lines.join('\n');
}

/* -------------------------
 * Main export
 * ------------------------- */

/**
 * renderOrderSummary(orderDoc, opts = {}, deps = {})
 */
module.exports = async function renderOrderSummary(orderDoc = {}, opts = {}, deps = {}) {
  const {
    allowHtml = true,
    sanitizeOptions = {},
    inlineItemLimit = DEFAULT_INLINE_LIMIT,
    templateObj = null,
    helpers = {}
  } = opts || {};

  const logger = deps && deps.logger ? deps.logger : console;

  if (!orderDoc || typeof orderDoc !== 'object') {
    throw new Error('order document required');
  }

  // load user info if possible
  let user = null;
  try {
    const userId = orderDoc.userId || orderDoc.user || null;
    if (userId && deps && deps.userRepo && typeof deps.userRepo.findById === 'function') {
      user = await deps.userRepo.findById(userId, { lean: true });
    } else if (userId && deps && deps.UserModel && typeof deps.UserModel.findById === 'function') {
      user = await deps.UserModel.findById(userId).lean().exec();
    }
  } catch (err) {
    logger && logger.debug && logger.debug({ err: err && err.message }, 'order-summary: user lookup failed');
  }

  // canonical order id (use _id)
  const orderId = orderDoc._id ? String(orderDoc._id) : crypto.createHash('sha1').update(String(Date.now())).digest('hex').slice(0, 8);
  const companyName = orderDoc.companyName || orderDoc.brand || 'Our Company';
  const customer = user ? { name: user.name || user.fullName || user.email || 'Customer', email: user.email } : (orderDoc.customer || orderDoc.customerInfo || { name: (orderDoc.user && orderDoc.user.name) || 'Customer' });
  const shipping = orderDoc.deliveryLocation || orderDoc.shipping || {};
  const tracking = orderDoc.tracking || {};
  const supportUrl = orderDoc.supportUrl || orderDoc.helpUrl || '#';
  const orderUrl = orderDoc.orderUrl || (orderDoc.urls && orderDoc.urls.order) || '#';
  const currency = (orderDoc.order && orderDoc.order.currency) || orderDoc.currency || 'USD';
  const rawItems = Array.isArray(orderDoc.items) ? orderDoc.items : (Array.isArray(orderDoc.order && orderDoc.order.items) ? orderDoc.order.items : []);

  // Enrich items from DB if deps provided
  const enriched = await enrichItems(rawItems, deps);
  // compute price/line totals using last snapshot
  const computed = computeLineTotals(enriched, currency);

  // compute totals
  const subtotal = computed.reduce((s, it) => s + (Number(it.lineTotal || 0)), 0);
  const shippingCost = (orderDoc.order && typeof orderDoc.order.shipping === 'number') ? orderDoc.order.shipping : (typeof orderDoc.shipping === 'number' ? orderDoc.shipping : 0);
  const total = (orderDoc.order && typeof orderDoc.order.total === 'number' && orderDoc.order.total > 0) ? orderDoc.order.total : (subtotal + Number(shippingCost || 0));

  // data object for templates
  const data = {
    companyName,
    customer,
    order: {
      number: orderId,
      date: orderDoc.order && orderDoc.order.date ? orderDoc.order.date : (orderDoc.createdAt ? new Date(orderDoc.createdAt).toLocaleString() : ''),
      status: orderDoc.status || (orderDoc.order && orderDoc.order.status) || 'unknown',
      currency,
      items: computed,
      subtotal,
      shipping: shippingCost,
      total
    },
    shipping,
    tracking,
    supportUrl,
    orderUrl
  };

  // prepare inline/remaining HTML and text
  const limit = Number(inlineItemLimit) || DEFAULT_INLINE_LIMIT;
  const items = data.order.items || [];
  const hasMore = items.length > limit;
  const moreCount = hasMore ? items.length - limit : 0;
  const itemsInlineHtml = buildItemRowsHtml(items, 0, Math.min(limit, items.length));
  const itemsRemainingHtml = hasMore ? buildItemRowsHtml(items, limit, items.length) : '';
  const itemsText = buildItemsText(items);

  // choose templates
  const tpl = templateObj || { subjectTemplate: SUBJECT_FALLBACK, htmlTemplate: HTML_FALLBACK, textTemplate: TEXT_FALLBACK, attachments: [] };
  const subjectTpl = tpl.subjectTemplate || tpl.subject || SUBJECT_FALLBACK;
  const htmlTpl = tpl.htmlTemplate || tpl.html || HTML_FALLBACK;
  const textTpl = tpl.textTemplate || tpl.text || TEXT_FALLBACK;
  const attachments = Array.isArray(tpl.attachments) ? tpl.attachments.slice() : [];

  // register helpers
  if (Handlebars) registerHelpers();
  if (Handlebars && helpers && typeof helpers === 'object') {
    Object.keys(helpers).forEach((k) => {
      if (typeof helpers[k] === 'function') {
        try { Handlebars.registerHelper(k, helpers[k]); } catch (e) { /* ignore */ }
      }
    });
  }

  // context for rendering
  const ctx = Object.assign({}, data, {
    itemsInline: itemsInlineHtml,
    itemsRemaining: itemsRemainingHtml,
    itemsText,
    hasMore,
    moreCount,
    customer
  });

  // render subject/html/text
  let subject = '';
  let html = '';
  let text = '';

  try {
    if (Handlebars) {
      subject = Handlebars.compile(subjectTpl)(ctx);
      html = Handlebars.compile(htmlTpl)(ctx);
      text = Handlebars.compile(textTpl)(ctx);
    } else {
      subject = (subjectTpl || SUBJECT_FALLBACK)
        .replace(/\{\{\s*order\.number\s*\}\}/g, data.order.number)
        .replace(/\{\{\s*companyName\s*\}\}/g, companyName);
      html = htmlTpl
        .replace('{{{itemsInline}}}', itemsInlineHtml)
        .replace('{{{itemsRemaining}}}', itemsRemainingHtml)
        .replace(/\{\{\s*companyName\s*\}\}/g, escapeHtml(companyName))
        .replace(/\{\{\s*order\.number\s*\}\}/g, escapeHtml(data.order.number))
        .replace(/\{\{\s*order\.date\s*\}\}/g, escapeHtml(data.order.date))
        .replace(/\{\{\s*order\.subtotal\s*order\.currency\s*\}\}/g, escapeHtml(moneyFmt(data.order.subtotal, data.order.currency)));
      text = (textTpl || TEXT_FALLBACK)
        .replace('{{itemsText}}', itemsText)
        .replace(/\{\{\s*companyName\s*\}\}/g, companyName)
        .replace(/\{\{\s*order\.number\s*\}\}/g, data.order.number)
        .replace(/\{\{\s*order\.date\s*\}\}/g, data.order.date);
    }
  } catch (err) {
    logger && logger.error && logger.error({ err: err && err.message }, 'order-summary: render failed, using fallback');
    subject = `Order ${data.order.number} summary`;
    html = `<div><h3>${escapeHtml(subject)}</h3><pre>${escapeHtml(JSON.stringify(items || [], null, 2))}</pre></div>`;
    text = `${subject}\n\nItems:\n${itemsText}`;
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
