// src/utils/msgeService.Utils.js
/**
 * msgeService.Utils.js
 *
 * Client-side utilities for interacting with the Message service.
 *
 * - Uses the comms surface base: DEFAULT_COMMS_BASE = "http://localhost:5000/api/comms"
 * - Message endpoints are under `${DEFAULT_COMMS_BASE}/messages` unless otherwise noted
 * - Validates JWT stored under STORAGE_KEY using jwt-decode; throws when determinably expired if requireAuth is true
 * - Normalizes UI payloads into the shape expected by the backend
 * - Lightweight, defensive API returning parsed JSON or throwing Error objects with .code and .details
 *
 * Exported:
 *   isAuthValid
 *   determineIntendedFor
 *   prepareMessagePayload
 *   createMessage
 *   updateMessage
 *   getMessage
 *   listMessages
 *   deleteMessage
 *   sendMessageById
 *   replyToMessage
 *   addAttachment
 *   removeAttachment
 *   addRecipient
 *   removeRecipient
 *   markRead
 *   markUnread
 */

import { jwtDecode } from "jwt-decode";

const STORAGE_KEY = "app_auth_session_v1";
// Use comms base from repo surface; message endpoints live under /messages
const DEFAULT_COMMS_BASE = "http://localhost:5000/api/comms/msg";

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
function _joinBase(base) {
  return (base || DEFAULT_COMMS_BASE).replace(/\/+$/, "");
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
 * - null expired means not determinable
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
 * determineIntendedFor({ recipients, ops_region, role, explicit })
 * - recipients: object { all, users } or array of user ids
 * - ops_region: string
 * - role: string
 * - explicit: explicit override
 */
export function determineIntendedFor({ recipients, ops_region, role, explicit } = {}) {
  if (explicit && ["user", "region", "role", "all"].includes(explicit)) return explicit;
  if (Array.isArray(recipients) && recipients.length > 0) return "user";
  if (recipients && typeof recipients === "object") {
    if (Array.isArray(recipients.users) && recipients.users.length > 0) return "user";
    if (recipients.all) return "all";
  }
  if (ops_region) return "region";
  if (role) return "role";
  return "all";
}

/**
 * prepareMessagePayload(input)
 * - Normalizes UI input into the payload expected by the Message service
 * - Ensures recipients shape, intendedFor, metadata.sender (if token contains user info)
 */
export function prepareMessagePayload(input = {}) {
  if (!input || typeof input !== "object") throw _makeError("INVALID_INPUT", "input must be an object", { input });

  const subject = _safeStr(input.subject || "");
  const details = input.details == null ? "" : input.details;
  const type = input.type || "notification";
  const status = input.status || undefined;
  const ops_region = input.ops_region || input.region || "";
  const attachments = Array.isArray(input.attachments) ? input.attachments.slice() : [];
  const replyTo = input.replyTo || undefined;

  // normalize recipients
  let recipients = { all: false, users: [] };
  if (Array.isArray(input.recipients)) {
    recipients = { all: false, users: input.recipients.slice() };
  } else if (input.recipients && typeof input.recipients === "object") {
    recipients = {
      all: Boolean(input.recipients.all),
      users: Array.isArray(input.recipients.users) ? input.recipients.users.slice() : [],
    };
  } else if (typeof input.recipients === "string") {
    const ids = input.recipients.split(",").map((s) => s.trim()).filter(Boolean);
    recipients = { all: false, users: ids };
  }

  const role = input.role || null;
  const explicitIntended = input.intendedFor || null;
  const intendedFor = determineIntendedFor({ recipients, ops_region, role, explicit: explicitIntended });

  // attempt to extract sender info from token (non-fatal)
  let sender = null;
  try {
    const token = _extractTokenFromStorage();
    if (token) {
      const payload = jwtDecode(token);
      if (payload) {
        sender = {
          userId: payload.userId || payload.userID || payload.user || payload.sub || payload._id || null,
          raw: payload,
        };
      }
    }
  } catch (_) {
    // ignore
  }

  const metadata = Object.assign({}, input.metadata || {});
  metadata.createdAt = metadata.createdAt || _nowIso();
  if (sender) metadata.sender = metadata.sender || sender;

  return {
    subject,
    details,
    type,
    status,
    recipients,
    ops_region,
    role,
    intendedFor,
    attachments,
    replyTo,
    metadata,
    payload: input.payload || {},
  };
}

/* -------------------------
 * REST helpers for Message service
 * ------------------------- */

/**
 * createMessage(payload, opts)
 * - POST {base}/messages
 * - requireAuth: if true, throw when token missing/expired
 */
export async function createMessage(payload = {}, opts = {}) {
  if (!payload || typeof payload !== "object") throw _makeError("INVALID_INPUT", "payload must be an object", { payload });
  const base = _joinBase(opts.base || DEFAULT_COMMS_BASE);
  const url = `${base}/`;
  const headers = Object.assign({ "Content-Type": "application/json" }, _authHeaders(Boolean(opts.requireAuth)));
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    credentials: opts.credentials ?? "same-origin",
  });
  if (!res.ok) {
    const body = await _jsonOrText(res);
    throw _makeError("CREATE_FAILED", `Create failed: ${res.status}`, { status: res.status, body });
  }
  const json = await res.json().catch(() => null);
  return json;
}

