// src/config/db-seeds/seed-db-models.products.js
/**
 * Seed script for Products collection (surgical adjustments)
 *
 * Purpose:
 *  - Prepare deterministic product payloads that reference items via placeholders.
 *  - Resolve item placeholders from orchestrator-provided deps at runtime.
 *  - Ensure each product has deterministic slug and required salesPrices fields.
 *  - Attempt to persist payloads (bulk insert) when not dryRun; fall back to robust upserts and final fetch.
 *  - Return canonical shapes: created[], dependencies (map), provided: { products: [ids] }.
 */

// src/config/db-seeds/seed-db-models.products.js
/**
 * Seed script for Products collection (surgical, non-disruptive)
 *
 * Requirements satisfied:
 *  - Uses orchestrator-provided deps.items (array) and deps.itemsMap (map) or flat keys.
 *  - Skips seeding when collection already contains documents unless force=true.
 *  - Ensures required nested fields (items.itemId and salesPrices.price,currency,from,to).
 *  - Attempts bulk insert; falls back to idempotent upserts.
 *  - Returns canonical shape: created[], dependencies (map), provided: { products: [ids] }.
 */

const mongoose = require('mongoose');
const ProductRepo = require('../../repositories/product.repo');
const ProductModel = require('../../models/product.model');

const DEFAULT_LOGGER = console;

function makeLogger(logger) {
  if (!logger) return DEFAULT_LOGGER;
  return {
    info: logger.info || logger.log || DEFAULT_LOGGER.log,
    warn: logger.warn || logger.warn || DEFAULT_LOGGER.warn,
    error: logger.error || logger.error || DEFAULT_LOGGER.error
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

/* -------------------------
 * Deps lookup helpers
 * ------------------------- */

/**
 * Build a lookup map from orchestrator deps.
 * Accepts:
 *  - deps.items: array of ids (preferred for simple lists)
 *  - deps.itemsMap: { 'BB-ITEM-000': 'id' }
 *  - flat keys: { 'BB-ITEM-000': 'id' }
 *
 * Returns { map, itemsArray } where map[key] -> id and itemsArray is deps.items (if present).
 */
function buildDepsLookup(deps = {}) {
  const map = {};
  const itemsArray = Array.isArray(deps.items) ? deps.items.slice() : [];

  // explicit itemsMap
  if (deps.itemsMap && typeof deps.itemsMap === 'object') {
    for (const [k, v] of Object.entries(deps.itemsMap)) {
      if (typeof v === 'string') map[k] = v;
    }
  }

  // flat keys (e.g., 'BB-ITEM-000': '69...')
  for (const [k, v] of Object.entries(deps || {})) {
    if (!k) continue;
    if (k === 'items' || k === 'itemsMap') continue;
    if (typeof v === 'string') map[k] = v;
    // if value is array of ids under an unexpected key, merge into itemsArray fallback
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') {
      // avoid duplicating canonical deps.items
      if (k !== 'items') itemsArray.push(...v.filter((x) => typeof x === 'string'));
    }
  }

  return { map, itemsArray };
}

/**
 * Resolve placeholder token to id.
 * Supported formats:
 *  - "{{items.BB-ITEM-000}}", "{{BB-ITEM-000}}", "items.BB-ITEM-000", "BB-ITEM-000"
 * If only itemsArray is available, map numeric suffix (000 -> index 0) to index.
 */
function resolvePlaceholderToken(token, lookup = { map: {}, itemsArray: [] }) {
  if (!token || typeof token !== 'string') return null;
  const s = token.trim();
  const curly = s.match(/^\{\{\s*(.+?)\s*\}\}$/);
  const inner = curly ? curly[1] : s;
  const parts = inner.split('.');
  const key = parts.length === 2 ? parts[1] : parts[0];

  // direct map lookup
  if (lookup.map && lookup.map[key]) return lookup.map[key];

  // if itemsArray exists, try numeric suffix mapping: BB-ITEM-000 -> 0
  const skuMatch = key.match(/(\d+)$/);
  if (skuMatch && Array.isArray(lookup.itemsArray) && lookup.itemsArray.length > 0) {
    const parsed = parseInt(skuMatch[1], 10);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed < lookup.itemsArray.length) {
      return lookup.itemsArray[parsed];
    }
    // also try zero-trimmed parse
    const trimmed = Number(skuMatch[1].replace(/^0+/, '') || '0');
    if (!Number.isNaN(trimmed) && trimmed >= 0 && trimmed < lookup.itemsArray.length) {
      return lookup.itemsArray[trimmed];
    }
  }

  // items.<index> style
  if (parts.length === 2 && /^\d+$/.test(parts[1]) && Array.isArray(lookup.itemsArray)) {
    const idx = Number(parts[1]);
    return lookup.itemsArray[idx] || null;
  }

  // fallback: if inner === 'items' return first
  if ((inner === 'items' || key === 'items') && Array.isArray(lookup.itemsArray) && lookup.itemsArray.length > 0) {
    return lookup.itemsArray[0];
  }

  return null;
}

