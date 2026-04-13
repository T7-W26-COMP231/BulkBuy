// src/services/messageService.js
/**
 * messageService (workhorse)
 *
 * - Uses utils when available: msgeService.Utils, s3fileService.Utils, websocket.Utils, emailService.Utils
 * - Minimal, explicit behavior: upload attachments before create/update, allow removal of attachments on update,
 *   publish websocket events and send email after persistence (best-effort), preserve mock fallback.
 * - All util failures are best-effort and do not block persistence.
 *
 * Public API:
 *  - fetchMessages(opts)
 *  - fetchReplies(parentId, opts)
 *  - createMessage(payload, opts)
 *  - updateMessage(id, patch, opts)
 *  - deleteMessage(id, opts)
 *
 * NOTE: This file intentionally only implements the requested behavior and nothing extra.
 */

let msgeUtils = null;
let s3Utils = null;
let websocketUtils = null;
let emailUtils = null;
let mockService = null;

/* Lazy load utils (best-effort) */
async function _loadUtils() {
  if (msgeUtils !== null || s3Utils !== null || websocketUtils !== null || emailUtils !== null || mockService !== null) {
    return;
  }
  try { const m = await import("./mssgeService.Utils.js"); msgeUtils = m.default || m; } catch (_) { msgeUtils = null; }
  try { const s = await import("./s3fileService.Utils.js"); s3Utils = s.default || s; } catch (_) { s3Utils = null; }
  try { const w = await import("./websoService.Utils.js"); websocketUtils = w.default || w; } catch (_) { websocketUtils = null; }
  try { const e = await import("./emailService.Utils.js"); emailUtils = e.default || e; } catch (_) { emailUtils = null; }
  try { const mm = await import("./messageService.mock.js"); mockService = mm.default || mm; } catch (_) { mockService = null; }
}

/* Helpers */
function _makeError(code, message, details) {
  const e = new Error(message || code);
  e.code = code;
  if (details !== undefined) e.details = details;
  return e;
}
function _toIdList(arr = []) {
  if (!arr) return [];
  return (Array.isArray(arr) ? arr : [arr]).map((a) => {
    if (!a) return null;
    if (typeof a === "string") return a;
    if (a._id) return a._id;
    if (a.id) return a.id;
    if (a.key) return a.key;
    if (a.url) return a.url;
    return null;
  }).filter(Boolean);
}
function _ensureArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}
function _isBlockedType(type) {
  if (!type) return false;
  const t = String(type).toLowerCase();
  return t === "email" || t === "notification" || t === "system";
}

/* Public API */

/**
 * fetchMessages(opts)
 * - prefers msgeUtils.listMessages(filter, opts)
 * - returns array of top-level messages (no replyTo)
 */
export async function fetchMessages(opts = {}) {
  await _loadUtils();
  const { mock = false } = opts;

  if (mock && mockService && typeof mockService.fetchMessages === "function") {
    return mockService.fetchMessages(opts);
  }

  if (msgeUtils && typeof msgeUtils.listMessages === "function") {
    const res = await msgeUtils.listMessages(opts?.filter ?? {}, opts).catch(async (err) => {
      if (mockService && typeof mockService.fetchMessages === "function") return mockService.fetchMessages(opts);
      throw err;
    });
    // support { items: [] } or raw array
    const arr = Array.isArray(res) ? res : (res && Array.isArray(res.items) ? res.items : []);
    return arr.filter((m) => m && !m.replyTo);
  }

  if (mockService && typeof mockService.fetchMessages === "function") {
    return mockService.fetchMessages(opts);
  }

  throw _makeError("NO_BACKEND", "No message backend available (msgeUtils or mock missing).");
}

/**
 * fetchReplies(parentId, opts)
 * - prefers msgeUtils.listMessages({ replyTo: parentId }, opts)
 */