/**
 * updateMessage(id, update, opts)
 * - PATCH {base}/messages/{id}
 */
export async function updateMessage(id, update = {}, opts = {}) {
  if (!id) throw _makeError("INVALID_INPUT", "id is required");
  if (!update || typeof update !== "object") throw _makeError("INVALID_INPUT", "update must be an object", { update });
  const base = _joinBase(opts.base || DEFAULT_COMMS_BASE);
  const url = `${base}/${encodeURIComponent(id)}`;
  const headers = Object.assign({ "Content-Type": "application/json" }, _authHeaders(Boolean(opts.requireAuth)));
  const res = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(update),
    credentials: opts.credentials ?? "same-origin",
  });
  if (!res.ok) {
    const body = await _jsonOrText(res);
    throw _makeError("UPDATE_FAILED", `Update failed: ${res.status}`, { status: res.status, body });
  }
  const json = await res.json().catch(() => null);
  return json;
}

/**
 * getMessage(id, opts)
 * - GET {base}/messages/{id}
 */
export async function getMessage(id, opts = {}) {
  if (!id) throw _makeError("INVALID_INPUT", "id is required");
  const base = _joinBase(opts.base || DEFAULT_COMMS_BASE);
  const url = `${base}/${encodeURIComponent(id)}`;
  const headers = Object.assign({}, _authHeaders(Boolean(opts.requireAuth)));
  const res = await fetch(url, {
    method: "GET",
    headers,
    credentials: opts.credentials ?? "same-origin",
  });
  if (!res.ok) {
    const body = await _jsonOrText(res);
    throw _makeError("GET_FAILED", `Get failed: ${res.status}`, { status: res.status, body });
  }
  const json = await res.json().catch(() => null);
  return json;
}

/**
 * listMessages(filter, opts)
 * - GET {base}/messages?query...
 */
// export async function listMessages(filter = {}, opts = {}) {
//   const base = _joinBase(opts.base || DEFAULT_COMMS_BASE);
//   const qs = new URLSearchParams();
//   Object.keys(filter || {}).forEach((k) => {
//     const v = filter[k];
//     if (v === undefined || v === null) return;
//     if (Array.isArray(v)) qs.set(k, v.join(","));
//     else qs.set(k, String(v));
//   });
//   const url = `${base}?${qs.toString()}`;
//   console.log('this is the msglist fetch error ----------------> ', url);// --------------------------------------
//   const headers = Object.assign({}, _authHeaders(Boolean(opts.requireAuth)));
//   const res = await fetch(url, {
//     method: "GET",
//     headers,
//     credentials: opts.credentials ?? "same-origin",
//   });
//   if (!res.ok) {
//     const body = await _jsonOrText(res);
//     throw _makeError("LIST_FAILED", `List failed: ${res.status}`, { status: res.status, body });
//   }
//   const json = await res.json().catch(() => null);
//   return json;
// }

