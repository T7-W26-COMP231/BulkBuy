// src/config/db-seeds/seed-db-models.reviews.js
/**
 * Seed script for Review documents
 *
 * Exports: { run }
 *
 * Behavior:
 *  - If DB already has reviews and force !== true, seeding is skipped.
 *  - Creates at least 2 reviews, referencing users/products/items/orders via placeholders.
 *  - Returns created summaries, dependencies (mapping placeholders -> created ids),
 *    and missingDependencies instructions for the orchestrator to resolve placeholders.
 *
 * Usage:
 *   const seed = require('./seed-db-models.reviews');
 *   await seed.run({ force: false, dryRun: false, logger: console });
 */

const mongoose = require('mongoose');
const ReviewRepo = require('../../repositories/review.repo');

const DEFAULT_LOGGER = console;

/* -------------------------
 * Helpers
 * ------------------------- */

function now() {
  return Date.now();
}

function makePlaceholder(prefix = 'ph') {
  return String(new mongoose.Types.ObjectId());
}

/* Build sample review payloads with placeholders */
function buildPayloads() {
  const placeholders = {
    users: {
      customer1: makePlaceholder('user'),
      customer2: makePlaceholder('user'),
      supplier1: makePlaceholder('user')
    },
    products: {
      prodA: makePlaceholder('prod'),
      prodB: makePlaceholder('prod')
    },
    items: {
      itemA: makePlaceholder('item'),
      itemB: makePlaceholder('item')
    },
    orders: {
      order1: makePlaceholder('ord')
    }
  };

  // Review 1: customer1 reviews product A (submitted)
  const review1 = {
    reviewerId: placeholders.users.customer1,
    revieweeId: placeholders.users.supplier1,
    productId: placeholders.products.prodA,
    itemId: placeholders.items.itemA,
    messageId: null,
    rating: 5,
    ops_region: 'NA',
    status: 'submitted',
    metadata: { context: 'post-purchase', orderRef: placeholders.orders.order1 },
    internalNotes: 'Seeded review - high rating'
  };

  // Review 2: customer2 reviews item B (draft)
  const review2 = {
    reviewerId: placeholders.users.customer2,
    revieweeId: placeholders.users.supplier1,
    productId: placeholders.products.prodB,
    itemId: placeholders.items.itemB,
    messageId: null,
    rating: 4,
    ops_region: 'NA',
    status: 'draft',
    metadata: { context: 'initial feedback' },
    internalNotes: 'Seeded review - draft'
  };

  // Review 3: customer1 reviews supplier directly (submitted)
  const review3 = {
    reviewerId: placeholders.users.customer1,
    revieweeId: placeholders.users.supplier1,
    productId: null,
    itemId: null,
    messageId: null,
    rating: 5,
    ops_region: 'NA',
    status: 'submitted',
    metadata: { context: 'supplier service' },
    internalNotes: 'Seeded supplier review'
  };

  return {
    payloads: [review1, review2, review3],
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

  // Check existing reviews
  let existingCount = 0;
  try {
    existingCount = await ReviewRepo.count({});
  } catch (err) {
    log.error('Failed to count reviews:', err && err.message ? err.message : err);
    existingCount = 0;
  }

  if (existingCount > 0 && !force) {
    log.info(`Reviews collection already has ${existingCount} documents. Skipping reviews seed (force=false).`);
    return {
      skipped: true,
      reason: 'reviews_exist',
      totalExisting: existingCount,
      created: [],
      dependencies: {},
      missingDependencies: []
    };
  }

  const { payloads, placeholders } = buildPayloads();

  if (dryRun) {
    log.info('Dry run enabled — no reviews will be persisted. Returning payload preview.');
    const preview = payloads.map((p) => ({
      reviewerId: p.reviewerId,
      revieweeId: p.revieweeId,
      rating: p.rating,
      status: p.status
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
  let inserted = [];
  try {
    inserted = await ReviewRepo.bulkInsert(payloads, {});
  } catch (err) {
    log.error('bulkInsert failed, attempting individual creates:', err && err.message ? err.message : err);
    inserted = [];
    for (const payload of payloads) {
      try {
        const created = await ReviewRepo.create(payload, {});
        if (created) inserted.push(created);
      } catch (e) {
        log.error('Failed to create review payload:', e && e.message ? e.message : e);
      }
    }
  }

  // Build created list and dependencies
  const created = [];
  const dependencies = {}; // reviewId -> placeholders used
  const missingDependencies = []; // instructions for orchestrator to resolve placeholders

  for (const doc of inserted) {
    const id = doc._id ? String(doc._id) : null;
    created.push({ _id: id, rating: doc.rating, status: doc.status });

    // Collect placeholders present in the original payloads by matching unique internalNotes
    // (we seeded internalNotes to help map back; if not present, we fallback to scanning fields)
    const usedPlaceholders = {
      reviewerPlaceholder: null,
      revieweePlaceholder: null,
      productPlaceholder: null,
      itemPlaceholder: null,
      orderPlaceholder: null
    };

    // Try to map by comparing fields in payloads array (we used same objects order)
    // This is a best-effort mapping: match by rating + status + internalNotes
    const match = payloads.find((p) => {
      return p.rating === doc.rating && p.status === doc.status && p.internalNotes && doc.internalNotes && p.internalNotes === doc.internalNotes;
    });

    if (match) {
      usedPlaceholders.reviewerPlaceholder = match.reviewerId || null;
      usedPlaceholders.revieweePlaceholder = match.revieweeId || null;
      usedPlaceholders.productPlaceholder = match.productId || null;
      usedPlaceholders.itemPlaceholder = match.itemId || null;
      usedPlaceholders.orderPlaceholder = (match.metadata && match.metadata.orderRef) || null;
    } else {
      // fallback: inspect doc fields for ObjectId-like strings that match our generated placeholders
      // (not strictly necessary but harmless)
      usedPlaceholders.reviewerPlaceholder = doc.reviewerId ? String(doc.reviewerId) : null;
      usedPlaceholders.revieweePlaceholder = doc.revieweeId ? String(doc.revieweeId) : null;
      usedPlaceholders.productPlaceholder = doc.productId ? String(doc.productId) : null;
      usedPlaceholders.itemPlaceholder = doc.itemId ? String(doc.itemId) : null;
    }

    dependencies[id] = usedPlaceholders;

    // If any placeholder looks like one of our generated placeholders (not real DB _id),
    // instruct orchestrator to replace them with real ids from other seeds.
    const placeholdersToResolve = [];
    for (const [k, v] of Object.entries(usedPlaceholders)) {
      if (v && typeof v === 'string') {
        // Heuristic: our placeholders are ObjectId strings but not present in DB; orchestrator will resolve
        placeholdersToResolve.push({ key: k, placeholder: v });
      }
    }

    if (placeholdersToResolve.length > 0) {
      missingDependencies.push({
        type: 'review.placeholders',
        reviewId: id,
        placeholders: placeholdersToResolve,
        note: 'Replace placeholders with real User._id, Product._id, Item._id, Order._id values once those seeds run'
      });
    }
  }

  log.info(`Seeded ${created.length} reviews.`);

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
   Postman payload examples (use these to test the Review routes)

   1) Create a review (POST /api/revws)
   Endpoint: POST http://localhost:3000/api/revws
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   {
     "reviewerId": "603d2f1b8f1b2c0012345671",
     "revieweeId": "603d2f1b8f1b2c0012345672",
     "productId": "603d2f1b8f1b2c0012345673",
     "itemId": "603d2f1b8f1b2c0012345674",
     "messageId": null,
     "rating": 5,
     "ops_region": "NA",
     "status": "submitted",
     "metadata": { "context": "post-purchase", "orderRef": "603d2f1b8f1b2c0012345680" }
   }

   2) Create a draft review (POST /api/revws)
   Body (JSON):
   {
     "reviewerId": "603d2f1b8f1b2c0012345675",
     "revieweeId": "603d2f1b8f1b2c0012345672",
     "productId": "603d2f1b8f1b2c0012345676",
     "itemId": "603d2f1b8f1b2c0012345677",
     "rating": 4,
     "ops_region": "NA",
     "status": "draft",
     "metadata": { "context": "initial feedback" }
   }

   3) Publish a review (POST /api/revws/:id/publish)
   Endpoint: POST http://localhost:3000/api/revws/{reviewId}/publish
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body: empty

   4) Get a review by id (GET /api/revws/:id)
   Endpoint: GET http://localhost:3000/api/revws/{reviewId}
   Headers:
     - Authorization: Bearer <token>

   5) List reviews (GET /api/revws?page=1&limit=25&filter={"status":"submitted"})
   Endpoint: GET http://localhost:3000/api/revws?filter={"status":"submitted"}&page=1&limit=25
   Headers:
     - Authorization: Bearer <token>

   6) Soft-delete a review (POST /api/revws/:id/soft-delete)
   Endpoint: POST http://localhost:3000/api/revws/{reviewId}/soft-delete
   Headers:
     - Authorization: Bearer <token>
   Body (JSON):
   { "deletedBy": "603d2f1b8f1b2c0012345671" }

   Replace placeholders {reviewId}, {productId}, {itemId}, {reviewerId}, {revieweeId}, and {orderRef} with actual _id values returned from create/list endpoints.
   --------------------------------------------------------------------------- */