/* -------------------------
 * Product payload builder
 * ------------------------- */

function makeProductPayload(index) {
  const names = [
    'Breakfast Essentials Pack',
    'Pantry Staples Bundle',
    'Organic Snacks Collection',
    'Beverage Variety Case',
    'Baking & Pantry Kit'
  ];
  const name = names[index % names.length];
  const now = Date.now();
  const sku = `BB-PROD-${String(index).padStart(3, '0')}`;
  const slug = slugify(`${sku}-${name}`);
  const defaultFrom = now - 24 * 3600 * 1000;
  const defaultTo = now + 24 * 3600 * 1000;

  // Each product gets 2 DIFFERENT items based on index
  const itemA = `BB-ITEM-${String(index * 2).padStart(3, '0')}`;
  const itemB = `BB-ITEM-${String(index * 2 + 1).padStart(3, '0')}`;
  const priceA = Number((10 + index * 3).toFixed(2));  // 10, 13, 16, 19, 22
  const priceB = Number((8 + index * 2).toFixed(2));  // 8,  10, 12, 14, 16

  return {
    sku,
    name,
    slug,
    descriptions: [
      { locale: 'en', title: name, body: `${name} — curated selection of high-demand items.` }
    ],
    items: [
      { itemId: `{{items.${itemA}}}`, salesPrices: [{ price: priceA, currency: 'USD', from: defaultFrom, to: defaultTo }] },
      { itemId: `{{items.${itemB}}}`, salesPrices: [{ price: priceB, currency: 'USD', from: defaultFrom, to: defaultTo }] }
    ],
    discountScheme: { type: 'tiered', tiers: [{ minQty: 10, discountPct: 5 }] },
    salesWindow: { fromEpoch: now - 7 * 24 * 3600 * 1000, toEpoch: now + 7 * 24 * 3600 * 1000 },
    ops_region: 'NA',
    metadata: { origin: 'seed', seededAt: now },
    estimatedSavings: Number(((priceA + priceB) * 0.05).toFixed(2)),
    status: 'active',
    deleted: false
  };
}

/* -------------------------
 * Resolve placeholders in payloads using orchestrator deps
 * ------------------------- */

function resolvePayloadPlaceholders(payloads = [], deps = {}) {
  const lookup = buildDepsLookup(deps || {});
  const missing = new Set();

  const resolved = payloads.map((p) => {
    const copy = JSON.parse(JSON.stringify(p));
    if (Array.isArray(copy.items)) {
      copy.items = copy.items.map((it) => {
        const out = Object.assign({}, it);
        if (out && typeof out.itemId === 'string') {
          const resolvedId = resolvePlaceholderToken(out.itemId, lookup);
          if (resolvedId) {
            // ensure ObjectId type for mongoose
            try {
              out.itemId = mongoose.Types.ObjectId(resolvedId);
            } catch (e) {
              out.itemId = resolvedId;
            }
          } else {
            missing.add(out.itemId);
          }
        }
        // ensure salesPrices entries have required fields
        if (Array.isArray(out.salesPrices)) {
          const now = Date.now();
          for (const sp of out.salesPrices) {
            if (sp.price === undefined || sp.price === null) sp.price = 0;
            if (!sp.currency) sp.currency = 'USD';
            if (!sp.from) sp.from = now - 24 * 3600 * 1000;
            if (!sp.to) sp.to = now + 24 * 3600 * 1000;
          }
        } else {
          const now = Date.now();
          out.salesPrices = [{ price: 0, currency: 'USD', from: now - 24 * 3600 * 1000, to: now + 24 * 3600 * 1000 }];
        }
        return out;
      });
    }
    return copy;
  });

  return { resolvedPayloads: resolved, missing: Array.from(missing) };
}