export async function listMessages(filter = {}, opts = {}) {
  const base = _joinBase(opts.base || DEFAULT_COMMS_BASE);

  // Ensure filter is an object (defensive)
  const safeFilter = filter && typeof filter === "object" ? filter : {};

  // // Encode the entire filter as a JSON string and send as `filter` query param
  const qs = new URLSearchParams();
  qs.set("filter", JSON.stringify(safeFilter));

  // Optional: include pagination/sort in querystring if provided via opts
  if (opts.page !== undefined) qs.set("page", String(opts.page ?? 1));
  if (opts.limit !== undefined) qs.set("limit", String(opts.limit ?? 24));
  if (opts.sort !== undefined) qs.set("sort", String(opts.sort ?? 'desc'));

  const url = `${base}?${qs.toString()}`;
  const headers = Object.assign({}, _authHeaders(Boolean(opts.requireAuth)));
  const res = await fetch(url, {
    method: "GET",
    headers,
    credentials: opts.credentials ?? "same-origin",
  });

  if (!res.ok) {
    const body = await _jsonOrText(res);
    throw _makeError("LIST_FAILED", `List failed: ${res.status}`, { status: res.status, body });
  }

  const json = await res.json().catch(() => null);
  return json;
}


/**
 * deleteMessage(id, opts)
 * - DELETE {base}/messages/{id}
 */
export async function deleteMessage(id, opts = {}) {
  if (!id) throw _makeError("INVALID_INPUT", "id is required");
  const base = _joinBase(opts.base || DEFAULT_COMMS_BASE);
  const url = `${base}/${encodeURIComponent(id)}/soft-delete`;
  const headers = Object.assign({}, _authHeaders(Boolean(opts.requireAuth)));
  const res = await fetch(url, {
    method: "DELETE",
    headers,
    credentials: opts.credentials ?? "same-origin",
  });
  if (!res.ok) {
    const body = await _jsonOrText(res);
    throw _makeError("DELETE_FAILED", `Delete failed: ${res.status}`, { status: res.status, body });
  }
  const json = await res.json().catch(() => null);
  return json;
}

/* -------------------------
 * Message lifecycle helpers
 * ------------------------- */

/**
 * sendMessageById(id, opts)
 * - Transition draft -> submitted
 * - Prefer PATCH {status: 'submitted'}; fallback to POST {base}/messages/{id}/send
 */
export async function sendMessageById(id, opts = {}) {
  if (!id) throw _makeError("INVALID_INPUT", "id is required");
  try {
    const res = await updateMessage(id, { status: "submitted" }, opts);
    return res;
  } catch (err) {
    const base = _joinBase(opts.base || DEFAULT_COMMS_BASE);
    const url = `${base}/${encodeURIComponent(id)}/send`;
    const headers = Object.assign({ "Content-Type": "application/json" }, _authHeaders(Boolean(opts.requireAuth)));
    const r = await fetch(url, {
      method: "POST",
      headers,
      credentials: opts.credentials ?? "same-origin",
    });
    if (!r.ok) {
      const body = await _jsonOrText(r);
      throw _makeError("SEND_FAILED", `Send failed: ${r.status}`, { status: r.status, body });
    }
    const json = await r.json().catch(() => null);
    return json;
  }
}

/**
 * replyToMessage(originalMessageId, payload, opts)
 * - Create a new message with replyTo set
 */
