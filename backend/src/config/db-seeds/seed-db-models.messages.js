// src/config/db-seeds/seed-db-models.messages.js
/**
 * Seed: Messages
 *
 * Responsibilities:
 * - Create a small, realistic set of Message documents for development/testing.
 * - Be idempotent: by default, if messages already exist the seed will skip unless `force: true`.
 * - Accepts `deps.users` (array of user _id strings or ObjectIds) to wire recipient lists.
 *
 * Usage:
 *   const seed = require('./seed-db-models.messages');
 *   await seed.run({ force: false, dryRun: false, logger: console, deps: { users: [userId1, userId2] } });
 *
 * Returns:
 *   {
 *     skipped: boolean,
 *     reason?: string,
 *     planned?: Array<Object> (when dryRun),
 *     created?: Array<Object> (plain objects),
 *     providedDependencies: { messageIds: [ ... ] },
 *     missingDependencies: [] // reserved for index coordination
 *   }
 */

const mongoose = require('mongoose');
const Message = require('../../models/message.model'); // model path relative to this seed file
const { Types } = mongoose;

async function ensureObjectId(id) {
  if (!id) return null;
  if (Types.ObjectId.isValid(id)) return Types.ObjectId(id);
  // fallback: generate new ObjectId (shouldn't normally happen)
  return Types.ObjectId();
}

module.exports = {
  /**
   * Run the messages seed.
   *
   * @param {Object} opts
   * @param {Boolean} [opts.force=false] - force seeding even if messages exist
   * @param {Boolean} [opts.dryRun=false] - do not persist, just return planned docs
   * @param {Function} [opts.logger=console] - logger
   * @param {Object} [opts.deps={}] - dependencies from other seeds (e.g., users)
   * @returns {Promise<Object>}
   */
  run: async function run(opts = {}) {
    const {
      force = false,
      dryRun = false,
      logger = console,
      deps = {}
    } = opts;

    // Defensive: ensure mongoose connection present
    if (!mongoose || !mongoose.connection || mongoose.connection.readyState === 0) {
      throw new Error('Mongoose is not connected. Connect to DB before running seeds.');
    }

    // If DB already has messages and not forcing, skip
    const existingCount = await Message.countDocuments({}).exec();
    if (existingCount > 0 && !force) {
      logger && logger.info && logger.info(`seed-db-models.messages: skipping (found ${existingCount} existing messages)`);
      return { skipped: true, reason: `found ${existingCount} existing messages` };
    }

    // Prepare user ids from deps (optional)
    const userIds = Array.isArray(deps.users) ? deps.users.slice(0, 10) : [];
    const normalizedUserIds = await Promise.all(userIds.map((u) => ensureObjectId(u)));
    // If no user ids provided, some messages will be broadcast (recipients.all = true)

    // Build sample messages
    const now = Date.now();
    const planned = [
      {
        // System notification broadcast
        type: 'notification',
        recipients: { all: true, users: [] },
        fromUserId: null,
        subject: 'Welcome to BulkBuy',
        details: 'Welcome! BulkBuy is live. Check out current sales windows and top products.',
        attachments: [],
        ops_region: 'global',
        status: 'submitted',
        metadata: { channel: 'system' },
        createdAt: now - 1000 * 60 * 60 * 24 * 7, // 1 week ago
        updatedAt: now - 1000 * 60 * 60 * 24 * 7
      },
      {
        // Order notification to a specific user (if available)
        type: 'order',
        recipients: { all: false, users: normalizedUserIds.length > 0 ? [normalizedUserIds[0]] : [] },
        fromUserId: normalizedUserIds.length > 1 ? normalizedUserIds[1] : null,
        subject: 'Your order has been dispatched',
        details: 'Order #BB-1001 has been dispatched and is on its way. Tracking will be available shortly.',
        attachments: [],
        ops_region: 'north-america',
        status: 'submitted',
        metadata: { orderId: 'BB-1001' },
        createdAt: now - 1000 * 60 * 60 * 24 * 2, // 2 days ago
        updatedAt: now - 1000 * 60 * 60 * 24 * 2
      },
      {
        // Email from support to a user
        type: 'email',
        recipients: { all: false, users: normalizedUserIds.length > 1 ? [normalizedUserIds[1]] : [] },
        fromUserId: normalizedUserIds.length > 2 ? normalizedUserIds[2] : null,
        subject: 'Issue with your recent payment',
        details: 'We noticed an issue processing your payment. Please update your payment method to avoid delays.',
        attachments: [],
        ops_region: 'europe',
        status: 'unread',
        metadata: { severity: 'high' },
        createdAt: now - 1000 * 60 * 60 * 12, // 12 hours ago
        updatedAt: now - 1000 * 60 * 60 * 12
      },
      {
        // Wall post (issue_wall) created by a user
        type: 'issue_wall',
        recipients: { all: false, users: normalizedUserIds.length > 0 ? [normalizedUserIds[0]] : [] },
        fromUserId: normalizedUserIds.length > 0 ? normalizedUserIds[0] : null,
        subject: 'Request for bulk pricing clarification',
        details: 'Can suppliers clarify the bulk pricing tiers for item X? I need pricing for 500 units.',
        attachments: [],
        ops_region: 'africa',
        status: 'submitted',
        metadata: { thread: 'pricing-clarify' },
        createdAt: now - 1000 * 60 * 60 * 6, // 6 hours ago
        updatedAt: now - 1000 * 60 * 60 * 6
      },
      {
        // Review-related message (notification to supplier)
        type: 'review',
        recipients: { all: false, users: normalizedUserIds.length > 3 ? [normalizedUserIds[3]] : [] },
        fromUserId: normalizedUserIds.length > 4 ? normalizedUserIds[4] : null,
        subject: 'New review submitted for your product',
        details: 'A customer submitted a 5-star review for "Premium Rice 25kg".',
        attachments: [],
        ops_region: 'asia',
        status: 'submitted',
        metadata: { productId: null, rating: 5 },
        createdAt: now - 1000 * 60 * 30, // 30 minutes ago
        updatedAt: now - 1000 * 60 * 30
      },
      {
        // Draft message (internal)
        type: 'notification',
        recipients: { all: false, users: normalizedUserIds.length > 0 ? [normalizedUserIds[0]] : [] },
        fromUserId: normalizedUserIds.length > 0 ? normalizedUserIds[0] : null,
        subject: 'Draft: Upcoming maintenance',
        details: 'Draft: We plan maintenance next week. Finalize schedule before publishing.',
        attachments: [],
        ops_region: 'global',
        status: 'draft',
        metadata: { internal: true },
        createdAt: now,
        updatedAt: now
      }
    ];

    // If recipients.users arrays are empty and no user deps provided, set recipients.all = true for those messages
    planned.forEach((m) => {
      if (!m.recipients || (!Array.isArray(m.recipients.users) || m.recipients.users.length === 0)) {
        // keep existing all flag; if it's false, make it a broadcast to ensure messages are reachable in a fresh DB
        if (!m.recipients || m.recipients.all === false) {
          m.recipients = { all: true, users: [] };
        }
      }
    });

    // If dryRun, return planned docs without persisting
    if (dryRun) {
      logger && logger.info && logger.info('seed-db-models.messages: dryRun - planned messages prepared');
      return { skipped: false, planned, created: [], providedDependencies: { messageIds: [] }, missingDependencies: [] };
    }

    // Persist messages
    let createdDocs;
    try {
      // Use ordered=false to continue on partial errors (but we want to know failures)
      const inserted = await Message.insertMany(planned, { ordered: false });
      createdDocs = (inserted || []).map((d) => (d && typeof d.toObject === 'function' ? d.toObject() : d));
      logger && logger.info && logger.info(`seed-db-models.messages: created ${createdDocs.length} messages`);
    } catch (err) {
      // insertMany may throw on some errors; attempt to recover inserted docs if available
      if (err && err.insertedDocs) {
        createdDocs = (err.insertedDocs || []).map((d) => (d && typeof d.toObject === 'function' ? d.toObject() : d));
        logger && logger.warn && logger.warn(`seed-db-models.messages: partial insert - created ${createdDocs.length} messages, error: ${err.message}`);
      } else {
        logger && logger.error && logger.error('seed-db-models.messages: failed to insert messages', err);
        throw err;
      }
    }

    // Build providedDependencies for index coordination
    const messageIds = (createdDocs || []).map((d) => d._id).filter(Boolean);

    return {
      skipped: false,
      planned: undefined,
      created: createdDocs,
      providedDependencies: { messageIds },
      missingDependencies: [] // no external required dependencies for messages seed
    };
  }
};