export async function fetchReplies(parentId, opts = {}) {
  await _loadUtils();
  const { mock = false } = opts;
  if (!parentId) return [];

  if (mock && mockService && typeof mockService.fetchReplies === "function") {
    return mockService.fetchReplies(parentId, opts);
  }

  if (msgeUtils && typeof msgeUtils.listMessages === "function") {
    try {
      const replies = await msgeUtils.listMessages({ replyTo: parentId }, opts);
      if (Array.isArray(replies)) return replies;
    } catch (_) { /* fallthrough */ }
  }

  if (msgeUtils && typeof msgeUtils.getMessage === "function" && typeof msgeUtils.listMessages === "function") {
    try {
      const parent = await msgeUtils.getMessage(parentId, opts).catch(() => null);
      if (parent && _isBlockedType(parent.type)) return [];
      const replies = await msgeUtils.listMessages({ replyTo: parentId }, opts).catch(() => []);
      return Array.isArray(replies) ? replies : [];
    } catch (_) { /* fallthrough */ }
  }

  if (mockService && typeof mockService.fetchReplies === "function") {
    return mockService.fetchReplies(parentId, opts);
  }

  return [];
}

/**
 * createMessage(payload, opts)
 * - upload attachments first (s3Utils.uploadFiles)
 * - persist via msgeUtils.createMessage
 * - best-effort: websocket publish/send and email send
 * - returns created message (with metadata.postActions if any)
 */
export async function createMessage(payload = {}, opts = {}) {
  await _loadUtils();
  const { mock = false, uploadAttachments = true, actor = null } = opts;

  if (mock && mockService && typeof mockService.createMessage === "function") {
    return mockService.createMessage(payload, opts);
  }

  // best-effort reply blocking check
  if (payload.replyTo && msgeUtils && typeof msgeUtils.getMessage === "function") {
    try {
      const parent = await msgeUtils.getMessage(payload.replyTo, opts).catch(() => null);
      if (parent && _isBlockedType(parent.type)) throw _makeError("REPLY_BLOCKED", "Replies not allowed to this message type", { parentId: payload.replyTo });
    } catch (err) {
      if (err.code === "REPLY_BLOCKED") throw err;
      // otherwise ignore
    }
  }

  // upload attachments if present
  let attachments = _ensureArray(payload.attachments);
  const postActions = { s3: null, websocket: null, email: null };
  if (attachments.length > 0 && uploadAttachments && s3Utils && typeof s3Utils.uploadFiles === "function") {
    try {
      const uploaded = await s3Utils.uploadFiles(attachments, actor || {}, opts).catch((e) => { throw e; });
      if (Array.isArray(uploaded) && uploaded.length > 0) {
        attachments = _toIdList(uploaded);
        postActions.s3 = { uploaded: attachments.slice() };
      } else {
        attachments = _toIdList(attachments);
        postActions.s3 = { uploaded: attachments.slice(), note: "no new uploads returned" };
      }
    } catch (e) {
      // non-fatal: normalize provided attachments and record error
      attachments = _toIdList(attachments);
      postActions.s3 = { error: e && e.message ? e.message : String(e) };
    }
  } else {
    attachments = _toIdList(attachments);
  }

  const body = Object.assign({}, payload, { attachments });

  // persist
  let created = null;
  if (msgeUtils && typeof msgeUtils.createMessage === "function") {
    created = await msgeUtils.createMessage(body, opts).catch(async (err) => {
      if (mockService && typeof mockService.createMessage === "function") return mockService.createMessage(body, opts);
      throw err;
    });
  } else if (mockService && typeof mockService.createMessage === "function") {
    created = await mockService.createMessage(body, opts);
  } else {
    throw _makeError("NO_BACKEND", "No message backend available to create message");
  }

  // websocket (best-effort)
  try {
    if (websocketUtils) {
      if (typeof websocketUtils.prepareMessage === "function" && typeof websocketUtils.sendMessage === "function") {
        const prepared = websocketUtils.prepareMessage(created);
        websocketUtils.sendMessage(prepared, opts).catch(() => {});
        postActions.websocket = "sent";
      } else if (typeof websocketUtils.publishEvent === "function") {
        websocketUtils.publishEvent("message.created", created).catch(() => {});
        postActions.websocket = "published";
      } else if (typeof websocketUtils.sendMessage === "function") {
        websocketUtils.sendMessage(created, opts).catch(() => {});
        postActions.websocket = "sent";
      }
    }
  } catch (e) {
    postActions.websocket = { error: e && e.message ? e.message : String(e) };
  }

  // email (best-effort)
  try {
    if (emailUtils && typeof emailUtils.sendEmail === "function" && (created.type === "email" || payload.email)) {
      const emailPayload = payload.email || created.email || {
        to: created.recipients && Array.isArray(created.recipients.users) ? created.recipients.users : [],
        template: created.template || {},
        data: created.payload || {},
        meta: { messageId: created._id || created.id },
      };
      emailUtils.sendEmail(emailPayload, opts).catch(() => {});
      postActions.email = "queued";
    }
  } catch (e) {
    postActions.email = { error: e && e.message ? e.message : String(e) };
  }

  // attach postActions to metadata
  try {
    created.metadata = created.metadata || {};
    created.metadata.postActions = Object.assign({}, created.metadata.postActions || {}, postActions);
  } catch (_) {}

  return created;
}

