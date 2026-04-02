// src/services/salesWindow.service.js
/**
 * SalesWindow service
 * - Business logic for SalesWindow documents
 * - Delegates persistence to src/repositories/salesWindow.repo
 * - Emits audit events via src/services/audit.service (centralized helper)
 *
 * Methods:
 * - create, getById, findByWindowRange, paginate, updateById, upsert, deleteById
 * - addProduct, addProductItem, addOrUpdateItem, removeItem, getItemSnapshot
 * - addPricingSnapshot, upsertPricingSnapshot, listPricingSnapshots, listPricingTiers
 * - listProducts, listProductItems
 * - bulkInsert, bulkInsertProducts, bulkInsertItems
 * - getOverflowChain, scheduleAutoRollover, cancelAutoRollover
 * - listAllCurrentProducts, listAllCurrentSalesWindows
 * - count, startSession
 *
 * All methods accept opts = { actor, user, correlationId, session, lean, ... } where appropriate.
 */

const createError = require("http-errors");
const SalesWindowRepo = require("../repositories/salesWindow.repo");
const auditService = require("./audit.service");

// ops-context cache eviction (in-process cache)

const evictRegionCache = async (region) => { // lazy load to avoid the cyclic dependency issues 
  try {
    if (!region) return;
    // lazy require to avoid circular dependency at module init
    const { evictRCache } = require("./ops-context/ops-context-products");
    if (typeof evictRCache === "function") {
      await evictRCache(region);
    }
  } catch (e) {
    // best-effort: log and continue
    console.warn("evictRegionCache failed for region", region, e && e.message);
  }
}


function actorFromOpts(opts = {}) {
  if (!opts) return { userId: null, role: null };
  if (opts.actor) return opts.actor;
  if (opts.user) {
    return {
      userId: (opts.user && (opts.user.userId || opts.user._id)) || null,
      role: (opts.user && opts.user.role) || null,
    };
  }
  return { userId: null, role: null };
}

function sanitize(doc) {
  if (!doc) return doc;
  if (typeof doc.toObject === "function") {
    const obj = doc.toObject();
    if (obj && obj.__v !== undefined) delete obj.__v;
    return obj;
  }
  const copy = Object.assign({}, doc);
  if (copy && copy.__v !== undefined) delete copy.__v;
  return copy;
}

class SalesWindowService {
  /* -------------------------
   * Audit helper
   * ------------------------- */

  /* safe eviction helper: best-effort, never fail main flow */
  async _safeEvictRegion(region) {
    try {
      if (!region) return;
      await evictRegionCache(region);
    } catch (e) {
      // best-effort: log and continue
      // eslint-disable-next-line no-console
      console.warn(
        "evictRegionCache failed for region",
        region,
        e && e.message,
      );
    }
  }

  async _audit(
    eventType,
    actor,
    target = { type: "SalesWindow", id: null },
    outcome = "success",
    severity = "info",
    correlationId = null,
    details = {},
  ) {
    try {
      await auditService.logEvent({
        eventType,
        actor,
        target,
        outcome,
        severity,
        correlationId,
        details,
      });
    } catch (e) {
      // best-effort: do not fail main flow on audit errors
      // eslint-disable-next-line no-console
      console.warn("auditService.logEvent failed", eventType, e && e.message);
    }
  }

  /* -------------------------
   * Create / basic CRUD
   * ------------------------- */

  async create(payload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!payload || typeof payload !== "object")
      throw createError(400, "payload is required");

