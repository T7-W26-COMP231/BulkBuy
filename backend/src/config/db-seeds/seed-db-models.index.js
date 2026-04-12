// src/config/db-seeds/seed-db-models.index.js
/**
 * Orchestrator for model seed scripts (final surgical)
 *
 * Behavior:
 *  - Uses a single canonical marker collection `seed_metadata` to indicate DB seeding.
 *  - If marker exists and --force is NOT provided, the orchestrator will skip all seeding.
 *  - If --force IS provided, the orchestrator will run, but will skip any individual seed
 *    whose target collection already contains documents (per-collection guard).
 *  - Preserves canonical arrays (items, products, ...) and explicit maps (itemsMap, <key>Map).
 *  - Passes accumulated deps into each seed via opts.deps so downstream seeds (products) can resolve placeholders.
 *  - Continues on single-seed errors and records a final summary.
 *
 * Usage:
 *   node src/config/db-seeds/seed-db-models.index.js --force
 */

const mongoose = require('mongoose');
const path = require('path');

const LEGACY_MARKER_COLLECTION = 'seed_metadata';
const MARKER_NAME = 'seed-db-models';
const MARKER_VERSION = 'v1';

function makeLogger(logger) {
  if (!logger) return console;
  const safe = {};
  ['info', 'warn', 'error', 'debug', 'log'].forEach((k) => {
    safe[k] = typeof logger[k] === 'function' ? logger[k].bind(logger) : console[k].bind(console);
  });
  return safe;
}

/* -------------------------
 * Marker helpers (single canonical collection: seed_metadata)
 * ------------------------- */

async function getSeedMarker(db) {
  try {
    const coll = db.collection(LEGACY_MARKER_COLLECTION);
    const doc = await coll.findOne({ name: MARKER_NAME });
    return doc || null;
  } catch (e) {
    return null;
  }
}

async function setSeedMarker(db, payload = {}) {
  const coll = db.collection(LEGACY_MARKER_COLLECTION);
  const now = Date.now();
  const doc = {
    name: MARKER_NAME,
    version: MARKER_VERSION,
    seededAt: now,
    summary: payload.summary || {},
    seeds: payload.seeds || [],
    updatedAt: now
  };
  await coll.updateOne({ name: MARKER_NAME }, { $set: doc }, { upsert: true });
  return doc;
}

/* -------------------------
 * Merge / normalize helpers
 * ------------------------- */

function mergeProvided(globalDeps, provided = {}) {
  for (const [k, v] of Object.entries(provided || {})) {
    if (!k) continue;

    if (!globalDeps[k]) globalDeps[k] = [];

    if (Array.isArray(v)) {
      globalDeps[k].push(...v.filter((x) => x !== undefined && x !== null));
      continue;
    }

    if (typeof v === 'string') {
      globalDeps[k].push(v);
      continue;
    }

    if (v && typeof v === 'object') {
      const isFlatMap = Object.values(v).every((val) => typeof val === 'string' || (Array.isArray(val) && typeof val[0] === 'string'));
      if (isFlatMap) {
        const mapKey = `${k}Map`;
        if (!globalDeps[mapKey] || typeof globalDeps[mapKey] !== 'object') globalDeps[mapKey] = {};
        for (const [kk, vv] of Object.entries(v)) {
          if (Array.isArray(vv) && vv.length > 0 && typeof vv[0] === 'string') {
            globalDeps[mapKey][kk] = vv[0];
            globalDeps[k].push(vv[0]);
          } else if (typeof vv === 'string') {
            globalDeps[mapKey][kk] = vv;
            globalDeps[k].push(vv);
          }
        }
        continue;
      }

      for (const [subk, subv] of Object.entries(v)) {
        if (!subk) continue;
        if (!globalDeps[subk]) globalDeps[subk] = [];
        if (Array.isArray(subv)) {
          globalDeps[subk].push(...subv.filter((x) => x !== undefined && x !== null));
        } else if (typeof subv === 'string') {
          globalDeps[subk].push(subv);
        } else if (subv && typeof subv === 'object') {
          const subMapKey = `${subk}Map`;
          if (!globalDeps[subMapKey] || typeof globalDeps[subMapKey] !== 'object') globalDeps[subMapKey] = {};
          for (const [kk, vv] of Object.entries(subv)) {
            if (Array.isArray(vv) && vv.length > 0 && typeof vv[0] === 'string') {
              globalDeps[subMapKey][kk] = vv[0];
              globalDeps[subk].push(vv[0]);
            } else if (typeof vv === 'string') {
              globalDeps[subMapKey][kk] = vv;
              globalDeps[subk].push(vv);
            }
          }
        }
      }
      continue;
    }

    if (v !== undefined && v !== null) {
      globalDeps[k].push(v);
    }
  }

  for (const key of Object.keys(globalDeps)) {
    if (Array.isArray(globalDeps[key])) {
      globalDeps[key] = Array.from(new Set(globalDeps[key]));
    }
  }

  return globalDeps;
}