/* -------------------------
 * Main run
 * ------------------------- */

async function run(opts = {}) {
  const { force = false, dryRun = false, logger: rawLogger = DEFAULT_LOGGER, deps = {} } = opts;
  const logger = makeLogger(rawLogger);

  if (!mongoose || !mongoose.connection) {
    throw new Error('Mongoose is not available. Connect to MongoDB before running seeds.');
  }
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Mongoose is not connected. Connect to MongoDB before running seeds.');
  }

  const db = mongoose.connection.db;

  // Prevent accidental reseed: skip if collection has documents and force is false
  try {
    const coll = db.collection('products');
    const existingCount = await coll.countDocuments();
    if (existingCount > 0 && !force) {
      logger.info(`seed-db-models.products: skipping seeding because "products" collection already contains ${existingCount} documents. Use force=true to override.`);
      return { skipped: true, existingCount, created: [], provided: {} };
    }
  } catch (err) {
    logger.warn('seed-db-models.products: could not determine existing product count; proceeding with seeding.', err && err.message ? err.message : err);
  }

  // Build payloads
  const payloads = [];
  for (let i = 0; i < 5; i++) payloads.push(makeProductPayload(i));

  // Resolve placeholders using orchestrator-provided deps
  const { resolvedPayloads, missing } = resolvePayloadPlaceholders(payloads, deps || {});
  if (missing && missing.length > 0) {
    logger.warn(`seed-db-models.products: unresolved item placeholders: ${missing.join(', ')}`);
  }

  if (dryRun) {
    logger.info('seed-db-models.products: dry run - previewing payloads (no persistence).');
    return {
      skipped: false,
      dryRun: true,
      preview: resolvedPayloads,
      payloads: resolvedPayloads,
      created: [],
      dependencies: {},
      missingDependencies: missing,
      provided: {},
      missing
    };
  }

  logger.info(`seed-db-models.products: attempting to persist ${resolvedPayloads.length} products.`);

  // Attempt bulk insert
  let rawInserted;
  try {
    if (ProductRepo && typeof ProductRepo.bulkInsert === 'function') {
      rawInserted = await ProductRepo.bulkInsert(resolvedPayloads, { ordered: false });
    } else {
      rawInserted = await ProductModel.insertMany(resolvedPayloads, { ordered: false });
    }
    logger.info('seed-db-models.products: bulk insert completed.');
  } catch (err) {
    logger.error('seed-db-models.products: bulkInsert failed:', err && err.message ? err.message : err);
    logger.info('seed-db-models.products: falling back to per-product upsert for idempotency.');

    rawInserted = [];
    for (const payload of resolvedPayloads) {
      try {
        if (!payload.slug) payload.slug = slugify(`${payload.sku || payload.name}-${payload.name || ''}`);

        const query = payload.sku ? { sku: payload.sku } : { name: payload.name };
        const update = { $set: payload, $setOnInsert: { createdAt: Date.now() } };
        const optsUpsert = { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true };

        let doc;
        if (ProductRepo && typeof ProductRepo.upsert === 'function') {
          try {
            doc = await ProductRepo.upsert(query, payload, { returnDocument: 'after' });
          } catch (repoErr) {
            logger.warn(`ProductRepo.upsert failed for ${payload.sku || payload.name}:`, repoErr && repoErr.message ? repoErr.message : repoErr);
            doc = await ProductModel.findOne(query).exec();
          }
        } else {
          doc = await ProductModel.findOneAndUpdate(query, update, optsUpsert).exec();
        }

        if (doc) rawInserted.push(doc);
        else {
          const existing = await ProductModel.findOne(query).exec();
          if (existing) rawInserted.push(existing);
        }
      } catch (e) {
        logger.error(`seed-db-models.products: failed to upsert product ${payload.sku || payload.name}:`, e && e.message ? e.message : e);
        try {
          const existing = await ProductModel.findOne({ sku: payload.sku }).exec();
          if (existing) rawInserted.push(existing);
        } catch (fetchErr) {
          logger.error('seed-db-models.products: failed to fetch existing product after upsert error:', fetchErr && fetchErr.message ? fetchErr.message : fetchErr);
        }
      }
    }
  }

  // Ensure final docs by querying DB for all product SKUs/names
  const queryOr = resolvedPayloads.map((p) => (p.sku ? { sku: p.sku } : { name: p.name }));
  let finalDocs = [];
  try {
    finalDocs = await ProductModel.find({ $or: queryOr }).lean().exec();
  } catch (err) {
    logger.warn('seed-db-models.products: failed to fetch final product docs; normalizing from rawInserted.', err && err.message ? err.message : err);
    finalDocs = Array.isArray(rawInserted) ? rawInserted.map((d) => (d && d.toObject ? d.toObject() : d)) : [];
  }

  const inserted = Array.isArray(finalDocs) ? finalDocs : [];

  // Build dependencies map and created list
  const dependencies = {};
  const created = [];
  for (const doc of inserted) {
    const id = doc && (doc._id ? String(doc._id) : (doc.id ? String(doc.id) : null));
    const sku = doc && (doc.sku || null);
    const name = doc && (doc.name || null);
    if (sku && id) dependencies[sku] = id;
    else if (name && id) dependencies[name] = id;
    created.push({ _id: id, sku, name });
  }

  const productsArray = Object.values(dependencies).filter(Boolean);

  logger.info(`seed-db-models.products: persisted ${created.length} products.`);

  return {
    skipped: false,
    dryRun: false,
    payloads: resolvedPayloads,
    created,
    dependencies,
    missingDependencies: missing,
    provided: { products: productsArray },
    missing
  };
}