/* ---------------------------------------------------------------------------
 * Postman payloads and quick test instructions
 *
 * Base path (as in app): /api/comms
 *
 * 1) Create a message (POST)
 *    POST /api/comms
 *    Body (JSON):
 *    {
 *      "type": "notification",
 *      "recipients": { "all": true, "users": [] },
 *      "subject": "System maintenance scheduled",
 *      "details": "We will perform maintenance on 2026-04-01 02:00 UTC.",
 *      "ops_region": "global",
 *      "status": "draft",
 *      "metadata": { "impact": "low" }
 *    }
 *
 * 2) Get a message by id (GET)
 *    GET /api/comms/:id
 *
 * 3) List messages (paginated) (GET)
 *    GET /api/comms?page=1&limit=25
 *
 * 4) Update a message (PATCH)
 *    PATCH /api/comms/:id
 *    Body (JSON):
 *    {
 *      "status": "submitted",
 *      "subject": "Maintenance scheduled - updated"
 *    }
 *
 * 5) Add an attachment (POST)
 *    POST /api/comms/:id/attachments
 *    Body (JSON):
 *    {
 *      "fileId": "<S3fileObjectId>"
 *    }
 *
 * 6) Add a recipient (POST)
 *    POST /api/comms/:id/recipients
 *    Body (JSON):
 *    {
 *      "userId": "<userObjectId>"
 *    }
 *
 * 7) Send message (transition draft -> submitted) (POST)
 *    POST /api/comms/:id/send
 *
 * Notes:
 * - Replace :id with the message _id returned from create/list endpoints.
 * - If your API uses different route names, adapt the base path accordingly.
 * - Use the `recipients` object to target specific users: { "all": false, "users": ["<userId1>", "<userId2>"] }.
 * ------------------------------------------------------------------------- */
