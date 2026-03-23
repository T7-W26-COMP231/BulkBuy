// src/config/db-seeds/seed-db-models.configs.js
/**
 * Seed file for Config documents
 *
 * Responsibilities:
 * - Create one Config per user (non-deleted). If a config already exists it will be skipped unless `force` is true.
 * - When run without explicit `users` in opts, it will attempt to load up to 10 users from the users collection.
 * - Returns an object describing created, updated, and skipped configs and any dependency ids required by other seeds.
 *
 * Usage (from seed index):
 *   const seedConfigs = require('./seed-db-models.configs');
 *   await seedConfigs.run({ force: false, dryRun: false, logger: console, users: [ userId1, userId2 ] });
 *
 * Contract:
 * - run(opts) -> Promise<{ created: Array, updated: Array, skipped: Array, dependencies: Object }>
 *
 * Notes:
 * - This file uses the Mongoose model directly to upsert configs. It is defensive: validates inputs and logs progress.
 * - It does not modify user documents beyond ensuring a config exists for the user (it will set user.config when creating a new config).
 */

const mongoose = require('mongoose');
const Config = require('../../models/config.model');
const User = require('../../models/user.model'); // used to attach config id to user when creating
const createError = require('http-errors');

async function ensureUsersList(providedUsers = [], logger = console) {
  if (Array.isArray(providedUsers) && providedUsers.length > 0) {
    // normalize to ObjectId strings
    return providedUsers.map((u) => (typeof u === 'string' ? u : String(u)));
  }

  // fallback: load up to 10 users from DB to seed configs for
  try {
    const users = await User.find({}).limit(10).select('_id role email ops_region').lean().exec();
    return (users || []).map((u) => String(u._id));
  } catch (err) {
    logger && logger.warn && logger.warn('seed-configs: failed to load users fallback', err.message || err);
    return [];
  }
}

/**
 * Build a sensible default config payload for a user
 * @param {String} userId
 * @param {Object} userDoc - optional lean user doc to derive ops_region/email
 */
function buildDefaultConfig(userId, userDoc = {}) {
  const ops_region = userDoc.ops_region || (userDoc.metadata && userDoc.metadata.ops_region) || 'north';
  const email = userDoc.email || '';
  // simple geo defaults (Brampton-ish) for demonstration; seeds should be realistic but not sensitive
  const defaultLocation = {
    lat: 43.7315,
    lng: -79.7624,
    address: email ? `Primary address for ${email}` : '123 Example St, Brampton, ON'
  };

  return {
    userId: new mongoose.Types.ObjectId(String(userId)),
    location: defaultLocation,
    theme: 'system',
    isPrivate: true,
    ops_region,
    metadata: {
      seededBy: 'seed-db-models.configs',
      seededAt: Date.now()
    }
  };
}

/**
 * Upsert config for a single user.
 * If force === false and a non-deleted config exists, it will be skipped.
 * If force === true, existing config will be overwritten (upsert semantics).
 */
async function upsertConfigForUser(userId, payload = {}, { force = false, session = null } = {}) {
  if (!userId) throw createError(400, 'userId is required');

  const filter = { userId: new mongoose.Types.ObjectId(String(userId)) };
  if (!force) filter.deleted = false; // only consider non-deleted existing config when not forcing

  const update = { $set: payload };
  const options = {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
    session
  };

  // If not forcing and a config exists, we want to skip creating a new one.
  if (!force) {
    const existing = await Config.findOne({ userId: new mongoose.Types.ObjectId(String(userId)), deleted: false }).exec();
    if (existing) {
      return { action: 'skipped', doc: existing.toObject ? existing.toObject() : existing };
    }
  }

  const doc = await Config.findOneAndUpdate(filter, update, options).exec();
  return { action: 'created_or_updated', doc: doc && (doc.toObject ? doc.toObject() : doc) };
}

/**
 * Main entrypoint for the seed file
 * @param {Object} opts
 *   - force: boolean (overwrite existing)
 *   - dryRun: boolean (do not persist)
 *   - logger: console-like logger
 *   - users: optional array of user ids to create configs for
 *   - session: optional mongoose session for transactional seeding
 */