module.exports = { run };


/* ---------------------------------------------------------------------------
   Postman Test Documentation (tail-end, original-style notes)

   1) Create single product (POST /api/prdts)
   Endpoint: POST http://localhost:3000/api/prdts
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON):
   {
     "sku": "BB-PROD-001",
     "name": "Retail Essentials Pack",
     "slug": "bb-prod-001-retail-essentials-pack",
     "descriptions": [{ "locale": "en", "title": "Retail Essentials Pack", "body": "Curated essentials for small retailers." }],
     "items": [
       { "itemId": "603d2f1b8f1b2c0012345678", "salesPrices": [{ "price": 29.99, "currency": "USD" }] }
     ],
     "discountScheme": { "type": "tiered", "tiers": [{ "minQty": 10, "discountPct": 5 }] },
     "salesWindow": { "fromEpoch": 1700000000000, "toEpoch": 1702592000000 },
     "ops_region": "NA",
     "metadata": { "notes": "Launched for Q3 promotion" },
     "status": "active"
   }

   2) Bulk insert products (POST /api/prdts/bulk)
   Endpoint: POST http://localhost:3000/api/prdts/bulk
   Headers:
     - Authorization: Bearer <token>
     - Content-Type: application/json
   Body (JSON): Array of product objects (same shape as create). Example:
   [
     {
       "sku": "BB-PROD-001",
       "name": "Snack Sampler",
       "descriptions": [{ "locale": "en", "title": "Snack Sampler", "body": "Assorted snacks for convenience stores." }],
       "items": [{ "itemId": "603d2f1b8f1b2c0012345680", "salesPrices": [{ "price": 12.99, "currency": "USD" }] }],
       "status": "active"
     },
     {
       "sku": "BB-PROD-002",
       "name": "Beverage Case",
       "descriptions": [{ "locale": "en", "title": "Beverage Case", "body": "Mixed beverages case for cafes." }],
       "items": [{ "itemId": "603d2f1b8f1b2c0012345681", "salesPrices": [{ "price": 24.99, "currency": "USD" }] }],
       "status": "active"
     }
   ]

   Helpful notes:
   - Product payloads include item placeholders like "{{items.BB-ITEM-000}}". Resolve placeholders before calling API or let orchestrator resolve them.
   - Ensure `sku` and `slug` are deterministic and unique to avoid duplicate-key errors.
   - When using bulk endpoints, check returned result shapes (`insertedIds`, `ops`) and normalize to actual `_id` arrays for orchestrator `provided` values.
--------------------------------------------------------------------------- */
