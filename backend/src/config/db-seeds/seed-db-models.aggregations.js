// src/config/db-seeds/seed-db-models.aggregations.js
/**
 * Seed script for Aggregations collection
 *
 * Exports: { run }
 *
 * Behavior:
 *  - If DB already has aggregations and force !== true, seeding is skipped.
 *  - Creates at least 3 aggregation documents representing end-of-sales-window summaries.
 *  - Each aggregation includes itemDtos with pricing snapshots and supplier placeholders.
 *  - Aggregation.metadata includes { SalesWindId: <salesWindow_placeholder_or_id> } as requested.
 *  - Returns created summaries, dependencies (mapping placeholders -> created ids),
 *    and missingDependencies instructions for the orchestrator to resolve placeholders.
 *
 * Usage:
 *   const seed = require('./seed-db-models.aggregations');
 *   await seed.run({ force: false, dryRun: false, logger: console });
 */

const mongoose = require('mongoose');
const AggregationRepo = require('../../repositories/aggregation.repo');

const DEFAULT_LOGGER = console;

/* -------------------------
 * Helpers
 * ------------------------- */

function nowEpoch() {
  return Date.now();
}

function makeSalesWindowRef(windowPlaceholderOrId) {
  return windowPlaceholderOrId || null;
}

function makeItemDto(itemId, supplierId = null, pricingSnapshot = {}, salesWindowRefs = []) {
  return {
    itemId,
    supplierId,
    pricingSnapshot,
    salesWindow: salesWindowRefs
  };
}

/* -------------------------
 * Build sample aggregations
 * ------------------------- */

function buildAggregations() {
  const ObjectId = mongoose.Types.ObjectId;
  const now = Date.now();

  // placeholders for sales windows, items, suppliers, orders
  const placeholders = {
    salesWindows: {
      pastWindow: String(new ObjectId()),
      currentWindow: String(new ObjectId()),
      futureWindow: String(new ObjectId())
    },
    items: {
      itemA: String(new ObjectId()),
      itemB: String(new ObjectId()),
      itemC: String(new ObjectId()),
      itemD: String(new ObjectId())
    },
    suppliers: {
      sup1: String(new ObjectId()),
      sup2: String(new ObjectId())
    },
    orders: {
      ord1: String(new ObjectId()),
      ord2: String(new ObjectId())
    }
  };

  // Aggregation 1: End of past sales window - summary of fulfilled items
  const aggPast = {
    itemDtos: [
      makeItemDto(placeholders.items.itemA, placeholders.suppliers.sup1, { list: 19.99, sale: 17.99, currency: 'USD' }, [{ from: now - 1000 * 60 * 60 * 24 * 60, to: now - 1000 * 60 * 60 * 24 * 30 }]),
      makeItemDto(placeholders.items.itemB, placeholders.suppliers.sup2, { list: 9.99, currency: 'USD' }, [{ from: now - 1000 * 60 * 60 * 24 * 60, to: now - 1000 * 60 * 60 * 24 * 30 }])
    ],
    orders: [placeholders.orders.ord1],
    ops_region: 'NA',
    status: 'processed',
    metadata: { SalesWindId: makeSalesWindowRef(placeholders.salesWindows.pastWindow), note: 'End of past window aggregation' },
    createdAt: now - 1000 * 60 * 60 * 24 * 25,
    updatedAt: now - 1000 * 60 * 60 * 24 * 20
  };

  // Aggregation 2: Current sales window in process - pending processing
  const aggCurrent = {
    itemDtos: [
      makeItemDto(placeholders.items.itemA, placeholders.suppliers.sup1, { list: 18.99, sale: 16.99, currency: 'USD' }, [{ from: now - 1000 * 60 * 60 * 24 * 2, to: now + 1000 * 60 * 60 * 24 * 5 }]),
      makeItemDto(placeholders.items.itemC, placeholders.suppliers.sup2, { list: 29.99, currency: 'USD' }, [{ from: now - 1000 * 60 * 60 * 24 * 2, to: now + 1000 * 60 * 60 * 24 * 5 }])
    ],
    orders: [placeholders.orders.ord2],
    ops_region: 'NA',
    status: 'in_process',
    metadata: { SalesWindId: makeSalesWindowRef(placeholders.salesWindows.currentWindow), note: 'Live aggregation for current window' },
    createdAt: now - 1000 * 60 * 60 * 24 * 1,
    updatedAt: now - 1000 * 60 * 60 * 12
  };

  // Aggregation 3: Future window pre-computed (planned) - pending
  const aggFuture = {
    itemDtos: [
      makeItemDto(placeholders.items.itemD, placeholders.suppliers.sup1, { list: 5.49, currency: 'USD' }, [{ from: now + 1000 * 60 * 60 * 24 * 10, to: now + 1000 * 60 * 60 * 24 * 20 }]),
      makeItemDto(placeholders.items.itemB, placeholders.suppliers.sup2, { list: 10.99, currency: 'USD' }, [{ from: now + 1000 * 60 * 60 * 24 * 10, to: now + 1000 * 60 * 60 * 24 * 20 }])
    ],
    orders: [],
    ops_region: 'NA',
    status: 'pending',
    metadata: { SalesWindId: makeSalesWindowRef(placeholders.salesWindows.futureWindow), note: 'Planned aggregation for upcoming window' },
    createdAt: now,
    updatedAt: now
  };

  return {
    payloads: [aggPast, aggCurrent, aggFuture],
    placeholders
  };
}

/* -------------------------
 * Run
 * ------------------------- */

