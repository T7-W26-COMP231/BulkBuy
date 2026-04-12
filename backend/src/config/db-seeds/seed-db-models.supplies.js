// src/config/db-seeds/seed-db-models.supplies.js
/**
 * Seed script for Supplies collection
 *
 * Exports: { run }
 *
 * Behavior:
 *  - If DB already has supplies and force !== true, seeding is skipped.
 *  - Creates at least 3 supplies: 1 past (received), 1 accepted, 1 quote.
 *  - Uses repository methods for persistence.
 *  - Returns created dependencies and missingDependencies for orchestrator to resolve (e.g., real supplier and item _ids).
 *
 * Usage:
 *   const seed = require('./seed-db-models.supplies');
 *   await seed.run({ force: false, dryRun: false, logger: console });
 */

const mongoose = require('mongoose');
const SupplyRepo = require('../../repositories/supply.repo');

const DEFAULT_LOGGER = console;

/**
 * Helper: build a discount bracket
 */
function makeDiscountBracket(minQty, discountPercent, description = '') {
  return { minQty, discountPercent, description };
}

/**
 * Helper: build a quote
 */
function makeQuote(pricePerBulkUnit, numberOfBulkUnits = 1, discountingScheme = [], isAccepted = false, meta = {}) {
  return {
    pricePerBulkUnit: Number(pricePerBulkUnit),
    numberOfBulkUnits: Number(numberOfBulkUnits),
    discountingScheme,
    isAccepted,
    meta,
    createdAt: new Date()
  };
}

/**
 * Helper: build an item entry for supply
 * itemId may be a placeholder ObjectId (string) which orchestrator will resolve later
 */
function makeSupplyItem(itemId, requestedQuantity = 1, quotes = [], meta = {}) {
  return {
    itemId,
    requestedQuantity,
    quotes,
    meta
  };
}

/**
 * Build sample supply payloads
 * We intentionally use generated ObjectIds as placeholders for supplierId and itemId so the orchestrator
 * can later replace them with real user/item _ids if needed.
 */
function buildSamplePayloads() {
  const ObjectId = mongoose.Types.ObjectId;
  const now = new Date();

  // Placeholder supplier and item ids (to be resolved by orchestrator if needed)
  const supplier1 = new ObjectId(); // intended to map to seeded supplier user
  const supplier2 = new ObjectId();
  const requester1 = new ObjectId();

  const itemA = new ObjectId();
  const itemB = new ObjectId();
  const itemC = new ObjectId();

  // Supply 1: past, received
  const supplyReceived = {
    supplierId: supplier1,
    requesterId: requester1,
    items: [
      makeSupplyItem(itemA, 100, [
        makeQuote(1200, 1, [makeDiscountBracket(50, 5, '5% for 50+'), makeDiscountBracket(100, 10, '10% for 100+')], true, { leadTimeDays: 7 })
      ], { category: 'groceries' }),
      makeSupplyItem(itemB, 200, [
        makeQuote(450, 1, [], true, { packaging: 'pallet' })
      ], { category: 'beverages' })
    ],
    deliveryLocation: {
      label: 'Main Distribution Center',
      line1: '100 Commerce Blvd',
      city: 'Brampton',
      region: 'ON',
      postalCode: 'L6T0A1',
      country: 'Canada',
      geo: { type: 'Point', coordinates: [-79.7, 43.7] }
    },
    status: 'received',
    ops_region: 'ON-GTA',
    metadata: { seeded: true, seedTag: 'supply.received' },
    internalNotes: 'Seed: past supply marked received'
  };

  // Supply 2: accepted (supplier accepted a quote but not yet dispatched)
  const supplyAccepted = {
    supplierId: supplier2,
    requesterId: null,
    items: [
      makeSupplyItem(itemC, 50, [
        makeQuote(2500, 1, [makeDiscountBracket(10, 3, '3% for 10+')], false, { currency: 'CAD' })
      ], { fragile: true })
    ],
    deliveryLocation: {
      label: 'Retailer Backroom',
      line1: '200 Retail Park',
      city: 'Toronto',
      region: 'ON',
      postalCode: 'M5V2T6',
      country: 'Canada'
    },
    status: 'accepted',
    ops_region: 'ON-TOR',
    metadata: { seeded: true, seedTag: 'supply.accepted' },
    internalNotes: 'Seed: accepted quote awaiting dispatch'
  };

  // Supply 3: quote (initial quote state)
  const supplyQuote = {
    supplierId: supplier1,
    requesterId: null,
    items: [
      makeSupplyItem(itemB, 300, [
        makeQuote(430, 1, [makeDiscountBracket(100, 4, '4% for 100+')], false, { packaging: 'box' }),
        makeQuote(410, 1, [makeDiscountBracket(200, 6, '6% for 200+')], false, { packaging: 'pallet' })
      ], { category: 'consumables' })
    ],
    deliveryLocation: {
      label: 'Temporary Storage',
      line1: '55 Logistics Way',
      city: 'Mississauga',
      region: 'ON',
      postalCode: 'L5B0E6',
      country: 'Canada'
    },
    status: 'quote',
    ops_region: 'ON-MISS',
    metadata: { seeded: true, seedTag: 'supply.quote' },
    internalNotes: 'Seed: initial quote'
  };

  return {
    payloads: [supplyReceived, supplyAccepted, supplyQuote],
    placeholders: {
      suppliers: { supplier1: String(supplier1), supplier2: String(supplier2) },
      requester: { requester1: String(requester1) },
      items: { itemA: String(itemA), itemB: String(itemB), itemC: String(itemC) }
    }
  };
}

