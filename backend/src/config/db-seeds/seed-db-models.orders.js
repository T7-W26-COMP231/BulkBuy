// src/config/db-seeds/seed-db-models.orders.js
/**
 * Seed script for Orders collection
 *
 * Exports: { run }
 *
 * Behavior:
 *  - If DB already has orders and force !== true, seeding is skipped.
 *  - Creates sample orders for placeholder users (3 users x 3 orders each = 9 orders):
 *      - 1 past (fulfilled)
 *      - 1 in-process (dispatched or confirmed)
 *      - 1 draft (cart)
 *  - Uses repository methods for persistence (bulkInsert fallback to individual creates).
 *  - Returns:
 *      - created: array of created order summaries
 *      - dependencies: mapping of placeholders (user/item) to created order ids
 *      - missingDependencies: instructions for orchestrator to resolve placeholder user/item ids
 *
 * Usage:
 *   const seed = require('./seed-db-models.orders');
 *   await seed.run({ force: false, dryRun: false, logger: console });
 */

const mongoose = require('mongoose');
const OrderRepo = require('../../repositories/order.repo');

const DEFAULT_LOGGER = console;

/* -------------------------
 * Helpers
 * ------------------------- */

function makeGeo(lng = -79.7, lat = 43.7) {
  return { type: 'Point', coordinates: [Number(lng), Number(lat)] };
}

function makeAddress(line1, city = 'Toronto', region = 'ON', postalCode = 'M5V2T6', country = 'Canada', geo = null) {
  const addr = { line1, city, region, postalCode, country };
  if (geo) addr.geo = geo;
  return addr;
}

function makePricingSnapshot(price = 0, discountPct = 0, initial = 0, final = 0, meta = {}) {
  return {
    atInstantPrice: Number(price),
    discountedPercentage: Number(discountPct),
    discountBracket: { initial: Number(initial), final: Number(final) },
    meta: meta || {}
  };
}

/**
 * Build an order item referencing placeholder item/product ids.
 * itemId and productId may be placeholder ObjectIds (strings) to be resolved later.
 */
function makeOrderItem({ productId = null, itemId = null, price = 0, qty = 1, discountPct = 0, saveForLater = false }) {
  return {
    productId,
    itemId,
    pricingSnapshot: makePricingSnapshot(price, discountPct, 0, 0, { currency: 'USD' }),
    saveForLater: !!saveForLater,
    quantity: Number(qty)
  };
}

/* -------------------------
 * Sample payload builder
 * ------------------------- */

/**
 * Build sample orders for a given placeholder userId
 * Returns array of 3 orders: past (fulfilled), in-process (dispatched), draft
 */