async function run(opts = {}) {
  const { force = false, dryRun = false, logger = DEFAULT_LOGGER } = opts;

  const log = {
    info: logger.info || logger.log || DEFAULT_LOGGER.log,
    warn: logger.warn || DEFAULT_LOGGER.warn,
    error: logger.error || DEFAULT_LOGGER.error
  };

  // Ensure mongoose connection
  if (!mongoose || !mongoose.connection || mongoose.connection.readyState === 0) {
    throw new Error('Mongoose connection is not established. Connect to DB before running seeds.');
  }

  // Check existing aggregations
  let existingCount = 0;
  try {
    existingCount = await AggregationRepo.count({}, { includeDeleted: true });
  } catch (err) {
    log.error('Failed to count aggregations:', err && err.message ? err.message : err);
    existingCount = 0;
  }

  if (existingCount > 0 && !force) {
    log.info(`Aggregations collection already has ${existingCount} documents. Skipping aggregations seed (force=false).`);
    return {
      skipped: true,
      reason: 'aggregations_exist',
      totalExisting: existingCount,
      created: [],
      dependencies: {},
      missingDependencies: []
    };
  }

  const { payloads, placeholders } = buildAggregations();

  if (dryRun) {
    log.info('Dry run enabled — no aggregations will be persisted. Returning payload preview.');
    const preview = payloads.map((p) => ({
      status: p.status,
      itemCount: (p.itemDtos || []).length,
      salesWindowRef: p.metadata && p.metadata.SalesWindId
    }));
    return {
      skipped: false,
      dryRun: true,
      preview,
      created: [],
      dependencies: {},
      missingDependencies: []
    };
  }

  // Persist using repository bulkInsert (ordered=false)
  let inserted;
  try {
    inserted = await AggregationRepo.bulkInsert(payloads, {});
  } catch (err) {
    log.error('bulkInsert failed, attempting individual creates:', err && err.message ? err.message : err);
    inserted = [];
    for (const payload of payloads) {
      try {
        const created = await AggregationRepo.create(payload, {});
        if (created) inserted.push(created);
      } catch (e) {
        log.error('Failed to create aggregation payload:', e && e.message ? e.message : e);
      }
    }
  }

  // Build created list and dependencies
  const created = [];
  const dependencies = {}; // aggregationId -> { tag, salesWindowPlaceholder, itemPlaceholders, supplierPlaceholders }
  const missingDependencies = []; // orchestrator instructions to resolve placeholders to real _ids

  for (const doc of inserted) {
    const id = doc._id ? String(doc._id) : null;
    const tag = doc.metadata && doc.metadata.note ? doc.metadata.note : null;
    created.push({ _id: id, status: doc.status, itemCount: (doc.itemDtos || []).length });

    const salesWindowPlaceholder = doc.metadata && doc.metadata.SalesWindId ? String(doc.metadata.SalesWindId) : null;
    const itemPlaceholders = (doc.itemDtos || []).map((it) => (it && it.itemId ? String(it.itemId) : null)).filter(Boolean);
    const supplierPlaceholders = (doc.itemDtos || []).map((it) => (it && it.supplierId ? String(it.supplierId) : null)).filter(Boolean);

    dependencies[id] = {
      tag,
      salesWindowPlaceholder,
      itemPlaceholders,
      supplierPlaceholders
    };

    if (salesWindowPlaceholder || itemPlaceholders.length > 0 || supplierPlaceholders.length > 0) {
      missingDependencies.push({
        type: 'aggregation.placeholders',
        aggregationId: id,
        salesWindowPlaceholder,
        itemPlaceholders,
        supplierPlaceholders,
        note: 'Replace placeholders with real SalesWindow._id, Item._id and User._id values once those seeds run'
      });
    }
  }

  log.info(`Seeded ${created.length} aggregations.`);

  return {
    skipped: false,
    dryRun: false,
    totalCreated: created.length,
    created,
    dependencies,
    missingDependencies,
    placeholders
  };
}

module.exports = { run };

/* ---------------------------------------------------------------------------
   Postman payload examples (use these to test the Aggregation routes)

   1) Create aggregation (POST /api/aggrs)
   Endpoint: POST http://localhost:3000/api/aggrs
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   {
     "itemDtos": [
       {
         "itemId": "603d2f1b8f1b2c0012345671",
         "supplierId": "603d2f1b8f1b2c0012345672",
         "pricingSnapshot": { "list": 19.99, "sale": 17.99, "currency": "USD" },
         "salesWindow": [{ "from": 1700000000000, "to": 1700604800000 }]
       }
     ],
     "orders": ["603d2f1b8f1b2c0012345680"],
     "ops_region": "NA",
     "status": "pending",
     "metadata": { "SalesWindId": "603d2f1b8f1b2c0012345690", "note": "End of window aggregation" }
   }

   2) Add order to aggregation (POST /api/aggrs/:id/add-order)
   Endpoint: POST http://localhost:3000/api/aggrs/{aggregationId}/add-order
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   { "orderId": "603d2f1b8f1b2c0012345680" }

   3) Mark aggregation processed (POST /api/aggrs/:id/mark-processed)
   Endpoint: POST http://localhost:3000/api/aggrs/{aggregationId}/mark-processed
   Headers:
     - Authorization: Bearer <token>

   4) Get aggregation by id (GET /api/aggrs/:id)
   Endpoint: GET http://localhost:3000/api/aggrs/{aggregationId}
   Headers:
     - Authorization: Bearer <token>

   5) List aggregations (GET /api/aggrs?page=1&limit=25&filter={"status":"pending"})
   Endpoint: GET http://localhost:3000/api/aggrs?filter={"status":"pending"}&page=1&limit=25
   Headers:
     - Authorization: Bearer <token>

   Replace placeholders {aggregationId}, {orderId}, {itemId}, {supplierId}, and {SalesWindId} with actual _id values returned from create/list endpoints.
   --------------------------------------------------------------------------- */
