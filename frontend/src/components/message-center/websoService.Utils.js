// src/utils/websocket.Utils.js
/**
 * websocket.Utils.js
 *
 * Utilities for composing and delivering comms/notification messages.
 *
 * Key points:
 * - Uses the comms surface base from the repo: DEFAULT_COMMS_BASE = "http://localhost:5000/api/comms"
 * - Validates JWT stored under STORAGE_KEY using jwt-decode and refuses requests when token is determinably expired
 * - Determines intendedFor automatically (recipients -> 'user', ops_region -> 'region', role -> 'role', otherwise 'all')
 * - Prepares normalized message payloads suitable for the backend notification surface
 * - Sends via Socket.IO client (getSocket) when connected, falls back to HTTP REST endpoints
 * - Exports: determineIntendedFor, prepareMessage, sendMessage, sendMessagesBatch, ackMessage, fetchMissedNotifications, isAuthValid
 *
 * Adjust the import path for getSocket() if your project layout differs.
 */

import { jwtDecode } from "jwt-decode";
import { getSocket } from "../../comms-js/socket"; // adjust path if needed

const STORAGE_KEY = "app_auth_session_v1";
// Use the comms base exactly as in the surface you provided
const DEFAULT_COMMS_BASE = "http://localhost:5000/api/comms/ws";

/* -------------------------
 * Small helpers
 * ------------------------- */

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
 * Auth helpers (jwt-decode)
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
      // raw string token
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

/* -------------------------
 * intendedFor logic
 * ------------------------- */

/**
 * determineIntendedFor({ recipients, ops_region, role, explicit })
 * - recipients: array of user ids OR recipients object { all, users }
 * - ops_region: string
 * - role: string
 * - explicit: explicit override ('user'|'region'|'role'|'all')
 *
 * Returns one of: 'user'|'region'|'role'|'all'
 */
export function determineIntendedFor({ recipients, ops_region, role, explicit } = {}) {
  if (explicit && ["user", "region", "role", "all"].includes(explicit)) return explicit;
  // recipients may be array or object
  if (Array.isArray(recipients) && recipients.length > 0) return "user";
  if (recipients && typeof recipients === "object") {
    if (Array.isArray(recipients.users) && recipients.users.length > 0) return "user";
    if (recipients.all) return "all";
  }
  if (ops_region) return "region";
  if (role) return "role";
  return "all";
}

/* -------------------------
 * Message preparation
 * ------------------------- */

/**
 * prepareMessage(input)
 * - Normalizes and enriches a message object for the comms surface.
 * - Input commonly from UI: { subject, details, recipients, ops_region, role, attachments, type, status, intendedFor, payload, replyTo }
 * - Adds: id (client-side), createdAt, intendedFor, metadata.notification.sender (if token contains user info)
 */
