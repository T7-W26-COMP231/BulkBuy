// src/models/salesWindow.model.extras.js
/**
 * salesWindow.model.extras.js
 *
 * Purpose
 * - Attach overflow-aware statics and helpers to SalesWindowSchema.
 * - Guarantee: all reads and writes are overflow-aware.
 * - Deduplication: new additions win across overlapping windows in same ops_region.
 * - Overflow: product containers moved to overflow when size heuristic exceeded.
 * - Bulk helpers: bulkInsertProducts, bulkInsertItems (overflow-aware).
 * - Rollover: opt-in scheduling for heads only (isHead === true). When a head rollover runs
 *   it copies the canonical merged view (head + overflow chain) into the successor; for each
 *   item only the first pricing snapshot (index 0) is copied.
 *
 * Methods accept opts: { session, lean, createOverflowThresholdBytes, defaultDurationMs, bufferMs, optInAutoRollover }
 *
 * Non-disruptive: only attaches statics; does not rename or remove existing fields.
 */

const { model } = require('mongoose');

const { calculateObjectSize: tryCalculateObjectSize } = (() => {
  try {
    const bson = require('bson');
    return { calculateObjectSize: bson.calculateObjectSize || null };
  } catch (e) {
    return { calculateObjectSize: null };
  }
})();

