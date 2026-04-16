// src/controllers/config.controller.js
/**
 * Config controller
 * - Thin HTTP layer that delegates to config.service
 * - Propagates actor and correlationId, records audit events for failures/successes
 */

const ConfigService = require('../services/config.service');
const auditService = require('../services/audit.service');

function actorFromReq(req = {}) {
  const user = req.user || null;
  return {
    userId: user && (user.userId || user._id) || null,
    role: user && user.role || null
  };
}

/* Async wrapper to forward errors to express error handler */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/* POST /configs/for-user/:userId */
async function createForUser(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const userId = req.params.userId;
    const payload = req.body || {};
    const created = await ConfigService.createForUser(userId, payload, { actor, correlationId, session: req.mongoSession });
    await auditService.logEvent({
      eventType: 'config.create.success',
      actor,
      target: { type: 'Config', id: created._id || null },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { userId }
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'config.create.failed',
      actor,
      target: { type: 'Config', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /configs/:id */
async function getById(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const doc = await ConfigService.getById(id, { actor, correlationId });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'config.get.failed',
      actor,
      target: { type: 'Config', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /configs/by-user/:userId */
async function getByUserId(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const userId = req.params.userId;
    const doc = await ConfigService.getByUserId(userId, { actor, correlationId });
    if (!doc) return res.status(404).json({ success: false, message: 'Config not found' });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'config.getByUser.failed',
      actor,
      target: { type: 'Config', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* PATCH /configs/:id */
async function updateById(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const update = req.body || {};
    const updated = await ConfigService.updateById(id, update, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'config.update.failed',
      actor,
      target: { type: 'Config', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /configs/by-user/:userId/upsert */
async function upsertForUser(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const userId = req.params.userId;
    const payload = req.body || {};
    const config = await ConfigService.upsertForUser(userId, payload, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: config });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'config.upsert.failed',
      actor,
      target: { type: 'Config', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /configs/by-user/:userId/theme */
async function setTheme(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const userId = req.params.userId;
    const { theme } = req.body || {};
    const config = await ConfigService.setTheme(userId, theme, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: config });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'config.setTheme.failed',
      actor,
      target: { type: 'Config', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /configs/by-user/:userId/location */
async function setLocation(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const userId = req.params.userId;
    const location = req.body || {};
    const config = await ConfigService.setLocation(userId, location, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: config });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'config.setLocation.failed',
      actor,
      target: { type: 'Config', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* POST /configs/:id/soft-delete */
async function softDelete(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const deletedBy = actor.userId || null;
    const removed = await ConfigService.softDeleteById(id, deletedBy, { actor, correlationId, session: req.mongoSession });
    return res.status(200).json({ success: true, data: removed });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'config.delete.soft.failed',
      actor,
      target: { type: 'Config', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* DELETE /configs/:id/hard */
async function hardDelete(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const removed = await ConfigService.hardDeleteById(id, { actor, correlationId });
    return res.status(200).json({ success: true, data: removed });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'config.delete.hard.failed',
      actor,
      target: { type: 'Config', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* GET /configs - list/paginate */
async function listConfigs(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const page = req.query.page;
    const limit = req.query.limit;
    const filter = req.query.filter ? JSON.parse(req.query.filter) : {};
    const result = await ConfigService.paginate(filter, { page, limit, correlationId, actor });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'config.list.failed',
      actor,
      target: { type: 'Config', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(500).json({ success: false, message: err.message });
  }
}

/* GET /configs/find - find by filter (returns array) */
async function findByFilter(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const filter = req.query.filter ? JSON.parse(req.query.filter) : {};
    const items = await ConfigService.findByFilter(filter, {
      actor,
      correlationId
    });
    return res.status(200).json({ success: true, items });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'config.find.failed',
      actor,
      target: { type: 'Config', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

 /* POST /configs/delivery-rules */
async function saveDeliveryRules(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);

  try {
    const deliveryRules = req.body || {};

    const saved = await ConfigService.saveDeliveryRules(deliveryRules, {
      actor,
      correlationId,
      session: req.mongoSession
    });

    return res.status(200).json({
      success: true,
      data: saved
    });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'config.deliveryRules.save.failed',
      actor,
      target: { type: 'Config', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });

    return res.status(err.status || 500).json({
      success: false,
      message: err.message
    });
  }
}

/* GET /configs/delivery-rules */
async function getDeliveryRules(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);

  try {
    const data = await ConfigService.getDeliveryRules({
      actor,
      correlationId
    });

    return res.status(200).json({
      success: true,
      data
    });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'config.deliveryRules.get.failed',
      actor,
      target: { type: 'Config', id: null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });

    return res.status(err.status || 500).json({
      success: false,
      message: err.message
    });
  }
}

/* POST /configs/pricing-tiers */
async function savePricingTiers(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);

  try {
    const { tiers = [] } = req.body || {};

    if (!Array.isArray(tiers) || tiers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'tiers array is required'
      });
    }

    const saved = await ConfigService.savePricingTiers(tiers, {
      actor,
      correlationId,
      session: req.mongoSession
    });

    return res.status(200).json({
      success: true,
      data: saved
    });
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

    return res.status(err.status || 500).json({
      success: false,
      message: err.message
    });
  }
}

module.exports = {
  createForUser: asyncHandler(createForUser),
  getById: asyncHandler(getById),
  getByUserId: asyncHandler(getByUserId),
  updateById: asyncHandler(updateById),
  upsertForUser: asyncHandler(upsertForUser),
  setTheme: asyncHandler(setTheme),
  setLocation: asyncHandler(setLocation),
  softDelete: asyncHandler(softDelete),
  hardDelete: asyncHandler(hardDelete),
  listConfigs: asyncHandler(listConfigs),
  findByFilter: asyncHandler(findByFilter),
  saveDeliveryRules: asyncHandler(saveDeliveryRules),
  getDeliveryRules: asyncHandler(getDeliveryRules),
  savePricingTiers: asyncHandler(savePricingTiers)
};