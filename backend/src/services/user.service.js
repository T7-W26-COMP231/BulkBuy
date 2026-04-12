// src/services/user.service.js
const createError = require('http-errors');
const bcrypt = require('bcrypt');
const UserRepo = require('../repositories/user.repo');
const auditService = require('./audit.service');

const DEFAULT_SALT_ROUNDS = 10;

function sanitizeForClient(doc) {
  if (!doc) return doc;
  const copy = { ...doc };
  if (copy.passwordHash) delete copy.passwordHash;
  if (copy.refreshTokens) delete copy.refreshTokens;
  return copy;
}

/**
 * Build audit actor from opts (best-effort).
 */
function actorFromOpts(opts = {}) {
  if (!opts) return {};
  if (opts.actor) return opts.actor;
  if (opts.user) return { userId: opts.user.userId || opts.user._id, role: opts.user.role || null };
  return {};
}

class UserService {
  /**
   * Create a new user.
   * - Accepts either password (plain) or passwordHash (already hashed).
   * - Ensures a unique userId is generated if not provided (repo handles retries).
   * - Strips disallowed fields and performs minimal validation.
   *
   * @param {Object} payload
   * @param {Object} [opts] - { session, actor, correlationId }
   * @returns {Promise<Object>} created user (plain object, safe for client)
   */
  async createUser(payload = {}, opts = {}) {
    if (!payload || typeof payload !== 'object') {
      throw createError(400, 'Invalid payload');
    }

    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const safe = { ...payload };

    // Remove fields clients must not set
    delete safe._id;
    delete safe.createdAt;
    delete safe.updatedAt;
    delete safe.deleted;
    delete safe.deletedAt;
    delete safe.deletedBy;
    delete safe.status; // status controlled by business logic
    delete safe.userId; // repo will generate if missing

    if ((payload.role == 'administrator' || payload.role == 'supplier') && actor.role !== 'administrator') {
      throw createError(422, 'Only an administrator can create an administrator or supplier account');
    }

    // Normalize emails if present
    if (Array.isArray(safe.emails)) {
      safe.emails = safe.emails.map((e) => {
        if (!e) return e;
        const out = { ...e };
        if (out.address) out.address = String(out.address).toLowerCase().trim();
        return out;
      }).filter(Boolean);
    }

    // Minimal required fields check
    const hasName = !!(safe.firstName || safe.lastName);
    const hasEmail = Array.isArray(safe.emails) && safe.emails.length > 0;
    if (!hasName && !hasEmail) {
      throw createError(422, 'At least one of firstName, lastName, or emails is required');
    }

    // Determine primary email to validate uniqueness
    const repoOpts = {};
    if (opts.session) repoOpts.session = opts.session;

    let chosenPrimary = null; // normalized address string
    let chosenPrimaryIndex = -1; // index in safe.emails if applicable

    if (Array.isArray(safe.emails) && safe.emails.length > 0) {
      // 1) If any email explicitly marked primary, prefer that (first one)
      const explicitPrimaryIndex = safe.emails.findIndex((em) => em && (em.primary === true || em.primary === 'true'));
      if (explicitPrimaryIndex !== -1) {
        chosenPrimaryIndex = explicitPrimaryIndex;
        chosenPrimary = safe.emails[explicitPrimaryIndex].address;
      } else if (safe.emails.length === 1) {
        // 2) If only one email provided, mark it primary and use it
        safe.emails[0].primary = true;
        chosenPrimaryIndex = 0;
        chosenPrimary = safe.emails[0].address;
      } else {
        // 3) No explicit primary and multiple emails: check each email in order and pick the first that is not already used.
        //    If all are already used, fail with 409 and list duplicates.
        const duplicates = [];
        for (let i = 0; i < safe.emails.length; i++) {
          const em = safe.emails[i];
          if (!em || !em.address) continue;
          const addr = String(em.address).toLowerCase().trim();
          let existingUser = null;
          try {
            if (typeof UserRepo !== 'undefined' && UserRepo && typeof UserRepo.findOne === 'function') {
              existingUser = await UserRepo.findOne({ 'emails.address': addr }, repoOpts);
            } else {
              const UserModel = mongoose.models.User || mongoose.model('User');
              existingUser = await UserModel.findOne({ 'emails.address': addr }).lean().exec();
            }
          } catch (lookupErr) {
            // If lookup fails, surface as server error
            await auditService.logEvent({
              eventType: 'create.user',
              actor,
              target: addr,
              outcome: 'failure',
              severity: 'error',
              correlationId,
              details: { error: `Failed to validate email uniqueness: ${lookupErr && lookupErr.message}` }
            });
            throw createError(500, `Failed to validate email uniqueness: ${lookupErr && lookupErr.message ? lookupErr.message : String(lookupErr)}`);
          }

          if (!existingUser) {
            // choose this one
            chosenPrimaryIndex = i;
            chosenPrimary = addr;
            safe.emails[i].primary = true;
            break;
          } else {
            duplicates.push(addr);
          }
        }

        if (!chosenPrimary) {
          // All provided emails already exist -> conflict
          try {
            await auditService.logEvent({
              eventType: 'create.user',
              actor,
              target: safe.emails.map((e) => e && e.address).filter(Boolean).join(', '),
              outcome: 'failure',
              severity: 'warn',
              correlationId,
              details: { error: 'All provided emails are already in use', duplicates }
            });
          } catch (auditErr) {
            // swallow audit errors
          }
          throw createError(409, `All provided emails are already in use: ${duplicates.join(', ')}`);
        }
      }
    }

    // If we have a chosenPrimary (either explicit, single, or selected), verify it does not already exist
    if (chosenPrimary) {
      try {
        let existingUser = null;
        if (typeof UserRepo !== 'undefined' && UserRepo && typeof UserRepo.findOne === 'function') {
          existingUser = await UserRepo.findOne({ 'emails.address': chosenPrimary }, repoOpts);
        } else {
          const UserModel = mongoose.models.User || mongoose.model('User');
          existingUser = await UserModel.findOne({ 'emails.address': chosenPrimary }).lean().exec();
        }

        if (existingUser) {
          // Audit and fail
          try {
            await auditService.logEvent({
              eventType: 'create.user',
              actor,
              target: chosenPrimary,
              outcome: 'failure',
              severity: 'warn',
              correlationId,
              details: { error: 'Primary email already in use' }
            });
          } catch (auditErr) {
            // swallow audit errors
          }
          throw createError(409, 'Primary email already in use');
        }
      } catch (err) {
        if (err && err.status && err.status === 409) throw err;
        await auditService.logEvent({
          eventType: 'create.user',
          actor,
          target: chosenPrimary,
          outcome: 'failure',
          severity: 'error',
          correlationId,
          details: { error: err && err.message ? err.message : String(err) }
        });
        throw createError(500, `Failed to validate primary email uniqueness: ${err && err.message ? err.message : String(err)}`);
      }
    }

    // If no chosenPrimary (no emails provided), proceed (other validations will catch missing email if required)
    // If chosenPrimary exists and is set in safe.emails, we already marked it primary above.

    // If caller provided plain password, hash it here
    if (safe.password) {
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || `${DEFAULT_SALT_ROUNDS}`, 10);
      try {
        safe.passwordHash = await bcrypt.hash(String(safe.password), saltRounds);
      } catch (err) {
        // audit failure to hash
        await auditService.logEvent({
          eventType: 'create.user',
          actor,
          target: safe.emails && safe.emails[0] ? safe.emails[0].address : undefined,
          outcome: 'failure',
          severity: 'error',
          correlationId,
          details: { error: `Failed to hash password: ${err.message}` }
        });
        throw createError(500, `Failed to hash password: ${err.message}`);
      }
      delete safe.password;
    }

