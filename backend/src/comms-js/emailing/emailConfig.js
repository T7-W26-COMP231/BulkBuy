// example emailConfig for emailService.init(...)
const emailConfig = {
  // global defaults
  from: 'no-reply@yourshop.com',
  replyTo: 'support@yourshop.com',
  ops_region: 'us-east-1',

  // template renderer (optional override). Must implement renderTemplate(name, payload, opts, deps)
  templateRenderer: require('./renderTemplate'),

  // mail transport adapter (mailer must expose sendMail(mailPayload, opts))
  mailer: {
    provider: 'smtp', // 'smtp' | 'sendgrid' | 'ses' | custom
    smtp: {
      host: 'smtp.gmail.com', //'smtp.mail.example',
      port: 465, // 587,
      secure: true, // false,
      auth: { user: 't7.w26.comp231@gmail.com', pass: 'qllvtzjvimukfwut' /*'smtp-user', pass: 'smtp-pass' */}
    },
    // optional provider-specific settings
    sendgrid: { apiKey: process.env.SENDGRID_API_KEY },
    ses: { region: 'us-east-1', accessKeyId: process.env.AWS_KEY, secretAccessKey: process.env.AWS_SECRET },
    verifyOnInit: true
  },

  // runtime / queue settings used by initEmailService
  runtime: {
    queueAdapter: 'bull', // 'bull' | 'bee' | 'kue' | custom
    redis: { host: '127.0.0.1', port: 6379, password: null },
    concurrency: 10,
    retry: { attempts: 3, backoffMs: 2000 }
  },

  // idempotency / dedupe defaults
  idempotency: {
    enabled: true,
    ttlSeconds: 60 * 60 * 24
  },

  // optional repositories / models (injected into services and templates)
  repos: {
    messageModel: require('../../models/message.model'),
    itemRepo: require('../../repositories/item.repo'),
    userRepo: require('../../repositories/user.repo')
  },

  // optional logger (pino-compatible)
  logger: require('pino')({ level: process.env.LOG_LEVEL || 'info' }),

  // operational flags
  sendImmediatelyWhenPrepared: false, // default: queue instead of immediate send
  defaultInlineItemLimit: 12,          // used by order-summary template
  supportUrl: ''
};

module.exports = emailConfig;
