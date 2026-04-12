// src/controllers/user.controller.js
const createError = require('http-errors');
const UserService = require('../services/user.service');

/**
 * Standard response wrapper
 * @param {Object} res
 * @param {Number} status
 * @param {Object} payload
 */
function send(res, status, payload) {
  return res.status(status).json(payload);
}

const UserController = {
  /**
   * POST /users
   */
  async createUser(req, res, next) {
    try {
      const payload = req.body || {};
      const created = await UserService.createUser(payload, { user: req.user });
      return send(res, 201, { success: true, data: created });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /users/authenticate
   * Body: { email, password }
   */
  async authenticate(req, res, next) {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) throw createError(400, 'email and password are required');
      const user = await UserService.authenticateByEmail(email, password);
      if (!user) return send(res, 401, { success: false, message: 'Invalid credentials' });
      return send(res, 200, { success: true, data: user });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /users/:id
   */
  async getUserById(req, res, next) {
    try {
      const { id } = req.params;
      if (!id) throw createError(400, 'id is required');
      const opts = { populate: req.query.populate, select: req.query.select, includeDeleted: req.query.includeDeleted === 'true' };
      const user = await UserService.getUserById(id, opts);
      return send(res, 200, { success: true, data: user });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /users/by-userid/:userId
   */
  async getUserByUserId(req, res, next) {
    try {
      const { userId } = req.params;
      if (!userId) throw createError(400, 'userId is required');
      const opts = { populate: req.query.populate, select: req.query.select, includeDeleted: req.query.includeDeleted === 'true' };
      const user = await UserService.getUserByUserId(userId, opts);
      return send(res, 200, { success: true, data: user });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /users/by-email
   * Query: ?email=someone@example.com
   */
  async getUserByEmail(req, res, next) {
    try {
      const email = req.query.email || (req.params && req.params.email);
      if (!email) throw createError(400, 'email is required');
      const opts = { populate: req.query.populate, select: req.query.select, includeDeleted: req.query.includeDeleted === 'true' };
      const user = await UserService.getUserByEmail(email, opts);
      return send(res, 200, { success: true, data: user });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /users
   * supports pagination: ?page=1&limit=25&sort=createdAt:-1
   * optional filter JSON: ?filter={"role":"customer"}
   */
  async listUsers(req, res, next) {
    try {
      const filter = req.query.filter ? JSON.parse(req.query.filter) : {};
      const opts = {
        page: req.query.page,
        limit: req.query.limit,
        sort: req.query.sort,
        select: req.query.select,
        populate: req.query.populate,
        includeDeleted: req.query.includeDeleted === 'true'
      };
      const result = await UserService.listUsers(filter, opts);
      return send(res, 200, { success: true, ...result });
    } catch (err) {
      if (err instanceof SyntaxError) return next(createError(400, 'Invalid filter JSON'));
      return next(err);
    }
  },

  /**
   * POST /users/search
   * Body: { filters, page, limit, sort, select, populate }
   * Delegates to generic search (supports $text and other Mongo filters).
   */
  async searchUsers(req, res, next) {
    try {
      const body = req.body || {};
      const filters = body.filters || {};
      const opts = {
        page: body.page || req.query.page,
        limit: body.limit || req.query.limit,
        sort: body.sort || req.query.sort,
        select: body.select || req.query.select,
        populate: body.populate || req.query.populate,
        includeDeleted: body.includeDeleted === true || req.query.includeDeleted === 'true'
      };
      const result = await UserService.searchUsers(filters, opts);
      return send(res, 200, { success: true, ...result });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /users/public-search
   * Query: ?q=term&page=1&limit=20
   */
  async publicSearch(req, res, next) {
    try {
      const q = req.query.q || null;
      const opts = {
        page: req.query.page,
        limit: req.query.limit,
        sort: req.query.sort,
        select: req.query.select,
        populate: req.query.populate,
        filters: req.query.filters ? JSON.parse(req.query.filters) : undefined
      };
      const result = await UserService.publicSearch(q, opts);
      return send(res, 200, { success: true, ...result });
    } catch (err) {
      if (err instanceof SyntaxError) return next(createError(400, 'Invalid filters JSON'));
      return next(err);
    }
  },

  /**
   * PATCH /users/:id
   */
  async updateUserById(req, res, next) {
    try {
      const { id } = req.params;
      const update = req.body || {};
      if (!id) throw createError(400, 'id is required');
      const opts = { new: true, populate: req.query.populate, includeDeleted: req.query.includeDeleted === 'true' };
      const updated = await UserService.updateUserById(id, update, opts);
      return send(res, 200, { success: true, data: updated });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * PATCH /users
   * Update one by filter: body { filter, update, opts }
   */
  async updateOne(req, res, next) {
    try {
      const body = req.body || {};
      const filter = body.filter || {};
      const update = body.update || {};
      const opts = body.opts || {};
      const updated = await UserService.updateOne(filter, update, opts);
      return send(res, 200, { success: true, data: updated });
    } catch (err) {
      return next(err);
    }
  },

  /**
 * GET /users/profile
 * Customer gets own profile
 */
  async getCustomerProfile(req, res, next) {
    try {
      const userId = req.user?._id;
      if (!userId) throw createError(401, "Unauthorized");

      const user = await UserService.getUserById(userId);

      return send(res, 200, {
        success: true,
        data: {
          user,
        },
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
 * PATCH /users/profile
 * Customer updates own profile
 */
  async updateCustomerProfile(req, res, next) {
    try {
      const userId = req.user?._id;
      if (!userId) throw createError(401, 'Unauthorized');

      const payload = req.body || {};

      const updated = await UserService.updateCustomerProfile(
        userId,
        payload
      );

      return send(res, 200, {
        success: true,
        message: 'Profile updated successfully',
        data: updated
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
 * PATCH /users/notifications
 * Customer updates notification preferences only
 */
async updateNotificationPreferences(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) throw createError(401, "Unauthorized");

    const payload = req.body || {};

    const updated = await UserService.updateNotificationPreferences(
      userId,
      payload
    );

    return send(res, 200, {
      success: true,
      message: "Notification preferences updated successfully",
      data: updated,
    });
  } catch (err) {
    return next(err);
  }
},

  /**
 * PATCH /users/payment-methods
 * Customer adds payment method
 */
  async addPaymentMethod(req, res, next) {
    try {
      const userId = req.user?._id;
      if (!userId) throw createError(401, "Unauthorized");

      const payload = req.body || {};

      const updated = await UserService.addPaymentMethod(
        userId,
        payload
      );

      return send(res, 200, {
        success: true,
        message: "Payment method added successfully",
        data: updated,
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * PATCH /users/payment-methods/:paymentId/default
   * Set default payment method
   */
  async setDefaultPaymentMethod(req, res, next) {
    try {
      const userId = req.user?._id;
      const { paymentId } = req.params;

      if (!userId) throw createError(401, "Unauthorized");
      if (!paymentId) throw createError(400, "paymentId is required");

      const updated = await UserService.setDefaultPaymentMethod(
        userId,
        paymentId
      );

      return send(res, 200, {
        success: true,
        message: "Default payment method updated",
        data: updated,
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * DELETE /users/payment-methods/:paymentId
   * Remove customer payment method
   */
  async removePaymentMethod(req, res, next) {
    try {
      const userId = req.user?._id;
      const { paymentId } = req.params;

      if (!userId) throw createError(401, "Unauthorized");
      if (!paymentId) throw createError(400, "paymentId is required");

      const updated = await UserService.removePaymentMethod(
        userId,
        paymentId
      );

      return send(res, 200, {
        success: true,
        message: "Payment method removed successfully",
        data: updated,
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * DELETE /users/:id
   * Performs soft-delete via service.
   */
  async deleteUserById(req, res, next) {
    try {
      const { id } = req.params;
      if (!id) throw createError(400, 'id is required');
      const deleted = await UserService.deleteUserById(id, req.user ? req.user._id : null);
      return send(res, 200, { success: true, data: deleted });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /users/bulk
   */
  async bulkCreate(req, res, next) {
    try {
      const docs = req.body;
      if (!Array.isArray(docs) || docs.length === 0) {
        throw createError(400, 'Request body must be a non-empty array of user objects');
      }
      const inserted = await UserService.bulkCreate(docs);
      return send(res, 201, { success: true, data: inserted });
    } catch (err) {
      return next(err);
    }
  }
};

module.exports = UserController;