    if (safe.passwordHash) {
      safe.passwordHash = String(safe.passwordHash);
    }

    try {
      const created = await UserRepo.create(safe, repoOpts);
      await auditService.logEvent({
        eventType: 'create.user',
        actor,
        target: created.userId || created._id || (created.emails && created.emails[0] && created.emails[0].address),
        outcome: 'success',
        correlationId,
        details: { userId: created.userId || created._id }
      });
      return sanitizeForClient(created);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'create.user',
        actor,
        target: safe.emails && safe.emails[0] ? safe.emails[0].address : undefined,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }



  /**
   * Authenticate user by email + password
   * - Returns sanitized user on success, null on failure.
   * - Note: repo.findOne must request passwordHash via select.
   *
   * @param {String} email
   * @param {String} password
   * @param {Object} [opts] - { actor, correlationId }
   * @returns {Promise<Object|null>}
   */
  async authenticateByEmail(email, password, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!email || !password) throw createError(400, 'email and password are required');
    const normalized = String(email).toLowerCase().trim();

    try {
      // Request passwordHash explicitly
      const user = await UserRepo.findOne({ 'emails.address': normalized }, { select: '+passwordHash', includeDeleted: false });
      if (!user || !user.passwordHash) {
        await auditService.logEvent({
          eventType: 'auth.user',
          actor,
          target: normalized,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'user_not_found_or_no_password' }
        });
        return null;
      }

