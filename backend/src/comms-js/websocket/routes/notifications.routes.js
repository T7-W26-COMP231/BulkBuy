// src/comms-js/routes/notifications.routes.js
// Mount under /api/comms

const express = require('express');
const router = express.Router();
const notificationsCtrl = require('../controllers/notifications.controller');
const { requireAuth } = require('../../../middleware/auth.middleware');
const { requireRole } = require('../../../middleware/rbac.middleware'); // assumes existing middleware
const rateLimit = require('../../../middleware/rateLimit.middleware'); // assumes existing rate limiter

// GET missed notifications since seq
router.get('ws/missed', requireAuth, notificationsCtrl.getMissedNotifications);

// POST ack to advance cursor
router.post('ws/ack', requireAuth, notificationsCtrl.ackNotifications);

// POST create notification(s) - authenticated users can create notifications (business rules apply)
router.post('ws/create', requireAuth, requireRole('administrator'), notificationsCtrl.createNotification);

// POST broadcast - admin only, rate-limited
router.post(
  'ws/broadcast',
  requireAuth,
  requireRole('administrator'),
  rateLimit({ windowMs: 60 * 1000, max: 6 }), // example: 6 broadcasts per minute
  notificationsCtrl.broadcastAll
);

module.exports = router;