function normalizeProvidedShape(provided = {}) {
  if (!provided || typeof provided !== 'object') return provided || {};

  const canonicalKeys = [
    'items',
    'products',
    'users',
    'configs',
    'salesWindows',
    'supplies',
    'orders',
    'messages',
    'regionMaps',
    'reviews',
    'aggregations'
  ];

  for (const k of canonicalKeys) {
    if (Object.prototype.hasOwnProperty.call(provided, k)) return provided;
  }

  const vals = Object.values(provided);
  if (vals.length === 0) return provided;

  const allIdsOrArrays = vals.every((v) => {
    if (typeof v === 'string') return true;
    if (Array.isArray(v)) return v.every((x) => typeof x === 'string');
    return false;
  });

  if (allIdsOrArrays) {
    const flattened = [];
    const map = {};
    for (const [k, v] of Object.entries(provided)) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') {
        flattened.push(...v.filter(Boolean));
        map[k] = v[0];
      } else if (typeof v === 'string') {
        flattened.push(v);
        map[k] = v;
      }
    }
    const out = Object.assign({}, provided, { items: Array.from(new Set(flattened)) });
    out.itemsMap = Object.assign({}, map);
    return out;
  }

  return provided;
}

/* -------------------------
 * Placeholder resolver (unchanged)
 * ------------------------- */

function resolveMissingPlaceholders(missingEntries = [], globalDeps = {}, logger = console) {
  const resolved = [];
  const unresolved = [];

  for (const m of missingEntries) {
    let resolvedValue = null;

    if (!m || (typeof m !== 'object' && typeof m !== 'string')) {
      unresolved.push(m);
      continue;
    }

    if (typeof m.placeholder === 'string') {
      const s = m.placeholder.trim();
      const curly = s.match(/^\{\{\s*([a-zA-Z0-9_]+)(?:\.(\d+))?\s*\}\}$/);
      if (curly) {
        const key = curly[1];
        const idx = curly[2] !== undefined ? parseInt(curly[2], 10) : 0;
        if (Array.isArray(globalDeps[key]) && globalDeps[key].length > idx) {
          resolvedValue = globalDeps[key][idx];
        } else if (globalDeps[`${key}Map`] && typeof globalDeps[`${key}Map`] === 'object') {
          const mapKeys = Object.keys(globalDeps[`${key}Map`]);
          if (mapKeys.length > idx) resolvedValue = globalDeps[`${key}Map`][mapKeys[idx]];
        }
      } else {
        const plain = s.match(/^([a-zA-Z0-9_]+)(?:\.(\d+))?$/);
        if (plain) {
          const key = plain[1];
          const idx = plain[2] !== undefined ? parseInt(plain[2], 10) : 0;
          if (Array.isArray(globalDeps[key]) && globalDeps[key].length > idx) {
            resolvedValue = globalDeps[key][idx];
          } else if (globalDeps[`${key}Map`] && typeof globalDeps[`${key}Map`] === 'object') {
            const mapKeys = Object.keys(globalDeps[`${key}Map`]);
            if (mapKeys.length > idx) resolvedValue = globalDeps[`${key}Map`][mapKeys[idx]];
          }
        } else if (globalDeps[s] && Array.isArray(globalDeps[s]) && globalDeps[s].length > 0) {
          resolvedValue = globalDeps[s][0];
        } else if (globalDeps[`${s}Map`] && typeof globalDeps[`${s}Map`] === 'object') {
          const mapVals = Object.values(globalDeps[`${s}Map`]);
          if (mapVals.length > 0) resolvedValue = mapVals[0];
        }
      }
    } else if (typeof m.placeholder === 'object' && m.placeholder !== null) {
      const key = m.placeholder.key || m.placeholder.k;
      const idx = Number.isFinite(Number(m.placeholder.index)) ? Number(m.placeholder.index) : 0;
      if (key && Array.isArray(globalDeps[key]) && globalDeps[key].length > idx) {
        resolvedValue = globalDeps[key][idx];
      } else if (key && globalDeps[`${key}Map`] && typeof globalDeps[`${key}Map`] === 'object') {
        const mapKeys = Object.keys(globalDeps[`${key}Map`]);
        if (mapKeys.length > idx) resolvedValue = globalDeps[`${key}Map`][mapKeys[idx]];
      }
    } else if (typeof m === 'string') {
      const s = m.trim();
      const plain = s.match(/^([a-zA-Z0-9_]+)(?:\.(\d+))?$/);
      if (plain) {
        const key = plain[1];
        const idx = plain[2] !== undefined ? parseInt(plain[2], 10) : 0;
        if (Array.isArray(globalDeps[key]) && globalDeps[key].length > idx) {
          resolvedValue = globalDeps[key][idx];
        } else if (globalDeps[`${key}Map`] && typeof globalDeps[`${key}Map`] === 'object') {
          const mapKeys = Object.keys(globalDeps[`${key}Map`]);
          if (mapKeys.length > idx) resolvedValue = globalDeps[`${key}Map`][mapKeys[idx]];
        }
      }
    }

    if (resolvedValue !== null && resolvedValue !== undefined) {
      resolved.push({ missing: m, resolvedTo: resolvedValue });
    } else {
      unresolved.push(m);
    }
  }

  logger.info && logger.info(`Resolved ${resolved.length} placeholders; ${unresolved.length} unresolved.`);
  return { resolved, unresolved };
}