/**
 * Run seeding for supplies
 * @param {Object} opts
 *   - force: boolean (if true, will seed even if supplies exist)
 *   - dryRun: boolean (if true, will not persist changes)
 *   - logger: console-like logger
 */
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

  // Check existing supplies
  let existingCount = 0;
  try {
    existingCount = await SupplyRepo.count({}, { includeDeleted: true });
  } catch (err) {
    log.error('Failed to count supplies:', err && err.message ? err.message : err);
    existingCount = 0;
  }

  if (existingCount > 0 && !force) {
    log.info(`Supplies collection already has ${existingCount} documents. Skipping supplies seed (force=false).`);
    return {
      skipped: true,
      reason: 'supplies_exist',
      totalExisting: existingCount,
      created: [],
      dependencies: {},
      missingDependencies: []
    };
  }

  const { payloads, placeholders } = buildSamplePayloads();

  if (dryRun) {
    log.info('Dry run enabled — no supplies will be persisted. Returning payload preview.');
    const preview = payloads.map((p) => ({
      status: p.status,
      supplierPlaceholder: p.supplierId ? String(p.supplierId) : null,
      items: (p.items || []).map((it) => ({ itemIdPlaceholder: it.itemId ? String(it.itemId) : null, requestedQuantity: it.requestedQuantity }))
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
    inserted = await SupplyRepo.bulkInsert(payloads, {});
  } catch (err) {
    log.error('bulkInsert failed, attempting individual creates:', err && err.message ? err.message : err);
    inserted = [];
    for (const payload of payloads) {
      try {
        const created = await SupplyRepo.create(payload, {});
        if (created) inserted.push(created);
      } catch (e) {
        log.error('Failed to create supply payload:', e && e.message ? e.message : e);
      }
    }
  }

  // Build created list and dependencies
  const created = [];
  const dependencies = {}; // supplyId -> { supplierPlaceholder, itemPlaceholders }
  const missingDependencies = []; // orchestrator instructions to resolve placeholders to real _ids

  for (const doc of inserted) {
    const id = doc._id ? String(doc._id) : null;
    created.push({ _id: id, status: doc.status, supplierId: doc.supplierId ? String(doc.supplierId) : null });

    // Collect item placeholders for this supply
    const itemPlaceholders = (doc.items || []).map((it) => (it && it.itemId ? String(it.itemId) : null)).filter(Boolean);

    dependencies[id] = {
      supplierPlaceholder: doc.supplierId ? String(doc.supplierId) : null,
      itemPlaceholders
    };

    // If any placeholders exist, add to missingDependencies for orchestrator to resolve
    if ((doc.supplierId && String(doc.supplierId).length > 0) || itemPlaceholders.length > 0) {
      missingDependencies.push({
        type: 'supply.placeholders',
        supplyId: id,
        supplierPlaceholder: doc.supplierId ? String(doc.supplierId) : null,
        itemPlaceholders,
        note: 'Replace supplierPlaceholder and itemPlaceholders with real User._id and Item._id values once those seeds run'
      });
    }
  }

  log.info(`Seeded ${created.length} supplies.`);

  return {
    skipped: false,
    dryRun: false,
    totalCreated: created.length,
    created,
    dependencies,
    missingDependencies,
    placeholders // return the original placeholders to help orchestrator mapping
  };
}

module.exports = { run };

/* ---------------------------------------------------------------------------
   Postman payload examples (use these to test the Supply routes)

   1) Create a supply (POST /api/supls)
   Endpoint: POST http://localhost:3000/api/supls
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   {
     "supplierId": "603d2f1b8f1b2c0012345678",
     "requesterId": "603d2f1b8f1b2c0012345679",
     "items": [
       {
         "itemId": "603d2f1b8f1b2c0012345680",
         "requestedQuantity": 100,
         "quotes": [
           {
             "pricePerBulkUnit": 1200,
             "numberOfBulkUnits": 1,
             "discountingScheme": [{ "minQty": 50, "discountPercent": 5, "description": "5% for 50+" }],
             "isAccepted": false,
             "meta": { "leadTimeDays": 14 }
           }
         ],
         "meta": { "category": "groceries" }
       }
     ],
     "deliveryLocation": {
       "label": "Main Warehouse",
       "line1": "123 Supply St",
       "city": "Brampton",
       "region": "ON",
       "postalCode": "L6T0A1",
       "country": "Canada"
     },
     "status": "quote",
     "ops_region": "ON-GTA",
     "metadata": { "notes": "Created via Postman" }
   }

   2) Add a quote to an item (POST /api/supls/:supplyId/items/:itemId/quotes)
   Endpoint: POST http://localhost:3000/api/supls/{supplyId}/items/{itemId}/quotes
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   {
     "pricePerBulkUnit": 1100,
     "numberOfBulkUnits": 1,
     "discountingScheme": [{ "minQty": 100, "discountPercent": 8, "description": "8% for 100+" }],
     "meta": { "leadTimeDays": 10 }
   }

   3) Accept a quote for an item (POST /api/supls/:supplyId/items/:itemId/accept)
   Endpoint: POST http://localhost:3000/api/supls/{supplyId}/items/{itemId}/accept
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   {
     "quoteIndex": 0
   }

   4) Update supply status (PATCH /api/supls/:id)
   Endpoint: PATCH http://localhost:3000/api/supls/{supplyId}
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   {
     "status": "dispatched",
     "metadata": { "tracking": "TRK123456" }
   }

   5) Get supply by id (GET /api/supls/:id)
   Endpoint: GET http://localhost:3000/api/supls/{supplyId}
   Headers:
     - Authorization: Bearer <token>

   Replace placeholders {supplyId} and {itemId} with actual _id values returned from create/list endpoints.
   --------------------------------------------------------------------------- */
