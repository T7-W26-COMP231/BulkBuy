// src/utils/permissions.js
/**
 * permissions.js
 *
 * Small centralized helpers for evaluating UI permissions and role-based checks.
 * Keeps permission logic in one place so components remain declarative.
 *
 * Usage:
 *   import { can, defaultPermissions, mergePermissions, actionsForMessage } from '../utils/permissions';
 *
 * - `can(action, permissions)` returns boolean
 * - `mergePermissions(base, override)` merges permission objects safely
 * - `actionsForMessage(message, permissions, depth, maxDepth)` returns which actions should be shown for a given message
 */

/* Default permission set used by components when none is provided */
export const defaultPermissions = {
  canRead: true,
  canReply: true,
  canUpdate: true,
  canDelete: true,
  canCreate: true,
};

/* Canonical list of actions the UI supports */
export const ACTIONS = {
  READ: "read",
  REPLY: "reply",
  UPDATE: "update",
  DELETE: "delete",
  CREATE: "create",
  VIEW_REPLIES: "view_replies",
};

/**
 * Merge two permission objects.
 * - Keeps boolean semantics and falls back to defaults for missing keys.
 * - Does not mutate inputs.
 *
 * @param {Object} base
 * @param {Object} override
 * @returns {Object} merged permissions
 */
export function mergePermissions(base = {}, override = {}) {
  const merged = { ...defaultPermissions, ...base, ...override };
  // ensure booleans for known keys
  Object.keys(defaultPermissions).forEach((k) => {
    merged[k] = Boolean(merged[k]);
  });
  return merged;
}

/**
 * Check whether a given action is allowed by the permissions object.
 *
 * Supported actions: 'read', 'reply', 'update', 'delete', 'create', 'view_replies'
 *
 * @param {string} action
 * @param {Object} permissions
 * @returns {boolean}
 */
export function can(action, permissions = {}) {
  const p = mergePermissions(defaultPermissions, permissions);
  switch (action) {
    case ACTIONS.READ:
      return Boolean(p.canRead);
    case ACTIONS.REPLY:
      return Boolean(p.canReply);
    case ACTIONS.UPDATE:
      return Boolean(p.canUpdate);
    case ACTIONS.DELETE:
      return Boolean(p.canDelete);
    case ACTIONS.CREATE:
      return Boolean(p.canCreate);
    case ACTIONS.VIEW_REPLIES:
      // viewing replies is allowed if user can read or reply
      return Boolean(p.canRead || p.canReply);
    default:
      return false;
  }
}

/**
 * Compute which action buttons should be shown for a specific message in the UI.
 * This centralizes rules like "no replies after max depth" or "hide update for deleted messages".
 *
 * @param {Object} message - message object (may include status, deleted, replyTo)
 * @param {Object} permissions - permission object
 * @param {number} depth - current depth (0 = root)
 * @param {number} maxDepth - maximum allowed reply depth
 * @returns {Object} actions visibility map: { replies, reply, update, delete, create }
 */
export function actionsForMessage(message = {}, permissions = {}, depth = 0, maxDepth = 3) {
  const p = mergePermissions(defaultPermissions, permissions);

  const isDeleted = Boolean(message.deleted);
  const status = message.status || "";

  const canViewReplies = can(ACTIONS.VIEW_REPLIES, p);
  const canReply = can(ACTIONS.REPLY, p) && depth < Number(maxDepth);
  const canUpdate = can(ACTIONS.UPDATE, p) && !isDeleted;
  const canDelete = can(ACTIONS.DELETE, p) && !isDeleted;
  const canCreate = can(ACTIONS.CREATE, p);

  // Replies may be present but creation can be disabled by depth or deletion
  return {
    replies: canViewReplies,
    reply: canReply && !isDeleted && status !== "deleted",
    update: canUpdate,
    delete: canDelete,
    create: canCreate,
  };
}

/**
 * Utility to guard an action and throw a friendly Error if not permitted.
 * Useful for service-level checks before attempting an API call.
 *
 * @param {string} action
 * @param {Object} permissions
 * @param {string} [messageText] - optional custom error message
 */
export function requirePermission(action, permissions = {}, messageText = null) {
  if (!can(action, permissions)) {
    const msg = messageText || `You do not have permission to ${action}.`;
    const err = new Error(msg);
    err.code = "E_PERMISSION";
    throw err;
  }
}

/* Small convenience: map of role -> permission presets (optional)
   Keep this minimal; real apps should derive permissions from server-side roles/ACLs. */
export const ROLE_PRESETS = {
  admin: {
    canRead: true,
    canReply: true,
    canUpdate: true,
    canDelete: true,
    canCreate: true,
  },
  moderator: {
    canRead: true,
    canReply: true,
    canUpdate: true,
    canDelete: true,
    canCreate: false,
  },
  reader: {
    canRead: true,
    canReply: false,
    canUpdate: false,
    canDelete: false,
    canCreate: false,
  },
};

export default {
  defaultPermissions,
  ACTIONS,
  mergePermissions,
  can,
  actionsForMessage,
  requirePermission,
  ROLE_PRESETS,
};
