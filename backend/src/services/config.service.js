// src/services/config.service.js
/**
 * Config service
 * - Business logic for Config documents
 * - Delegates persistence to src/repositories/config.repo and src/repositories/user.repo
 * - Emits audit events via audit.service
 *
 * Guarantees:
 * - Only one non-deleted Config per user. createForUser will fail if a non-deleted config already exists.
 * - upsertForUser will create or update the single config for the user and ensure user.config is set.
 *
 * Methods:
 * - createForUser, getById, getByUserId, updateById, upsertForUser
 * - setTheme, setLocation, softDeleteById, hardDeleteById, paginate, findByFilter
 *
 * All methods accept opts = { actor, correlationId, session, ... } where appropriate.
 */

const createError = require('http-errors');
const ConfigRepo = require('../repositories/config.repo');
const UserRepo = require('../repositories/user.repo');
const auditService = require('./audit.service');

const THEME_ENUM = ['light', 'dark', 'system'];

function actorFromOpts(opts = {}) {
  if (!opts) return { userId: null, role: null };
  if (opts.actor) return opts.actor;
  if (opts.user) return { userId: opts.user && (opts.user.userId || opts.user._id) || null, role: opts.user && opts.user.role || null };
  return { userId: null, role: null };
}

function sanitize(doc) {
  if (!doc) return doc;
  if (typeof doc.toObject === 'function') {
    const obj = doc.toObject();
    if (obj.internalNotes) delete obj.internalNotes;
    if (obj.deleted !== undefined) delete obj.deleted;
    return obj;
  }
  const copy = { ...doc };
  delete copy.internalNotes;
  delete copy.deleted;
  return copy;
}

class ConfigService {
  /**
   * Create a config for a user and attach config _id to the user.config field.
   * Enforces single non-deleted config per user: if a non-deleted config exists, creation fails.
   *
   * @param {String|ObjectId} userId
   * @param {Object} payload - partial config fields (location, theme, isPrivate, ops_region, metadata)
   * @param {Object} opts - { actor, correlationId, session }
   */
  async createForUser(userId, payload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!userId) throw createError(400, 'userId is required');

    const session = opts.session || null;
    const configPayload = { userId, ...payload };