export async function replyToMessage(originalMessageId, payload = {}, opts = {}) {
  if (!originalMessageId) throw _makeError("INVALID_INPUT", "originalMessageId is required");
  const p = Object.assign({}, payload, { replyTo: originalMessageId });
  return createMessage(p, opts);
}

/* -------------------------
 * Attachments & recipients helpers
 * ------------------------- */

/**
 * addAttachment(messageId, fileId, opts)
 * - POST {base}/messages/{id}/attachments
 */
export async function addAttachment(messageId, fileId, opts = {}) {
  if (!messageId || !fileId) throw _makeError("INVALID_INPUT", "messageId and fileId are required");
  const base = _joinBase(opts.base || DEFAULT_COMMS_BASE);
  const url = `${base}/${encodeURIComponent(messageId)}/attachments`;
  const headers = Object.assign({ "Content-Type": "application/json" }, _authHeaders(Boolean(opts.requireAuth)));
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ fileId }),
    credentials: opts.credentials ?? "same-origin",
  });
  if (!res.ok) {
    const body = await _jsonOrText(res);
    throw _makeError("ADD_ATTACHMENT_FAILED", `Add attachment failed: ${res.status}`, { status: res.status, body });
  }
  const json = await res.json().catch(() => null);
  return json;
}

/**
 * removeAttachment(messageId, fileId, opts)
 * - DELETE {base}/messages/{id}/attachments/{fileId} or POST fallback
 */
export async function removeAttachment(messageId, fileId, opts = {}) {
  if (!messageId || !fileId) throw _makeError("INVALID_INPUT", "messageId and fileId are required");
  const base = _joinBase(opts.base || DEFAULT_COMMS_BASE);
  const urlDelete = `${base}/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(fileId)}`;
  const headers = Object.assign({}, _authHeaders(Boolean(opts.requireAuth)));
  const res = await fetch(urlDelete, {
    method: "DELETE",
    headers,
    credentials: opts.credentials ?? "same-origin",
  });
  if (res.ok) {
    const json = await res.json().catch(() => null);
    return json;
  }
  // fallback
  const urlPost = `${base}/${encodeURIComponent(messageId)}/attachments/remove`;
  const headers2 = Object.assign({ "Content-Type": "application/json" }, _authHeaders(Boolean(opts.requireAuth)));
  const r2 = await fetch(urlPost, {
    method: "POST",
    headers: headers2,
    body: JSON.stringify({ fileId }),
    credentials: opts.credentials ?? "same-origin",
  });
  if (!r2.ok) {
    const body = await _jsonOrText(r2);
    throw _makeError("REMOVE_ATTACHMENT_FAILED", `Remove attachment failed: ${r2.status}`, { status: r2.status, body });
  }
  const json2 = await r2.json().catch(() => null);
  return json2;
}

/**
 * addRecipient(messageId, userId, opts)
 * - POST {base}/messages/{id}/recipients
 */
export async function addRecipient(messageId, userId, opts = {}) {
  if (!messageId || !userId) throw _makeError("INVALID_INPUT", "messageId and userId are required");
  const base = _joinBase(opts.base || DEFAULT_COMMS_BASE);
  const url = `${base}/${encodeURIComponent(messageId)}/add-recipient`;
  const headers = Object.assign({ "Content-Type": "application/json" }, _authHeaders(Boolean(opts.requireAuth)));
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ userId }),
    credentials: opts.credentials ?? "same-origin",
  });
  if (!res.ok) {
    const body = await _jsonOrText(res);
    throw _makeError("ADD_RECIPIENT_FAILED", `Add recipient failed: ${res.status}`, { status: res.status, body });
  }
  const json = await res.json().catch(() => null);
  return json;
}

/**
 * removeRecipient(messageId, userId, opts)
 * - DELETE {base}/messages/{id}/recipients/{userId} or POST fallback
 */