function buildOrdersForUser(userPlaceholderId, itemPlaceholders = [], ops_region = 'NA') {
  const now = Date.now();

  // Past order (fulfilled)
  const pastOrder = {
    userId: userPlaceholderId,
    items: [
      makeOrderItem({ productId: itemPlaceholders[0] || null, itemId: itemPlaceholders[0] || null, price: 19.99, qty: 10, discountPct: 5 }),
      makeOrderItem({ productId: itemPlaceholders[1] || null, itemId: itemPlaceholders[1] || null, price: 9.99, qty: 5 })
    ],
    orderLocation: makeAddress('10 Past St', 'Brampton', 'ON', 'L6T0A1', 'Canada', makeGeo(-79.7624, 43.7315)),
    deliveryLocation: makeAddress('10 Past St', 'Brampton', 'ON', 'L6T0A1', 'Canada', makeGeo(-79.7624, 43.7315)),
    paymentMethod: { type: 'card', provider: 'stripe', last4: '4242' },
    salesWindow: null,
    ops_region,
    messages: [],
    metadata: { seeded: true, seedTag: 'order.past' },
    status: 'fulfilled',
    createdAt: now - 1000 * 60 * 60 * 24 * 60, // ~60 days ago
    updatedAt: now - 1000 * 60 * 60 * 24 * 30 // ~30 days ago
  };

  // In-process order (dispatched or confirmed)
  const inProcessOrder = {
    userId: userPlaceholderId,
    items: [
      makeOrderItem({ productId: itemPlaceholders[2] || null, itemId: itemPlaceholders[2] || null, price: 29.99, qty: 3 }),
      makeOrderItem({ productId: itemPlaceholders[1] || null, itemId: itemPlaceholders[1] || null, price: 14.99, qty: 2 })
    ],
    orderLocation: makeAddress('200 Commerce Blvd', 'Toronto', 'ON', 'M5V2T6', 'Canada', makeGeo(-79.38, 43.65)),
    deliveryLocation: makeAddress('200 Commerce Blvd', 'Toronto', 'ON', 'M5V2T6', 'Canada', makeGeo(-79.38, 43.65)),
    paymentMethod: { type: 'card', provider: 'stripe', last4: '1111' },
    salesWindow: null,
    ops_region,
    messages: [],
    metadata: { seeded: true, seedTag: 'order.inprocess' },
    status: 'dispatched',
    createdAt: now - 1000 * 60 * 60 * 24 * 5, // 5 days ago
    updatedAt: now - 1000 * 60 * 60 * 24 * 1 // 1 day ago
  };

  // Draft order (cart) with saveForLater example
  const draftOrder = {
    userId: userPlaceholderId,
    items: [
      makeOrderItem({ productId: itemPlaceholders[0] || null, itemId: itemPlaceholders[0] || null, price: 19.99, qty: 2, saveForLater: false }),
      makeOrderItem({ productId: itemPlaceholders[3] || null, itemId: itemPlaceholders[3] || null, price: 4.99, qty: 1, saveForLater: true })
    ],
    orderLocation: makeAddress('Cart Address', 'Mississauga', 'ON', 'L5B0E6', 'Canada'),
    deliveryLocation: null,
    paymentMethod: null,
    salesWindow: null,
    ops_region,
    messages: [],
    metadata: { seeded: true, seedTag: 'order.draft' },
    status: 'draft',
    createdAt: now - 1000 * 60 * 60 * 2, // 2 hours ago
    updatedAt: now - 1000 * 60 * 30 // 30 minutes ago
  };

  return [pastOrder, inProcessOrder, draftOrder];
}

