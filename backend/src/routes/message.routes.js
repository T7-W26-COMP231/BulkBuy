// src/routes/message.routes.js
/**
 * Message routes
 * - Thin routing layer that wires validators, auth, and controller handlers
 * - All mutating endpoints require authentication (requireAuth)
 *
 * Routes:
 * POST   /messages                    -> create message
 * GET    /messages                    -> list messages (pagination/filter)
 * GET    /messages/:id                -> get message by id
 * PATCH  /messages/:id                -> update message
 * POST   /messages/:id/soft-delete    -> soft delete
 * DELETE /messages/:id/hard           -> hard delete (admin)
 *
 * POST   /messages/:id/add-attachment
 * POST   /messages/:id/remove-attachment
 * POST   /messages/:id/add-recipient
 * POST   /messages/:id/remove-recipient
 * POST   /messages/:id/mark-read
 * POST   /messages/:id/mark-unread
 * POST   /messages/:id/send
 * POST   /messages/:id/reply
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const MessageController = require('../controllers/message.controller');
const messageValidators = require('../validators/message.validators');
const { requireAuth } = require('../middleware/auth.middleware');

/* Async wrapper to forward errors to express error handler */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/* Simple param validator for :id */
const validateIdParam = (req, res, next) => {
  const id = req.params.id;
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    const err = new Error('id must be a valid ObjectId');
    err.status = 400;
    return next(err);
  }
  return next();
};

/* Simple body validator for fileId and userId where used */
const requireBodyField = (field) => (req, res, next) => {
  if (!req.body || req.body[field] === undefined || req.body[field] === null) {
    const err = new Error(`${field} is required in request body`);
    err.status = 400;
    return next(err);
  }
  return next();
};

/* Public / authenticated routes */
router.post(
  '/',
  requireAuth,
  messageValidators.create,
  asyncHandler(MessageController.createMessage)
);

router.get(
  '/',
  requireAuth,
  messageValidators.query,
  asyncHandler(MessageController.listMessages)
);

router.get(
  '/:id',
  requireAuth,
  validateIdParam,
  asyncHandler(MessageController.getById)
);

router.patch(
  '/:id',
  requireAuth,
  validateIdParam,
  messageValidators.update,
  asyncHandler(MessageController.updateById)
);

/* Soft delete (logical) */
router.post(
  '/:id/soft-delete',
  requireAuth,
  validateIdParam,
  asyncHandler(MessageController.softDelete)
);

/* Hard delete (admin only) */
router.delete(
  '/:id/hard',
  requireAuth,
  validateIdParam,
  messageValidators.adminOnly,
  asyncHandler(MessageController.hardDelete)
);

/* Attachments */
router.post(
  '/:id/add-attachment',
  requireAuth,
  validateIdParam,
  requireBodyField('fileId'),
  asyncHandler(MessageController.addAttachment)
);

router.post(
  '/:id/remove-attachment',
  requireAuth,
  validateIdParam,
  requireBodyField('fileId'),
  asyncHandler(MessageController.removeAttachment)
);

/* Recipients */
router.post(
  '/:id/add-recipient',
  requireAuth,
  validateIdParam,
  requireBodyField('userId'),
  asyncHandler(MessageController.addRecipient)
);

router.post(
  '/:id/remove-recipient',
  requireAuth,
  validateIdParam,
  requireBodyField('userId'),
  asyncHandler(MessageController.removeRecipient)
);

/* Read / unread */
router.post(
  '/:id/mark-read',
  requireAuth,
  validateIdParam,
  asyncHandler(MessageController.markRead)
);

router.post(
  '/:id/mark-unread',
  requireAuth,
  validateIdParam,
  asyncHandler(MessageController.markUnread)
);

/* Send and reply */
router.post(
  '/:id/send',
  requireAuth,
  validateIdParam,
  asyncHandler(MessageController.sendMessage)
);

router.post(
  '/:id/reply',
  requireAuth,
  validateIdParam,
  messageValidators.reply,
  asyncHandler(MessageController.replyToMessage)
);

module.exports = router;