export async function removeRecipient(messageId, userId, opts = {}) {
  if (!messageId || !userId) throw _makeError("INVALID_INPUT", "messageId and userId are required");
  const base = _joinBase(opts.base || DEFAULT_COMMS_BASE);
  const urlDelete = `${base}/${encodeURIComponent(messageId)}/recipients/${encodeURIComponent(userId)}`;
  const headers = Object.assign({}, _authHeaders(Boolean(opts.requireAuth)));
  const res = await fetch(urlDelete, {
    method: "DELETE",
    headers,
    credentials: opts.credentials ?? "same-origin",
  });
  if (res.ok) {
    const json = await res.json().catch(() => null);
    return json;
  }
  // fallback
  const urlPost = `${base}/${encodeURIComponent(messageId)}/recipients/remove`;
  const headers2 = Object.assign({ "Content-Type": "application/json" }, _authHeaders(Boolean(opts.requireAuth)));
  const r2 = await fetch(urlPost, {
    method: "POST",
    headers: headers2,
    body: JSON.stringify({ userId }),
    credentials: opts.credentials ?? "same-origin",
  });
  if (!r2.ok) {
    const body = await _jsonOrText(r2);
    throw _makeError("REMOVE_RECIPIENT_FAILED", `Remove recipient failed: ${r2.status}`, { status: r2.status, body });
  }
  const json2 = await r2.json().catch(() => null);
  return json2;
}

/* -------------------------
 * Read / Unread helpers
 * ------------------------- */

/**
 * markRead(messageId, opts)
 * - PATCH {base}/messages/{id} { status: 'read' } or POST fallback
 */
export async function markRead(messageId, opts = {}) {
  if (!messageId) throw _makeError("INVALID_INPUT", "messageId is required");
  try {
    const res = await updateMessage(messageId, { status: "read" }, opts);
    return res;
  } catch (err) {
    const base = _joinBase(opts.base || DEFAULT_COMMS_BASE);
    const url = `${base}/${encodeURIComponent(messageId)}/mark-read`;
    const headers = Object.assign({}, _authHeaders(Boolean(opts.requireAuth)));
    const r = await fetch(url, {
      method: "POST",
      headers,
      credentials: opts.credentials ?? "same-origin",
    });
    if (!r.ok) {
      const body = await _jsonOrText(r);
      throw _makeError("MARK_READ_FAILED", `Mark read failed: ${r.status}`, { status: r.status, body });
    }
    const json = await r.json().catch(() => null);
    return json;
  }
}

/**
 * markUnread(messageId, opts)
 * - PATCH {base}/messages/{id} { status: 'unread' } or POST fallback
 */
export async function markUnread(messageId, opts = {}) {
  if (!messageId) throw _makeError("INVALID_INPUT", "messageId is required");
  try {
    const res = await updateMessage(messageId, { status: "unread" }, opts);
    return res;
  } catch (err) {
    const base = _joinBase(opts.base || DEFAULT_COMMS_BASE);
    const url = `${base}/${encodeURIComponent(messageId)}/mark-unread`;
    const headers = Object.assign({}, _authHeaders(Boolean(opts.requireAuth)));
    const r = await fetch(url, {
      method: "POST",
      headers,
      credentials: opts.credentials ?? "same-origin",
    });
    if (!r.ok) {
      const body = await _jsonOrText(r);
      throw _makeError("MARK_UNREAD_FAILED", `Mark unread failed: ${r.status}`, { status: r.status, body });
    }
    const json = await r.json().catch(() => null);
    return json;
  }
}

/* -------------------------
 * Default export
 * ------------------------- */

const msgeServiceUtils = {
  isAuthValid,
  determineIntendedFor,
  prepareMessagePayload,
  createMessage,
  updateMessage,
  getMessage,
  listMessages,
  deleteMessage,
  sendMessageById,
  replyToMessage,
  addAttachment,
  removeAttachment,
  addRecipient,
  removeRecipient,
  markRead,
  markUnread,
};

export default msgeServiceUtils;
