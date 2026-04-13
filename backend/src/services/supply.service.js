// src/services/supply.service.js
//
// Supply service
// - Business logic for supply records and item quotes
// - Delegates persistence to SupplyRepo
// - Emits audit events via audit.service
//
// Methods:
// - createSupply, listSupplies, getById, updateById
// - addItem, getItem, updateItem, removeItem
// - addQuote, acceptQuote, updateStatus
// - hardDeleteById
//
// All methods accept opts = { actor, correlationId, session, ... } where appropriate.

const createError = require('http-errors');
const SupplyRepo = require('../repositories/supply.repo');
const AggregationRepo = require('../repositories/aggregation.repo');
const auditService = require('./audit.service');

const STATUS = [
  'quote',
  'draft',
  'pending_review',
  'accepted',
  'dispatched',
  'cancelled',
  'delivered',
  'received'
];

function actorFromOpts(opts = {}) {
  if (!opts) return { userId: null, role: null };
  if (opts.actor) return opts.actor;
  if (opts.user) return { userId: opts.user && (opts.user.userId || opts.user._id) || null, role: opts.user && opts.user.role || null };
  return { userId: null, role: null };
}

function sanitize(doc) {
  if (!doc) return doc;
  // If doc is a mongoose document, toObject will be available
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  // Remove internal-only fields
  if (obj.internalNotes) delete obj.internalNotes;
  return obj;
}

class SupplyService {
  /**
   * Create a new supply record
   * @param {Object} payload
   * @param {Object} opts
   */
  async createSupply(payload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!payload || typeof payload !== 'object') throw createError(400, 'Invalid payload');
    if (!Array.isArray(payload.items) || payload.items.length === 0) throw createError(422, 'items must be a non-empty array');

    const safe = {
  ...payload,
  supplierId:
    payload.supplierId ||
    actor.userId ||
    null,
};

delete safe._id;
delete safe.createdAt;
delete safe.updatedAt;

