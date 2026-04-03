// src/routes/supply.routes.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const SupplyController = require('../controllers/supply.controller');
const supplyValidators = require('../validators/supply.validators');
const { requireAuth } = require('../middleware/auth.middleware');

/**
 * Async wrapper to forward errors to express error handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Validate itemId param as a Mongo ObjectId
 */
function validateItemId(req, res, next) {
  const itemId = req.params.itemId;
  if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
    const err = new Error('itemId must be a valid ObjectId');
    err.status = 400;
    return next(err);
  }
  return next();
}

/**
 * Routes
 *
 * POST   /supplies                      -> create supply (quote request)
 * GET    /supplies                      -> list supplies (pagination/filter)
 * GET    /supplies/:id                  -> get supply by id
 * PATCH  /supplies/:id                  -> update supply (partial)
 * POST   /supplies/:id/add-quote        -> add quote to an item
 * POST   /supplies/:id/accept-quote     -> accept a quote
 * POST   /supplies/:id/update-status    -> update supply status (enum)
 * DELETE /supplies/:id/hard             -> hard delete (admin)
 *
 * Item-level:
 * POST   /supplies/:id/items            -> add item to supply
 * GET    /supplies/:id/items/:itemId    -> get item
 * PATCH  /supplies/:id/items/:itemId    -> update item
 * DELETE /supplies/:id/items/:itemId    -> remove item
 */

/* Public */
router.post('/', requireAuth, supplyValidators.create, asyncHandler(SupplyController.createSupply));
router.get('/', requireAuth, supplyValidators.query, asyncHandler(SupplyController.listSupplies));
router.get('/dashboard/summary', requireAuth, asyncHandler(SupplyController.getDashboardSummary));
router.get('/:id', requireAuth, supplyValidators.idParam, asyncHandler(SupplyController.getById));

/* Supply modifications */
router.patch('/:id', requireAuth, supplyValidators.idParam, supplyValidators.update, asyncHandler(SupplyController.updateById));
router.post('/:id/add-quote', requireAuth, supplyValidators.idParam, supplyValidators.addQuote, asyncHandler(SupplyController.addQuote));
router.post('/:id/accept-quote', requireAuth, supplyValidators.idParam, supplyValidators.acceptQuote, asyncHandler(SupplyController.acceptQuote));
router.post('/:id/update-status', requireAuth, supplyValidators.idParam, supplyValidators.updateStatus, asyncHandler(SupplyController.updateStatus));
router.post('/:id/save-draft', requireAuth, supplyValidators.idParam, asyncHandler(SupplyController.saveDraft));

/* Hard delete (admin only) */
router.delete('/:id/hard', requireAuth, supplyValidators.idParam, supplyValidators.adminOnly, asyncHandler(SupplyController.hardDelete));

/* Item-level routes */
router.post('/:id/items', requireAuth, supplyValidators.idParam, asyncHandler(SupplyController.addItem));
router.get('/:id/items/:itemId', requireAuth, supplyValidators.idParam, validateItemId, asyncHandler(SupplyController.getItem));
router.patch('/:id/items/:itemId', requireAuth, supplyValidators.idParam, validateItemId, asyncHandler(SupplyController.updateItem));
router.delete('/:id/items/:itemId', requireAuth, supplyValidators.idParam, validateItemId, asyncHandler(SupplyController.removeItem));

module.exports = router;