/* -------------------------
 * Load seed module helper
 * ------------------------- */

function loadSeedModule(name) {
  const p = path.resolve(__dirname, `./seed-db-models.${name}.js`);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const mod = require(p);
  if (!mod) throw new Error(`seed module at "${p}" is empty`);
  if (typeof mod === 'function') return mod;
  if (typeof mod.run === 'function') return mod.run.bind(mod);
  if (mod.default && typeof mod.default === 'function') return mod.default;
  throw new Error(`seed module for "${name}" does not export a function or { run: fn }`);
}

/* -------------------------
 * Main run
 * ------------------------- */

async function run(opts = {}) {
  const o = {
    force: !!opts.force,
    dryRun: !!opts.dryRun,
    logger: makeLogger(opts.logger || console)
  };
  const logger = o.logger;

  logger.info('[seed-index] starting seed run', { force: o.force, dryRun: o.dryRun });

  if (!mongoose || !mongoose.connection) {
    const msg = '[seed-index] mongoose is not available. Connect to MongoDB before running seeds.';
    logger.error(msg);
    throw new Error(msg);
  }
  if (mongoose.connection.readyState !== 1) {
    const msg = '[seed-index] mongoose is not connected. Connect to MongoDB before running seeds.';
    logger.error(msg);
    throw new Error(msg);
  }

  const db = mongoose.connection.db;

  // Read existing marker once
  let existingMarker = null;
  let existingAppliedSeeds = [];
  try {
    existingMarker = await getSeedMarker(db);
    if (existingMarker && Array.isArray(existingMarker.seeds) && existingMarker.seeds.length > 0) {
      existingAppliedSeeds = existingMarker.seeds.slice();
      logger.info('[seed-index] found previous seed_metadata with applied seeds:', existingAppliedSeeds);
    } else if (existingMarker) {
      logger.info('[seed-index] found previous seed_metadata (no per-seed list).');
    } else {
      logger.info('[seed-index] no seed_metadata found; proceeding with seeding.');
    }
  } catch (err) {
    logger.warn('[seed-index] failed to read seed_metadata; continuing with seeding', err && err.message ? err.message : err);
  }

  // If marker exists and force is NOT provided, skip all seeding immediately.
  if (existingMarker && !o.force) {
    logger.info('[seed-index] seed_metadata exists and --force not provided; skipping all seeding.');
    return {
      success: true,
      summary: {
        startedAt: new Date().toISOString(),
        seedOrder: [],
        seedResults: [],
        provided: {},
        perSeedProvided: {},
        missing: [],
        resolved: [],
        unresolved: [],
        marker: existingMarker,
        errors: []
      }
    };
  }

  // Order tuned for dependencies (items before products)
  const seedOrder = [
    'users',
    'configs',
    'items',
    'products',
    'salesWindows',
    'supplies',
    'orders',
    'messages',
    'regionMaps',
    'reviews',
    'aggregations'
  ];

  // Load seed modules
  const seeds = [];
  for (const name of seedOrder) {
    try {
      const fn = loadSeedModule(name);
      seeds.push({ name, fn });
    } catch (err) {
      logger.error(`[seed-index] failed to load seed module for "${name}": ${err && err.message ? err.message : err}`);
      seeds.push({ name, fn: null, loadError: err });
    }
  }

  const globalDeps = {};
  const perSeedProvided = {};
  const allMissing = [];
  const seedResults = [];
  const seedErrors = [];
  const newlyAppliedSeeds = [];

  const useTransaction = false;
  let session = null;
  if (useTransaction) {
    session = await mongoose.startSession();
    session.startTransaction();
    logger.info('[seed-index] started mongoose transaction for seeding');
  }

  try {
    for (const s of seeds) {
      logger.info(`[seed-index] preparing to run seed: ${s.name}`, { dryRun: o.dryRun });

      if (!s.fn) {
        const msg = `Seed module "${s.name}" could not be loaded; skipping execution but continuing run.`;
        logger.error('[seed-index] ' + msg, s.loadError && s.loadError.message ? s.loadError.message : s.loadError);
        seedResults.push({ name: s.name, createdCount: 0, providedKeys: 0, missingCount: 0, skipped: true, error: msg });
        seedErrors.push({ name: s.name, error: s.loadError ? (s.loadError.message || String(s.loadError)) : 'module load failed' });
        continue;
      }

      // If this seed was recorded in marker and force is false, skip it.
      if (!o.force && existingAppliedSeeds.includes(s.name)) {
        logger.info(`[seed-index] skipping seed "${s.name}" because it is recorded in seed_metadata and --force was not provided.`);
        seedResults.push({ name: s.name, createdCount: 0, providedKeys: 0, missingCount: 0, skipped: true });
        continue;
      }

      // If force is true, perform per-collection check: skip this seed if the collection already has documents.
      // If force is false, we already returned earlier when marker existed; here force is true so we check collection.
      let skipDueToCollection = false;
      try {
        const coll = db.collection(s.name);
        const existingCount = await coll.countDocuments();
        if (existingCount > 0 && o.force) {
          logger.info(`[seed-index] skipping seed "${s.name}" because collection "${s.name}" already contains ${existingCount} documents (force=true still respects existing data).`);
          seedResults.push({ name: s.name, createdCount: 0, providedKeys: 0, missingCount: 0, skipped: true });
          skipDueToCollection = true;
        }
      } catch (countErr) {
        logger.warn(`[seed-index] could not determine existing document count for collection "${s.name}": ${countErr && countErr.message ? countErr.message : countErr}. Proceeding to run seed.`);
      }
      if (skipDueToCollection) continue;

      // Pass accumulated globalDeps into each seed
      const seedOpts = {
        deps: { ...globalDeps },
        force: o.force,
        dryRun: o.dryRun,
        logger,
        session
      };

      let result;
      try {
        result = await s.fn(seedOpts);
      } catch (err) {
        logger.error(`[seed-index] seed "${s.name}" threw an error but run will continue: ${err && err.message ? err.message : err}`, err && err.stack ? err.stack : '');
        seedErrors.push({ name: s.name, error: err && err.message ? err.message : String(err) });
        result = result || {};
      }

      // Normalize result shapes
      const created = Array.isArray(result && result.created) ? result.created : (result && result.created ? [result.created] : []);
      const providedRaw = (result && (result.provided || result.dependencies)) ? (result.provided || result.dependencies) : {};
      const provided = normalizeProvidedShape(providedRaw);

      perSeedProvided[s.name] = providedRaw;

      const missing = Array.isArray(result && result.missing)
        ? result.missing
        : (Array.isArray(result && result.missingDependencies)
          ? result.missingDependencies
          : (result && result.missing ? [result.missing] : (result && result.missingDependencies ? [result.missingDependencies] : [])));

      try {
        mergeProvided(globalDeps, provided);
      } catch (err) {
        logger.error(`[seed-index] failed to merge provided dependencies from seed "${s.name}": ${err && err.message ? err.message : err}`);
        seedErrors.push({ name: s.name, error: `mergeProvided failed: ${err && err.message ? err.message : String(err)}` });
      }

      for (const m of missing) {
        allMissing.push(Object.assign({}, m, { seedName: s.name }));
      }

      // Record seed as newly applied (executed)
      newlyAppliedSeeds.push(s.name);

      seedResults.push({
        name: s.name,
        createdCount: created.length,
        providedKeys: Object.keys(provided || {}).length,
        missingCount: missing.length,
        skipped: !!(result && result.skipped),
        rawResultSummary: (result && result.summary) ? result.summary : undefined
      });

      logger.info(`[seed-index] seed "${s.name}" finished. created=${created.length} providedKeys=${Object.keys(provided || {}).length} missing=${missing.length} skipped=${!!(result && result.skipped)}`);
    }

    // Resolve placeholders using accumulated globalDeps
    const { resolved, unresolved } = resolveMissingPlaceholders(allMissing, globalDeps, logger);

    // Group resolved by seedName and attempt to patch via optional patchPlaceholders export
    const perSeedResolved = {};
    for (const r of resolved) {
      const seedName = r.missing.seedName || 'unknown';
      perSeedResolved[seedName] = perSeedResolved[seedName] || [];
      perSeedResolved[seedName].push(r);
    }

    for (const [seedName, entries] of Object.entries(perSeedResolved)) {
      try {
        const mod = require(path.resolve(__dirname, `./seed-db-models.${seedName}.js`));
        if (mod && typeof mod.patchPlaceholders === 'function') {
          logger.info(`[seed-index] applying ${entries.length} resolved placeholders for seed "${seedName}" via patchPlaceholders`);
          try {
            await mod.patchPlaceholders({ resolvedEntries: entries, globalDeps, dryRun: o.dryRun, logger, session });
          } catch (err) {
            logger.error(`[seed-index] patchPlaceholders for "${seedName}" failed: ${err && err.message ? err.message : err}`);
            seedErrors.push({ name: seedName, error: `patchPlaceholders failed: ${err && err.message ? err.message : String(err)}` });
          }
        } else {
          logger.info(`[seed-index] seed "${seedName}" does not implement patchPlaceholders; skipping automatic patching for ${entries.length} items`);
        }
      } catch (err) {
        logger.warn(`[seed-index] failed to patch placeholders for seed "${seedName}": ${err && err.message ? err.message : err}`);
        seedErrors.push({ name: seedName, error: `patchPlaceholders load failed: ${err && err.message ? err.message : String(err)}` });
      }
    }

    if (unresolved.length > 0) {
      logger.warn(`[seed-index] ${unresolved.length} placeholders remain unresolved after best-effort resolution.`);
    }

    if (useTransaction && session) {
      await session.commitTransaction();
      session.endSession();
      logger.info('[seed-index] transaction committed');
    }

    // Compose final applied seeds list: preserve previously recorded seeds and append newly applied ones (deduped)
    const finalAppliedSeeds = Array.from(new Set([...(existingAppliedSeeds || []), ...(newlyAppliedSeeds || [])]));

    // Write marker to single canonical collection seed_metadata unless dryRun
    let marker = null;
    if (!o.dryRun) {
      try {
        marker = await setSeedMarker(db, { summary: { seedCount: seedResults.length, unresolvedCount: unresolved.length, errors: seedErrors.length }, seeds: finalAppliedSeeds });
        logger.info('[seed-index] seed_metadata written with per-seed list.');
      } catch (err) {
        logger.warn('[seed-index] failed to write seed_metadata', err && err.message ? err.message : err);
        seedErrors.push({ name: 'marker', error: err && err.message ? err.message : String(err) });
      }
    } else {
      logger.info('[seed-index] dryRun=true; not writing seed_metadata');
    }

    const summary = {
      startedAt: new Date().toISOString(),
      seedOrder,
      seedResults,
      provided: globalDeps,
      perSeedProvided,
      missing: allMissing,
      resolved,
      unresolved,
      marker,
      errors: seedErrors,
      appliedSeeds: finalAppliedSeeds
    };

    logger.info('[seed-index] seeding complete', { seedsApplied: seedResults.length, unresolved: unresolved.length, errors: seedErrors.length });
    return { success: seedErrors.length === 0, summary };
  } catch (err) {
    if (useTransaction && session) {
      try { await session.abortTransaction(); session.endSession(); } catch (e) { /* ignore */ }
    }
    logger.error('[seed-index] seeding failed (fatal)', err && err.message ? err.message : err);
    throw err;
  }
}

/* -------------------------
 * CLI runner
 * ------------------------- */
if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    const opts = {
      force: argv.includes('--force'),
      dryRun: argv.includes('--dryRun') || argv.includes('--dry-run'),
      logger: console
    };

    try {
      if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        try {
          // eslint-disable-next-line global-require, import/no-dynamic-require
          const connectDB = require('../../config/db');
          const env = require('../../config/env');
          await connectDB(env.mongoUri);
          console.log('[seed-index][cli] connected to mongo via config/db');
        } catch (e) {
          console.warn('[seed-index][cli] mongoose not connected and config/db could not be required. Please connect before running seeds.');
        }
      }

      const result = await run(opts);
      console.log('Seed run result summary:', JSON.stringify(result.summary || {}, null, 2));
      if (!result.success) process.exit(2);
      process.exit(0);
    } catch (err) {
      console.error('Seed run failed:', err && err.stack ? err.stack : err);
      process.exit(1);
    }
  })();
}

module.exports = { run };
