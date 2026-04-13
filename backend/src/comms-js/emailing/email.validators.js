// src/comms/emailing/email.validators.js
/**
 * Validation middleware for email routes
 *
 * Exports:
 *  - validateSend
 *  - validateBulk
 *  - validateToRecipients
 *
 * Uses Joi for schema validation and forwards friendly errors to next().
 */

const Joi = require('joi');
const createError = require('http-errors');

/* Schemas */

const recipientSchema = Joi.alternatives().try(
  Joi.string().trim().email().label('emailString'),
  Joi.object({
    to: Joi.string().trim().required().label('to'),
    data: Joi.object().optional().label('data')
  }).label('recipientObject')
);

const sendSchema = Joi.object({
  to: Joi.alternatives().try(
    Joi.string().trim().email(),
    Joi.array().items(Joi.string().trim().email()).min(1)
  ).required().label('to'),
  template: Joi.alternatives().try(Joi.object(), Joi.string()).optional().label('template'),
  data: Joi.object().optional().label('data'),
  meta: Joi.object().optional().label('meta'),
  immediate: Joi.boolean().optional().label('immediate')
}).required();

const bulkSchema = Joi.object({
  recipients: Joi.array().items(recipientSchema).min(1).required().label('recipients'),
  template: Joi.alternatives().try(Joi.object(), Joi.string()).required().label('template'),
  dataList: Joi.array().items(Joi.object()).optional().label('dataList'),
  chunkSize: Joi.number().integer().min(1).max(10000).optional().default(100).label('chunkSize'),
  dedupe: Joi.boolean().optional().default(true).label('dedupe'),
  idempotencyPrefix: Joi.string().trim().optional().allow('').label('idempotencyPrefix'),
  meta: Joi.object().optional().label('meta')
}).required();

const toRecipientsSchema = Joi.object({
  spec: Joi.object().required().label('spec'),
  template: Joi.alternatives().try(Joi.object(), Joi.string()).required().label('template'),
  data: Joi.alternatives().try(Joi.object(), Joi.array()).optional().label('data'),
  opts: Joi.object().optional().label('opts')
}).required();

/* Helper: run schema and forward errors */

function _validate(schema) {
  return async function (req, res, next) {
    try {
      const payload = req.body || {};
      const value = await schema.validateAsync(payload, { abortEarly: false, stripUnknown: true });
      // attach validated value for downstream handlers to use
      req.validatedBody = value;
      return next();
    } catch (err) {
      if (err && err.isJoi) {
        const details = (err.details || []).map((d) => ({ path: d.path.join('.'), message: d.message }));
        return next(createError(400, 'Validation failed', { details }));
      }
      return next(err);
    }
  };
}

/* Exported middlewares */

module.exports = {
  validateSend: _validate(sendSchema),
  validateBulk: _validate(bulkSchema),
  validateToRecipients: _validate(toRecipientsSchema)
};
