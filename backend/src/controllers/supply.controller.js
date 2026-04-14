// src/controllers/supply.controller.js
/**
 * Supply controller
 * - Thin HTTP layer that delegates to supply.service
 * - Consistent audit logging and correlationId propagation
 */
const { sendQuoteApproved, sendQuoteRejected } = require('../services/email.service');
const { emitToUser, getSocketIO } = require('../../socket');

const userService = require('../services/user.service');

const supplyService = require('../services/supply.service');
const auditService = require('../services/audit.service');

/* Helpers */
function actorFromReq(req = {}) {
  const user = req.user || null;
  return { userId: user && (user.userId || user._id) || null, role: user && user.role || null };
}

/**
 * POST /supplies
 */
async function createSupply(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const payload = req.body;
    const created = await supplyService.createSupply(payload, { actor, correlationId });
    await auditService.logEvent({
      eventType: 'supply.create.success',
      actor,
      target: { type: 'Supply', id: created._id || created.id || null },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });
    return res.status(201).json({ success: true, data: created });
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
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/**
 * GET /supplies
 */
async function listSupplies(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);

  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    let filter = {};

    // Keep existing JSON filter support
    if (req.query.filter) {
      filter = JSON.parse(req.query.filter);
    }

    // Add direct query param support
    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.supplierId) {
      //filter.supplierId = req.query.supplierId;
      filter.supplierId = req.user.userId || req.user._id;

    }
    /* 👇 add this
    if (req.user?.role === 'supplier') {
      filter.supplierId = req.user._id;
    }*/

    if (req.user?.role === 'supplier') {
      filter.supplierId = req.user.userId || req.user._id;
    }

    const result = await supplyService.listSupplies(filter, {
      page,
      limit,
      correlationId,
      actor,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("❌ listSupplies error:", err); // 👈 add this
    await auditService.logEvent({
      eventType: 'supply.list.failed',
      actor,
      target: { type: 'Supply', id: null },
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

// Fetches and returns the authenticated supplier's dashboard summary.
async function getDashboardSummary(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);

  try {
    const supplierId = req.user && (req.user.userId || req.user._id);

    if (!supplierId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const summary = await supplyService.getDashboardSummary(supplierId, {
      actor,
      correlationId,
    });

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.dashboardSummary.failed',
      actor,
      target: { type: 'Supply', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });

    return res.status(err.status || 500).json({
      success: false,
      message: err.message
    });
  }
}

/**
 * GET /supplies/historical-reports
 */
async function getHistoricalQuoteReport(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);

  try {
    const supplierId = req.user && (req.user.userId || req.user._id);

    if (!supplierId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const result = await supplyService.getHistoricalQuoteReport({
      supplierId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      status: req.query.status,
      product: req.query.product,
      page: req.query.page,
      limit: req.query.limit,
      correlationId,
      actor,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.historicalReport.failed',
      actor,
      target: { type: 'Supply', id: null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });

    return res.status(err.status || 500).json({
      success: false,
      message: err.message
    });
  }
}

/**
 * GET /supplies/:id
 */
async function getById(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const doc = await supplyService.getById(id, { correlationId, actor });
    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.get.failed',
      actor,
      target: { type: 'Supply', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/**
 * PATCH /supplies/:id
 */
async function updateById(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const update = req.body;
    const updated = await supplyService.updateById(id, update, { actor, correlationId });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.update.failed',
      actor,
      target: { type: 'Supply', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/**
 * POST /supplies/:id/add-quote
 */
async function addQuote(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const { itemId, quote } = req.body;
    const updated = await supplyService.addQuote(id, itemId, quote, { actor, correlationId });
    await auditService.logEvent({
      eventType: 'supply.addQuote.success',
      actor,
      target: { type: 'Supply', id },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { itemId }
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.addQuote.failed',
      actor,
      target: { type: 'Supply', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/**
 * POST /supplies/:id/accept-quote
 */
async function acceptQuote(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const { itemId, quoteId, quoteIndex } = req.body;
    const updated = await supplyService.acceptQuote(id, itemId, { quoteId, quoteIndex }, { actor, correlationId });
    await auditService.logEvent({
      eventType: 'supply.acceptQuote.success',
      actor,
      target: { type: 'Supply', id },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { itemId, quoteId, quoteIndex }
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.acceptQuote.failed',
      actor,
      target: { type: 'Supply', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/**
 * POST /supplies/:id/save-draft
 */
async function saveDraft(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);

  try {
    const id = req.params.id;
    const draftPayload = req.body;

    const updated = await supplyService.saveDraft(id, draftPayload, {
      actor,
      correlationId,
    });

    await auditService.logEvent({
      eventType: 'supply.saveDraft.success',
      actor,
      target: { type: 'Supply', id },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { status: 'draft' }
    });

    return res.status(200).json({
      success: true,
      message: 'Draft saved successfully',
      data: updated
    });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.saveDraft.failed',
      actor,
      target: { type: 'Supply', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });

    return res.status(err.status || 500).json({
      success: false,
      message: err.message
    });
  }
}

/**
 * POST /supplies/:id/submit-review
 */
async function submitForReview(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);

  try {
    const id = req.params.id;

    const submitted = await supplyService.submitForReview(id, {
      actor,
      correlationId,
    });

    await auditService.logEvent({
      eventType: 'supply.submitReview.success',
      actor,
      target: { type: 'Supply', id },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { status: 'pending_review' }
    });
    // added this block
    try {
      getSocketIO().emit('quote_submitted', {
        supplyId: id,
        productName: submitted?.items?.[0]?.meta?.productName || 'a product',
        supplierId: actor.userId,
        submittedAt: new Date().toISOString(),
      });
    } catch (socketErr) {
      console.warn('⚠ Socket emit failed:', socketErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Quote submitted for administrative review',
      data: submitted
    });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.submitReview.failed',
      actor,
      target: { type: 'Supply', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });

    return res.status(err.status || 500).json({
      success: false,
      message: err.message,
      missingFields: err.missingFields || []
    });
  }
}

/**
 * POST /supplies/:id/update-status
 */
/*
async function updateStatus(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const { status, rejectionReason } = req.body;
    const updated = await supplyService.updateStatus(id, status, {
      actor,
      correlationId,
      rejectionReason,
    });
    await auditService.logEvent({
      eventType: 'supply.updateStatus.success',
      actor,
      target: { type: 'Supply', id },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { status }
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.updateStatus.failed',
      actor,
      target: { type: 'Supply', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}*/

//modified by Sahil
async function updateStatus(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const { status, rejectionReason } = req.body;
    console.log("🔔 updateStatus called with status:", status, "for supply:", id); // 👈 add this


    const updated = await supplyService.updateStatus(id, status, {
      actor,
      correlationId,
      rejectionReason,
    });

    // 👇 send email notification (best-effort, never fails the request)
    try {
      const supply = await supplyService.getById(id, { correlationId });
      const supplier = await userService.getUserById(supply.supplierId);
      const supplierEmail = supplier?.emails?.[0]?.address;
      const supplierName = `${supplier?.firstName || ''} ${supplier?.lastName || ''}`.trim() || 'Supplier';

      if (supplierEmail) {
        const quoteDetails = {
          productName: supply?.items?.[0]?.meta?.productName || null,
          pricePerBulkUnit: supply?.items?.[0]?.quotes?.[0]?.pricePerBulkUnit || null,
          numberOfBulkUnits: supply?.items?.[0]?.quotes?.[0]?.numberOfBulkUnits || null,
        };



        if (status === 'accepted') {
          await sendQuoteApproved(supplierEmail, supplierName, quoteDetails);
        } else if (status === 'cancelled') {
          await sendQuoteRejected(supplierEmail, supplierName, quoteDetails, rejectionReason);
        }
      }
      emitToUser(String(supply.supplierId), "quote-status-updated", {
        supplyId: id,
        status,
        rejectionReason: rejectionReason || null,
        updatedAt: new Date().toISOString(),
      });

    } catch (emailErr) {
      console.warn('⚠ Email notification failed:', emailErr.message);
    }

    await auditService.logEvent({
      eventType: 'supply.updateStatus.success',
      actor,
      target: { type: 'Supply', id },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { status }
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.updateStatus.failed',
      actor,
      target: { type: 'Supply', id: req.params.id || null },
      outcome: 'failure',
      severity: err.status && err.status >= 500 ? 'error' : 'warning',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/**
 * DELETE /supplies/:id/hard
 */
async function hardDelete(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const id = req.params.id;
    const removed = await supplyService.hardDeleteById(id, { actor, correlationId });
    await auditService.logEvent({
      eventType: 'supply.delete.hard.success',
      actor,
      target: { type: 'Supply', id },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: {}
    });
    return res.status(200).json({ success: true, data: removed });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.delete.hard.failed',
      actor,
      target: { type: 'Supply', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* -------------------------
 * Item-level endpoints
 * ------------------------- */

/**
 * POST /supplies/:id/items
 * Add an item to a supply
 */
async function addItem(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const supplyId = req.params.id;
    const itemPayload = req.body;
    const updated = await supplyService.addItem(supplyId, itemPayload, { actor, correlationId });
    await auditService.logEvent({
      eventType: 'supply.addItem.success',
      actor,
      target: { type: 'Supply', id: supplyId },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { itemId: itemPayload.itemId || null }
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.addItem.failed',
      actor,
      target: { type: 'Supply', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/**
 * GET /supplies/:id/items/:itemId
 * Read a specific item
 */
async function getItem(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const supplyId = req.params.id;
    const itemId = req.params.itemId;
    const item = await supplyService.getItem(supplyId, itemId, { actor, correlationId });
    return res.status(200).json({ success: true, data: item });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.getItem.failed',
      actor,
      target: { type: 'Supply', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/**
 * PATCH /supplies/:id/items/:itemId
 * Update an item (partial or replace with opts.replaceItem)
 */
async function updateItem(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const supplyId = req.params.id;
    const itemId = req.params.itemId;
    const updatePayload = req.body;
    const updated = await supplyService.updateItem(supplyId, itemId, updatePayload, { actor, correlationId, arrayFilters: req.body.arrayFilters });
    await auditService.logEvent({
      eventType: 'supply.updateItem.success',
      actor,
      target: { type: 'Supply', id: supplyId },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { itemId }
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.updateItem.failed',
      actor,
      target: { type: 'Supply', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/**
 * DELETE /supplies/:id/items/:itemId
 * Remove an item from a supply
 */
async function removeItem(req, res) {
  const correlationId = req.correlationId || null;
  const actor = actorFromReq(req);
  try {
    const supplyId = req.params.id;
    const itemId = req.params.itemId;
    const updated = await supplyService.removeItem(supplyId, itemId, { actor, correlationId });
    await auditService.logEvent({
      eventType: 'supply.removeItem.success',
      actor,
      target: { type: 'Supply', id: supplyId },
      outcome: 'success',
      severity: 'info',
      correlationId,
      details: { itemId }
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    await auditService.logEvent({
      eventType: 'supply.removeItem.failed',
      actor,
      target: { type: 'Supply', id: req.params.id || null },
      outcome: 'failure',
      severity: 'error',
      correlationId,
      details: { message: err.message }
    });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

module.exports = {
  createSupply,
  listSupplies,
  getDashboardSummary,
  getHistoricalQuoteReport,
  getById,
  updateById,
  addQuote,
  acceptQuote,
  updateStatus,
  hardDelete,
  addItem,
  getItem,
  updateItem,
  removeItem,
  saveDraft,
  submitForReview
};