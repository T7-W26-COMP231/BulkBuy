// src/validators/user.validators.js
const Joi = require('joi');
const { Types } = require('mongoose');

/**
 * Helper middleware to validate request parts using Joi schema.
 * @param {Joi.ObjectSchema} schema
 * @param {'body'|'params'|'query'} property
 */
function validate(schema, property = 'body') {
  return (req, res, next) => {
    const data = req[property] || {};
    const { error, value } = schema.validate(data, { abortEarly: false, stripUnknown: true });
    if (error) {
      const details = error.details.map((d) => d.message);
      return res.status(400).json({ success: false, errors: details });
    }
    req[property] = value;
    return next();
  };
}

/**
 * ObjectId validator for Joi
 */
const objectId = Joi.string().custom((val, helpers) => {
  if (!Types.ObjectId.isValid(val)) return helpers.error('any.invalid');
  return val;
}, 'ObjectId validation');

/**
 * Sub-schemas
 */
const EmailSchema = Joi.object({
  address: Joi.string().email().required(),
  verified: Joi.boolean().default(false),
  primary: Joi.boolean().default(false)
});

const PhoneSchema = Joi.object({
  number: Joi.string().trim().required(),
  type: Joi.string().valid('mobile', 'home', 'work', 'other').default('mobile'),
  verified: Joi.boolean().default(false)
});

const AddressSchema = Joi.object({
  label: Joi.string().trim().allow('', null),
  line1: Joi.string().trim().allow('', null),
  line2: Joi.string().trim().allow('', null),
  city: Joi.string().trim().allow('', null),
  region: Joi.string().trim().allow('', null),
  postalCode: Joi.string().trim().allow('', null),
  country: Joi.string().trim().allow('', null)
});

const PaymentMethodSchema = Joi.object({
  type: Joi.string().required(),
  detailsRef: objectId.allow(null),
  last4: Joi.string().length(4).pattern(/^\d{4}$/).allow(null, ''),
  provider: Joi.string().trim().allow('', null),
  isDefault: Joi.boolean().default(false)
});

/**
 * Auth-specific schemas (register / login)
 */
const registerSchema = Joi.object({
  userId: Joi.string().pattern(/^\d{16}$/).optional(),
  firstName: Joi.string().trim().allow('', null),
  lastName: Joi.string().trim().allow('', null),
  role: Joi.string().valid('customer', 'administrator', 'supplier').default('customer'),
  emails: Joi.array().items(EmailSchema).max(5).unique((a, b) => a.address === b.address).optional(),
  phones: Joi.array().items(PhoneSchema).max(5).optional(),
  addresses: Joi.array().items(AddressSchema).max(5).optional(),
  password: Joi.string().min(8).max(128).required(),
  config: objectId.optional(),
  paymentMethods: Joi.array().items(PaymentMethodSchema).optional(),
  avatar: objectId.optional(),
  metadata: Joi.object().optional()
}).or('firstName', 'lastName', 'emails');

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

/**
 * Validators
 */

/* Create user */
const create = validate(
  Joi.object({
    userId: Joi.string().pattern(/^\d{16}$/).optional(),
    firstName: Joi.string().trim().allow('', null),
    lastName: Joi.string().trim().allow('', null),
    role: Joi.string().valid('customer', 'administrator', 'supplier').default('customer'),
    emails: Joi.array().items(EmailSchema).max(5).unique((a, b) => a.address === b.address).optional(),
    phones: Joi.array().items(PhoneSchema).max(5).optional(),
    addresses: Joi.array().items(AddressSchema).max(5).optional(),
    config: objectId.optional(),
    paymentMethods: Joi.array().items(PaymentMethodSchema).optional(),
    avatar: objectId.optional(),
    metadata: Joi.object().optional()
  }).or('firstName', 'lastName', 'emails'),
  'body'
);

/* Update user (partial) */
const update = validate(
  Joi.object({
    firstName: Joi.string().trim().allow('', null),
    lastName: Joi.string().trim().allow('', null),
    role: Joi.string().valid('customer', 'administrator', 'supplier'),
    emails: Joi.array().items(EmailSchema).max(5).optional(),
    phones: Joi.array().items(PhoneSchema).max(5).optional(),
    addresses: Joi.array().items(AddressSchema).max(5).optional(),
    config: objectId.optional(),
    paymentMethods: Joi.array().items(PaymentMethodSchema).optional(),
    avatar: objectId.optional(),
    metadata: Joi.object().optional()
  }).min(1),
  'body'
);

/* Bulk create */
const bulkCreate = validate(
  Joi.array().items(
    Joi.object({
      userId: Joi.string().pattern(/^\d{16}$/).optional(),
      firstName: Joi.string().trim().allow('', null),
      lastName: Joi.string().trim().allow('', null),
      role: Joi.string().valid('customer', 'administrator', 'supplier').default('customer'),
      emails: Joi.array().items(EmailSchema).max(5).optional(),
      phones: Joi.array().items(PhoneSchema).max(5).optional(),
      addresses: Joi.array().items(AddressSchema).max(5).optional(),
      config: objectId.optional(),
      paymentMethods: Joi.array().items(PaymentMethodSchema).optional(),
      avatar: objectId.optional(),
      metadata: Joi.object().optional()
    }).or('firstName', 'lastName', 'emails')
  ).min(1),
  'body'
);

/* ID param validator */
const idParam = validate(
  Joi.object({ id: objectId.required() }),
  'params'
);

/* userId param validator (16-digit human id) */
const userIdParam = validate(
  Joi.object({ userId: Joi.string().pattern(/^\d{16}$/).required() }),
  'params'
);

/* Query validator for list endpoint */
const query = validate(
  Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    sort: Joi.string().optional(),
    select: Joi.string().optional(),
    populate: Joi.string().optional(),
    filter: Joi.string().optional()
  }),
  'query'
);

module.exports = {
  validate,
  objectId,
  EmailSchema,
  PhoneSchema,
  AddressSchema,
  PaymentMethodSchema,
  registerSchema,
  loginSchema,
  create,
  update,
  bulkCreate,
  idParam,
  userIdParam,
  query
};
