// src/config/db-seeds/seed-db-models.items.js
/**
 * Seed script for Items collection (duplicate-key resilient, surgical adjustments)
 *
 * Purpose:
 *  - Produce deterministic item payloads and persist them safely.
 *  - Avoid duplicate-key errors by checking existing SKUs before bulk insert.
 *  - Use robust fallback upsert logic and always return canonical provided shape:
 *      { items: [ "<_id>", ... ] }
 *
 * Key behaviors:
 *  - Builds 20 deterministic item payloads with non-null unique `sku` and `slug`.
 *  - If collection already has documents and force=false, the seed will skip.
 *  - Attempts bulk insert for new SKUs (ordered:false). On bulk failure, falls back
 *    to per-item upserts and fetches existing docs to ensure a complete dependency map.
 *  - Normalizes insert/upsert results into an array of docs and returns:
 *      { created: [...], dependencies: { sku: id }, provided: { items: [...] } }
 *
 * Notes:
 *  - This file is defensive: it tolerates repo shapes, driver shapes, and partial failures.
 *  - It uses returnDocument: 'after' for findOneAndUpdate to avoid Mongoose deprecation warnings.
 */

const mongoose = require('mongoose');
const ItemRepo = require('../../repositories/item.repo');
const ItemModel = require('../../models/item.model');

const DEFAULT_LOGGER = console;

/* -------------------------
 * Utilities
 * ------------------------- */

function makeLogger(logger) {
  if (!logger) return DEFAULT_LOGGER;
  return {
    info: logger.info || logger.log || DEFAULT_LOGGER.log,
    warn: logger.warn || DEFAULT_LOGGER.warn,
    error: logger.error || DEFAULT_LOGGER.error
  };
}

