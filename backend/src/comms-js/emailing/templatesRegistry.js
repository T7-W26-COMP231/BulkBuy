// src/comms/emailing/templatesRegistry.js
// Registry that imports built-in function-style templates and exposes a small API:
// - register(name, fn)
// - get(name) => fn | null
// - render(name, payload, opts = {}, deps = {}) => Promise<{subject, html, text, attachments}>
// - list() => [names]
//
// Built-ins: order-summary, simple-text
// Template functions may be sync or async and must return { subject, html, text, attachments }.

const path = require('path');

const templates = new Map();

/**
 * Try to require a built-in template and register it if valid.
 * Accepts either a function export or a default function export.
 */
function tryLoadBuiltin(name, relPath) {
  try {
    // require relative to this file
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const mod = require(path.join(__dirname, relPath));
    const fn = (typeof mod === 'function') ? mod : (mod && typeof mod.default === 'function' ? mod.default : null);
    if (fn) templates.set(String(name), fn);
  } catch (err) {
    // ignore missing/invalid builtins
  }
}

// Load built-in templates (these files should exist in ./templates/)
tryLoadBuiltin('order-summary', './templates/order-summary.js');
tryLoadBuiltin('simple-text', './templates/simple-text.js');

/**
 * register(name, fn)
 * Register a template function under `name`.
 * fn(payload, opts = {}, deps = {}) => { subject, html, text, attachments } | Promise<...>
 */
function register(name, fn) {
  if (!name || typeof name !== 'string') throw new Error('template name required');
  if (typeof fn !== 'function') throw new Error('template function required');
  templates.set(String(name), fn);
}

/**
 * get(name)
 * Return the registered template function or null if not found.
 */
function get(name) {
  if (!name) return null;
  return templates.get(String(name)) || null;
}

/**
 * render(name, payload = {}, opts = {}, deps = {})
 * Calls the template function and normalizes the result.
 * Throws if template not found or returns invalid shape.
 */
async function render(name, payload = {}, opts = {}, deps = {}) {
  const fn = get(name);
  if (!fn) throw new Error(`template not found: ${name}`);

  // Allow sync or async template functions
  const res = fn(payload, opts, deps);
  const out = (res && typeof res.then === 'function') ? await res : res;

  if (!out || typeof out !== 'object') {
    throw new Error(`template ${name} did not return an object`);
  }

  const subject = typeof out.subject === 'string' ? out.subject : (out.subject ? String(out.subject) : '');
  const html = typeof out.html === 'string' ? out.html : (out.html ? String(out.html) : '');
  const text = typeof out.text === 'string' ? out.text : (out.text ? String(out.text) : '');
  const attachments = Array.isArray(out.attachments) ? out.attachments.slice() : [];

  return { subject, html, text, attachments };
}

/**
 * list()
 * Return array of registered template names
 */
function list() {
  return Array.from(templates.keys());
}

module.exports = {
  register,
  get,
  render,
  list
};