async function run(opts = {}) {
  const logger = opts.logger || console;
  const force = !!opts.force;
  const dryRun = !!opts.dryRun;
  const session = opts.session || null;

  logger.info && logger.info(`[seed-configs] starting (force=${force}, dryRun=${dryRun})`);

  const result = {
    created: [],
    updated: [],
    skipped: [],
    errors: [],
    dependencies: {
      configIds: [] // list of created/updated config _ids for other seeds to consume
    }
  };

  try {
    const userIds = await ensureUsersList(opts.users || [], logger);
    if (!userIds || userIds.length === 0) {
      logger.warn && logger.warn('[seed-configs] no users found to seed configs for; exiting');
      return result;
    }

    for (const uid of userIds) {
      try {
        // attempt to load user doc to derive sensible defaults
        let userDoc = null;
        try {
          userDoc = await User.findById(uid).select('_id email ops_region metadata').lean().exec();
        } catch (e) {
          // ignore; we'll still seed with generic defaults
          userDoc = null;
        }

        const payload = buildDefaultConfig(uid, userDoc || {});
        // remove _id if present
        delete payload._id;

        if (dryRun) {
          // simulate
          logger.info && logger.info(`[seed-configs] dryRun: would upsert config for user ${uid}`);
          result.created.push({ userId: uid, payload });
          continue;
        }

        const res = await upsertConfigForUser(uid, payload, { force, session });

        if (res.action === 'skipped') {
          result.skipped.push({ userId: uid, configId: res.doc._id || res.doc.id });
          logger.info && logger.info(`[seed-configs] skipped existing config for user ${uid}`);
          // still expose existing config id as dependency
          if (res.doc && (res.doc._id || res.doc.id)) result.dependencies.configIds.push(String(res.doc._id || res.doc.id));
        } else if (res.action === 'created_or_updated') {
          const doc = res.doc;
          // attach config id to user.config if not already set (best-effort)
          try {
            if (doc && doc._id) {
              await User.findByIdAndUpdate(uid, { $set: { config: doc._id } }, { new: true }).exec();
            }
          } catch (e) {
            // non-fatal; log and continue
            logger.warn && logger.warn(`[seed-configs] warning: failed to attach config to user ${uid}: ${e.message || e}`);
          }

          // classify created vs updated by checking createdAt/updatedAt or presence of upsert
          // For simplicity, treat as created_or_updated and push to created array
          result.created.push({ userId: uid, configId: String(doc._id), ops_region: doc.ops_region || null });
          result.dependencies.configIds.push(String(doc._id));
          logger.info && logger.info(`[seed-configs] upserted config for user ${uid} -> configId=${doc._id}`);
        }
      } catch (err) {
        logger.error && logger.error(`[seed-configs] failed for user ${uid}: ${err.message || err}`);
        result.errors.push({ userId: uid, message: err.message || String(err) });
      }
    }

    logger.info && logger.info('[seed-configs] finished');
    return result;
  } catch (err) {
    logger.error && logger.error('[seed-configs] fatal error', err);
    throw err;
  }
}

module.exports = {
  run,
  // exported for testing or index orchestration
  upsertConfigForUser,
  buildDefaultConfig
};

/**
 * ------------------------------------------------------------------------
 * Postman / curl payloads and instructions (examples)
 *
 * NOTE: these endpoints assume the API routes follow the pattern used in the repo:
 *   - POST /api/confg/for-user/:userId      -> createForUser (controller)
 *   - GET  /api/confg/:id                   -> getById
 *   - PATCH /api/confg/:id                  -> updateById
 *   - POST /api/confg/for-user/:userId/theme -> setTheme (or use upsert endpoint)
 *   - POST /api/confg/for-user/:userId/location -> setLocation
 *
 * Example: Create config for a user (Postman)
 *  - Method: POST
 *  - URL: http://localhost:3000/api/confg/for-user/60f7a2b9c2a4f12d4c8b4567
 *  - Headers:
 *      Content-Type: application/json
 *      Authorization: Bearer <token>   (if your app requires auth)
 *  - Body (raw JSON):
 *    {
 *      "location": { "lat": 43.7315, "lng": -79.7624, "address": "123 Example St, Brampton, ON" },
 *      "theme": "dark",
 *      "isPrivate": true,
 *      "ops_region": "north",
 *      "metadata": { "preferredLanguage": "en-CA" }
 *    }
 *
 * Example: Upsert (set theme) for user (Postman)
 *  - Method: POST
 *  - URL: http://localhost:3000/api/confg/for-user/60f7a2b9c2a4f12d4c8b4567/theme
 *  - Body:
 *    { "theme": "light" }
 *
 * Example: Upsert (set location) for user (Postman)
 *  - Method: POST
 *  - URL: http://localhost:3000/api/confg/for-user/60f7a2b9c2a4f12d4c8b4567/location
 *  - Body:
 *    { "location": { "lat": 43.7000, "lng": -79.4000, "address": "Downtown Example" } }
 *
 * Example: Get config by id (curl)
 *   curl -X GET "http://localhost:3000/api/confg/60f8b3c9d4e5f67890abcdef" -H "Accept: application/json"
 *
 * Example: Patch config (curl)
 *   curl -X PATCH "http://localhost:3000/api/confg/60f8b3c9d4e5f67890abcdef" \
 *     -H "Content-Type: application/json" \
 *     -d '{"isPrivate": false, "metadata": {"note":"updated via curl"}}'
 *
 * ------------------------------------------------------------------------
 */
