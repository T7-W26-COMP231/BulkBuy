// src/controllers/message.controller.js
/**
 * Message controller
 * - Thin HTTP layer that delegates to message.service
 * - Consistent audit logging and correlationId propagation
 */

const messageService = require('../services/message.service');
const auditService = require('../services/audit.service');

function actorFromReq(req = {}) {
  const user = req.user || null;
  return { userId: user && (user.userId || user._id) || null, role: user && user.role || null };
}

/* POST /messages */
async function createMessage(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const payload = req.body;
    const created = await messageService.createMessage(payload, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'message.create.success',
      actor,
      target: { type: 'Message', id: created._id || created.id || null },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });
    return res.status(201).json({ success: true, data: created });
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
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /messages */
async function listMessages(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const page = req.query.page;
    const limit = req.query.limit;
    const filter = req.query.filter ? JSON.parse(req.query.filter) : {};
    const result = await messageService.listMessages(filter, { page, limit, correlationId, actor });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'message.list.failed',
      actor,
      target: { type: 'Message', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(500).json({ success: false, message: err.message });
  }
}

/* GET /messages/:id */
async function getById(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const doc = await messageService.getById(id, { correlationId, actor });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'message.get.failed',
      actor,
      target: { type: 'Message', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* PATCH /messages/:id */
async function updateById(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const update = req.body;
    const updated = await messageService.updateById(id, update, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'message.update.failed',
      actor,
      target: { type: 'Message', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /messages/:id/soft-delete */
async function softDelete(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const deletedBy = actor.userId || null;
    const removed = await messageService.softDeleteById(id, deletedBy, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'message.delete.soft.success',
      actor,
      target: { type: 'Message', id },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });
    return res.status(200).json({ success: true, data: removed });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'message.delete.soft.failed',
      actor,
      target: { type: 'Message', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* DELETE /messages/:id/hard */
async function hardDelete(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const removed = await messageService.hardDeleteById(id, { actor, correlationId });
    await auditService.logEvent({
      eventType: 'message.delete.hard.success',
      actor,
      target: { type: 'Message', id },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });
    return res.status(200).json({ success: true, data: removed });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'message.delete.hard.failed',
      actor,
      target: { type: 'Message', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /messages/:id/add-attachment */
async function addAttachment(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const messageId = req.params.id;
    const { fileId } = req.body;
    const updated = await messageService.addAttachment(messageId, fileId, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'message.addAttachment.success',
      actor,
      target: { type: 'Message', id: messageId },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { fileId }
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'message.addAttachment.failed',
      actor,
      target: { type: 'Message', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /messages/:id/remove-attachment */
async function removeAttachment(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const messageId = req.params.id;
    const { fileId } = req.body;
    const updated = await messageService.removeAttachment(messageId, fileId, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'message.removeAttachment.success',
      actor,
      target: { type: 'Message', id: messageId },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { fileId }
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'message.removeAttachment.failed',
      actor,
      target: { type: 'Message', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /messages/:id/add-recipient */
async function addRecipient(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const messageId = req.params.id;
    const { userId } = req.body;
    const updated = await messageService.addRecipient(messageId, userId, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'message.addRecipient.success',
      actor,
      target: { type: 'Message', id: messageId },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { userId }
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'message.addRecipient.failed',
      actor,
      target: { type: 'Message', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /messages/:id/remove-recipient */
async function removeRecipient(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const messageId = req.params.id;
    const { userId } = req.body;
    const updated = await messageService.removeRecipient(messageId, userId, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'message.removeRecipient.success',
      actor,
      target: { type: 'Message', id: messageId },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { userId }
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'message.removeRecipient.failed',
      actor,
      target: { type: 'Message', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /messages/:id/mark-read */
async function markRead(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const messageId = req.params.id;
    const updated = await messageService.markRead(messageId, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'message.markRead.success',
      actor,
      target: { type: 'Message', id: messageId },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'message.markRead.failed',
      actor,
      target: { type: 'Message', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /messages/:id/mark-unread */
async function markUnread(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const messageId = req.params.id;
    const updated = await messageService.markUnread(messageId, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'message.markUnread.success',
      actor,
      target: { type: 'Message', id: messageId },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'message.markUnread.failed',
      actor,
      target: { type: 'Message', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /messages/:id/send */
async function sendMessage(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const messageId = req.params.id;
    const updated = await messageService.sendMessage(messageId, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'message.send.success',
      actor,
      target: { type: 'Message', id: messageId },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'message.send.failed',
      actor,
      target: { type: 'Message', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /messages/:id/reply */
async function replyToMessage(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const originalId = req.params.id;
    const payload = req.body;
    const created = await messageService.replyToMessage(originalId, payload, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'message.reply.success',
      actor,
      target: { type: 'Message', id: created._id || created.id || null },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { replyTo: originalId }
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'message.reply.failed',
      actor,
      target: { type: 'Message', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

module.exports = {
  createMessage,
  listMessages,
  getById,
  updateById,
  softDelete,
  hardDelete,
  addAttachment,
  removeAttachment,
  addRecipient,
  removeRecipient,
  markRead,
  markUnread,
  sendMessage,
  replyToMessage
};
