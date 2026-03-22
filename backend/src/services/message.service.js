// src/services/message.service.js
//
// Message service
// - Business logic for messages and related operations
// - Delegates persistence to MessageRepo
// - Emits audit events via audit.service
//
// Methods:
// - createMessage, listMessages, getById, updateById
// - softDeleteById, hardDeleteById
// - addAttachment, removeAttachment
// - addRecipient, removeRecipient
// - markRead, markUnread
// - sendMessage, replyToMessage
//
// All methods accept opts = { actor, correlationId, session, ... } where appropriate.

const createError = require('http-errors');
const MessageRepo = require('../repositories/message.repo');
const auditService = require('./audit.service');

const TYPE_ENUM = ['issue_wall', 'email', 'notification', 'order', 'review'];
const STATUS_ENUM = ['draft', 'submitted', 'deleted', 'read', 'unread'];

function actorFromOpts(opts = {}) {
  if (!opts) return { userId: null, role: null };
  if (opts.actor) return opts.actor;
  if (opts.user) return { userId: opts.user && (opts.user.userId || opts.user._id) || null, role: opts.user && opts.user.role || null };
  return { userId: null, role: null };
}

function sanitize(doc) {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  if (obj.internalNotes) delete obj.internalNotes;
  if (obj.deleted !== undefined) delete obj.deleted;
  return obj;
}

class MessageService {
  /**
   * Create a new message (draft by default)
   * @param {Object} payload
   * @param {Object} opts
   */
  async createMessage(payload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!payload || typeof payload !== 'object') throw createError(400, 'Invalid payload');
    if (!payload.type || !TYPE_ENUM.includes(payload.type)) throw createError(400, 'type is required and must be valid');

    const safe = { ...payload };
    delete safe._id;
    delete safe.createdAt;
    delete safe.updatedAt;