module.exports = function attachExtras(SalesWindowSchema, mongoose) {
  /* -------------------------
   * Internal helpers
   * ------------------------- */

  function approximateJsonSize(obj) {
    try {
      if (tryCalculateObjectSize && typeof tryCalculateObjectSize === 'function') {
        return tryCalculateObjectSize(obj);
      }
      if (tryCalculateObjectSize && typeof tryCalculateObjectSize.calculateObjectSize === 'function') {
        return tryCalculateObjectSize.calculateObjectSize(obj);
      }
      return Buffer.byteLength(JSON.stringify(obj), 'utf8');
    } catch (e) {
      return 0;
    }
  }

  function findProductIndex(products, productId) {
    if (!Array.isArray(products)) return -1;
    return products.findIndex((p) => String(p.productId) === String(productId));
  }

  function findItemIndex(product, itemId) {
    if (!product || !Array.isArray(product.items)) return -1;
    return product.items.findIndex((it) => String(it.itemId) === String(itemId));
  }

  /* -------------------------
   * getWindowChain (canonical)
   * - returns head + overflow chain in order (head first)
   * ------------------------- */
  if (!SalesWindowSchema.statics.getWindowChain) {
    SalesWindowSchema.statics.getWindowChain = async function getWindowChain(windowId, opts = {}) {
      if (!windowId) return [];
      const session = opts.session || null;
      const lean = !!opts.lean;
      const windows = [];
      let currentId = windowId;

      while (currentId) {
        const q = this.findById(currentId);
        if (lean) q.lean();
        if (session) q.session(session);
        const doc = await q.exec();
        if (!doc) break;
        windows.push(doc);
        const next = doc.overflow_id;
        if (!next || String(next) === String(currentId)) break;
        currentId = next;
      }
      return windows;
    };
  }

  /* -------------------------
   * Overlap helpers
   * ------------------------- */
  SalesWindowSchema.statics._overlapFilterFor = function _overlapFilterFor(windowDoc) {
    return {
      _id: { $ne: windowDoc._id },
      ops_region: windowDoc.ops_region,
      'window.fromEpoch': { $lt: Number(windowDoc.window.toEpoch) },
      'window.toEpoch': { $gt: Number(windowDoc.window.fromEpoch) }
    };
  };

  SalesWindowSchema.statics._findOverlappingWindows = async function _findOverlappingWindows(windowDoc, opts = {}) {
    if (!windowDoc) return [];
    const session = opts.session || null;
    const q = this.find(this._overlapFilterFor(windowDoc));
    if (session) q.session(session);
    q.lean();
    return q.exec();
  };

  /* -------------------------
   * Remove helpers (operate on conflicting windows)
   * ------------------------- */
  SalesWindowSchema.statics._removeProductFromWindow = async function _removeProductFromWindow(windowId, productId, opts = {}) {
    if (!windowId || !productId) return false;
    const session = opts.session || null;
    const doc = await this.findById(windowId).session(session).exec();
    if (!doc) return false;
    const before = doc.products.length;
    doc.products = doc.products.filter((p) => String(p.productId) !== String(productId));
    if (doc.products.length === before) return false;
    await doc.save({ session });
    return true;
  };

  SalesWindowSchema.statics._removeItemFromWindow = async function _removeItemFromWindow(windowId, productId, itemId, opts = {}) {
    if (!windowId || !productId || !itemId) return false;
    const session = opts.session || null;
    const doc = await this.findById(windowId).session(session).exec();
    if (!doc) return false;
    const pIndex = findProductIndex(doc.products, productId);
    if (pIndex === -1) return false;
    const product = doc.products[pIndex];
    const before = product.items.length;
    product.items = product.items.filter((it) => String(it.itemId) !== String(itemId));
    if (product.items.length === before) return false;
    if (product.items.length === 0) {
      doc.products = doc.products.filter((p) => String(p.productId) !== String(productId));
    }
    await doc.save({ session });
    return true;
  };

  /* -------------------------
   * createOverflowWindow  
   * - creates an overflow document with isHead: false
   * - links source.overflow_id to the new doc
   * ------------------------- */
  SalesWindowSchema.statics.createOverflowWindow = async function createOverflowWindow(sourceWindowId, initialPayload = {}, opts = {}) {
    const session = opts.session || null;
    const payload = {
      window: initialPayload.window || { fromEpoch: Date.now(), toEpoch: Date.now() },
      products: initialPayload.products || [],
      ops_region: initialPayload.ops_region || undefined,
      metadata: initialPayload.metadata || {},
      isHead: false
    };

    if (!payload.ops_region) {
      const src = await this.findById(sourceWindowId).session(session).lean().exec();
      if (src && src.ops_region) payload.ops_region = src.ops_region;
    }

    const createdArr = await this.create([payload], { session });
    const newDoc = createdArr[0];

    await this.findByIdAndUpdate(
      sourceWindowId,
      { $set: { overflow_id: newDoc._id } },
      { session, new: true }
    ).exec();

    return newDoc;
  };

  /* -------------------------
   * Move product to overflow (best-effort)
   * - creates overflow with isHead: false
   * - links source.overflow_id to overflow doc
   * ------------------------- */
  SalesWindowSchema.statics._moveProductToOverflow = async function _moveProductToOverflow(sourceDoc, productIndex, opts = {}) {
    if (!sourceDoc || typeof productIndex !== 'number') return { moved: false };
    const session = opts.session || null;
    const Model = this;

    const movedProduct = sourceDoc.products.splice(productIndex, 1)[0];
    if (!movedProduct) return { moved: false };

    const payload = {
      window: sourceDoc.window || { fromEpoch: Date.now(), toEpoch: Date.now() },
      products: [movedProduct],
      ops_region: sourceDoc.ops_region,
      metadata: sourceDoc.metadata || {},
      isHead: false
    };

    let overflowDoc;
    if (session) {
      const created = await Model.create([payload], { session });
      overflowDoc = created && created[0];
    } else {
      overflowDoc = await Model.create(payload);
    }

    try {
      sourceDoc.overflow_id = overflowDoc._id;
      sourceDoc.isHead = true;
      await sourceDoc.save({ session });
    } catch (err) {
      try {
        if (overflowDoc && overflowDoc._id) {
          await Model.findByIdAndDelete(overflowDoc._id).exec();
        }
      } catch (cleanupErr) {
        // swallow cleanup errors
      }
      throw err;
    }

    return { moved: true, overflowId: overflowDoc._id };
  };

  /* -------------------------
   * Canonical merger: head + overflow chain -> merged products[]
   * - preserves ordering: head snapshots first, then overflow snapshots in chain order
   * ------------------------- */
  SalesWindowSchema.statics._mergeChainData = async function _mergeChainData(startWindowId, opts = {}) {
    if (!startWindowId) return { windows: [], merged: { products: [] } };
    const session = opts.session || null;
    const windows = await this.getWindowChain(startWindowId, { lean: true, session });

    const productMap = new Map();

    for (const w of windows) {
      if (!Array.isArray(w.products)) continue;
      for (const p of w.products) {
        const pid = String(p.productId);
        if (!productMap.has(pid)) {
          productMap.set(pid, {
            productId: p.productId,
            items: new Map(),
            metadata: Object.assign({}, p.metadata || {})
          });
        }
        const targetProduct = productMap.get(pid);

        if (!Array.isArray(p.items)) continue;
        for (const it of p.items) {
          const iid = String(it.itemId);
          if (!targetProduct.items.has(iid)) {
            targetProduct.items.set(iid, {
              itemId: it.itemId,
              productId: it.productId,
              pricing_snapshots: [],
              pricing_tiers: Array.isArray(it.pricing_tiers) ? it.pricing_tiers.slice() : [],
              qtySold: it.qtySold || 0,
              qtyAvailable: it.qtyAvailable || 0,
              metadata: Object.assign({}, it.metadata || {}),
              createdAt: it.createdAt || null,
              updatedAt: it.updatedAt || null
            });
          }
          const targetItem = targetProduct.items.get(iid);

          if (Array.isArray(it.pricing_snapshots)) {
            for (const s of it.pricing_snapshots) {
              const snapshotWithMeta = Object.assign({}, s, {
                sourceWindowId: w._id,
                windowFrom: w.window && w.window.fromEpoch
              });
              targetItem.pricing_snapshots.push(snapshotWithMeta);
            }
          }
        }
      }
    }

    const mergedProducts = [];
    for (const [pid, pObj] of productMap.entries()) {
      const itemsArr = [];
      for (const [iid, itObj] of pObj.items.entries()) itemsArr.push(itObj);
      mergedProducts.push({
        productId: pObj.productId,
        items: itemsArr,
        metadata: pObj.metadata
      });
    }

    return { windows, merged: { products: mergedProducts } };
  };

  /* -------------------------
   * Read helpers (overflow-aware)
   * ------------------------- */
  SalesWindowSchema.statics.listProducts = async function listProducts(windowId, opts = {}) {
    if (!windowId) throw new Error('windowId is required');
    const merged = await this._mergeChainData(windowId, opts);
    return merged.merged.products;
  };

  SalesWindowSchema.statics.listProductItems = async function listProductItems(windowId, productId, opts = {}) {
    if (!windowId || !productId) throw new Error('windowId and productId are required');
    const products = await this.listProducts(windowId, opts);
    const p = products.find((x) => String(x.productId) === String(productId));
    return p ? p.items : [];
  };

  /* -------------------------
   * createWindow
   * - Creates a new head SalesWindow document (isHead true by default).
   * - AFTER creation: deduplicate overlapping windows in same ops_region (new wins).
   * - optInAutoRollover: boolean (default false). If true and created.isHead === true, schedule rollover.
   * - Returns the created document (not lean).
   * ------------------------- */
  SalesWindowSchema.statics.createWindow = async function createWindow(payload = {}, opts = {}) {
    if (!payload || !payload.window || !payload.ops_region) throw new Error('payload.window and payload.ops_region are required');
    const session = opts.session || null;
    const optInAutoRollover = !!opts.optInAutoRollover;
    const Model = this;

    const createPayload = Object.assign({}, payload, { isHead: payload.isHead === false ? false : true });

    let created;
    if (session) {
      const arr = await Model.create([createPayload], { session });
      created = arr && arr[0];
    } else {
      created = await Model.create(createPayload);
    }
    if (!created) throw new Error('failed to create SalesWindow');

    const newProducts = Array.isArray(created.products) ? created.products : [];
    if (newProducts.length > 0) {
      const productIdSet = new Set(newProducts.map(p => String(p.productId)));
      const itemIdSet = new Set();
      for (const p of newProducts) {
        if (Array.isArray(p.items)) {
          for (const it of p.items) itemIdSet.add(String(it.itemId));
        }
      }

      const overlapping = await Model._findOverlappingWindows(created, { session });

      for (const other of overlapping) {
        if (!Array.isArray(other.products) || other.products.length === 0) continue;
        let mutated = false;

        const beforeProducts = other.products.length;
        other.products = other.products.filter(p => !productIdSet.has(String(p.productId)));
        if (other.products.length !== beforeProducts) mutated = true;

        for (const p of other.products.slice()) {
          if (!Array.isArray(p.items) || p.items.length === 0) continue;
          const beforeItems = p.items.length;
          p.items = p.items.filter(it => !itemIdSet.has(String(it.itemId)));
          if (p.items.length !== beforeItems) mutated = true;
        }

        const beforeFinal = other.products.length;
        other.products = other.products.filter(p => Array.isArray(p.items) ? p.items.length > 0 : true);
        if (other.products.length !== beforeFinal) mutated = true;

        if (mutated) {
          if (session) {
            await Model.findByIdAndUpdate(other._id, { products: other.products }, { session }).exec();
          } else {
            await Model.findByIdAndUpdate(other._id, { products: other.products }).exec();
          }
        }
      }
    }

    if (optInAutoRollover && created.isHead) {
      try {
        await Model.scheduleAutoRollover(created._id, { session: opts.session, defaultDurationMs: opts.defaultDurationMs, bufferMs: opts.bufferMs });
      } catch (e) {
        // do not fail create on scheduling error
        // eslint-disable-next-line no-console
        console.warn('scheduleAutoRollover failed (opt-in):', e && e.message);
      }
    }

    return created;
  };

  /* -------------------------
   * Add / update helpers (overflow-aware)
   * - addProduct: removes product from overlapping windows first, then adds to target head.
   * - addProductItem: removes item from overlapping windows first, then adds to target head.
   * - addPricingSnapshot/addPricingTier: remove item from overlapping windows first.
   * - After mutation, check size heuristic and move product container to overflow if needed.
   * ------------------------- */

  SalesWindowSchema.statics.addProduct = async function addProduct(windowId, payload = {}, opts = {}) {
    if (!windowId) throw new Error('windowId is required');
    if (!payload || !payload.productId) throw new Error('payload.productId is required');
    const session = opts.session || null;
    const threshold = Number(opts.createOverflowThresholdBytes) || 100 * 1024;
    const Model = this;

    const doc = await Model.findById(windowId).session(session).exec();
    if (!doc) throw new Error('SalesWindow not found');

    const overlapping = await Model._findOverlappingWindows(doc, { session });
    for (const other of overlapping) {
      const has = Array.isArray(other.products) && other.products.some(p => String(p.productId) === String(payload.productId));
      if (has) {
        await Model._removeProductFromWindow(other._id, payload.productId, { session });
      }
    }

    const existingIndex = findProductIndex(doc.products, payload.productId);
    if (existingIndex !== -1) throw new Error('product already exists in window');

    const newProduct = {
      productId: payload.productId,
      items: Array.isArray(payload.items) ? payload.items : [],
      metadata: payload.metadata || {}
    };

    doc.products.push(newProduct);
    await doc.save({ session });

    const approxSize = approximateJsonSize(doc.toObject ? doc.toObject() : doc);
    if (approxSize > threshold) {
      const pIndex = findProductIndex(doc.products, payload.productId);
      if (pIndex !== -1) {
        const res = await Model._moveProductToOverflow(doc, pIndex, { session });
        return Object.assign({ movedToOverflow: !!res.moved }, { overflowId: res.overflowId || null, product: newProduct });
      }
    }

    return { movedToOverflow: false, product: newProduct, ops_region: Model.ops_region };
  };

  SalesWindowSchema.statics.addProductItem = async function addProductItem(windowId, productId, itemPayload = {}, opts = {}) {
    if (!windowId || !productId) throw new Error('windowId and productId are required');
    if (!itemPayload || !itemPayload.itemId) throw new Error('itemPayload.itemId is required');
    const session = opts.session || null;
    const threshold = Number(opts.createOverflowThresholdBytes) || 100 * 1024;
    const Model = this;

    const doc = await Model.findById(windowId).session(session).exec();
    if (!doc) throw new Error('SalesWindow not found');

    const overlapping = await Model._findOverlappingWindows(doc, { session });
    for (const other of overlapping) {
      if (!Array.isArray(other.products)) continue;
      for (const p of other.products) {
        const itIdx = (Array.isArray(p.items) ? p.items.findIndex(it => String(it.itemId) === String(itemPayload.itemId)) : -1);
        if (itIdx !== -1) {
          await Model._removeItemFromWindow(other._id, p.productId, itemPayload.itemId, { session });
          break;
        }
      }
    }

    let pIndex = findProductIndex(doc.products, productId);
    if (pIndex === -1) {
      doc.products.push({ productId, items: [], metadata: {} });
      pIndex = doc.products.length - 1;
    }
    const product = doc.products[pIndex];

    const itIndex = findItemIndex(product, itemPayload.itemId);
    if (itIndex !== -1) throw new Error('item already exists');

    const now = new Date();
    const newItem = {
      itemId: itemPayload.itemId,
      productId,
      pricing_snapshots: Array.isArray(itemPayload.pricing_snapshots) ? itemPayload.pricing_snapshots.map(s => Object.assign({ createdAt: now, updatedAt: now }, s)) : [],
      pricing_tiers: Array.isArray(itemPayload.pricing_tiers) ? itemPayload.pricing_tiers.slice() : [],
      qtySold: itemPayload.qtySold || 0,
      qtyAvailable: itemPayload.qtyAvailable || 0,
      metadata: itemPayload.metadata || {},
      createdAt: now,
      updatedAt: now
    };

    product.items.push(newItem);
    await doc.save({ session });

    const approxSize = approximateJsonSize(doc.toObject ? doc.toObject() : doc);
    if (approxSize > threshold) {
      const res = await Model._moveProductToOverflow(doc, pIndex, { session });
      return { movedToOverflow: !!res.moved, overflowId: res.overflowId || null, item: newItem };
    }

    return { movedToOverflow: false, item: newItem, ops_region: Model.ops_region };
  };

  SalesWindowSchema.statics.addPricingSnapshot = async function addPricingSnapshot(windowId, productId, itemId, snapshot = {}, opts = {}) {
    if (!windowId || !productId || !itemId) throw new Error('windowId, productId and itemId are required');
    const session = opts.session || null;
    const threshold = Number(opts.createOverflowThresholdBytes) || 100 * 1024;
    const Model = this;

    const doc = await Model.findById(windowId).session(session).exec();
    if (!doc) throw new Error('SalesWindow not found');

    const overlapping = await Model._findOverlappingWindows(doc, { session });
    for (const other of overlapping) {
      if (!Array.isArray(other.products)) continue;
      for (const p of other.products) {
        const itIdx = (Array.isArray(p.items) ? p.items.findIndex(it => String(it.itemId) === String(itemId)) : -1);
        if (itIdx !== -1) {
          await Model._removeItemFromWindow(other._id, p.productId, itemId, { session });
          break;
        }
      }
    }

    let pIndex = findProductIndex(doc.products, productId);
    if (pIndex === -1) {
      doc.products.push({ productId, items: [], metadata: {} });
      pIndex = doc.products.length - 1;
    }
    const product = doc.products[pIndex];

    let itIndex = findItemIndex(product, itemId);
    const now = new Date();
    if (itIndex === -1) {
      const newItem = {
        itemId,
        productId,
        pricing_snapshots: [{ ...snapshot, createdAt: now, updatedAt: now }],
        metadata: {},
        createdAt: now,
        updatedAt: now
      };
      product.items.push(newItem);
    } else {
      const existing = product.items[itIndex];
      existing.pricing_snapshots = existing.pricing_snapshots || [];
      existing.pricing_snapshots.push({ ...snapshot, createdAt: now, updatedAt: now });
      existing.updatedAt = now;
    }

    await doc.save({ session });

    const approxSize = approximateJsonSize(doc.toObject ? doc.toObject() : doc);
    if (approxSize > threshold) {
      const res = await Model._moveProductToOverflow(doc, pIndex, { session });
      return { movedToOverflow: !!res.moved, overflowId: res.overflowId || null, ops_region: Model.ops_region };
    }

    return { movedToOverflow: false, ops_region: Model.ops_region };
  };

  SalesWindowSchema.statics.addPricingTier = async function addPricingTier(windowId, productId, itemId, tier = {}, opts = {}) {
    if (!windowId || !productId || !itemId) throw new Error('windowId, productId and itemId are required');
    const session = opts.session || null;
    const threshold = Number(opts.createOverflowThresholdBytes) || 100 * 1024;
    const Model = this;

    const doc = await Model.findById(windowId).session(session).exec();
    if (!doc) throw new Error('SalesWindow not found');

    const overlapping = await Model._findOverlappingWindows(doc, { session });
    for (const other of overlapping) {
      if (!Array.isArray(other.products)) continue;
      for (const p of other.products) {
        const itIdx = (Array.isArray(p.items) ? p.items.findIndex(it => String(it.itemId) === String(itemId)) : -1);
        if (itIdx !== -1) {
          await Model._removeItemFromWindow(other._id, p.productId, itemId, { session });
          break;
        }
      }
    }

    const pIndex = findProductIndex(doc.products, productId);
    if (pIndex === -1) throw new Error('product not found');

    const product = doc.products[pIndex];
    const itIndex = findItemIndex(product, itemId);
    if (itIndex === -1) throw new Error('item not found');

    const item = product.items[itIndex];
    item.pricing_tiers = item.pricing_tiers || [];
    const newTier = {
      quantity: Number(tier.quantity) || 0,
      discountPercentagePerUnitBulk: Number(tier.discountPercentagePerUnitBulk) || 0
    };
    item.pricing_tiers.push(newTier);
    item.updatedAt = new Date();
    await doc.save({ session });

    const approxSize = approximateJsonSize(doc.toObject ? doc.toObject() : doc);
    if (approxSize > threshold) {
      const res = await Model._moveProductToOverflow(doc, pIndex, { session });
      return { movedToOverflow: !!res.moved, overflowId: res.overflowId || null, tier: newTier, ops_region: Model.ops_region };
    }

    return { movedToOverflow: false, tier: newTier, ops_region: Model.ops_region };
  };

  /* -------------------------
   * Bulk helpers
   * - bulkInsertProducts(windowId, products[], opts)
   * - bulkInsertItems(windowId, productId, items[], opts)
   * - Both are overflow-aware and dedupe overlapping windows first.
   * ------------------------- */

  SalesWindowSchema.statics.bulkInsertProducts = async function bulkInsertProducts(windowId, products = [], opts = {}) {
    if (!windowId) throw new Error('windowId is required');
    if (!Array.isArray(products) || products.length === 0) return { inserted: 0, movedToOverflow: [] };
    const session = opts.session || null;
    const threshold = Number(opts.createOverflowThresholdBytes) || 100 * 1024;
    const Model = this;

    const doc = await Model.findById(windowId).session(session).exec();
    if (!doc) throw new Error('SalesWindow not found');

    const productIdSet = new Set(products.map(p => String(p.productId)));
    const itemIdSet = new Set();
    for (const p of products) {
      if (Array.isArray(p.items)) {
        for (const it of p.items) itemIdSet.add(String(it.itemId));
      }
    }

    const overlapping = await Model._findOverlappingWindows(doc, { session });
    for (const other of overlapping) {
      if (!Array.isArray(other.products)) continue;
      let mutated = false;

      const beforeProducts = other.products.length;
      other.products = other.products.filter(p => !productIdSet.has(String(p.productId)));
      if (other.products.length !== beforeProducts) mutated = true;

      for (const p of other.products.slice()) {
        if (!Array.isArray(p.items) || p.items.length === 0) continue;
        const beforeItems = p.items.length;
        p.items = p.items.filter(it => !itemIdSet.has(String(it.itemId)));
        if (p.items.length !== beforeItems) mutated = true;
      }

      other.products = other.products.filter(p => Array.isArray(p.items) ? p.items.length > 0 : true);
      if (mutated) {
        if (session) {
          await Model.findByIdAndUpdate(other._id, { products: other.products }, { session }).exec();
        } else {
          await Model.findByIdAndUpdate(other._id, { products: other.products }).exec();
        }
      }
    }

    const inserted = [];
    for (const p of products) {
      const existingIndex = findProductIndex(doc.products, p.productId);
      if (existingIndex !== -1) continue;
      const now = new Date();
      const productPayload = {
        productId: p.productId,
        items: Array.isArray(p.items) ? p.items.map(it => ({
          itemId: it.itemId,
          productId: p.productId,
          pricing_snapshots: Array.isArray(it.pricing_snapshots) ? it.pricing_snapshots.map(s => Object.assign({ createdAt: now, updatedAt: now }, s)) : [],
          pricing_tiers: Array.isArray(it.pricing_tiers) ? it.pricing_tiers.slice() : [],
          qtySold: it.qtySold || 0,
          qtyAvailable: it.qtyAvailable || 0,
          metadata: it.metadata || {},
          createdAt: now,
          updatedAt: now
        })) : [],
        metadata: p.metadata || {}
      };
      doc.products.push(productPayload);
      inserted.push(productPayload);
    }

    await doc.save({ session });

    const movedToOverflow = [];
    for (const ins of inserted) {
      const approxSize = approximateJsonSize(doc.toObject ? doc.toObject() : doc);
      if (approxSize > threshold) {
        const pIndex = findProductIndex(doc.products, ins.productId);
        if (pIndex !== -1) {
          const res = await Model._moveProductToOverflow(doc, pIndex, { session });
          if (res.moved) movedToOverflow.push({ productId: ins.productId, overflowId: res.overflowId });
        }
      }
    }

    return { inserted: inserted.length, movedToOverflow, ops_region: Model.ops_region };
  };

  SalesWindowSchema.statics.bulkInsertItems = async function bulkInsertItems(windowId, productId, items = [], opts = {}) {
    if (!windowId || !productId) throw new Error('windowId and productId are required');
    if (!Array.isArray(items) || items.length === 0) return { inserted: 0, movedToOverflow: false };
    const session = opts.session || null;
    const threshold = Number(opts.createOverflowThresholdBytes) || 100 * 1024;
    const Model = this;

    const doc = await Model.findById(windowId).session(session).exec();
    if (!doc) throw new Error('SalesWindow not found');

    const itemIdSet = new Set(items.map(it => String(it.itemId)));
    const overlapping = await Model._findOverlappingWindows(doc, { session });
    for (const other of overlapping) {
      if (!Array.isArray(other.products)) continue;
      for (const p of other.products) {
        const beforeItems = Array.isArray(p.items) ? p.items.length : 0;
        p.items = Array.isArray(p.items) ? p.items.filter(it => !itemIdSet.has(String(it.itemId))) : [];
        if (p.items.length !== beforeItems) {
          if (session) {
            await Model.findByIdAndUpdate(other._id, { products: other.products }, { session }).exec();
          } else {
            await Model.findByIdAndUpdate(other._id, { products: other.products }).exec();
          }
        }
      }
    }

    let pIndex = findProductIndex(doc.products, productId);
    if (pIndex === -1) {
      doc.products.push({ productId, items: [], metadata: {} });
      pIndex = doc.products.length - 1;
    }
    const product = doc.products[pIndex];

    const inserted = [];
    const now = new Date();
    for (const it of items) {
      const itIndex = findItemIndex(product, it.itemId);
      if (itIndex !== -1) continue;
      const newItem = {
        itemId: it.itemId,
        productId,
        pricing_snapshots: Array.isArray(it.pricing_snapshots) ? it.pricing_snapshots.map(s => Object.assign({ createdAt: now, updatedAt: now }, s)) : [],
        pricing_tiers: Array.isArray(it.pricing_tiers) ? it.pricing_tiers.slice() : [],
        qtySold: it.qtySold || 0,
        qtyAvailable: it.qtyAvailable || 0,
        metadata: it.metadata || {},
        createdAt: now,
        updatedAt: now
      };
      product.items.push(newItem);
      inserted.push(newItem);
    }

    await doc.save({ session });

    const approxSize = approximateJsonSize(doc.toObject ? doc.toObject() : doc);
    let movedToOverflow = false;
    let overflowId = null;
    if (approxSize > threshold) {
      const res = await Model._moveProductToOverflow(doc, pIndex, { session });
      movedToOverflow = !!res.moved;
      overflowId = res.overflowId || null;
    }

    return { inserted: inserted.length, movedToOverflow, overflowId, ops_region: Model.ops_region };
  };

  /* -------------------------
   * Auto-rollover scheduler (opt-in)
   * - scheduleAutoRollover(windowId, { defaultDurationMs, bufferMs })
   * - cancelAutoRollover(windowId)
   * - Only schedules for head windows (isHead === true).
   * - When it runs it uses the merged view (head + overflow chain) so the successor
   *   receives the full window contents (but only first pricing snapshot per item).
   * ------------------------- */

  const _scheduledRollovers = new Map();

  SalesWindowSchema.statics.scheduleAutoRollover = async function scheduleAutoRollover(windowId, opts = {}) {
    if (!windowId) throw new Error('windowId is required');
    const session = opts.session || null;
    const defaultDurationMs = opts.defaultDurationMs !== undefined ? Number(opts.defaultDurationMs) : null;
    const bufferMs = Number(opts.bufferMs) || 1000;

    if (_scheduledRollovers.has(String(windowId))) {
      clearTimeout(_scheduledRollovers.get(String(windowId)));
      _scheduledRollovers.delete(String(windowId));
    }

    // Only schedule rollovers for head windows
    const doc = await this.findById(windowId).session(session).lean().exec();
    if (!doc) throw new Error('SalesWindow not found');
    if (!doc.isHead) {
      return { scheduled: false, reason: 'not-a-head-window' };
    }

    const now = Date.now();
    const fromEpoch = Number(doc.window && doc.window.fromEpoch) || now;
    const toEpoch = Number(doc.window && doc.window.toEpoch) || now;
    const sourceDuration = Math.max(0, toEpoch - fromEpoch);
    const duration = defaultDurationMs !== null ? Number(defaultDurationMs) : (sourceDuration || (24 * 60 * 60 * 1000));
    const delay = Math.max(0, toEpoch - now + bufferMs);

    const timeoutId = setTimeout(async () => {
      try {
        // Build merged view (head + overflow chain) and copy it into the successor.
        const mergedResult = await this._mergeChainData(windowId, { session });
        const mergedProducts = (mergedResult && mergedResult.merged && mergedResult.merged.products) || [];

        const newProducts = [];
        for (const p of mergedProducts) {
          const newItems = [];
          if (Array.isArray(p.items)) {
            for (const it of p.items) {
              const firstSnapshot = Array.isArray(it.pricing_snapshots) && it.pricing_snapshots.length > 0
                ? [Object.assign({}, it.pricing_snapshots[0])]
                : [];
              newItems.push({
                itemId: it.itemId,
                productId: it.productId,
                pricing_snapshots: firstSnapshot,
                pricing_tiers: Array.isArray(it.pricing_tiers) ? it.pricing_tiers.slice() : [],
                qtySold: it.qtySold || 0,
                qtyAvailable: it.qtyAvailable || 0,
                metadata: Object.assign({}, it.metadata || {}),
                createdAt: new Date(),
                updatedAt: new Date()
              });
            }
          }
          newProducts.push({
            productId: p.productId,
            items: newItems,
            metadata: Object.assign({}, p.metadata || {})
          });
        }

        const newWindowPayload = {
          window: { fromEpoch: toEpoch, toEpoch: toEpoch + duration },
          products: newProducts,
          ops_region: doc.ops_region,
          metadata: { autoCreatedFrom: doc._id, autoCreatedAt: Date.now() },
          isHead: true
        };

        // Use createWindow so dedupe runs and overflow-awareness is preserved; do not auto-schedule the successor
        await this.createWindow(newWindowPayload, { session: null, optInAutoRollover: false });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('auto-rollover failed for window', windowId, err && err.message);
      } finally {
        _scheduledRollovers.delete(String(windowId));
      }
    }, delay);

    _scheduledRollovers.set(String(windowId), timeoutId);
    return { scheduled: true, scheduledAt: Date.now() + delay };
  };

  SalesWindowSchema.statics.cancelAutoRollover = function cancelAutoRollover(windowId) {
    if (!windowId) return false;
    const key = String(windowId);
    if (!_scheduledRollovers.has(key)) return false;
    clearTimeout(_scheduledRollovers.get(key));
    _scheduledRollovers.delete(key);
    return true;
  };

  /* -------------------------
   * End attachExtras
   * ------------------------- */
};
