// src/utils/emailService.Utils.js
/**
 * emailService.Utils.js
 *
 * Frontend reusable utilities for interacting with the email surface.
 *
 * - Uses comms email base: DEFAULT_COMMS_BASE = "http://localhost:5000/api/comms/em"
 * - Validates JWT stored under STORAGE_KEY using jwt-decode
 * - Attaches Authorization header when a valid token is available
 * - Provides lightweight, defensive API:
 *     isAuthValid
 *     prepareEmailPayload
 *     sendEmail
 *     sendBulk
 *     sendToRecipients
 *     getStats
 *     shutdown
 *
 * Notes:
 * - Adjust STORAGE_KEY if your auth session is stored under a different key.
 * - All functions throw Error objects with `.code` and `.details` for programmatic handling.
 */

import { jwtDecode } from "jwt-decode";

const STORAGE_KEY = "app_auth_session_v1";
const DEFAULT_COMMS_BASE = "http://localhost:5000/api/comms/em";

function _safeStr(v) {
  return v == null ? "" : String(v);
}

function _nowIso() {
  return new Date().toISOString();
}

function _makeError(code, message, details) {
  const e = new Error(message || code);
  e.code = code;
  if (details !== undefined) e.details = details;
  return e;
}

async function _jsonOrText(res) {
  const ct = res && res.headers && typeof res.headers.get === "function" ? res.headers.get("content-type") || "" : "";
  if (ct.includes("application/json")) return res.json().catch(() => null);
  return res.text().catch(() => null);
}

/* -------------------------
 * Auth helpers
 * ------------------------- */

function _extractTokenFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      return (
        parsed.token ||
        parsed.accessToken ||
        parsed.authToken ||
        parsed.access_token ||
        parsed.auth_token ||
        (parsed.session && (parsed.session.token || parsed.session.accessToken)) ||
        null
      );
    } catch (_) {
      return raw;
    }
  } catch (_) {
    return null;
  }
}

/**
 * _isJwtExpired
 * - returns { expired: boolean|null, exp: number|null }
 * - null expired means not determinable (non-JWT or decode failed)
 */
function _isJwtExpired(token) {
  if (!token || typeof token !== "string") return { expired: null, exp: null };
  try {
    const payload = jwtDecode(token);
    if (!payload || typeof payload !== "object") return { expired: null, exp: null };
    const exp = payload.exp ? Number(payload.exp) : null; // seconds
    if (!exp) return { expired: null, exp: null };
    const nowSec = Math.floor(Date.now() / 1000);
    return { expired: nowSec >= exp, exp };
  } catch (_) {
    return { expired: null, exp: null };
  }
}

export function isAuthValid() {
  const token = _extractTokenFromStorage();
  if (!token) return false;
  const check = _isJwtExpired(token);
  if (check.expired === true) return false;
  return true;
}

function _getValidTokenOrThrow() {
  const token = _extractTokenFromStorage();
  if (!token) throw _makeError("AUTH_MISSING", "Authentication token not found in local storage", { key: STORAGE_KEY });
  const check = _isJwtExpired(token);
  if (check.expired === true) throw _makeError("AUTH_EXPIRED", "Authentication token is expired", { exp: check.exp });
  return token;
}

function _authHeaders(requireValid = false, extra = {}) {
  const headers = Object.assign({}, extra);
  if (requireValid) {
    const token = _getValidTokenOrThrow();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } else {
    const token = _extractTokenFromStorage();
    if (token) {
      const check = _isJwtExpired(token);
      if (check.expired !== true) headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return headers;
}

/* -------------------------
 * Payload helpers
 * ------------------------- */

/**
 * prepareEmailPayload(input)
 * - Normalizes UI input into the payload expected by the email surface.
 * - Input:
 *    { to, cc, bcc, template, data, meta, immediate }
 * - Returns normalized object ready to POST to /send or /bulk endpoints.
 */
export function prepareEmailPayload(input = {}) {
  if (!input || typeof input !== "object") throw _makeError("INVALID_INPUT", "input must be an object", { input });

  const to = Array.isArray(input.to) ? input.to.map(_safeStr).filter(Boolean) : (input.to ? [_safeStr(input.to)] : []);
  const cc = Array.isArray(input.cc) ? input.cc.map(_safeStr).filter(Boolean) : (input.cc ? [_safeStr(input.cc)] : []);
  const bcc = Array.isArray(input.bcc) ? input.bcc.map(_safeStr).filter(Boolean) : (input.bcc ? [_safeStr(input.bcc)] : []);
  const template = input.template || {};
  const data = input.data || {};
  const meta = input.meta || {};
  const immediate = Boolean(input.immediate);

  if (to.length === 0 && (!input.recipients || (Array.isArray(input.recipients) && input.recipients.length === 0))) {
    // allow bulk flows to pass recipients instead; single-send requires at least one recipient
    if (!Array.isArray(input.recipients) || input.recipients.length === 0) {
      throw _makeError("INVALID_INPUT", "At least one recipient (to or recipients) is required", { input });
    }
  }

  return {
    to,
    cc,
    bcc,
    recipients: Array.isArray(input.recipients) ? input.recipients.slice() : undefined,
    template,
    data,
    meta,
    immediate,
    createdAt: _nowIso(),
  };
}

/* -------------------------
 * HTTP helpers (email surface)
 * ------------------------- */

function _baseUrl(base) {
  return (base || DEFAULT_COMMS_BASE).replace(/\/+$/, "");
}

/**
 * sendEmail(payload, opts)
 * - POST {base}/email/send
 * - opts.requireAuth: boolean (if true, throw when token missing/expired)
 */
export async function sendEmail(payload = {}, opts = {}) {
  if (!payload || typeof payload !== "object") throw _makeError("INVALID_INPUT", "payload must be an object", { payload });

  const base = _baseUrl(opts.base);
  const url = `${base}/send`;
  const headers = Object.assign({ "Content-Type": "application/json" }, _authHeaders(Boolean(opts.requireAuth)));

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    credentials: opts.credentials ?? "same-origin",
  });

  if (!res.ok) {
    const body = await _jsonOrText(res);
    throw _makeError("SEND_FAILED", `Send failed: ${res.status}`, { status: res.status, body });
  }

  const json = await res.json().catch(() => null);
  return json;
}