/* -------------------------
 * Run function
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

  // Check existing orders
  let existingCount = 0;
  try {
    existingCount = await OrderRepo.count({}, { includeDeleted: true });
  } catch (err) {
    log.error('Failed to count orders:', err && err.message ? err.message : err);
    existingCount = 0;
  }

  if (existingCount > 0 && !force) {
    log.info(`Orders collection already has ${existingCount} documents. Skipping orders seed (force=false).`);
    return {
      skipped: true,
      reason: 'orders_exist',
      totalExisting: existingCount,
      created: [],
      dependencies: {},
      missingDependencies: []
    };
  }

  // Build placeholder users and items (to be resolved by orchestrator)
  const ObjectId = mongoose.Types.ObjectId;
  const placeholders = {
    users: {
      userA: String(new ObjectId()),
      userB: String(new ObjectId()),
      userC: String(new ObjectId())
    },
    items: {
      item1: String(new ObjectId()),
      item2: String(new ObjectId()),
      item3: String(new ObjectId()),
      item4: String(new ObjectId())
    }
  };

  // Build payloads: 3 orders per user
  const payloads = [];
  payloads.push(...buildOrdersForUser(placeholders.users.userA, [placeholders.items.item1, placeholders.items.item2, placeholders.items.item3, placeholders.items.item4], 'ON-GTA'));
  payloads.push(...buildOrdersForUser(placeholders.users.userB, [placeholders.items.item2, placeholders.items.item3, placeholders.items.item4, placeholders.items.item1], 'ON-TOR'));
  payloads.push(...buildOrdersForUser(placeholders.users.userC, [placeholders.items.item3, placeholders.items.item4, placeholders.items.item1, placeholders.items.item2], 'NA'));

  if (dryRun) {
    log.info('Dry run enabled — no orders will be persisted. Returning payload preview.');
    const preview = payloads.map((p) => ({
      userPlaceholder: p.userId ? String(p.userId) : null,
      status: p.status,
      itemCount: (p.items || []).length,
      createdAt: p.createdAt
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
    inserted = await OrderRepo.bulkInsert(payloads, {});
  } catch (err) {
    log.error('bulkInsert failed, attempting individual creates:', err && err.message ? err.message : err);
    inserted = [];
    for (const payload of payloads) {
      try {
        const created = await OrderRepo.create(payload, {});
        if (created) inserted.push(created);
      } catch (e) {
        log.error('Failed to create order payload:', e && e.message ? e.message : e);
      }
    }
  }

  // Build created list and dependencies
  const created = [];
  const dependencies = {}; // orderId -> { userPlaceholder, itemPlaceholders }
  const missingDependencies = []; // orchestrator instructions to resolve placeholders to real _ids

  for (const doc of inserted) {
    const id = doc._id ? String(doc._id) : null;
    created.push({ _id: id, status: doc.status, userId: doc.userId ? String(doc.userId) : null, itemCount: (doc.items || []).length });

    const itemPlaceholders = (doc.items || []).map((it) => (it && it.itemId ? String(it.itemId) : null)).filter(Boolean);

    dependencies[id] = {
      userPlaceholder: doc.userId ? String(doc.userId) : null,
      itemPlaceholders
    };

    // If any placeholders exist, add to missingDependencies for orchestrator to resolve
    if ((doc.userId && String(doc.userId).length > 0) || itemPlaceholders.length > 0) {
      missingDependencies.push({
        type: 'order.placeholders',
        orderId: id,
        userPlaceholder: doc.userId ? String(doc.userId) : null,
        itemPlaceholders,
        note: 'Replace userPlaceholder with real User._id and itemPlaceholders with Item._id values once those seeds run'
      });
    }
  }

  log.info(`Seeded ${created.length} orders.`);

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
   Postman payload examples (use these to test the Order routes)

   1) Create order (POST /api/ordrs)
   Endpoint: POST http://localhost:3000/api/ordrs
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   {
     "userId": "603d2f1b8f1b2c0012345678",
     "items": [
       {
         "productId": "603d2f1b8f1b2c0012345680",
         "itemId": "603d2f1b8f1b2c0012345681",
         "pricingSnapshot": { "atInstantPrice": 19.99, "discountedPercentage": 5, "discountBracket": { "initial": 0, "final": 5 }, "meta": { "currency": "USD" } },
         "quantity": 10
       }
     ],
     "orderLocation": { "line1": "100 Commerce Blvd", "city": "Brampton", "region": "ON", "postalCode": "L6T0A1", "country": "Canada" },
     "deliveryLocation": { "line1": "100 Commerce Blvd", "city": "Brampton", "region": "ON", "postalCode": "L6T0A1", "country": "Canada" },
     "paymentMethod": { "type": "card", "provider": "stripe", "last4": "4242" },
     "status": "submitted",
     "ops_region": "ON-GTA"
   }

   2) Add item to existing order (POST /api/ordrs/:id/items)
   Endpoint: POST http://localhost:3000/api/ordrs/{orderId}/items
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   {
     "productId": "603d2f1b8f1b2c0012345680",
     "itemId": "603d2f1b8f1b2c0012345682",
     "pricingSnapshot": { "atInstantPrice": 9.99, "discountedPercentage": 0, "meta": { "currency": "USD" } },
     "quantity": 3,
     "saveForLater": false
   }

   3) Set item quantity (PATCH /api/ordrs/:orderId/items/:itemId/quantity)
   Endpoint: PATCH http://localhost:3000/api/ordrs/{orderId}/items/{itemId}/quantity
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   { "quantity": 5 }

   4) Update order status (PATCH /api/ordrs/:id)
   Endpoint: PATCH http://localhost:3000/api/ordrs/{orderId}
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   {
     "status": "dispatched",
     "metadata": { "tracking": "TRK-000123" }
   }

   5) Get orders for a user (GET /api/ordrs?userId={userId}&page=1&limit=25)
   Endpoint: GET http://localhost:3000/api/ordrs?userId=603d2f1b8f1b2c0012345678&page=1&limit=25
   Headers:
     - Authorization: Bearer <token>

   Replace placeholders {orderId}, {itemId}, and {userId} with actual _id values returned from create/list endpoints.
   --------------------------------------------------------------------------- */
