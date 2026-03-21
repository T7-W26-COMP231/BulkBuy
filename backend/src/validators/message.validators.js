// src/validators/message.validators.js
/**
 * Validators for Message endpoints
 * - Uses express-validator
 * - Exports middleware arrays for route wiring
 */

const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

const TYPE_ENUM = ['issue_wall', 'email', 'notification', 'order', 'review'];
const STATUS_ENUM = ['draft', 'submitted', 'deleted', 'read', 'unread'];

/**
 * Run express-validator results and forward a structured error
 */
function runValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.param, message: e.msg }));
    const err = new Error('Validation failed');
    err.status = 400;
    err.details = details;
    return next(err);
  }
  return next();
}

/**
 * Helper: allow empty or valid JSON string in query (e.g., ?filter={...})
 */
function isJsonString(value) {
  if (value === undefined || value === null || value === '') return true;
  try {
    JSON.parse(value);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Admin guard middleware
 */
function adminOnly(req, res, next) {
  const user = req.user;
  if (!user || !user.role || user.role !== 'administrator') {
    const err = new Error('admin privileges required');
    err.status = 403;
    return next(err);
  }
  return next();
}

/* Common param validators */
const idParam = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('id must be a valid ObjectId'),
  runValidation
];

/* Create message */
const create = [
  body('type').exists().withMessage('type is required').bail()
    .isIn(TYPE_ENUM).withMessage(`type must be one of: ${TYPE_ENUM.join(', ')}`),
  body('recipients').optional().isObject().withMessage('recipients must be an object'),
  body('recipients.all').optional().isBoolean().withMessage('recipients.all must be boolean').toBoolean(),
  body('recipients.users').optional().isArray().withMessage('recipients.users must be an array'),
  body('recipients.users.*').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('recipients.users must contain valid ObjectIds'),
  body('fromUserId').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('fromUserId must be a valid ObjectId'),
  body('subject').optional().isString().trim(),
  body('details').optional().isString().trim(),
  body('attachments').optional().isArray().withMessage('attachments must be an array'),
  body('attachments.*').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('attachments must be valid ObjectIds'),
  body('ops_region').optional().isString().trim(),
  body('status').optional().isIn(STATUS_ENUM).withMessage(`status must be one of: ${STATUS_ENUM.join(', ')}`),
  body('replyTo').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('replyTo must be a valid ObjectId'),
  body('metadata').optional().isObject().withMessage('metadata must be an object'),
  runValidation
];

/* Query list */
const queryValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('sort').optional().isString(),
  query('filter').optional().custom(isJsonString).withMessage('filter must be valid JSON string'),
  runValidation
];

/* Update message (partial) */
const update = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('id must be a valid ObjectId'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('update payload must be an object');
    }
    if (Object.keys(value).length === 0) {
      throw new Error('update payload cannot be empty');
    }
    return true;
  }),
  body('_id').not().exists().withMessage('_id cannot be modified'),
  body('type').optional().isIn(TYPE_ENUM).withMessage(`type must be one of: ${TYPE_ENUM.join(', ')}`),
  body('status').optional().isIn(STATUS_ENUM).withMessage(`status must be one of: ${STATUS_ENUM.join(', ')}`),
  runValidation
];

/* Add attachment */
const addAttachment = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('id must be a valid ObjectId'),
  body('fileId').exists().withMessage('fileId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('fileId must be a valid ObjectId'),
  runValidation
];

/* Remove attachment */
const removeAttachment = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('id must be a valid ObjectId'),
  body('fileId').exists().withMessage('fileId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('fileId must be a valid ObjectId'),
  runValidation
];

/* Add recipient */
const addRecipient = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('id must be a valid ObjectId'),
  body('userId').exists().withMessage('userId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('userId must be a valid ObjectId'),
  runValidation
];

/* Remove recipient */
const removeRecipient = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('id must be a valid ObjectId'),
  body('userId').exists().withMessage('userId is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('userId must be a valid ObjectId'),
  runValidation
];

/* Reply validator */
const reply = [
  param('id').exists().withMessage('id is required').bail()
    .custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('id must be a valid ObjectId'),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('reply payload must be an object');
    }
    return true;
  }),
  body('type').optional().isIn(TYPE_ENUM).withMessage(`type must be one of: ${TYPE_ENUM.join(', ')}`),
  body('subject').optional().isString().trim(),
  body('details').optional().isString().trim(),
  body('recipients').optional().isObject().withMessage('recipients must be an object'),
  body('recipients.users').optional().isArray().withMessage('recipients.users must be an array'),
  body('recipients.users.*').optional().custom((v) => mongoose.Types.ObjectId.isValid(String(v))).withMessage('recipients.users must contain valid ObjectIds'),
  runValidation
];

/* Simple validators for mark read/unread and send (only id param required) */
const markRead = idParam;
const markUnread = idParam;
const send = idParam;

module.exports = {
  runValidation,
  create,
  query: queryValidator,
  idParam,
  update,
  addAttachment,
  removeAttachment,
  addRecipient,
  removeRecipient,
  reply,
  markRead,
  markUnread,
  send,
  adminOnly
};