/**
 * updateMessage(id, patch, opts)
 * - supports adding attachments (upload first) and removing attachments (patch.removeAttachments)
 * - persist via msgeUtils.updateMessage
 * - best-effort websocket publish
 */
export async function updateMessage(id, patch = {}, opts = {}) {
  await _loadUtils();
  if (!id) throw _makeError("INVALID_INPUT", "id is required for updateMessage");

  const { mock = false, uploadAttachments = true, actor = null } = opts;

  if (mock && mockService && typeof mockService.updateMessage === "function") {
    return mockService.updateMessage(id, patch, opts);
  }

  // best-effort permission check: owner or admin
  if (actor && actor.userId && msgeUtils && typeof msgeUtils.getMessage === "function") {
    try {
      const existing = await msgeUtils.getMessage(id, opts).catch(() => null);
      if (existing && existing.fromUserId && String(existing.fromUserId) !== String(actor.userId)) {
        const isAdmin = Array.isArray(actor.roles) && actor.roles.includes("administrator");
        if (!isAdmin && !opts.force) throw _makeError("UPDATE_BLOCKED", "Actor not allowed to update this message", { actor: actor.userId, owner: existing.fromUserId });
      }
    } catch (err) {
      if (err.code === "UPDATE_BLOCKED") throw err;
      // otherwise ignore
    }
  }

  // handle attachments: upload new ones, remove requested ones
  let attachments = _ensureArray(patch.attachments);
  const removeAttachments = _ensureArray(patch.removeAttachments);
  const postActions = { s3: null, websocket: null };

  // upload new attachments
  if (attachments.length > 0 && uploadAttachments && s3Utils && typeof s3Utils.uploadFiles === "function") {
    try {
      const uploaded = await s3Utils.uploadFiles(attachments, actor || {}, opts).catch((e) => { throw e; });
      if (Array.isArray(uploaded) && uploaded.length > 0) {
        attachments = _toIdList(uploaded);
        postActions.s3 = postActions.s3 || {};
        postActions.s3.uploaded = attachments.slice();
      } else {
        attachments = _toIdList(attachments);
        postActions.s3 = postActions.s3 || {};
        postActions.s3.uploaded = attachments.slice();
      }
    } catch (e) {
      attachments = _toIdList(attachments);
      postActions.s3 = { error: e && e.message ? e.message : String(e) };
    }
  } else {
    attachments = _toIdList(attachments);
  }

  // delete attachments if requested and s3Utils.deleteFiles exists
  if (removeAttachments.length > 0 && s3Utils && typeof s3Utils.deleteFiles === "function") {
    try {
      const idsToDelete = _toIdList(removeAttachments);
      await s3Utils.deleteFiles(idsToDelete, actor || {}, opts).catch(() => {});
      postActions.s3 = postActions.s3 || {};
      postActions.s3.deleted = idsToDelete.slice();
    } catch (e) {
      postActions.s3 = postActions.s3 || {};
      postActions.s3.deleteError = e && e.message ? e.message : String(e);
    }
  } else if (removeAttachments.length > 0) {
    // if no deleteFiles util, still record requested removals so backend can handle them
    postActions.s3 = postActions.s3 || {};
    postActions.s3.requestedDeletes = _toIdList(removeAttachments);
  }

  // build body: include attachments additions and signal removals to backend via removeAttachments
  const body = Object.assign({}, patch, {
    attachments: attachments.length ? attachments : undefined,
    removeAttachments: removeAttachments.length ? _toIdList(removeAttachments) : undefined,
  });

  // persist update
  if (msgeUtils && typeof msgeUtils.updateMessage === "function") {
    const updated = await msgeUtils.updateMessage(id, body, opts).catch(async (err) => {
      if (mockService && typeof mockService.updateMessage === "function") return mockService.updateMessage(id, body, opts);
      throw err;
    });

    // websocket notify (best-effort)
    try {
      if (websocketUtils && typeof websocketUtils.publishEvent === "function") {
        websocketUtils.publishEvent("message.updated", updated).catch(() => {});
        postActions.websocket = "published";
      } else if (websocketUtils && typeof websocketUtils.sendMessage === "function") {
        websocketUtils.sendMessage({ action: "update", payload: updated }, opts).catch(() => {});
        postActions.websocket = "sent";
      }
    } catch (e) {
      postActions.websocket = { error: e && e.message ? e.message : String(e) };
    }

    // attach postActions to metadata
    try {
      updated.metadata = updated.metadata || {};
      updated.metadata.postActions = Object.assign({}, updated.metadata.postActions || {}, postActions);
    } catch (_) {}

    return updated;
  }

  if (mockService && typeof mockService.updateMessage === "function") {
    return mockService.updateMessage(id, body, opts);
  }

  throw _makeError("NO_BACKEND", "No message backend available to update message");
}