    try {
      const created = await MessageRepo.create(safe, { session: opts.session });
      await auditService.logEvent({
        eventType: 'message.create.success',
        actor,
        target: { type: 'Message', id: created._id || created.id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(created);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.create.failed',
        actor,
        target: { type: 'Message', id: null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Paginated list of messages
   * @param {Object} filter
   * @param {Object} opts
   */
  async listMessages(filter = {}, opts = {}) {
    const correlationId = opts.correlationId || null;
    try {
      const result = await MessageRepo.paginate(filter, opts);
      result.items = (result.items || []).map(sanitize);
      return result;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.list.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Message', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Get message by id
   * @param {String} id
   * @param {Object} opts
   */
  async getById(id, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    try {
      const doc = await MessageRepo.findById(id, opts);
      if (!doc) throw createError(404, 'Message not found');
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.get.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Message', id: id || null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Update message by id (partial)
   * @param {String} id
   * @param {Object} update
   * @param {Object} opts
   */
  async updateById(id, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    const payload = { ...update };
    delete payload._id;

    try {
      const updated = await MessageRepo.updateById(id, payload, opts);
      if (!updated) throw createError(404, 'Message not found');
      await auditService.logEvent({
        eventType: 'message.update.success',
        actor,
        target: { type: 'Message', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { update: payload }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.update.failed',
        actor,
        target: { type: 'Message', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Soft delete message
   * @param {String} id
   * @param {Object} opts
   */
  async softDeleteById(id, deletedBy = null, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');

    try {
      const removed = await MessageRepo.softDeleteById(id, deletedBy, opts);
      if (!removed) throw createError(404, 'Message not found');
      await auditService.logEvent({
        eventType: 'message.delete.soft.success',
        actor,
        target: { type: 'Message', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.delete.soft.failed',
        actor,
        target: { type: 'Message', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Hard delete message
   * @param {String} id
   * @param {Object} opts
   */
  async hardDeleteById(id, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');

    try {
      const removed = await MessageRepo.deleteById(id, opts);
      if (!removed) throw createError(404, 'Message not found');
      await auditService.logEvent({
        eventType: 'message.delete.hard.success',
        actor,
        target: { type: 'Message', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.delete.hard.failed',
        actor,
        target: { type: 'Message', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Add attachment to message
   * @param {String} messageId
   * @param {String} fileId
   * @param {Object} opts
   */
  async addAttachment(messageId, fileId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!messageId || !fileId) throw createError(400, 'messageId and fileId are required');

    try {
      const updated = await MessageRepo.addAttachment(messageId, fileId, opts);
      if (!updated) throw createError(404, 'Message not found');
      await auditService.logEvent({
        eventType: 'message.addAttachment.success',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { fileId }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.addAttachment.failed',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Remove attachment from message
   * @param {String} messageId
   * @param {String} fileId
   * @param {Object} opts
   */
  async removeAttachment(messageId, fileId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!messageId || !fileId) throw createError(400, 'messageId and fileId are required');

    try {
      const updated = await MessageRepo.removeAttachment(messageId, fileId, opts);
      if (!updated) throw createError(404, 'Message not found');
      await auditService.logEvent({
        eventType: 'message.removeAttachment.success',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { fileId }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.removeAttachment.failed',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Add recipient to message
   * @param {String} messageId
   * @param {String} userId
   * @param {Object} opts
   */
  async addRecipient(messageId, userId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!messageId || !userId) throw createError(400, 'messageId and userId are required');

    try {
      const updated = await MessageRepo.addRecipient(messageId, userId, opts);
      if (!updated) throw createError(404, 'Message not found');
      await auditService.logEvent({
        eventType: 'message.addRecipient.success',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { userId }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.addRecipient.failed',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Remove recipient from message
   * @param {String} messageId
   * @param {String} userId
   * @param {Object} opts
   */
  async removeRecipient(messageId, userId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!messageId || !userId) throw createError(400, 'messageId and userId are required');

    try {
      const updated = await MessageRepo.removeRecipient(messageId, userId, opts);
      if (!updated) throw createError(404, 'Message not found');
      await auditService.logEvent({
        eventType: 'message.removeRecipient.success',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { userId }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.removeRecipient.failed',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Mark message as read
   * @param {String} messageId
   * @param {Object} opts
   */
  async markRead(messageId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!messageId) throw createError(400, 'messageId is required');

    try {
      const updated = await MessageRepo.markRead(messageId, opts);
      await auditService.logEvent({
        eventType: 'message.markRead.success',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.markRead.failed',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Mark message as unread
   * @param {String} messageId
   * @param {Object} opts
   */
  async markUnread(messageId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!messageId) throw createError(400, 'messageId is required');

    try {
      const updated = await MessageRepo.markUnread(messageId, opts);
      await auditService.logEvent({
        eventType: 'message.markUnread.success',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.markUnread.failed',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Send a message (transition from draft -> submitted)
   * @param {String} messageId
   * @param {Object} opts
   */
  async sendMessage(messageId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!messageId) throw createError(400, 'messageId is required');

    try {
      // set status to submitted
      const updated = await MessageRepo.updateById(messageId, { $set: { status: 'submitted' } }, { ...opts, new: true });
      if (!updated) throw createError(404, 'Message not found');
      await auditService.logEvent({
        eventType: 'message.send.success',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.send.failed',
        actor,
        target: { type: 'Message', id: messageId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Reply to a message (creates a new message with replyTo set)
   * @param {String} originalMessageId
   * @param {Object} payload - new message payload (type, recipients, subject, details, attachments)
   * @param {Object} opts
   */
  async replyToMessage(originalMessageId, payload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!originalMessageId) throw createError(400, 'originalMessageId is required');
    if (!payload || typeof payload !== 'object') throw createError(400, 'payload is required');

    try {
      const original = await MessageRepo.findById(originalMessageId, { includeDeleted: false, lean: true });
      if (!original) throw createError(404, 'Original message not found');

      const replyPayload = {
        ...payload,
        replyTo: originalMessageId,
        // default recipients: reply to original.fromUserId if not provided
        recipients: payload.recipients || (original.fromUserId ? { all: false, users: [original.fromUserId] } : { all: false, users: [] })
      };

      const created = await MessageRepo.create(replyPayload, { session: opts.session });
      await auditService.logEvent({
        eventType: 'message.reply.success',
        actor,
        target: { type: 'Message', id: created._id || created.id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { replyTo: originalMessageId }
      });
      return sanitize(created);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'message.reply.failed',
        actor,
        target: { type: 'Message', id: originalMessageId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }
}

module.exports = new MessageService();
