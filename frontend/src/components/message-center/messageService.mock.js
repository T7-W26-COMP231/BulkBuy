// src/services/mock.messageService.js
/**
 * mock.messageService
 *
 * In-memory mock implementation of the message service used by the UI hook (useMessages).
 * Designed to be required by the main messageService module so mock logic is isolated.
 *
 * Exports:
 *  - fetchMessages(opts)
 *  - fetchReplies(parentId, opts)
 *  - createMessage(payload, opts)
 *  - updateMessage(id, patch, opts)
 *  - deleteMessage(id, opts)
 *  - _mockStore (read-only accessors)
 *
 * Behavior mirrors the real service surface but runs entirely in-process with simulated latency.
 */

const BLOCKED_TYPES = new Set(["email", "notification", "system"]);

function delay(ms = 250) {
  return new Promise((res) => setTimeout(res, ms));
}
function nowISO() {
  return new Date().toISOString();
}
function genId(prefix = "m") {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000).toString(36)}`;
}

/* Internal mock store */
const _mockStore = {
  messages: {}, // id -> message
  rootOrder: [], // most-recent-first root ids
};

/* Seed data (idempotent) */
(function seedMock() {
  if (Object.keys(_mockStore.messages).length > 0) return;

  const a = {
    _id: genId("m"),
    subject: "Welcome to the issue wall",
    details: "This is a seeded root message. Use the form to create new messages.",
    type: "issue_wall",
    recipients: { all: true, users: [] },
    attachments: [],
    ops_region: "Toronto Central",
    status: "submitted",
    replyTo: null,
    metadata: {},
    createdAt: nowISO(),
    updatedAt: nowISO(),
    _replyCount: 1,
    replies: [],
  };

  const b = {
    _id: genId("m"),
    subject: "System notification: maintenance",
    details: "Scheduled maintenance tonight 11pm-1am.",
    type: "notification",
    recipients: { all: true, users: [] },
    attachments: [],
    ops_region: "Toronto",
    status: "unread",
    replyTo: null,
    metadata: {},
    createdAt: nowISO(),
    updatedAt: nowISO(),
    _replyCount: 0,
    replies: [],
  };

  const r1 = {
    _id: genId("r"),
    subject: `Re: ${a.subject}`,
    details: "Thanks for the heads up — will there be downtime for APIs?",
    type: "issue_wall",
    recipients: { all: false, users: [] },
    attachments: [],
    ops_region: "Toronto Central",
    status: "submitted",
    replyTo: a._id,
    metadata: {},
    createdAt: nowISO(),
    updatedAt: nowISO(),
    _replyCount: 0,
    replies: [],
  };

  a.replies = [r1];
  _mockStore.messages[a._id] = a;
  _mockStore.messages[b._id] = b;
  _mockStore.messages[r1._id] = r1;
  _mockStore.rootOrder = [a._id, b._id];
})();

/* Helpers */
function shallowCopyMessage(m) {
  if (!m) return null;
  return { ...m, _replyCount: m._replyCount || 0 };
}

/* API */

async function fetchMessages({ latency = 250 } = {}) {
  await delay(latency);
  const roots = _mockStore.rootOrder
    .map((id) => shallowCopyMessage(_mockStore.messages[id]))
    .filter(Boolean);
  return roots;
}

async function fetchReplies(parentId, { latency = 250 } = {}) {
  await delay(latency);
  if (!parentId) return [];
  const parent = _mockStore.messages[String(parentId)];
  if (parent && BLOCKED_TYPES.has(String(parent.type).toLowerCase())) {
    return [];
  }
  const replies = Object.values(_mockStore.messages)
    .filter((m) => String(m.replyTo) === String(parentId))
    .map((r) => shallowCopyMessage(r))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return replies;
}

async function createMessage(payload = {}, { latency = 300 } = {}) {
  await delay(latency);

  // Defensive: block replies under blocked parent types
  if (payload && payload.replyTo) {
    const parent = _mockStore.messages[String(payload.replyTo)];
    if (parent && BLOCKED_TYPES.has(String(parent.type).toLowerCase())) {
      const err = new Error("Replies are not allowed for this message type.");
      err.code = "REPLY_BLOCKED";
      throw err;
    }
  }

  const id = genId(payload.replyTo ? "r" : "m");
  const created = {
    _id: id,
    subject: payload.subject || "",
    details: payload.details || "",
    type: payload.type || "notification",
    recipients: payload.recipients || { all: false, users: [] },
    attachments: payload.attachments || [],
    ops_region: payload.ops_region || "",
    status: payload.status || "submitted",
    replyTo: payload.replyTo || null,
    metadata: payload.metadata || {},
    createdAt: nowISO(),
    updatedAt: nowISO(),
    _replyCount: 0,
    replies: [],
  };

  _mockStore.messages[id] = created;

  if (created.replyTo) {
    const parent = _mockStore.messages[String(created.replyTo)];
    if (parent) {
      parent._replyCount = (parent._replyCount || 0) + 1;
      parent.replies = Array.isArray(parent.replies) ? [...parent.replies, created] : [created];
    }
  } else {
    _mockStore.rootOrder = [id, ..._mockStore.rootOrder];
  }

  return shallowCopyMessage(created);
}

async function updateMessage(id, patch = {}, { latency = 200 } = {}) {
  await delay(latency);
  const cur = _mockStore.messages[String(id)];
  if (!cur) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }
  if (BLOCKED_TYPES.has(String(cur.type).toLowerCase())) {
    const err = new Error("Updates are not allowed for this message type.");
    err.code = "UPDATE_BLOCKED";
    throw err;
  }
  const updated = { ...cur, ...patch, updatedAt: nowISO() };
  _mockStore.messages[String(id)] = updated;
  return shallowCopyMessage(updated);
}

async function deleteMessage(id, { latency = 200 } = {}) {
  await delay(latency);
  const cur = _mockStore.messages[String(id)];
  if (!cur) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }
  if (BLOCKED_TYPES.has(String(cur.type).toLowerCase())) {
    const err = new Error("Deletes are not allowed for this message type.");
    err.code = "DELETE_BLOCKED";
    throw err;
  }

  const updated = { ...cur, deleted: true, status: "deleted", updatedAt: nowISO() };
  _mockStore.messages[String(id)] = updated;

  // adjust parent's reply count / rootOrder
  if (updated.replyTo) {
    const parent = _mockStore.messages[String(updated.replyTo)];
    if (parent) {
      parent._replyCount = Math.max(0, (parent._replyCount || 1) - 1);
      parent.replies = Array.isArray(parent.replies) ? parent.replies.filter((r) => String(r._id) !== String(id)) : [];
    }
  } else {
    _mockStore.rootOrder = _mockStore.rootOrder.filter((rid) => String(rid) !== String(id));
  }

  return shallowCopyMessage(updated);
}

/* Read-only accessors for tests/debug */
const mockExports = {
  fetchMessages,
  fetchReplies,
  createMessage,
  updateMessage,
  deleteMessage,
  _mockStore: {
    get messages() {
      return { ..._mockStore.messages };
    },
    get rootOrder() {
      return [..._mockStore.rootOrder];
    },
  },
};

module.exports = mockExports;