    try {
      const created = await SalesWindowRepo.create(payload, {
        session: opts.session,
        lean: false,
      });

      // evict cache for the region of the created window (best-effort)
      try {
        await this._safeEvictRegion(created && created.ops_region);
      } catch (e) { }

      await this._audit(
        "salesWindow.create.success",
        actor,
        { type: "SalesWindow", id: created._id || null },
        "success",
        "info",
        correlationId,
        { window: created.window },
      );
      return sanitize(created);
    } catch (err) {
      await this._audit(
        "salesWindow.create.failed",
        actor,
        { type: "SalesWindow", id: null },
        "failure",
        err.status && err.status >= 500 ? "error" : "warning",
        correlationId,
        {
          message: err.message,
          payload: { window: payload && payload.window },
        },
      );
      throw err;
    }
  }

  async getById(id, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, "id is required");

    try {
      const doc = await SalesWindowRepo.findById(id, opts);
      if (!doc) throw createError(404, "SalesWindow not found");
      return sanitize(doc);
    } catch (err) {
      await this._audit(
        "salesWindow.get.failed",
        actorFromOpts(opts),
        { type: "SalesWindow", id: id || null },
        "failure",
        err.status && err.status >= 500 ? "error" : "warning",
        correlationId,
        { message: err.message },
      );
      throw err;
    }
  }

  async findByWindowRange(fromEpoch, toEpoch, opts = {}) {
    const correlationId = opts.correlationId || null;
    try {
      const docs = await SalesWindowRepo.findByWindowRange(
        fromEpoch,
        toEpoch,
        opts,
      );
      return (docs || []).map(sanitize);
    } catch (err) {
      await this._audit(
        "salesWindow.findByWindowRange.failed",
        actorFromOpts(opts),
        { type: "SalesWindow", id: null },
        "failure",
        "error",
        correlationId,
        { message: err.message, fromEpoch, toEpoch },
      );
      throw err;
    }
  }

  async paginate(filter = {}, opts = {}) {
    const correlationId = opts.correlationId || null;
    try {
      const result = await SalesWindowRepo.paginate(filter, opts);
      result.items = (result.items || []).map(sanitize);
      return result;
    } catch (err) {
      await this._audit(
        "salesWindow.list.failed",
        actorFromOpts(opts),
        { type: "SalesWindow", id: null },
        "failure",
        "error",
        correlationId,
        { message: err.message },
      );
      throw err;
    }
  }

  async updateById(id, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, "id is required");
    if (!update || typeof update !== "object")
      throw createError(400, "update is required");

    try {
      const updated = await SalesWindowRepo.updateById(id, update, opts);
      if (!updated) throw createError(404, "SalesWindow not found");

      // evict cache for the region affected (best-effort)
      try {
        await this._safeEvictRegion(updated && updated.ops_region);
      } catch (e) { }

      await this._audit(
        "salesWindow.update.success",
        actor,
        { type: "SalesWindow", id },
        "success",
        "info",
        correlationId,
        { update },
      );
      return sanitize(updated);
    } catch (err) {
      await this._audit(
        "salesWindow.update.failed",
        actor,
        { type: "SalesWindow", id },
        "failure",
        "error",
        correlationId,
        { message: err.message },
      );
      throw err;
    }
  }

  /* -------------------------
   * Product / Item / Pricing helpers
   * ------------------------- */

  async addProduct(windowId, payload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, "windowId is required");
    if (!payload || typeof payload !== "object")
      throw createError(400, "payload is required");

    try {
      const res = await SalesWindowRepo.addProduct(windowId, payload, opts);

      try { await this._safeEvictRegion(res && res.ops_region || payload && payload.ops_region || opts && opts.region); } catch (e) { }

      await this._audit(
        "salesWindow.addProduct.success",
        actor,
        { type: "SalesWindow", id: windowId },
        "success",
        "info",
        correlationId,
        { productId: payload.productId || null },
      );
      return res;
    } catch (err) {
      await this._audit(
        "salesWindow.addProduct.failed",
        actor,
        { type: "SalesWindow", id: windowId },
        "failure",
        "error",
        correlationId,
        { message: err.message },
      );
      throw err;
    }
  }

  async addProductItem(windowId, productId, itemPayload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, "windowId is required");
    if (!productId) throw createError(400, "productId is required");
    if (!itemPayload || typeof itemPayload !== "object")
      throw createError(400, "itemPayload is required");

    try {
      const res = await SalesWindowRepo.addProductItem(
        windowId,
        productId,
        itemPayload,
        opts,
      );

      // evict by region if available on opts or itemPayload
      try { await this._safeEvictRegion(res && res.ops_region || opts && opts.region || itemPayload && itemPayload.ops_region); } catch (e) { }

      await this._audit(
        "salesWindow.addProductItem.success",
        actor,
        { type: "SalesWindow", id: windowId },
        "success",
        "info",
        correlationId,
        { productId, itemId: itemPayload.itemId || null },
      );
      return res;
    } catch (err) {
      await this._audit(
        "salesWindow.addProductItem.failed",
        actor,
        { type: "SalesWindow", id: windowId },
        "failure",
        "error",
        correlationId,
        { message: err.message, productId },
      );
      throw err;
    }
  }

  async addOrUpdateItem(windowId, productId, itemId, payload = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, "windowId is required");
    if (!productId) throw createError(400, "productId is required");
    if (!itemId) throw createError(400, "itemId is required");

    try {
      const result = await SalesWindowRepo.addOrUpdateItem(
        windowId,
        productId,
        itemId,
        payload,
        opts,
      );

      // evict region (opts.region preferred; fallback to payload.ops_region)
      try { await this._safeEvictRegion(result && result.ops_region || opts && opts.region || payload && payload.ops_region); } catch (e) { }

      await this._audit(
        "salesWindow.item.addOrUpdate.success",
        actor,
        { type: "SalesWindow", id: windowId },
        "success",
        "info",
        correlationId,
        {
          productId,
          itemId,
          movedToOverflow: result && result.movedToOverflow,
        },
      );
      return result;
    } catch (err) {
      await this._audit(
        "salesWindow.item.addOrUpdate.failed",
        actor,
        { type: "SalesWindow", id: windowId },
        "failure",
        "error",
        correlationId,
        { message: err.message, productId, itemId },
      );
      throw err;
    }
  }

  async removeItem(windowId, productId, itemId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, "windowId is required");
    if (!productId) throw createError(400, "productId is required");
    if (!itemId) throw createError(400, "itemId is required");

    try {
      const removed = await SalesWindowRepo.removeItem(
        windowId,
        productId,
        itemId,
        opts,
      );

      try { await this._safeEvictRegion(removed && removed.ops_region || opts && opts.region); } catch (e) { }

      await this._audit(
        "salesWindow.item.remove.success",
        actor,
        { type: "SalesWindow", id: windowId },
        "success",
        "info",
        correlationId,
        { productId, itemId, removed: !!removed },
      );
      return removed;
    } catch (err) {
      await this._audit(
        "salesWindow.item.remove.failed",
        actor,
        { type: "SalesWindow", id: windowId },
        "failure",
        "error",
        correlationId,
        { message: err.message, productId, itemId },
      );
      throw err;
    }
  }

  async addPricingSnapshot(
    windowId,
    productId,
    itemId,
    snapshot = {},
    opts = {},
  ) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, "windowId is required");
    if (!productId) throw createError(400, "productId is required");
    if (!itemId) throw createError(400, "itemId is required");
    if (!snapshot || typeof snapshot !== "object")
      throw createError(400, "snapshot is required");

    try {
      const res = await SalesWindowRepo.addPricingSnapshot(
        windowId,
        productId,
        itemId,
        snapshot,
        opts,
      );

      try { await this._safeEvictRegion(res && res.ops_region || opts && opts.region); } catch (e) { }

      await this._audit(
        "salesWindow.pricingSnapshot.add.success",
        actor,
        { type: "SalesWindow", id: windowId },
        "success",
        "info",
        correlationId,
        { productId, itemId },
      );
      return res;
    } catch (err) {
      await this._audit(
        "salesWindow.pricingSnapshot.add.failed",
        actor,
        { type: "SalesWindow", id: windowId },
        "failure",
        "error",
        correlationId,
        { message: err.message, productId, itemId },
      );
      throw err;
    }
  }

  async upsertPricingSnapshot(
    windowId,
    productId,
    itemId,
    snapshot = {},
    opts = {},
  ) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, "windowId is required");
    if (!productId) throw createError(400, "productId is required");
    if (!itemId) throw createError(400, "itemId is required");
    if (!snapshot || typeof snapshot !== "object")
      throw createError(400, "snapshot is required");

    try {
      const res = await SalesWindowRepo.upsertPricingSnapshot(
        windowId,
        productId,
        itemId,
        snapshot,
        opts,
      );

      try { await this._safeEvictRegion(res && res.ops_region || opts && opts.region); } catch (e) { }

      await this._audit(
        "salesWindow.pricingSnapshot.upsert.success",
        actor,
        { type: "SalesWindow", id: windowId },
        "success",
        "info",
        correlationId,
        { productId, itemId },
      );
      return res;
    } catch (err) {
      await this._audit(
        "salesWindow.pricingSnapshot.upsert.failed",
        actor,
        { type: "SalesWindow", id: windowId },
        "failure",
        "error",
        correlationId,
        { message: err.message, productId, itemId },
      );
      throw err;
    }
  }

  async listPricingSnapshots(productId, itemId, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!productId) throw createError(400, "productId is required");
    if (!itemId) throw createError(400, "itemId is required");

    try {
      const snapshots = await SalesWindowRepo.listPricingSnapshots(
        productId,
        itemId,
        opts,
      );
      return snapshots;
    } catch (err) {
      await this._audit(
        "salesWindow.listPricingSnapshots.failed",
        actorFromOpts(opts),
        { type: "SalesWindow", id: null },
        "failure",
        "error",
        correlationId,
        { message: err.message, productId, itemId },
      );
      throw err;
    }
  }

  async listPricingTiers(windowId, productId, itemId, opts = {}) {
    if (!windowId) throw createError(400, "windowId is required");
    if (!productId) throw createError(400, "productId is required");
    if (!itemId) throw createError(400, "itemId is required");
    return this.listProductItems(windowId, productId, opts).then((items) => {
      const it = (items || []).find((i) => String(i.itemId) === String(itemId));
      return it ? it.pricing_tiers || [] : [];
    });
  }

  async listProducts(windowId, opts = {}) {
    if (!windowId) throw createError(400, "windowId is required");
    return SalesWindowRepo.listProducts(windowId, opts);
  }

  async listProductItems(windowId, productId, opts = {}) {
    if (!windowId) throw createError(400, "windowId is required");
    if (!productId) throw createError(400, "productId is required");
    return SalesWindowRepo.listProductItems(windowId, productId, opts);
  }//you can provide item id in opts--> opts means options

  async getItemSnapshot(windowId, productId, itemId, opts = {}) {
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, "windowId is required");
    if (!productId) throw createError(400, "productId is required");
    if (!itemId) throw createError(400, "itemId is required");

    try {
      const snapshot = await SalesWindowRepo.getItemSnapshot(
        windowId,
        productId,
        itemId,
        opts,
      );
      return snapshot;
    } catch (err) {
      await this._audit(
        "salesWindow.item.get.failed",
        actorFromOpts(opts),
        { type: "SalesWindow", id: windowId },
        "failure",
        "error",
        correlationId,
        { message: err.message, productId, itemId },
      );
      throw err;
    }
  }

  /* -------------------------
   * Upsert / bulk / delete / count
   * ------------------------- */

  async upsert(filter = {}, update = {}, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!filter || Object.keys(filter).length === 0)
      throw createError(400, "filter is required");

    try {
      const doc = await SalesWindowRepo.upsert(filter, update, opts);

      try { await this._safeEvictRegion(doc && doc.ops_region || opts && opts.region); } catch (e) { }

      await this._audit(
        "salesWindow.upsert.success",
        actor,
        { type: "SalesWindow", id: (doc && doc._id) || null },
        "success",
        "info",
        correlationId,
        { filter },
      );
      return sanitize(doc);
    } catch (err) {
      await this._audit(
        "salesWindow.upsert.failed",
        actor,
        { type: "SalesWindow", id: null },
        "failure",
        "error",
        correlationId,
        { message: err.message, filter },
      );
      throw err;
    }
  }

  async bulkInsert(docs = [], opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!Array.isArray(docs) || docs.length === 0) return [];

    try {
      const inserted = await SalesWindowRepo.bulkInsert(docs, opts);

      // evict per-region for inserted docs if present
      try {
        const regions = new Set((inserted || []).map((d) => d && d.ops_region).filter(Boolean));
        for (const r of regions) await this._safeEvictRegion(r);
      } catch (e) { }

      await this._audit(
        "salesWindow.bulkInsert.success",
        actor,
        { type: "SalesWindow", id: null },
        "success",
        "info",
        correlationId,
        { count: inserted.length },
      );
      return inserted;
    } catch (err) {
      await this._audit(
        "salesWindow.bulkInsert.failed",
        actor,
        { type: "SalesWindow", id: null },
        "failure",
        "error",
        correlationId,
        { message: err.message },
      );
      throw err;
    }
  }

  async bulkInsertProducts(windowId, products = [], opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, "windowId is required");
    if (!Array.isArray(products))
      throw createError(400, "products must be an array");

    try {
      const res = await SalesWindowRepo.bulkInsertProducts(
        windowId,
        products,
        opts,
      );

      // evict region for the window (opts.region preferred)
      try { await this._safeEvictRegion(res && res.ops_region || opts && opts.region); } catch (e) { }

      await this._audit(
        "salesWindow.bulkInsertProducts.success",
        actor,
        { type: "SalesWindow", id: windowId },
        "success",
        "info",
        correlationId,
        { count: products.length },
      );
      return res;
    } catch (err) {
      await this._audit(
        "salesWindow.bulkInsertProducts.failed",
        actor,
        { type: "SalesWindow", id: windowId },
        "failure",
        "error",
        correlationId,
        { message: err.message },
      );
      throw err;
    }
  }

  async bulkInsertItems(windowId, productId, items = [], opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, "windowId is required");
    if (!productId) throw createError(400, "productId is required");
    if (!Array.isArray(items)) throw createError(400, "items must be an array");

    try {
      const res = await SalesWindowRepo.bulkInsertItems(
        windowId,
        productId,
        items,
        opts,
      );

      // evict region for the window (opts.region preferred)
      try { await this._safeEvictRegion(res && res.ops_region || opts && opts.region); } catch (e) { }

      await this._audit(
        "salesWindow.bulkInsertItems.success",
        actor,
        { type: "SalesWindow", id: windowId },
        "success",
        "info",
        correlationId,
        { productId, count: items.length },
      );
      return res;
    } catch (err) {
      await this._audit(
        "salesWindow.bulkInsertItems.failed",
        actor,
        { type: "SalesWindow", id: windowId },
        "failure",
        "error",
        correlationId,
        { message: err.message },
      );
      throw err;
    }
  }

  async deleteById(id, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!id) throw createError(400, "id is required");

    try {
      const removed = await SalesWindowRepo.deleteById(id, opts);
      if (!removed) throw createError(404, "SalesWindow not found");

      // evict cache for the region of the deleted window (best-effort)
      try {
        await this._safeEvictRegion(removed && removed.ops_region);
      } catch (e) { }

      await this._audit(
        "salesWindow.delete.hard.success",
        actor,
        { type: "SalesWindow", id },
        "success",
        "info",
        correlationId,
        {},
      );
      return sanitize(removed);
    } catch (err) {
      await this._audit(
        "salesWindow.delete.hard.failed",
        actor,
        { type: "SalesWindow", id },
        "failure",
        "error",
        correlationId,
        { message: err.message },
      );
      throw err;
    }
  }

  async count(filter = {}, opts = {}) {
    try {
      return SalesWindowRepo.count(filter, opts);
    } catch (err) {
      await this._audit(
        "salesWindow.count.failed",
        actorFromOpts(opts),
        { type: "SalesWindow", id: null },
        "failure",
        "error",
        opts.correlationId || null,
        { message: err.message },
      );
      throw err;
    }
  }

  /* -------------------------
   * Overflow chain / rollover / session
   * ------------------------- */

  async getOverflowChain(startWindowId, opts = {}) {
    try {
      return SalesWindowRepo.getOverflowChain(startWindowId, opts);
    } catch (err) {
      await this._audit(
        "salesWindow.overflowChain.failed",
        actorFromOpts(opts),
        { type: "SalesWindow", id: startWindowId || null },
        "failure",
        "error",
        opts.correlationId || null,
        { message: err.message },
      );
      throw err;
    }
  }

  async scheduleAutoRollover(windowId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, "windowId is required");

    try {
      const res = await SalesWindowRepo.scheduleAutoRollover(windowId, opts);
      await this._audit(
        "salesWindow.scheduleAutoRollover.success",
        actor,
        { type: "SalesWindow", id: windowId },
        "success",
        "info",
        correlationId,
        {},
      );
      return res;
    } catch (err) {
      await this._audit(
        "salesWindow.scheduleAutoRollover.failed",
        actor,
        { type: "SalesWindow", id: windowId },
        "failure",
        "error",
        correlationId,
        { message: err.message },
      );
      throw err;
    }
  }

  async cancelAutoRollover(windowId, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!windowId) throw createError(400, "windowId is required");

    try {
      const res = await SalesWindowRepo.cancelAutoRollover(windowId, opts);
      await this._audit(
        "salesWindow.cancelAutoRollover.success",
        actor,
        { type: "SalesWindow", id: windowId },
        "success",
        "info",
        correlationId,
        {},
      );
      return res;
    } catch (err) {
      await this._audit(
        "salesWindow.cancelAutoRollover.failed",
        actor,
        { type: "SalesWindow", id: windowId },
        "failure",
        "error",
        correlationId,
        { message: err.message },
      );
      throw err;
    }
  }

  async startSession() {
    return SalesWindowRepo.startSession();
  }

  //-------------------------------------------------------------------------------------------------------

  /* -------------------------
   * Convenience aggregation: listAllCurrentProducts
   * ------------------------- */

  // /*
  //  * listAllCurrentProducts(region, opts)
  //  *
  //  * - Internal-only (no audit).
  //  * - Paginated: opts.page (1-based), opts.limit.
  //  * - Newest windows win on dedupe (windows sorted by window.fromEpoch DESC).
  //  * - Products deduped by productId.
  //  * - Items deduped by itemId (first-seen from newest window wins).
  //  * - Product shape:
  //  *   {
  //  *     productId,
  //  *     windowId,
  //  *     window: { fromEpoch, toEpoch },
  //  *     items: [ { itemId, productId, windowId, /* item details merged */ } ],
  //  *     metadata
  //  *   }
  //  *
  //  * Implementation notes:
  //  * - For efficiency we paginate products first, then enrich each product's items
  //  *   by fetching item documents for that product only (single query per product).
  //  * - We select all item fields except `price` and `pricingTiers`.
  //  */
  async listAllCurrentProducts(region, opts = {}) {
    if (!region || typeof region !== "string")
      throw createError(400, "region is required");

    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
    const nowMs = Date.now();

    // 1) find current windows (newest first)
    const filter = {
      ops_region: region,
      "window.fromEpoch": { $lte: Number(nowMs) },
      "window.toEpoch": { $gte: Number(nowMs) },
    };
    const findOpts = Object.assign({}, opts, {
      lean: true,
      sort: { "window.fromEpoch": -1 },
    });
    const windows = await SalesWindowRepo.findByFilter(filter, findOpts);

    if (!Array.isArray(windows) || windows.length === 0) {
      return { products: [], total: 0, page, limit, pages: 0 };
    }

    // 2) fetch merged views for each window (repo/model is authoritative for merging)
    const mergedPromises = windows.map((w) =>
      SalesWindowRepo.getMergedView(
        w._id,
        Object.assign({}, opts, { lean: true }),
      ),
    );
    const mergedResults = await Promise.all(mergedPromises);

    // 3) aggregate products deduped by productId; items deduped by itemId (first-seen wins)
    const productMap = new Map();

    for (let wi = 0; wi < mergedResults.length; wi++) {
      const merged = mergedResults[wi];
      const sourceWindow = windows[wi];
      const sourceWindowId =
        sourceWindow && sourceWindow._id ? String(sourceWindow._id) : null;
      const sourceWindowFrom =
        sourceWindow && sourceWindow.window
          ? Number(sourceWindow.window.fromEpoch)
          : null;
      const sourceWindowTo =
        sourceWindow && sourceWindow.window
          ? Number(sourceWindow.window.toEpoch)
          : null;

      if (!merged || !Array.isArray(merged.products)) continue;

      for (const p of merged.products) {
        if (!p || p.productId === undefined || p.productId === null) continue;
        const pid = String(p.productId);

        if (!productMap.has(pid)) {
          // first-seen product (from newest window)
          const itemMap = new Map();
          const itemsOut = [];

          if (Array.isArray(p.items)) {
            for (const it of p.items) {
              if (!it || it.itemId === undefined || it.itemId === null)
                continue;
              const iid = String(it.itemId);
              const itemStub = {
                itemId: it.itemId,
                productId: p.productId,
                windowId: sourceWindowId,
              };
              itemMap.set(iid, itemStub);
              itemsOut.push(itemStub);
            }
          }

          productMap.set(pid, {
            productId: p.productId,
            windowId: sourceWindowId,
            window: { fromEpoch: sourceWindowFrom, toEpoch: sourceWindowTo },
            items: itemsOut,
            _itemMap: itemMap,
            metadata:
              p.metadata && typeof p.metadata === "object"
                ? Object.assign({}, p.metadata)
                : {},
          });
        } else {
          // merge items into existing product; keep first-seen item (from newer window)
          const existing = productMap.get(pid);
          const itemMap = existing._itemMap;
          if (Array.isArray(p.items)) {
            for (const it of p.items) {
              if (!it || it.itemId === undefined || it.itemId === null)
                continue;
              const iid = String(it.itemId);
              if (!itemMap.has(iid)) {
                const itemStub = {
                  itemId: it.itemId,
                  productId: p.productId,
                  windowId: sourceWindowId,
                };
                itemMap.set(iid, itemStub);
              }
            }
          }
          // shallow merge metadata: prefer existing keys (existing wins)
          if (p.metadata && typeof p.metadata === "object") {
            existing.metadata = Object.assign(
              {},
              p.metadata,
              existing.metadata,
            );
          }
          existing.items = Array.from(itemMap.values());
        }
      }
    }

    // 4) finalize products array (defer heavy object creation until now)
    const allProducts = Array.from(productMap.values()).map((p) => ({
      productId: p.productId,
      windowId: p.windowId,
      window: { fromEpoch: p.window.fromEpoch, toEpoch: p.window.toEpoch },
      items: p.items.map((it) => ({
        itemId: it.itemId,
        productId: it.productId,
        windowId: it.windowId,
      })),
      metadata: p.metadata,
    }));

    // 5) paginate products (we will enrich each paged product one at a time)
    const total = allProducts.length;
    const pages = total === 0 ? 0 : Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const end = start + limit;
    const pagedProducts = allProducts.slice(start, end);

    // 6) per-product enrichment: fetch item details for each product's items and merge
    // Select all item fields except `price` and `pricingTiers`.
    // Based on the Item model, include: _id, sku, title, slug, description, shortDescription,
    // brand, categories, tags, images, media, inventory, variants, weight, dimensions,
    // shipping, taxClass, ratings, reviews, relatedProducts, seller, metadata, status,
    // ops_region, published, createdAt, updatedAt
    const selectFields = [
      "_id",
      "sku",
      "title",
      "slug",
      "description",
      "shortDescription",
      "brand",
      "categories",
      "tags",
      "images",
      "media",
      "inventory",
      "variants",
      "weight",
      "dimensions",
      "shipping",
      "taxClass",
      "ratings",
      "reviews",
      "relatedProducts",
      "seller",
      "metadata",
      "status",
      "ops_region",
      "published",
      "createdAt",
      "updatedAt",
    ].join(" ");

    const productsWithDetails = [];
    for (const prod of pagedProducts) {
      // collect item ids for this product
      const itemIds = prod.items
        .map((it) => it.itemId)
        .filter(Boolean)
        .map(String);
      let itemDetailsMap = new Map();

      if (itemIds.length > 0) {
        // fetch item details for this product in one query
        const dbItems = await ItemRepo.findByFilter(
          { _id: { $in: itemIds } },
          { lean: true, select: selectFields },
        );
        for (const dbItem of dbItems || []) {
          const idStr = String(dbItem._id || dbItem._id);
          itemDetailsMap.set(idStr, dbItem);
        }
      }

      // merge details into items, preserving stub fields (itemId, productId, windowId)
      const enrichedItems = prod.items.map((it) => {
        const idStr = String(it.itemId);
        const details = itemDetailsMap.get(idStr) || null;
        if (details) {
          // ensure the stub fields are preserved and details fields are included
          return Object.assign(
            {
              itemId: it.itemId,
              productId: it.productId,
              windowId: it.windowId,
            },
            details,
          );
        }
        // fallback: return stub only
        return {
          itemId: it.itemId,
          productId: it.productId,
          windowId: it.windowId,
        };
      });

      // assemble final product object
      productsWithDetails.push({
        productId: prod.productId,
        windowId: prod.windowId,
        window: prod.window,
        items: enrichedItems,
        metadata: prod.metadata,
      });
    }

    return { products: productsWithDetails, total, page, limit, pages };
  }

  //-------------------------------------------------------------------------------------------------------

  /* -------------------------
   * listAllCurrentSalesWindows
   * - returns SalesWindow documents (heads and/or overflow docs) AS IS
   * - no merging performed here
   * ------------------------- */

  async listAllCurrentSalesWindows(region, opts = {}) {
    const actor = actorFromOpts(opts);
    const correlationId = opts.correlationId || null;
    if (!region || typeof region !== "string")
      throw createError(400, "region is required");

    try {
      const nowMs = Date.now();
      const filter = {
        ops_region: region,
        "window.fromEpoch": { $lte: Number(nowMs) },
        "window.toEpoch": { $gte: Number(nowMs) },
      };

      const findOpts = Object.assign({}, opts, {
        lean: !!opts.lean,
        sort: opts.sort || { "window.fromEpoch": -1 },
      });
      const docs = await SalesWindowRepo.findByFilter(filter, findOpts);

      if (!Array.isArray(docs) || docs.length === 0) {
        await this._audit(
          "salesWindow.listAllCurrentSalesWindows.empty",
          actor,
          { type: "SalesWindow", id: null },
          "success",
          "info",
          correlationId,
          { region },
        );
        return [];
      }

      await this._audit(
        "salesWindow.listAllCurrentSalesWindows.success",
        actor,
        { type: "SalesWindow", id: null },
        "success",
        "info",
        correlationId,
        { region, count: docs.length },
      );

      if (findOpts.lean) return docs;
      return docs.map(sanitize);
    } catch (err) {
      await this._audit(
        "salesWindow.listAllCurrentSalesWindows.failed",
        actorFromOpts(opts),
        { type: "SalesWindow", id: null },
        "failure",
        "error",
        opts.correlationId || null,
        { message: err.message },
      );
      throw err;
    }
  }
}

module.exports = new SalesWindowService();