    try {
      const created = await SupplyRepo.create(safe, { session: opts.session });
      await auditService.logEvent({
        eventType: 'supply.create.success',
        actor,
        target: { type: 'Supply', id: created._id || created.id || null },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(created);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'supply.create.failed',
        actor,
        target: { type: 'Supply', id: null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Paginated list
   * @param {Object} filter
   * @param {Object} opts
   */
  async listSupplies(filter = {}, opts = {}) {
    const correlationId = opts.correlationId || null;

    try {
      const result = await SupplyRepo.paginate(filter, opts);

      const UserRepo = require("../repositories/user.repo");

      const enrichedItems = await Promise.all(
        (result.items || []).map(async (item) => {
          const safeItem = sanitize(item);
          console.log("DEBUG supply supplierId =>", safeItem?._id, safeItem?.supplierId);

          const supplierId =
            safeItem?.supplierId?._id ||
            safeItem?.supplierId ||
            null;

          if (!supplierId) {
            return {
              ...safeItem,
              supplier: null,
            };
          }

          try {
            const supplier = await UserRepo.findById(supplierId);

            return {
              ...safeItem,
              supplier: supplier
                ? {
                  _id: supplier._id,
                  firstName: supplier.firstName || "",
                  lastName: supplier.lastName || "",
                  companyName:
                    supplier.companyName ||
                    supplier.company ||
                    "",
                  email:
                    supplier.email ||
                    supplier?.emails?.[0]?.address ||
                    "",
                }
                : null,
            };
          } catch (lookupErr) {
            return {
              ...safeItem,
              supplier: null,
            };
          }
        })
      );

      return {
        ...result,
        items: enrichedItems,
      };
    } catch (err) {
      await auditService.logEvent({
        eventType: "supply.list.failed",
        actor: actorFromOpts(opts),
        target: { type: "Supply", id: null },
        outcome: "failure",
        severity: "error",
        correlationId,
        details: { message: err.message },
      });

      throw err;
    }
  }

  /**
   * Get dashboard summary metrics for a supplier
   * @param {String} supplierId
   * @param {Object} opts
   */
  async getDashboardSummary(supplierId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!supplierId) throw createError(400, 'supplierId is required');

    if (!require("mongoose").Types.ObjectId.isValid(supplierId)) {
      return {
        activeQuotes: 0,
        activeAggregationWindows: 0,
        orderRequests: 0,
        criticalAlerts: 0,
      };
    }

    try {
      const [
        activeQuotes,
        activeAggregationWindows,
        orderRequests,
        cancelledSupplies,
        suspendedAggregations
      ] = await Promise.all([
        SupplyRepo.count(
          {
            supplierId,
            status: 'accepted',
          },
          opts
        ),
        AggregationRepo.count({
          'itemDtos.supplierId': supplierId,
          status: { $in: ['pending', 'in_process'] }
        }),
        SupplyRepo.count(
          {
            supplierId,
            status: 'quote',
          },
          opts
        ),
        SupplyRepo.count(
          {
            supplierId,
            status: 'cancelled',
          },
          opts
        ),
        AggregationRepo.count({
          'itemDtos.supplierId': supplierId,
          status: 'suspended'
        })
      ]);

      const criticalAlerts = cancelledSupplies + suspendedAggregations;

      return {
        activeQuotes,
        activeAggregationWindows,
        orderRequests,
        criticalAlerts,
      };
    } catch (err) {
      console.error("🚨 Dashboard Summary Error:", err);
      await auditService.logEvent({
        eventType: 'supply.dashboardSummary.failed',
        actor,
        target: { type: 'Supply', id: null },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Get by id
   * @param {String} id
   * @param {Object} opts
   */
  async getById(id, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    try {
      const doc = await SupplyRepo.findById(id, opts);
      if (!doc) throw createError(404, 'Supply not found');
      return sanitize(doc);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'supply.get.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Supply', id: id || null },
        outcome: 'failure',
        severity: err.status && err.status >= 500 ? 'error' : 'warning',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Update supply by id (partial)
   * @param {String} id
   * @param {Object} update
   * @param {Object} opts
   */
  async updateById(id, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update payload is required');

    const payload = { ...update };
    delete payload._id;

    try {
      const updated = await SupplyRepo.updateById(id, payload, opts);
      if (!updated) throw createError(404, 'Supply not found');
      await auditService.logEvent({
        eventType: 'supply.update.success',
        actor,
        target: { type: 'Supply', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { update: payload }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'supply.update.failed',
        actor,
        target: { type: 'Supply', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Add an item to a supply
   * @param {String} supplyId
   * @param {Object} itemPayload
   * @param {Object} opts
   */
  async addItem(supplyId, itemPayload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!supplyId || !itemPayload || typeof itemPayload !== 'object') throw createError(400, 'supplyId and itemPayload are required');

    try {
      const updated = await SupplyRepo.addItem(supplyId, itemPayload, opts);
      await auditService.logEvent({
        eventType: 'supply.addItem.success',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { itemId: itemPayload.itemId || null }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'supply.addItem.failed',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Read a specific item from a supply
   * @param {String} supplyId
   * @param {String} itemId
   * @param {Object} opts
   */
  async getItem(supplyId, itemId, opts = {}) {
    if (!supplyId || !itemId) throw createError(400, 'supplyId and itemId are required');
    try {
      const item = await SupplyRepo.getItem(supplyId, itemId, opts);
      if (!item) throw createError(404, 'Item not found');
      return item;
    } catch (err) {
      await auditService.logEvent({
        eventType: 'supply.getItem.failed',
        actor: actorFromOpts(opts),
        target: { type: 'Supply', id: supplyId },
        outcome: 'failure',
        severity: 'error',
        correlationId: opts.correlationId || null,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Update an item inside a supply
   * @param {String} supplyId
   * @param {String} itemId
   * @param {Object} updatePayload
   * @param {Object} opts
   */
  async updateItem(supplyId, itemId, updatePayload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!supplyId || !itemId) throw createError(400, 'supplyId and itemId are required');
    if (!updatePayload || typeof updatePayload !== 'object') throw createError(400, 'update payload is required');

    try {
      const updated = await SupplyRepo.updateItem(supplyId, itemId, updatePayload, opts);
      if (!updated) throw createError(404, 'Supply or item not found');
      await auditService.logEvent({
        eventType: 'supply.updateItem.success',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { itemId }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'supply.updateItem.failed',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Remove an item from a supply
   * @param {String} supplyId
   * @param {String} itemId
   * @param {Object} opts
   */
  async removeItem(supplyId, itemId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!supplyId || !itemId) throw createError(400, 'supplyId and itemId are required');

    try {
      const updated = await SupplyRepo.removeItem(supplyId, itemId, opts);
      if (!updated) throw createError(404, 'Supply not found');
      await auditService.logEvent({
        eventType: 'supply.removeItem.success',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { itemId }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'supply.removeItem.failed',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Add a quote to an item
   * @param {String} supplyId
   * @param {String} itemId
   * @param {Object} quote
   * @param {Object} opts
   */
  async addQuote(supplyId, itemId, quote = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!supplyId || !itemId || !quote || typeof quote !== 'object') throw createError(400, 'supplyId, itemId and quote are required');

    try {
      const updated = await SupplyRepo.addQuoteToItem(supplyId, itemId, quote, opts);
      if (!updated) throw createError(404, 'Supply or item not found');
      await auditService.logEvent({
        eventType: 'supply.addQuote.success',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { itemId }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'supply.addQuote.failed',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Accept a quote for an item (ensures only one accepted)
   * @param {String} supplyId
   * @param {String} itemId
   * @param {Object} opts - { quoteId, quoteIndex }
   * @param {Object} svcOpts
   */
  async acceptQuote(supplyId, itemId, { quoteId = null, quoteIndex = null } = {}, svcOpts = {}) {
    const actor = actorFromOpts(svcOpts);
    const correlationId = svcOpts.correlationId || null;
    if (!supplyId || !itemId) throw createError(400, 'supplyId and itemId are required');

    try {
      const updated = await SupplyRepo.acceptQuote(supplyId, itemId, { quoteId, quoteIndex }, svcOpts);
      await auditService.logEvent({
        eventType: 'supply.acceptQuote.success',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { itemId, quoteId, quoteIndex }
      });
      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'supply.acceptQuote.failed',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
 * Save quote draft
 * @param {String} supplyId
 * @param {Object} draftPayload
 * @param {Object} opts
 */
  async saveDraft(supplyId, draftPayload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!supplyId) throw createError(400, 'supplyId is required');
    if (!draftPayload || typeof draftPayload !== 'object') {
      throw createError(400, 'draft payload is required');
    }

    try {
      const existing = await SupplyRepo.findById(supplyId, opts);

      const currentMetadata =
        existing?.metadata?.toObject?.() ||
        existing?.metadata ||
        {};

      const updatePayload = {
        metadata: {
          ...currentMetadata,
          quoteDraft: draftPayload,
        },
        status: 'draft',
      };

      const updated = await SupplyRepo.updateById(
        supplyId,
        updatePayload,
        { ...opts, returnDocument: "after" }
      );

      if (!updated) throw createError(404, 'Supply not found');

      await auditService.logEvent({
        eventType: 'supply.saveDraft.success',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { status: 'draft' }
      });

      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'supply.saveDraft.failed',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });

      throw err;
    }
  }

  /**
  * Submit finalized quote for admin review
  * @param {String} supplyId
  * @param {Object} opts
  */
  async submitForReview(supplyId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;

    if (!supplyId) {
      throw createError(400, 'supplyId is required');
    }

    try {
      const existing = await SupplyRepo.findById(supplyId, opts);

      if (!existing) {
        throw createError(404, 'Supply not found');
      }

      // Prevent resubmission
      if (existing.status === 'pending_review') {
        throw createError(409, 'Quote is already under review');
      }

      const missingFields = [];

      const quoteDraft =
        existing.metadata?.get?.("quoteDraft") ||
        existing.metadata?.quoteDraft ||
        {};

      if (!quoteDraft.productName) missingFields.push('productName');
      if (!quoteDraft.skuId) missingFields.push('skuId');

      if (missingFields.length > 0) {
        const error = createError(422, 'Missing required fields');
        error.missingFields = missingFields;
        throw error;
      }

      const updated = await SupplyRepo.updateById(
        supplyId,
        {
          status: 'pending_review',
          isLocked: true,
          submittedAt: new Date(),
        },
        { ...opts, returnDocument: 'after' }
      );

      await auditService.logEvent({
        eventType: 'supply.submitReview.success',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: { status: 'pending_review' }
      });

      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'supply.submitReview.failed',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });

      throw err;
    }
  }

  /**
   * Update supply status
   * @param {String} supplyId
   * @param {String} status
   * @param {Object} opts
   */



  async updateStatus(supplyId, status, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    const rejectionReason = opts.rejectionReason || null;

    if (!supplyId) throw createError(400, 'supplyId is required');
    if (!STATUS.includes(status)) throw createError(400, `invalid status: ${status}`);

    try {
      const updatePayload = { status };

      if (status === 'cancelled' && rejectionReason) {
        updatePayload['metadata.rejectionReason'] = rejectionReason;
      }

      const updated = await SupplyRepo.updateById(
        supplyId,
        updatePayload,
        { ...opts, returnDocument: "after" }
      );

      if (!updated) throw createError(404, 'Supply not found');

      await auditService.logEvent({
        eventType: 'supply.updateStatus.success',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {
          status,
          ...(rejectionReason ? { rejectionReason } : {})
        }
      });

      return sanitize(updated);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'supply.updateStatus.failed',
        actor,
        target: { type: 'Supply', id: supplyId },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }

  /**
   * Hard delete by id
   * @param {String} id
   * @param {Object} opts
   */
  async hardDeleteById(id, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, 'id is required');

    try {
      const removed = await SupplyRepo.deleteById(id, opts);
      if (!removed) throw createError(404, 'Supply not found');
      await auditService.logEvent({
        eventType: 'supply.delete.hard.success',
        actor,
        target: { type: 'Supply', id },
        outcome: 'success',
        severity: 'info',
        correlationId,
        details: {}
      });
      return sanitize(removed);
    } catch (err) {
      await auditService.logEvent({
        eventType: 'supply.delete.hard.failed',
        actor,
        target: { type: 'Supply', id },
        outcome: 'failure',
        severity: 'error',
        correlationId,
        details: { message: err.message }
      });
      throw err;
    }
  }
}

module.exports = new SupplyService();