function slugify(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Normalize various possible return shapes from bulkInsert/insertMany/upsert:
 * - Array of docs
 * - Single doc
 * - Mongo driver result { insertedIds, ops }
 * - Repo-specific shapes { created: [...] }
 *
 * Returns array of docs (may be empty).
 */
function normalizeInsertedResult(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (result.ops && Array.isArray(result.ops) && result.ops.length > 0) return result.ops;
  if (result.created && Array.isArray(result.created)) return result.created;
  if (result.insertedIds && typeof result.insertedIds === 'object') {
    return Object.values(result.insertedIds).map((id) => ({ _id: id }));
  }
  if (result._id || result.id) return [result];
  return [];
}

/* -------------------------
 * Payload builder
 * ------------------------- */

function makeItemPayload(index) {
  const sku = `BB-ITEM-${String(index).padStart(3, '0')}`;
  const title = [
    'Organic Almonds 1kg',
    'Premium Olive Oil 500ml',
    'Whole Grain Oats 2kg',
    'Canned Tuna in Olive Oil 185g',
    'Roasted Coffee Beans 1kg',
    'Natural Peanut Butter 1kg',
    'Dried Mango Slices 500g',
    'Sparkling Mineral Water 1L',
    'Dark Chocolate 70% 100g',
    'Multigrain Pasta 1kg',
    'Honey Raw 500g',
    'Green Tea Bags 100ct',
    'Sea Salt 1kg',
    'Quinoa White 1kg',
    'Coconut Milk 400ml',
    'Maple Syrup 250ml',
    'Chia Seeds 500g',
    'Protein Bars 12-pack',
    'Frozen Mixed Berries 1kg',
    'Shelf-stable Milk 1L'
  ][index % 20];

  const description = `${title} — high quality, bulk-friendly packaging suitable for retailers and foodservice.`;
  const shortDescription = `${title} — bulk pack.`;

  const listPrice = Number((10 + (index % 10) * 2).toFixed(2));
  const salePrice = index % 5 === 0 ? Number((8 + (index % 7) * 1.5).toFixed(2)) : null;

  const price = [
    {
      list: listPrice,
      sale: salePrice,
      currency: 'USD',
      effectiveFrom: null,
      effectiveTo: null
    }
  ];

  const pricingTiers = [
    { minQty: 10, price: Number((listPrice * 0.95).toFixed(2)), currency: 'USD' },
    { minQty: 50, price: Number((listPrice * 0.9).toFixed(2)), currency: 'USD' }
  ];

  const inventory = {
    stock: 100 + (index * 5),
    reserved: 0,
    backorder: index % 7 === 0,
    warehouses: []
  };

  const weight = { value: Number((0.5 + (index % 5) * 0.25).toFixed(2)), unit: 'kg' };
  const dimensions = { length: 20 + index, width: 10 + index, height: 5 + index, unit: 'cm' };

  const tags = ['grocery', 'bulk', index % 2 === 0 ? 'organic' : 'standard'];

  const metadata = {
    imageUrl: `https://images.unsplash.com/photo-collection?item=${encodeURIComponent(sku)}`,
    origin: 'seed',
    ops_notes: `Seeded item ${sku}`
  };

  const seller = { id: null, name: 'BulkBuy Supplier' };

  // Deterministic slug derived from SKU and title to avoid duplicate null slugs
  const slug = slugify(`${sku}-${title}`);

  return {
    sku,
    title,
    slug,
    description,
    shortDescription,
    brand: { id: null, name: 'BulkBuy Brand' },
    categories: [],
    tags,
    images: [],
    media: [],
    price,
    pricingTiers,
    inventory,
    variants: [],
    weight,
    dimensions,
    shipping: { class: 'standard', freightClass: '', shipsFrom: 'CA' },
    taxClass: 'standard',
    ratings: { avg: 0, count: 0 },
    reviews: [],
    relatedProducts: [],
    seller,
    metadata,
    status: 'active',
    ops_region: 'NA',
    published: true
  };
}

/* -------------------------
 * Main run
 * ------------------------- */

async function run(opts = {}) {
  const { force = false, dryRun = false, logger: rawLogger = DEFAULT_LOGGER } = opts;
  const logger = makeLogger(rawLogger);

  if (!mongoose || !mongoose.connection || mongoose.connection.readyState === 0) {
    throw new Error('Mongoose connection is not established. Connect to DB before running seeds.');
  }

  // 1) Check existing items
  let existingCount = 0;
  try {
    if (ItemModel && typeof ItemModel.countDocuments === 'function') {
      existingCount = await ItemModel.countDocuments({}).exec();
    } else if (ItemRepo && typeof ItemRepo.count === 'function') {
      existingCount = await ItemRepo.count({});
    } else {
      existingCount = 0;
    }
  } catch (err) {
    logger.warn('Failed to count items; assuming none exist:', err && err.message ? err.message : err);
    existingCount = 0;
  }

  if (existingCount > 0 && !force) {
    logger.info(`Items collection already has ${existingCount} documents. Skipping items seed (force=false).`);
    return {
      skipped: true,
      reason: 'items_exist',
      totalExisting: existingCount,
      created: [],
      dependencies: {},
      missingDependencies: [],
      provided: {},
      missing: []
    };
  }

  // 2) Build payloads (20 items)
  const docs = [];
  for (let i = 0; i < 20; i++) docs.push(makeItemPayload(i));

  if (dryRun) {
    logger.info('Dry run enabled — no documents will be persisted. Returning payload preview.');
    const preview = docs.map((d) => ({ sku: d.sku, title: d.title, slug: d.slug, price: d.price[0].list }));
    return {
      skipped: false,
      dryRun: true,
      preview,
      created: [],
      dependencies: {},
      missingDependencies: [],
      provided: {},
      missing: []
    };
  }

  // 3) Query DB for existing SKUs to avoid duplicate-key on sku unique index
  let existingDocsBySku = {};
  try {
    const skus = docs.map((d) => d.sku);
    const found = await ItemModel.find({ sku: { $in: skus } }, { sku: 1 }).lean().exec();
    if (Array.isArray(found) && found.length > 0) {
      for (const f of found) {
        if (f && f.sku) existingDocsBySku[f.sku] = true;
      }
    }
  } catch (err) {
    logger.warn('Failed to query existing SKUs before insert:', err && err.message ? err.message : err);
  }

  // 4) Filter docs to only those SKUs not already present
  const docsToInsert = docs.filter((d) => !existingDocsBySku[d.sku]);

  let rawInserted = [];
  if (docsToInsert.length === 0) {
    logger.info('No new item SKUs to insert; all SKUs already exist.');
  } else {
    // Attempt bulk insert for new docs
    try {
      logger.info(`Attempting bulk insert for ${docsToInsert.length} new items (ordered:false).`);
      if (ItemRepo && typeof ItemRepo.bulkInsert === 'function') {
        rawInserted = await ItemRepo.bulkInsert(docsToInsert, { ordered: false });
      } else {
        rawInserted = await ItemModel.insertMany(docsToInsert, { ordered: false });
      }
      logger.info('Bulk insert completed for items.');
    } catch (err) {
      // Bulk insert failed; log and attempt robust fallback per-item upsert
      logger.error('Items bulkInsert failed :', err && err.message ? err.message : err);
      logger.info('bulkInsert failed or returned no documents; attempting robust fallback (upserts).');

      rawInserted = [];
      for (const payload of docsToInsert) {
        try {
          // Ensure slug exists
          if (!payload.slug) payload.slug = slugify(`${payload.sku}-${payload.title || ''}`);

          const query = { sku: payload.sku };
          const update = { $set: payload, $setOnInsert: { createdAt: new Date() } };
          const optsUpsert = { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true };

          let doc;
          if (ItemRepo && typeof ItemRepo.upsert === 'function') {
            try {
              // Some repos may not support returnDocument; attempt common signature
              doc = await ItemRepo.upsert(query, payload, { returnDocument: 'after' });
            } catch (repoErr) {
              logger.warn(`ItemRepo.upsert failed for SKU ${payload.sku}:`, repoErr && repoErr.message ? repoErr.message : repoErr);
              doc = await ItemModel.findOne({ sku: payload.sku }).exec();
            }
          } else if (ItemModel && typeof ItemModel.findOneAndUpdate === 'function') {
            doc = await ItemModel.findOneAndUpdate(query, update, optsUpsert).exec();
          } else if (ItemModel && typeof ItemModel.create === 'function') {
            doc = await ItemModel.create(payload);
          }

          if (doc) {
            rawInserted.push(doc);
          } else {
            // If upsert returned nothing, try to fetch existing doc (handles duplicate-key race)
            const existing = await ItemModel.findOne({ sku: payload.sku }).exec();
            if (existing) rawInserted.push(existing);
          }
        } catch (e) {
          // Log and continue; if duplicate-key occurs, fetch existing doc and include it
          logger.error(`Failed to upsert SKU ${payload.sku}:`, e && e.message ? e.message : e);
          try {
            const existing = await ItemModel.findOne({ sku: payload.sku }).exec();
            if (existing) rawInserted.push(existing);
          } catch (fetchErr) {
            logger.error(`Failed to fetch existing doc for SKU ${payload.sku} after upsert error:`, fetchErr && fetchErr.message ? fetchErr.message : fetchErr);
          }
        }
      }
    }
  }

  // 5) After insert/upsert, ensure we have a complete list of docs for all SKUs (both pre-existing and newly created)
  const allSkus = docs.map((d) => d.sku);
  let finalDocs = [];
  try {
    finalDocs = await ItemModel.find({ sku: { $in: allSkus } }).lean().exec();
  } catch (err) {
    logger.error('Failed to query final item documents by SKUs:', err && err.message ? err.message : err);
    // As a fallback, combine rawInserted normalized results with any previously found docs
    finalDocs = normalizeInsertedResult(rawInserted);
    for (const s of Object.keys(existingDocsBySku)) {
      if (!finalDocs.find((d) => d && d.sku === s)) {
        try {
          const doc = await ItemModel.findOne({ sku: s }).lean().exec();
          if (doc) finalDocs.push(doc);
        } catch (e) {
          // ignore
        }
      }
    }
  }

  const inserted = normalizeInsertedResult(finalDocs);

  // 6) Build dependencies map (sku -> _id) and created list
  const dependencies = {};
  const created = [];
  for (const doc of inserted) {
    const id = doc && (doc._id ? String(doc._id) : (doc.id ? String(doc.id) : null));
    const sku = doc && (doc.sku || null);
    const title = doc && (doc.title || null);
    if (sku && id) dependencies[sku] = id;
    created.push({ _id: id, sku, title });
  }

  // 7) Build canonical items array for orchestrator
  const itemsArray = Object.values(dependencies).filter(Boolean);

  logger.info(`Seeded ${created.length} items (unique SKUs accounted).`);

  return {
    skipped: false,
    dryRun: false,
    totalCreated: created.length,
    created,
    dependencies,
    missingDependencies: [],
    provided: { items: itemsArray },
    missing: []
  };
}

module.exports = { run };

/* ---------------------------------------------------------------------------
   Postman Test Documentation (examples for Items)

   1) Create single item (POST /api/items)
   Endpoint: POST http://localhost:3000/api/items
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   {
     "sku": "BB-ITEM-001",
     "title": "Organic Almonds 1kg",
     "slug": "bb-item-001-organic-almonds-1kg",
     "price": [{ "list": 12.00, "currency": "USD" }],
     "inventory": { "stock": 100 }
   }

   2) Bulk insert items (POST /api/items/bulk)
   Endpoint: POST http://localhost:3000/api/items/bulk
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON): Array of item objects (same shape as create). Example:
   [
     { "sku": "BB-ITEM-001", "title": "Organic Almonds 1kg", "slug": "bb-item-001-organic-almonds-1kg", "price": [{ "list": 12.00 }] },
     { "sku": "BB-ITEM-002", "title": "Premium Olive Oil 500ml", "slug": "bb-item-002-premium-olive-oil-500ml", "price": [{ "list": 14.00 }] }
   ]

   Helpful notes:
   - Ensure `sku` and `slug` are deterministic and unique to avoid duplicate-key errors.
   - The seed checks existing SKUs and only inserts new SKUs; it will fetch existing docs to build dependencies.
   - When using bulk endpoints, check returned result shapes (`insertedIds`, `ops`) and normalize to actual `_id` arrays for orchestrator provided values.
--------------------------------------------------------------------------- */