/**
 * deleteMessage(id, opts)
 * - best-effort permission check
 * - persist via msgeUtils.deleteMessage
 * - publish websocket event (best-effort)
 */
export async function deleteMessage(id, opts = {}) {
  await _loadUtils();
  if (!id) throw _makeError("INVALID_INPUT", "id is required for deleteMessage");
  const { mock = false, actor = null } = opts;

  if (mock && mockService && typeof mockService.deleteMessage === "function") {
    return mockService.deleteMessage(id, opts);
  }

  // permission: owner or admin (best-effort)
  if (actor && actor.userId && msgeUtils && typeof msgeUtils.getMessage === "function") {
    try {
      const existing = await msgeUtils.getMessage(id, opts).catch(() => null);
      if (existing && existing.fromUserId && String(existing.fromUserId) !== String(actor.userId)) {
        const isAdmin = Array.isArray(actor.roles) && actor.roles.includes("administrator");
        if (!isAdmin && !opts.force) throw _makeError("DELETE_BLOCKED", "Actor not allowed to delete this message", { actor: actor.userId, owner: existing.fromUserId });
      }
    } catch (err) {
      if (err.code === "DELETE_BLOCKED") throw err;
      // otherwise ignore
    }
  }

  if (msgeUtils && typeof msgeUtils.deleteMessage === "function") {
    const deleted = await msgeUtils.deleteMessage(id, opts).catch(async (err) => {
      if (mockService && typeof mockService.deleteMessage === "function") return mockService.deleteMessage(id, opts);
      throw err;
    });

    try {
      if (websocketUtils && typeof websocketUtils.publishEvent === "function") {
        websocketUtils.publishEvent("message.deleted", { id }).catch(() => {});
      }
    } catch (_) {}

    return deleted;
  }

  if (mockService && typeof mockService.deleteMessage === "function") {
    return mockService.deleteMessage(id, opts);
  }

  throw _makeError("NO_BACKEND", "No message backend available to delete message");
}

/* runtime override for tests */
export function __overrideUtils({ msge, s3, websocket, email, mock } = {}) {
  if (msge !== undefined) msgeUtils = msge;
  if (s3 !== undefined) s3Utils = s3;
  if (websocket !== undefined) websocketUtils = websocket;
  if (email !== undefined) emailUtils = email;
  if (mock !== undefined) mockService = mock;
}

const messageService = {
  fetchMessages,
  fetchReplies,
  createMessage,
  updateMessage,
  deleteMessage,
  __overrideUtils,
  _mockStore: mockService && mockService._mockStore ? mockService._mockStore : undefined,
};

export default messageService;
