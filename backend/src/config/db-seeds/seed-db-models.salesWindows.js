// src/config/db-seeds/seed-db-models.salesWindows.js
/**
 * Seed script for SalesWindow collection
 *
 * Exports: { run }
 *
 * Behavior:
 *  - If DB already has sales windows and force !== true, seeding is skipped.
 *  - Creates at least 3 sales windows: 1 past, 1 current, 1 future.
 *  - Each window contains product containers with item snapshots. Item and product ids
 *    are placeholders (ObjectId strings) to be resolved by the orchestrator after items/products are seeded.
 *  - Returns created summaries, dependencies (mapping names/placeholders -> _ids),
 *    and missingDependencies instructions for the index orchestrator.
 *
 * Usage:
 *   const seed = require('./seed-db-models.salesWindows');
 *   await seed.run({ force: false, dryRun: false, logger: console });
 */

const mongoose = require('mongoose');
const SalesWindowRepo = require('../../repositories/salesWindow.repo');

const DEFAULT_LOGGER = console;

/* -------------------------
 * Helpers
 * ------------------------- */

function nowEpoch() {
  return Date.now();
}

function epochDaysFromNow(days = 0) {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

/**
 * Build a pricing snapshot that matches the SalesWindow model's PricingSnapshotSchema.
 * - atInstantPrice: number
 * - discountedPercentage: number (0-100)
 * - discountBracket: { initial, final }
 * - metadata: arbitrary
 */
function makePricingSnapshot(atInstantPrice = 0, discountedPercentage = 0, discountBracket = { initial: 0, final: 0 }, metadata = {}) {
  return {
    atInstantPrice: Number(atInstantPrice),
    discountedPercentage: Number(discountedPercentage),
    discountBracket: {
      initial: Number(discountBracket.initial || 0),
      final: Number(discountBracket.final || 0)
    },
    metadata: metadata || {},
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

/**
 * Build a product item entry for a sales window.
 * itemIdPlaceholder is a string (placeholder) or ObjectId.
 * pricingSnapshots is an array of pricing snapshot objects (matching model).
 */
function makeProductItem(itemIdPlaceholder, pricingSnapshots = [], metadata = {}) {
  return {
    itemId: itemIdPlaceholder,
    pricing_snapshots: Array.isArray(pricingSnapshots) ? pricingSnapshots : [],
    metadata: metadata || {},
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

/**
 * Build a product container for a sales window.
 */
function makeProductContainer(productIdPlaceholder, items = [], metadata = {}) {
  return {
    productId: productIdPlaceholder,
    items: Array.isArray(items) ? items : [],
    metadata: metadata || {}
  };
}

/* -------------------------
 * Build sample windows
 * ------------------------- */

function buildSalesWindows() {
  const ObjectId = mongoose.Types.ObjectId;

  // placeholders to be resolved by orchestrator
  const placeholders = {
    products: {
      prodA: String(new ObjectId()),
      prodB: String(new ObjectId()),
      prodC: String(new ObjectId())
    },
    items: {
      item1: String(new ObjectId()),
      item2: String(new ObjectId()),
      item3: String(new ObjectId()),
      item4: String(new ObjectId())
    }
  };

  // Past window: ended last week
  const pastWindow = {
    window: {
      fromEpoch: epochDaysFromNow(-30),
      toEpoch: epochDaysFromNow(-7)
    },
    products: [
      makeProductContainer(placeholders.products.prodA, [
        makeProductItem(
          placeholders.items.item1,
          [
            makePricingSnapshot(19.99, 0, { initial: 0, final: 0 }, { currency: 'USD', note: 'list price' }),
            makePricingSnapshot(17.99, 10, { initial: 0, final: 10 }, { currency: 'USD', note: 'sale price' })
          ],
          { origin: 'seed' }
        ),
        makeProductItem(
          placeholders.items.item2,
          [ makePricingSnapshot(9.99, 0, { initial: 0, final: 0 }, { currency: 'USD' }) ],
          { origin: 'seed' }
        )
      ], { notes: 'past product A' }),

      makeProductContainer(placeholders.products.prodB, [
        makeProductItem(
          placeholders.items.item3,
          [ makePricingSnapshot(29.99, 0, { initial: 0, final: 0 }, { currency: 'USD' }) ],
          { notes: 'past item' }
        )
      ], { notes: 'past product B' })
    ],
    metadata: { seeded: true, tag: 'saleswindow.past' }
  };

  // Current window: active now
  const currentWindow = {
    window: {
      fromEpoch: epochDaysFromNow(-2),
      toEpoch: epochDaysFromNow(5)
    },
    products: [
      makeProductContainer(placeholders.products.prodA, [
        makeProductItem(
          placeholders.items.item1,
          [
            makePricingSnapshot(18.99, 5, { initial: 0, final: 5 }, { currency: 'USD', effectiveFrom: epochDaysFromNow(-2), effectiveTo: epochDaysFromNow(5) }),
            makePricingSnapshot(16.99, 10, { initial: 5, final: 10 }, { currency: 'USD', promo: 'spring' })
          ],
          { promo: 'spring' }
        ),
        makeProductItem(
          placeholders.items.item4,
          [ makePricingSnapshot(4.99, 0, { initial: 0, final: 0 }, { currency: 'USD' }) ],
          { pack: 'single' }
        )
      ], { notes: 'current product A' }),

      makeProductContainer(placeholders.products.prodC, [
        makeProductItem(
          placeholders.items.item2,
          [ makePricingSnapshot(11.99, 0, { initial: 0, final: 0 }, { currency: 'USD' }) ],
          { notes: 'current item' }
        )
      ], { notes: 'current product C' })
    ],
    metadata: { seeded: true, tag: 'saleswindow.current' }
  };

  // Future window: starts in 10 days
  const futureWindow = {
    window: {
      fromEpoch: epochDaysFromNow(10),
      toEpoch: epochDaysFromNow(20)
    },
    products: [
      makeProductContainer(placeholders.products.prodB, [
        makeProductItem(
          placeholders.items.item3,
          [
            makePricingSnapshot(27.99, 0, { initial: 0, final: 0 }, { currency: 'USD' }),
            makePricingSnapshot(25.99, 7, { initial: 0, final: 7 }, { currency: 'USD', planned: true })
          ],
          { planned: true }
        ),
        makeProductItem(
          placeholders.items.item4,
          [
            makePricingSnapshot(5.49, 0, { initial: 0, final: 0 }, { currency: 'USD' }),
            makePricingSnapshot(4.99, 9, { initial: 0, final: 9 }, { currency: 'USD', planned: true })
          ],
          { planned: true }
        )
      ], { notes: 'future product B' }),

      makeProductContainer(placeholders.products.prodC, [
        makeProductItem(
          placeholders.items.item1,
          [ makePricingSnapshot(20.99, 0, { initial: 0, final: 0 }, { currency: 'USD' }) ],
          { planned: true }
        )
      ], { notes: 'future product C' })
    ],
    metadata: { seeded: true, tag: 'saleswindow.future' }
  };

  return {
    payloads: [pastWindow, currentWindow, futureWindow],
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

  // Defensive: ensure repository exists and exposes expected methods
  if (!SalesWindowRepo || typeof SalesWindowRepo.count !== 'function') {
    throw new Error('SalesWindow repository not available or missing required methods');
  }

  // Check existing sales windows
  let existingCount = 0;
  try {
    existingCount = await SalesWindowRepo.count({}, { includeDeleted: true });
  } catch (err) {
    log.error('Failed to count sales windows:', err && err.message ? err.message : err);
    existingCount = 0;
  }

  if (existingCount > 0 && !force) {
    log.info(`SalesWindow collection already has ${existingCount} documents. Skipping sales windows seed (force=false).`);
    return {
      skipped: true,
      reason: 'saleswindows_exist',
      totalExisting: existingCount,
      created: [],
      dependencies: {},
      missingDependencies: []
    };
  }

  const { payloads, placeholders } = buildSalesWindows();

  if (dryRun) {
    log.info('Dry run enabled — no sales windows will be persisted. Returning payload preview.');
    const preview = payloads.map((p) => ({
      fromEpoch: p.window.fromEpoch,
      toEpoch: p.window.toEpoch,
      productsCount: (p.products || []).length,
      tag: p.metadata && p.metadata.tag
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
    inserted = await SalesWindowRepo.bulkInsert(payloads, {});
  } catch (err) {
    log.error('bulkInsert failed, attempting individual creates:', err && err.message ? err.message : err);
    inserted = [];
    for (const payload of payloads) {
      try {
        const created = await SalesWindowRepo.create(payload, {});
        if (created) inserted.push(created);
      } catch (e) {
        log.error('Failed to create sales window payload:', e && e.message ? e.message : e);
      }
    }
  }

  // Build created list and dependencies
  const created = [];
  const dependencies = {}; // windowId -> { tag, productPlaceholders, itemPlaceholders }
  const missingDependencies = []; // orchestrator instructions to resolve placeholders to real _ids

  for (const doc of inserted) {
    const id = doc._id ? String(doc._id) : null;
    const tag = doc.metadata && doc.metadata.tag ? doc.metadata.tag : null;
    created.push({ _id: id, tag, window: doc.window });

    // collect placeholders from products/items
    const productPlaceholders = [];
    const itemPlaceholders = [];
    if (Array.isArray(doc.products)) {
      doc.products.forEach((p) => {
        if (p && p.productId) productPlaceholders.push(String(p.productId));
        if (Array.isArray(p.items)) {
          p.items.forEach((it) => {
            if (it && it.itemId) itemPlaceholders.push(String(it.itemId));
          });
        }
      });
    }

    dependencies[id] = { tag, productPlaceholders, itemPlaceholders };

    if (productPlaceholders.length > 0 || itemPlaceholders.length > 0) {
      missingDependencies.push({
        type: 'saleswindow.placeholders',
        salesWindowId: id,
        tag,
        productPlaceholders,
        itemPlaceholders,
        note: 'Replace productPlaceholders and itemPlaceholders with real Product._id and Item._id values once those seeds run'
      });
    }
  }

  log.info(`Seeded ${created.length} sales windows.`);

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
   Postman payload examples (use these to test the SalesWindow routes)

   1) Create a sales window (POST /api/swnds)
   Endpoint: POST http://localhost:3000/api/swnds
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   {
     "window": { "fromEpoch": 1700000000000, "toEpoch": 1700604800000 },
     "products": [
       {
         "productId": "603d2f1b8f1b2c0012345670",
         "items": [
           {
             "itemId": "603d2f1b8f1b2c0012345671",
             "pricing_snapshots": [
               { "atInstantPrice": 19.99, "discountedPercentage": 0, "discountBracket": { "initial": 0, "final": 0 }, "metadata": { "currency": "USD" } }
             ],
             "metadata": { "promo": "launch" }
           }
         ],
         "metadata": { "notes": "Bundle A" }
       }
     ],
     "metadata": { "notes": "Q3 launch window" }
   }

   2) Add or update an item snapshot (POST /api/swnds/:id/items)
   Endpoint: POST http://localhost:3000/api/swnds/{salesWindowId}/items
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   {
     "productId": "603d2f1b8f1b2c0012345670",
     "itemId": "603d2f1b8f1b2c0012345671",
     "pricing_snapshots": [
       { "atInstantPrice": 18.99, "discountedPercentage": 5, "discountBracket": { "initial": 0, "final": 5 }, "metadata": { "currency": "USD", "promo": "earlybird" } }
     ],
     "metadata": { "promo": "earlybird" }
   }

   3) Get sales window by id (GET /api/swnds/:id)
   Endpoint: GET http://localhost:3000/api/swnds/{salesWindowId}
   Headers:
     - Authorization: Bearer <token>

   4) Find windows by range (GET /api/swnds?fromEpoch=1700000000000&toEpoch=1700604800000)
   Endpoint: GET http://localhost:3000/api/swnds?fromEpoch=1700000000000&toEpoch=1700604800000
   Headers:
     - Authorization: Bearer <token>

   5) Remove an item from a product (DELETE /api/swnds/:id/products/:productId/items/:itemId)
   Endpoint: DELETE http://localhost:3000/api/swnds/{salesWindowId}/products/{productId}/items/{itemId}
   Headers:
     - Authorization: Bearer <token>

   Replace placeholders {salesWindowId}, {productId}, {itemId} with actual _id values returned from create/list endpoints.
   --------------------------------------------------------------------------- */