    try {
      // Ensure there is no existing non-deleted config for this user
      const existing = await ConfigRepo.findByUserId(userId, { includeDeleted: false, session });
      if (existing) {
        throw createError(409, 'A config already exists for this user');
      }

      // Create config
      let createdConfig;
      if (session) {
        createdConfig = await ConfigRepo.create(configPayload, { session });
      } else {
        createdConfig = await ConfigRepo.create(configPayload);
      }

      // Attach config to user
      if (session) {
        await UserRepo.updateById(userId, { config: createdConfig._id }, { session });
      } else {
        await UserRepo.updateById(userId, { config: createdConfig._id });
      }

      await auditService.logEvent({
        eventType: 'config.create.success',
        actor,
        target: { type: 'Config', id: createdConfig._id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { userId }
      });

      return sanitize(createdConfig);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'config.create.failed',
        actor,
        target: { type: 'Config', id: null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message, userId }
      });
      throw err;
    }
  }

  /**
   * Get config by id
   */
  async getById(id, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    try {
      const doc = await ConfigRepo.findById(id, opts);
      if (!doc) throw createError(404, 'Config not found');
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'config.get.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Config', id: id || null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Get config by userId
   */
  async getByUserId(userId, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!userId) throw createError(400, 'userId is required');
    try {
      const doc = await ConfigRepo.findByUserId(userId, opts);
      if (!doc) return null;
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'config.getByUser.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Config', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, userId }
      });
      throw err;
    }
  }

  /**
   * Update config by id (partial)
   */
  async updateById(id, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    try {
      const updated = await ConfigRepo.updateById(id, update, opts);
      if (!updated) throw createError(404, 'Config not found');
      await auditService.logEvent({
        eventType: 'config.update.success',
        actor,
        target: { type: 'Config', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { update }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'config.update.failed',
        actor,
        target: { type: 'Config', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Upsert config for a user (create or update)
   * - Ensures user.config is set to the config _id after creation
   * - Guarantees a single config per user by using find+upsert semantics
   */
  async upsertForUser(userId, payload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!userId) throw createError(400, 'userId is required');

    const session = opts.session || null;

    try {
      // Use repository upsert which will create or update the single config for the user
      const config = await ConfigRepo.upsertForUser(userId, payload, { session });

      // Ensure user.config points to config._id
      if (session) {
        await UserRepo.updateById(userId, { config: config._id }, { session });
      } else {
        await UserRepo.updateById(userId, { config: config._id });
      }

      await auditService.logEvent({
        eventType: 'config.upsert.success',
        actor,
        target: { type: 'Config', id: config._id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { userId }
      });

      return sanitize(config);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'config.upsert.failed',
        actor,
        target: { type: 'Config', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message, userId }
      });
      throw err;
    }
  }

  /**
   * Set theme for a user's config
   */
  async setTheme(userId, theme, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!userId) throw createError(400, 'userId is required');
    if (!THEME_ENUM.includes(theme)) throw createError(400, `theme must be one of: ${THEME_ENUM.join(', ')}`);

    try {
      const config = await this.upsertForUser(userId, { theme }, opts);
      await auditService.logEvent({
        eventType: 'config.setTheme.success',
        actor,
        target: { type: 'Config', id: config._id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { theme }
      });
      return config;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'config.setTheme.failed',
        actor,
        target: { type: 'Config', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Set location for a user's config
   */
  async setLocation(userId, location = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!userId) throw createError(400, 'userId is required');

    // Basic validation
    if (location.lat !== undefined) {
      const lat = Number(location.lat);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw createError(400, 'lat must be a number between -90 and 90');
    }
    if (location.lng !== undefined) {
      const lng = Number(location.lng);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw createError(400, 'lng must be a number between -180 and 180');
    }

    try {
      const config = await this.upsertForUser(userId, { location }, opts);
      await auditService.logEvent({
        eventType: 'config.setLocation.success',
        actor,
        target: { type: 'Config', id: config._id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { location }
      });
      return config;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'config.setLocation.failed',
        actor,
        target: { type: 'Config', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Soft delete config by id
   */
  async softDeleteById(id, deletedBy = null, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');

    try {
      const removed = await ConfigRepo.softDeleteById(id, deletedBy, opts);
      if (!removed) throw createError(404, 'Config not found');
      await auditService.logEvent({
        eventType: 'config.delete.soft.success',
        actor,
        target: { type: 'Config', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'config.delete.soft.failed',
        actor,
        target: { type: 'Config', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Hard delete config by id (admin usage expected)
   */
  async hardDeleteById(id, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');

    try {
      const removed = await ConfigRepo.deleteById(id, opts);
      if (!removed) throw createError(404, 'Config not found');

      // If a user referenced this config, unset it (best-effort)
      try {
        await UserRepo.updateOne({ config: id }, { $unset: { config: '' } }, { new: true });
      } catch (e) {
        // non-fatal
      }

      await auditService.logEvent({
        eventType: 'config.delete.hard.success',
        actor,
        target: { type: 'Config', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'config.delete.hard.failed',
        actor,
        target: { type: 'Config', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Paginate configs
   */
  async paginate(filter = {}, opts = {}) {
    const correlationId = opts.correlationId || null;
    try {
      const result = await ConfigRepo.paginate(filter, opts);
      result.items = (result.items || []).map(sanitize);
      return result;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'config.list.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Config', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

    /**
   * Find by filter
   */
  async findByFilter(filter = {}, opts = {}) {
    try {
      const items = await ConfigRepo.findByFilter(filter, opts);
      return (items || []).map(sanitize);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'config.find.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Config', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId: opts.correlationId || null,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Save admin pricing tiers
   */
  async savePricingTiers(tiers = [], opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!Array.isArray(tiers) || tiers.length === 0) {
      throw createError(400, 'tiers array is required');
    }

    try {
      const saved = await ConfigRepo.upsertForUser(
        actor.userId,
        {
          metadata: {
            pricingTiers: tiers
          }
        },
        opts
      );

      await auditService.logEvent({
        eventType: 'config.pricingTiers.save.success',
        actor,
        target: { type: 'Config', id: saved._id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { tierCount: tiers.length }
      });

      return sanitize(saved);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'config.pricingTiers.save.failed',
        actor,
        target: { type: 'Config', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });

      throw err;
    }
  }
}

module.exports = new ConfigService();