/**
 * sendBulk(opts)
 * - POST {base}/email/bulk
 * - opts: { recipients, template, dataList, chunkSize, dedupe, idempotencyPrefix, meta }
 */
export async function sendBulk(opts = {}) {
  if (!opts || typeof opts !== "object") throw _makeError("INVALID_INPUT", "opts must be an object", { opts });

  const base = _baseUrl(opts.base);
  const url = `${base}/bulk`;
  const headers = Object.assign({ "Content-Type": "application/json" }, _authHeaders(Boolean(opts.requireAuth)));

  const body = {
    recipients: Array.isArray(opts.recipients) ? opts.recipients : [],
    template: opts.template || {},
    dataList: Array.isArray(opts.dataList) ? opts.dataList : [],
    chunkSize: Number(opts.chunkSize || 100),
    dedupe: opts.dedupe !== false,
    idempotencyPrefix: opts.idempotencyPrefix || "bulk",
    meta: opts.meta || {},
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    credentials: opts.credentials ?? "same-origin",
  });

  if (!res.ok) {
    const bodyText = await _jsonOrText(res);
    throw _makeError("BULK_FAILED", `Bulk send failed: ${res.status}`, { status: res.status, body: bodyText });
  }

  const json = await res.json().catch(() => null);
  return json;
}

/**
 * sendToRecipients(spec, template, data, opts)
 * - POST {base}/email/to-recipients
 * - spec: recipient resolution spec (passed through to server)
 */
export async function sendToRecipients(spec = {}, template = {}, data = {}, opts = {}) {
  if (!spec || typeof spec !== "object") throw _makeError("INVALID_INPUT", "spec must be an object", { spec });

  const base = _baseUrl(opts.base);
  const url = `${base}/to-recipients`;
  const headers = Object.assign({ "Content-Type": "application/json" }, _authHeaders(Boolean(opts.requireAuth)));

  const body = { spec, template, data, opts: opts.requestOpts || {} };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    credentials: opts.credentials ?? "same-origin",
  });

  if (!res.ok) {
    const bodyText = await _jsonOrText(res);
    throw _makeError("SEND_TO_RECIPIENTS_FAILED", `Send to recipients failed: ${res.status}`, { status: res.status, body: bodyText });
  }

  const json = await res.json().catch(() => null);
  return json;
}

/* -------------------------
 * Admin helpers
 * ------------------------- */

/**
 * getStats(opts)
 * - GET {base}/email/stats
 * - Admin-only endpoint; requireAuth + requireRole('administrator') should be enforced server-side
 */
export async function getStats(opts = {}) {
  const base = _baseUrl(opts.base);
  const url = `${base}/stats`;
  const headers = Object.assign({}, _authHeaders(Boolean(opts.requireAuth)));

  const res = await fetch(url, {
    method: "GET",
    headers,
    credentials: opts.credentials ?? "same-origin",
  });

  if (!res.ok) {
    const body = await _jsonOrText(res);
    throw _makeError("STATS_FAILED", `Get stats failed: ${res.status}`, { status: res.status, body });
  }

  const json = await res.json().catch(() => null);
  return json;
}

/**
 * shutdown(opts)
 * - POST {base}/email/shutdown
 * - Admin-only; use with caution
 */
export async function shutdown(opts = {}) {
  const base = _baseUrl(opts.base);
  const url = `${base}/shutdown`;
  const headers = Object.assign({ "Content-Type": "application/json" }, _authHeaders(Boolean(opts.requireAuth)));

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body || {}),
    credentials: opts.credentials ?? "same-origin",
  });

  if (!res.ok) {
    const body = await _jsonOrText(res);
    throw _makeError("SHUTDOWN_FAILED", `Shutdown failed: ${res.status}`, { status: res.status, body });
  }

  const json = await res.json().catch(() => null);
  return json;
}

/* -------------------------
 * Default export
 * ------------------------- */

const emailServiceUtils = {
  isAuthValid,
  prepareEmailPayload,
  sendEmail,
  sendBulk,
  sendToRecipients,
  getStats,
  shutdown,
};

export default emailServiceUtils;