export function prepareMessage(input = {}) {
  if (!input || typeof input !== "object") throw _makeError("INVALID_INPUT", "message input must be an object", { input });

  const subject = _safeStr(input.subject || "");
  const details = input.details == null ? "" : input.details;

  // normalize recipients to object { all: boolean, users: [] }
  let recipients = { all: false, users: [] };
  if (Array.isArray(input.recipients)) {
    recipients = { all: false, users: input.recipients.slice() };
  } else if (input.recipients && typeof input.recipients === "object") {
    recipients = {
      all: Boolean(input.recipients.all),
      users: Array.isArray(input.recipients.users) ? input.recipients.users.slice() : [],
    };
  } else if (input.recipients && typeof input.recipients === "string") {
    // legacy: comma-separated string
    const ids = input.recipients.split(",").map((s) => s.trim()).filter(Boolean);
    recipients = { all: false, users: ids };
  }

  const ops_region = input.ops_region || input.region || null;
  const role = input.role || null;
  const type = input.type || "notification";
  const status = input.status || undefined;
  const attachments = Array.isArray(input.attachments) ? input.attachments.slice() : [];
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
    // ignore decode errors
  }

  const id = `cmsg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = _nowIso();

  const message = {
    id,
    subject,
    details,
    type,
    status,
    recipients,
    ops_region,
    role,
    intendedFor,
    attachments,
    replyTo: input.replyTo || undefined,
    metadata: Object.assign({ createdAt, sender }, input.metadata || {}),
    payload: input.payload || {},
  };

  return message;
}

/* -------------------------
 * Sending helpers
 * ------------------------- */

/**
 * _sendViaSocket(socket, message, opts)
 * - Emits 'notification:create' with envelope and waits for ack
 * - Server may accept this event; otherwise HTTP fallback will be used
 */
async function _sendViaSocket(socket, message, opts = {}) {
  if (!socket || !socket.connected) throw _makeError("SOCKET_DISCONNECTED", "Socket is not connected");
  return new Promise((resolve, reject) => {
    try {
      const envelope = {
        action: "notification:create",
        payload: message,
        meta: { sentAt: _nowIso() },
      };

      socket.emit("notification:create", envelope, (ack) => {
        if (!ack) return reject(_makeError("SOCKET_ACK_MISSING", "No ack received from socket"));
        if (ack.ok) return resolve(ack);
        return reject(_makeError("SOCKET_ACK_ERROR", "Socket ack returned error", { ack }));
      });
    } catch (err) {
      return reject(err);
    }
  });
}

/**
 * _sendViaHttp(message, opts)
 * - POST to {base}/create
 * - Attaches Authorization header when a valid token is present
 */
async function _sendViaHttp(message, opts = {}) {
  const base = (opts.base || DEFAULT_COMMS_BASE).replace(/\/+$/, "");
  const url = `${base}/create`;
  const headers = { "Content-Type": "application/json" };

  try {
    const token = _getValidTokenOrThrow();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch (err) {
    if (opts.requireAuth) throw err;
    // else allow anonymous if backend supports it
  }

  const body = {
    intendedFor: message.intendedFor,
    targetUserIds: message.recipients && Array.isArray(message.recipients.users) ? message.recipients.users : undefined,
    region: message.ops_region || message.region || undefined,
    role: message.role || undefined,
    payload: message.payload || {},
    subject: message.subject || "",
    details: message.details || "",
    fromUserId: (message.metadata && message.metadata.sender && message.metadata.sender.userId) || undefined,
    expiresAt: (message.metadata && message.metadata.expiresAt) || undefined,
    autoSeq: opts.autoSeq !== false,
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    credentials: opts.credentials ?? "same-origin",
  });

  if (!res.ok) {
    const bodyText = await _jsonOrText(res);
    throw _makeError("HTTP_SEND_FAILED", `HTTP send failed: ${res.status}`, { status: res.status, body: bodyText });
  }

  const json = await res.json().catch(() => null);
  return json;
}

/**
 * sendMessage(message, opts)
 * - Attempts socket first; falls back to HTTP
 * - opts:
 *    base: REST base
 *    requireAuth: boolean (if true, throw when token missing/expired)
 */
export async function sendMessage(message, opts = {}) {
  if (!message || typeof message !== "object") throw _makeError("INVALID_INPUT", "message must be an object", { message });

  // ensure intendedFor present
  if (!message.intendedFor) {
    message.intendedFor = determineIntendedFor({
      recipients: (message.recipients && message.recipients.users) || [],
      ops_region: message.ops_region || message.region,
      role: message.role,
      explicit: message.intendedFor,
    });
  }

  if (opts.requireAuth) _getValidTokenOrThrow();

  const socket = getSocket && typeof getSocket === "function" ? getSocket() : null;
  if (socket && socket.connected) {
    try {
      const ack = await _sendViaSocket(socket, message, opts);
      // return { via: "socket", ack }; //----------------------------------------------------------
    } catch (err) {
      // fall back to HTTP
      // eslint-disable-next-line no-console
      console.debug("[websocket.Utils] socket send failed, falling back to HTTP", err && err.message);
    }
  }

  const httpResp = await _sendViaHttp(message, opts);
  return { via: "http", result: httpResp };
}

/* -------------------------
 * Batch send + cleanup
 * ------------------------- */

/**
 * sendMessagesBatch(messages[], opts)
 * - Sequential by default. If one fails, stops and attempts best-effort cleanup via POST {base}/cleanup
 */
export async function sendMessagesBatch(messages = [], opts = {}) {
  if (!Array.isArray(messages)) throw _makeError("INVALID_INPUT", "messages must be an array", { messages });
  if (messages.length === 0) return [];

  const results = [];
  const createdIds = [];

  async function _attemptCleanup(items = []) {
    if (!items || items.length === 0) return;
    const cleanupUrl = opts.cleanupEndpoint || `${(opts.base || DEFAULT_COMMS_BASE).replace(/\/+$/, "")}/cleanup`;
    try {
      const headers = { "Content-Type": "application/json" };
      try {
        const token = _getValidTokenOrThrow();
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch (_) { }
      await fetch(cleanupUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ items }),
        credentials: opts.credentials ?? "same-origin",
      }).catch(() => { });
    } catch (_) {
      // swallow
    }
  }

  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    try {
      const res = await sendMessage(m, opts);
      results.push(res);
      // try to capture created id from ack or http result
      const createdId =
        (res.ack && (res.ack.id || (res.ack.data && res.ack.data.id))) ||
        (res.result && (res.result.data && res.result.data.created && res.result.data.created._id)) ||
        null;
      if (createdId) createdIds.push({ id: createdId });
    } catch (err) {
      await _attemptCleanup(createdIds);
      throw _makeError("BATCH_SEND_FAILED", `Failed to send message at index ${i}: ${err.message || err}`, { index: i, cause: err, results });
    }
  }

  return results;
}

/* -------------------------
 * Ack / Missed helpers (server surface)
 * ------------------------- */

/**
 * ackMessage(seq, opts)
 * - Attempts to ack via socket.emit('ackNotification') if connected, otherwise POST /ack
 */
export async function ackMessage(seq, opts = {}) {
  if (!seq && seq !== 0) return null;
  const socket = getSocket && typeof getSocket === "function" ? getSocket() : null;
  if (socket && socket.connected) {
    return new Promise((resolve) => {
      try {
        socket.emit("ackNotification", { seq: Number(seq) }, (ack) => resolve(ack || null));
      } catch (e) {
        resolve(null);
      }
    });
  }

  try {
    const headers = { "Content-Type": "application/json" };
    try {
      const token = _getValidTokenOrThrow();
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch (_) { }
    const res = await fetch(`${(opts.base || DEFAULT_COMMS_BASE).replace(/\/+$/, "")}/ack`, {
      method: "POST",
      headers,
      body: JSON.stringify({ seq: Number(seq) }),
      credentials: opts.credentials ?? "same-origin",
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch (_) {
    return null;
  }
}

/**
 * fetchMissedNotifications({ sinceSeq, limit, opts })
 * - GET /missed?sinceSeq=...&limit=...
 * - Requires auth (server requires user context)
 */
export async function fetchMissedNotifications({ sinceSeq = 0, limit = 200, opts = {} } = {}) {
  const base = (opts.base || DEFAULT_COMMS_BASE).replace(/\/+$/, "");
  const qs = new URLSearchParams();
  qs.set("sinceSeq", String(Number(sinceSeq || 0)));
  qs.set("limit", String(Math.min(Number(limit || 200), 1000)));
  const url = `${base}/missed?${qs.toString()}`;

  const headers = {};
  try {
    const token = _getValidTokenOrThrow();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch (err) {
    throw err; // fetching missed requires auth
  }

  const res = await fetch(url, {
    method: "GET",
    headers,
    credentials: opts.credentials ?? "same-origin",
  });

  if (!res.ok) {
    const body = await _jsonOrText(res);
    throw _makeError("FETCH_MISSED_FAILED", `Fetch missed failed: ${res.status}`, { status: res.status, body });
  }

  const json = await res.json().catch(() => null);
  return json;
}

/* -------------------------
 * Default export
 * ------------------------- */

const websocketUtils = {
  determineIntendedFor,
  prepareMessage,
  sendMessage,
  sendMessagesBatch,
  ackMessage,
  fetchMissedNotifications,
  isAuthValid,
};

export default websocketUtils;