      const match = await bcrypt.compare(String(password), user.passwordHash);
      if (!match) {
        await auditService.logEvent({
          eventType: 'auth.user',
          actor,
          target: normalized,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'invalid_credentials' }
        });
        return null;
      }

      // remove passwordHash before returning
      delete user.passwordHash;
      await auditService.logEvent({
        eventType: 'auth.user',
        actor,
        target: normalized,
        outcome: 'success',
        correlationId,
        details: { userId: user.userId || user._id }
      });
      return sanitizeForClient(user);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'auth.user',
        actor,
        target: normalized,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Generic authenticate wrapper used by auth flows.
   * Supports credentials: { email, password }.
   * Returns { user } on success or throws on validation errors.
   *
   * @param {Object} credentials
   * @param {String|null} correlationId
   * @returns {Promise<{ user }>}
   */
  async authenticate(credentials = {}, correlationId = null) {
    if (!credentials || typeof credentials !== 'object') throw createError(400, 'credentials are required');
    const { email, password } = credentials;
    if (!email || !password) throw createError(400, 'email and password are required');

    const user = await this.authenticateByEmail(email, password, { correlationId });
    if (!user) {
      const err = createError(401, 'Invalid credentials');
      throw err;
    }
    return { user };
  }

  /**
   * Get user by Mongo _id
   * @param {String|ObjectId} id
   * @param {Object} [opts] - { select, populate, includeDeleted=false }
   */
  async getUserById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const user = await UserRepo.findById(id, opts);
    if (!user) throw createError(404, 'User not found');
    return sanitizeForClient(user);
  }

  /**
   * Get user by human-friendly userId
   * @param {String} userId
   * @param {Object} [opts]
   */
  async getUserByUserId(userId, opts = {}) {
    if (!userId) throw createError(400, 'userId is required');
    const user = await UserRepo.findByUserId(userId, opts);
    if (!user) throw createError(404, 'User not found');
    return sanitizeForClient(user);
  }

  /**
   * Get user by email (primary or any listed email)
   * @param {String} email
   * @param {Object} [opts] - { select, populate, includeDeleted=false }
   */
  async getUserByEmail(email, opts = {}) {
    if (!email) throw createError(400, 'email is required');
    const normalized = String(email).toLowerCase().trim();
    const user = await UserRepo.findByEmail(normalized, opts);
    if (!user) throw createError(404, 'User not found');
    return sanitizeForClient(user);
  }

  /**
   * Generic search / find users (supports filters and pagination)
   */
  async searchUsers(filters = {}, opts = {}) {
    const f = typeof filters === 'object' && filters !== null ? { ...filters } : {};
    const result = await UserRepo.paginate(f, opts);
    result.items = (result.items || []).map(sanitizeForClient);
    return result;
  }

  /**
   * Public search for provider profiles
   */
  async publicSearch(q = null, opts = {}) {
    const filters = opts.filters && typeof opts.filters === 'object' ? { ...opts.filters } : {};
    // Base: only active, not deleted
    const base = Object.assign({}, filters, { status: 'active', deleted: false });

    let filter;
    if (q && String(q).trim().length > 0) {
      filter = Object.assign({}, base, { $text: { $search: String(q).trim() } });
    } else {
      filter = base;
    }

    const paginateOpts = {
      page: opts.page,
      limit: opts.limit,
      sort: opts.sort || { score: { $meta: 'textScore' }, updatedAt: -1 },
      select: opts.select,
      populate: opts.populate,
      includeDeleted: false
    };

    const result = await UserRepo.paginate(filter, paginateOpts);
    result.items = (result.items || []).map(sanitizeForClient);
    return result;
  }

  /**
   * List users with pagination (wrapper)
   */
  async listUsers(filter = {}, opts = {}) {
    const f = typeof filter === 'object' && filter !== null ? { ...filter } : {};
    const result = await UserRepo.paginate(f, opts);
    result.items = (result.items || []).map(sanitizeForClient);
    return result;
  }

  /**
   * Update user by _id
   * @param {String|ObjectId} id
   * @param {Object} update
   * @param {Object} [opts] - { new, populate, includeDeleted=false, actor, correlationId }
   */
  async updateUserById(id, update = {}, opts = { new: true }) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    const payload = { ...update };
    delete payload._id;
    delete payload.userId;
    delete payload.createdAt;
    delete payload.deleted;
    delete payload.deletedAt;
    delete payload.deletedBy;

    if (payload.password) {
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || `${DEFAULT_SALT_ROUNDS}`, 10);
      try {
        payload.passwordHash = await bcrypt.hash(String(payload.password), saltRounds);
      } catch (err) {
        await auditService.logEvent({
          eventType: 'update.user',
          actor,
          target: id,
          outcome: 'failure',
          severity: 'error',
          correlationId,
          details: { error: `Failed to hash password: ${err.message}` }
        });
        throw createError(500, `Failed to hash password: ${err.message}`);
      }
      delete payload.password;
    }

    if (Array.isArray(payload.emails)) {
      payload.emails = payload.emails.map((e) => {
        if (!e) return e;
        const out = { ...e };
        if (out.address) out.address = String(out.address).toLowerCase().trim();
        return out;
      });
    }

    try {
      const updated = await UserRepo.updateById(id, payload, opts);
      if (!updated) {
        await auditService.logEvent({
          eventType: 'update.user',
          actor,
          target: id,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'User not found');
      }
      await auditService.logEvent({
        eventType: 'update.user',
        actor,
        target: id,
        outcome: 'success',
        correlationId,
        details: { update: payload }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'update.user',
        actor,
        target: id,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Customer self profile update
   * Reuses updateUserById to keep validation and audit logic centralized
   */
  async updateCustomerProfile(userId, payload = {}, opts = {}) {
    if (!userId) {
      throw createError(401, "Unauthorized");
    }

    const existingUser = await this.getUserById(userId);

    const existingAddresses = Array.isArray(existingUser?.addresses)
      ? [...existingUser.addresses]
      : [];

    if (existingAddresses.length > 0) {
      existingAddresses[0] = {
        ...existingAddresses[0],
        line1: payload.addressLine1,
        city: payload.city,
        postalCode: payload.postalCode,
      };
    } else {
      existingAddresses.push({
        label: "Home",
        line1: payload.addressLine1,
        city: payload.city,
        postalCode: payload.postalCode,
        country: "Canada",
      });
    }

    const safePayload = {
  firstName: payload.firstName,
  lastName: payload.lastName,
  addresses: existingAddresses,
  notificationPreferences: {
    priceTierAlerts:
      payload.notificationPreferences?.priceTierAlerts ?? true,
    orderUpdates:
      payload.notificationPreferences?.orderUpdates ?? true,
  },
};

    if (payload.email) {
      const existingEmails = Array.isArray(existingUser?.emails)
        ? [...existingUser.emails]
        : [];

      if (existingEmails.length > 0) {
        existingEmails[0] = {
          ...existingEmails[0],
          address: String(payload.email).toLowerCase().trim(),
        };

        safePayload.emails = existingEmails;
      } else {
        safePayload.emails = [
          {
            address: String(payload.email).toLowerCase().trim(),
            primary: true,
          },
        ];
      }
    }

    return this.updateUserById(userId, safePayload, opts);
  }

  /**
 * Update customer notification preferences only
 */
async updateNotificationPreferences(userId, payload = {}, opts = {}) {
  if (!userId) {
    throw createError(401, "Unauthorized");
  }

  const existingUser = await this.getUserById(userId);

  const existingPreferences =
    existingUser?.notificationPreferences || {};

  const safePayload = {
    notificationPreferences: {
      priceTierAlerts:
        payload.priceTierAlerts ??
        existingPreferences.priceTierAlerts ??
        true,
      orderUpdates:
        payload.orderUpdates ??
        existingPreferences.orderUpdates ??
        true,
    },
  };

  return this.updateUserById(userId, safePayload, opts);
}


  /**
   * Add customer payment method
   */
  async addPaymentMethod(userId, payload = {}, opts = {}) {
    if (!userId) {
      throw createError(401, "Unauthorized");
    }

    const existingUser = await this.getUserById(userId);

    const existingMethods = Array.isArray(existingUser?.paymentMethods)
      ? [...existingUser.paymentMethods]
      : [];

    const nextMethod = {
      type: payload.type || "card",
      last4: String(payload.cardNumber || "").slice(-4),
      provider: payload.provider || "visa",
      expiry: payload.expiryDate,
      tokenRef: payload.tokenRef || `pm_${Date.now()}`,
      isDefault: existingMethods.length === 0,
    };

    existingMethods.push(nextMethod);

    return this.updateUserById(
      userId,
      { paymentMethods: existingMethods },
      opts
    );
  }

  /**
   * Remove customer payment method
   */
  async removePaymentMethod(userId, paymentId, opts = {}) {
    if (!userId) {
      throw createError(401, "Unauthorized");
    }

    const existingUser = await this.getUserById(userId);

    let existingMethods = Array.isArray(existingUser?.paymentMethods)
      ? [...existingUser.paymentMethods]
      : [];

    existingMethods = existingMethods.filter(
      (method) => method.tokenRef !== paymentId
    );

    if (
      existingMethods.length > 0 &&
      !existingMethods.some((method) => method.isDefault)
    ) {
      existingMethods[0] = {
        ...existingMethods[0],
        isDefault: true,
      };
    }

    return this.updateUserById(
      userId,
      { paymentMethods: existingMethods },
      opts
    );
  }

  /**
   * Set default customer payment method
   */
  async setDefaultPaymentMethod(userId, paymentId, opts = {}) {
    if (!userId) {
      throw createError(401, "Unauthorized");
    }

    const existingUser = await this.getUserById(userId);

    const existingMethods = Array.isArray(existingUser?.paymentMethods)
      ? [...existingUser.paymentMethods]
      : [];

    const paymentExists = existingMethods.some(
      (method) => method.tokenRef === paymentId
    );

    if (!paymentExists) {
      throw createError(404, "Payment method not found");
    }

    const updatedMethods = existingMethods.map((method) => ({
      ...method,
      isDefault: method.tokenRef === paymentId,
    }));

    return this.updateUserById(
      userId,
      { paymentMethods: updatedMethods },
      opts
    );
  }


  /**
   * Update one user by filter
   */
  async updateOne(filter = {}, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!filter || Object.keys(filter).length === 0) {
      throw createError(400, 'filter is required');
    }
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    const payload = { ...update };
    delete payload._id;
    delete payload.userId;
    delete payload.createdAt;
    delete payload.deleted;
    delete payload.deletedAt;
    delete payload.deletedBy;

    if (payload.password) {
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || `${DEFAULT_SALT_ROUNDS}`, 10);
      try {
        payload.passwordHash = await bcrypt.hash(String(payload.password), saltRounds);
      } catch (err) {
        await auditService.logEvent({
          eventType: 'update.user',
          actor,
          target: filter,
          outcome: 'failure',
          severity: 'error',
          correlationId,
          details: { error: `Failed to hash password: ${err.message}` }
        });
        throw createError(500, `Failed to hash password: ${err.message}`);
      }
      delete payload.password;
    }

    if (Array.isArray(payload.emails)) {
      payload.emails = payload.emails.map((e) => {
        if (!e) return e;
        const out = { ...e };
        if (out.address) out.address = String(out.address).toLowerCase().trim();
        return out;
      });
    }

    try {
      const updated = await UserRepo.updateOne(filter, payload, opts);
      if (!updated) {
        await auditService.logEvent({
          eventType: 'update.user',
          actor,
          target: filter,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'User not found');
      }
      await auditService.logEvent({
        eventType: 'update.user',
        actor,
        target: filter,
        outcome: 'success',
        correlationId,
        details: { update: payload }
      });
      return sanitizeForClient(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'update.user',
        actor,
        target: filter,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Upsert user
   */
  async upsertUser(filter = {}, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!filter || Object.keys(filter).length === 0) {
      throw createError(400, 'filter is required for upsert');
    }

    const payload = { ...update };
    delete payload._id;
    delete payload.userId;
    delete payload.createdAt;
    delete payload.deleted;
    delete payload.deletedAt;
    delete payload.deletedBy;

    if (payload.password) {
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || `${DEFAULT_SALT_ROUNDS}`, 10);
      try {
        payload.passwordHash = await bcrypt.hash(String(payload.password), saltRounds);
      } catch (err) {
        await auditService.logEvent({
          eventType: 'upsert.user',
          actor,
          target: filter,
          outcome: 'failure',
          severity: 'error',
          correlationId,
          details: { error: `Failed to hash password: ${err.message}` }
        });
        throw createError(500, `Failed to hash password: ${err.message}`);
      }
      delete payload.password;
    }

    try {
      const doc = await UserRepo.upsert(filter, payload, opts);
      await auditService.logEvent({
        eventType: 'upsert.user',
        actor,
        target: filter,
        outcome: 'success',
        correlationId,
        details: { upsert: payload }
      });
      return sanitizeForClient(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'upsert.user',
        actor,
        target: filter,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Soft-delete user by _id (service-level delete)
   */
  async deleteUserById(id, deletedBy = null, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!id) throw createError(400, 'id is required');
    try {
      const deleted = await UserRepo.softDeleteById(id, deletedBy);
      if (!deleted) {
        await auditService.logEvent({
          eventType: 'delete.user.soft',
          actor,
          target: id,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found' }
        });
        throw createError(404, 'User not found');
      }
      await auditService.logEvent({
        eventType: 'delete.user.soft',
        actor,
        target: id,
        outcome: 'success',
        correlationId,
        details: { deletedBy }
      });
      return sanitizeForClient(deleted);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'delete.user.soft',
        actor,
        target: id,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Restore a soft-deleted user
   */
  async restoreUserById(id, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!id) throw createError(400, 'id is required');
    try {
      const restored = await UserRepo.restoreById(id);
      if (!restored) {
        await auditService.logEvent({
          eventType: 'restore.user',
          actor,
          target: id,
          outcome: 'failure',
          severity: 'warn',
          correlationId,
          details: { reason: 'not_found_or_not_deleted' }
        });
        throw createError(404, 'User not found or not deleted');
      }
      await auditService.logEvent({
        eventType: 'restore.user',
        actor,
        target: id,
        outcome: 'success',
        correlationId,
        details: {}
      });
      return sanitizeForClient(restored);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'restore.user',
        actor,
        target: id,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Bulk insert users
   */
  async bulkCreate(docs = [], opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!Array.isArray(docs) || docs.length === 0) {
      throw createError(400, 'docs must be a non-empty array');
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || `${DEFAULT_SALT_ROUNDS}`, 10);
    const normalized = await Promise.all(docs.map(async (d) => {
      const copy = { ...d };
      if (Array.isArray(copy.emails)) {
        copy.emails = copy.emails.map((e) => {
          if (!e) return e;
          const out = { ...e };
          if (out.address) out.address = String(out.address).toLowerCase().trim();
          return out;
        });
      }
      if (copy.password) {
        try {
          copy.passwordHash = await bcrypt.hash(String(copy.password), saltRounds);
        } catch (err) {
          await auditService.logEvent({
            eventType: 'create.user.bulk',
            actor,
            target: undefined,
            outcome: 'failure',
            severity: 'error',
            correlationId,
            details: { error: `Failed to hash password in bulk create: ${err.message}` }
          });
          throw createError(500, `Failed to hash password in bulk create: ${err.message}`);
        }
        delete copy.password;
      }
      delete copy._id;
      delete copy.createdAt;
      delete copy.updatedAt;
      delete copy.deleted;
      delete copy.deletedAt;
      delete copy.deletedBy;
      delete copy.status;
      delete copy.userId;
      return copy;
    }));

    try {
      const inserted = await UserRepo.bulkInsert(normalized, opts);
      await auditService.logEvent({
        eventType: 'create.user.bulk',
        actor,
        target: undefined,
        outcome: 'success',
        correlationId,
        details: { count: Array.isArray(inserted) ? inserted.length : 0 }
      });
      return (inserted || []).map((doc) => {
        const obj = doc && doc.toObject ? doc.toObject() : doc;
        return sanitizeForClient(obj);
      });
    } catch (err) {
      await auditService.logEvent({
        eventType: 'create.user.bulk',
        actor,
        target: undefined,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });
      throw err;
    }
  }

  /**
   * Count users matching filter
   */
  async countUsers(filter = {}, opts = {}) {
    return UserRepo.count(filter, opts);
  }

  /**
   * Start a transaction session
   */
  async startSession() {
    return UserRepo.startSession();
  }

  /**
   * Transactional create example
   */
  async createUserTransaction(payload = {}, transactionalWork, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    const session = await this.startSession();
    session.startTransaction();
    try {
      const created = await UserRepo.create(payload, { session });
      if (typeof transactionalWork === 'function') {
        await transactionalWork(session, created);
      }
      await session.commitTransaction();
      session.endSession();

      await auditService.logEvent({
        eventType: 'create.user.transaction',
        actor,
        target: created.userId || created._id,
        outcome: 'success',
        correlationId,
        details: {}
      });

      return sanitizeForClient(created);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();

      await auditService.logEvent({
        eventType: 'create.user.transaction',
        actor,
        target: payload && payload.emails && payload.emails[0] ? payload.emails[0].address : undefined,
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { error: err && err.message }
      });

      throw err;
    }
  }

  /**
   * Logout helper - revoke refresh token if repo supports it.
   * Best-effort: calls UserRepo.revokeRefreshToken if available, otherwise attempts to $pull token.
   *
   * @param {String|ObjectId} userId
   * @param {String} refreshToken
   * @param {String|null} correlationId
   */
  async logout(userId, refreshToken, correlationId = null) {
    const actor = { userId: userId || null, role: null };
    if (!userId || !refreshToken) {
      // nothing to do, but log attempt
      await auditService.logEvent({
        eventType: 'auth.logout.attempt',
        actor,
        target: { type: 'User', id: userId || null },
        outcome: 'partial',
        severity: 'info',
        correlationId,
        details: { hasRefreshToken: Boolean(refreshToken) }
      });
      return true;
    }

    try {
      if (typeof UserRepo.revokeRefreshToken === 'function') {
        await UserRepo.revokeRefreshToken(userId, refreshToken);
      } else if (typeof UserRepo.updateOne === 'function') {
        // best-effort: remove token from refreshTokens array if present
        await UserRepo.updateOne({ _id: userId }, { $pull: { refreshTokens: refreshToken } }, { new: true });
      }
      await auditService.logEvent({
        eventType: 'auth.logout.success',
        actor,
        target: { type: 'User', id: userId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return true;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'auth.logout.failed',
        actor,
        target: { type: 'User', id: userId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Validate a refresh token for a user (best-effort).
   * - If UserRepo provides a validation method, use it.
   * - Otherwise, attempt to read stored refreshTokens and check membership.
   *
   * @param {String|ObjectId} userId
   * @param {String} refreshToken
   * @returns {Promise<Boolean>}
   */
  async validateRefreshToken(userId, refreshToken) {
    if (!userId || !refreshToken) return false;

    try {
      if (typeof UserRepo.validateRefreshToken === 'function') {
        return !!(await UserRepo.validateRefreshToken(userId, refreshToken));
      }

      // attempt to read refreshTokens array
      if (typeof UserRepo.findById === 'function') {
        const user = await UserRepo.findById(userId, { select: '+refreshTokens' });
        if (!user) return false;
        const tokens = user.refreshTokens || [];
        return tokens.includes(refreshToken);
      }

      // cannot validate, default to false
      return false;
    } catch (err) {
      // on error, treat as invalid but log
      await auditService.logEvent({
        eventType: 'auth.refresh.validate.failed',
        actor: { userId: userId || null, role: null },
        target: { type: 'User', id: userId || null },
        outcome: 'failure',
        severity: 'error',
        correlationId: null,
        details: { error: err.message }
      });
      return false;
    }
  }
}

module.exports = new UserService();
