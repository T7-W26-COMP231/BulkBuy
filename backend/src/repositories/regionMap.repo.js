// src/repositories/regionMap.repo.js
/**
 * Mongoose-backed repository for RegionMap model
 * - Provides CRUD, pagination, and common query helpers
 * - Accepts opts: { session, new, select, populate, includeDeleted, lean, runValidators, arrayFilters }
 * - Returns lean objects by default for read methods when opts.lean is true
 */

const mongoose = require('mongoose');
const createError = require('http-errors');
const RegionMap = require('../models/regionMap.model');

function normalizeOpts(opts = {}) {
  return {
    session: opts.session || null,
    new: !!opts.new,
    select: opts.select || null,
    populate: opts.populate || null,
    includeDeleted: !!opts.includeDeleted,
    arrayFilters: opts.arrayFilters || null,
    lean: !!opts.lean,
    runValidators: opts.runValidators !== undefined ? !!opts.runValidators : true
  };
}

class RegionMapRepo {
  /* -------------------------
   * Create
   * ------------------------- */

  /**
   * Create a region map
   * @param {Object} payload
   * @param {Object} opts
   */
  async create(payload = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!payload || typeof payload !== 'object') throw createError(400, 'payload is required');

    if (o.session) {
      const docs = await RegionMap.create([payload], { session: o.session });
      return o.lean ? docs[0].toObject() : docs[0];
    }
    const created = await RegionMap.create(payload);
    return o.lean && created.toObject ? created.toObject() : created;
  }

  /* -------------------------
   * Read
   * ------------------------- */

  /**
   * Find by id
   * @param {String|ObjectId} id
   * @param {Object} opts
   */
  async findById(id, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) return null;
    const q = RegionMap.findById(id);
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.session) q.session(o.session);
    if (o.lean) q.lean();
    return q.exec();
  }

  /**
   * Find by ops_region
   * @param {String} opsRegion
   * @param {Object} opts
   */
  async findByOpsRegion(opsRegion, opts = {}) {
    const o = normalizeOpts(opts);
    if (!opsRegion) return null;
    const q = RegionMap.findOne({ ops_region: opsRegion });
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.session) q.session(o.session);
    if (o.lean) q.lean();
    return q.exec();
  }

  /**
   * Generic find by filter (returns array)
   * @param {Object} filter
   * @param {Object} opts
   */
  async findByFilter(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const base = { ...filter };
    let q = RegionMap.find(base);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.session) q = q.session(o.session);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Paginate region maps
   * @param {Object} filter
   * @param {Object} opts - { page, limit, sort, select, populate, session, lean }
   */
  async paginate(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const limit = Math.max(1, parseInt(opts.limit, 10) || 25);
    const skip = (page - 1) * limit;

    const baseFilter = { ...filter };

    const countQuery = RegionMap.countDocuments(baseFilter);
    let findQuery = RegionMap.find(baseFilter).skip(skip).limit(limit).sort(opts.sort || { createdAt: -1 });

    if (o.select) findQuery = findQuery.select(o.select);
    if (o.populate) findQuery = findQuery.populate(o.populate);
    if (o.session) {
      findQuery = findQuery.session(o.session);
      countQuery.session(o.session);
    }
    if (o.lean) findQuery = findQuery.lean();

    const [total, items] = await Promise.all([countQuery.exec(), findQuery.exec()]);
    const pages = Math.max(1, Math.ceil(total / limit));
    return { items, total, page, limit, pages };
  }

  /* -------------------------
   * Update
   * ------------------------- */

  /**
   * Update by id
   * @param {String|ObjectId} id
   * @param {Object} update
   * @param {Object} opts
   */
  async updateById(id, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) throw createError(400, 'id is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update is required');

    const updateOpts = { new: !!o.new, session: o.session, runValidators: o.runValidators };
    if (o.arrayFilters) updateOpts.arrayFilters = o.arrayFilters;

    let q = RegionMap.findByIdAndUpdate(id, update, updateOpts);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Update a nested location by locationId
   * @param {String|ObjectId} regionId
   * @param {String|ObjectId} locationId
   * @param {Object} update
   * @param {Object} opts
   */
  async updateLocation(regionId, locationId, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!regionId) throw createError(400, 'regionId is required');
    if (!locationId) throw createError(400, 'locationId is required');
    if (!update || typeof update !== 'object') throw createError(400, 'update is required');

    // Use positional filtered update
    const filter = { _id: regionId, 'locations.locationId': locationId };
    const updateDoc = { $set: {} };
    // prefix update keys with locations.$[elem].
    Object.keys(update).forEach((k) => {
      updateDoc.$set[`locations.$[elem].${k}`] = update[k];
    });

    const updateOpts = {
      new: !!o.new,
      session: o.session,
      runValidators: o.runValidators,
      arrayFilters: [{ 'elem.locationId': mongoose.Types.ObjectId(String(locationId)) }]
    };

    let q = RegionMap.findOneAndUpdate(filter, updateDoc, updateOpts);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Add a location to a region map (atomic)
   * @param {String|ObjectId} regionId
   * @param {Object} locPayload
   * @param {Object} opts
   */
  async addLocation(regionId, locPayload = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!regionId) throw createError(400, 'regionId is required');

    const loc = {
      locationId: locPayload.locationId || new mongoose.Types.ObjectId(),
      name: locPayload.name || 'Unnamed location',
      type: locPayload.type || '',
      description: locPayload.description || {},
      address: locPayload.address || {},
      geo: locPayload.geo || { type: 'Point', coordinates: [] },
      contact: locPayload.contact || {},
      metadata: locPayload.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const q = RegionMap.findByIdAndUpdate(
      regionId,
      { $push: { locations: loc } },
      { new: true, session: o.session, runValidators: o.runValidators }
    );

    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();

    const doc = await q.exec();
    if (!doc) return null;
    // return the pushed location (last element)
    const added = (doc.locations || []).slice(-1)[0];
    return o.lean && added && typeof added.toObject === 'function' ? added.toObject() : added;
  }

  /**
   * Remove a location by locationId
   * @param {String|ObjectId} regionId
   * @param {String|ObjectId} locationId
   * @param {Object} opts
   */
  async removeLocation(regionId, locationId, opts = {}) {
    const o = normalizeOpts(opts);
    if (!regionId) throw createError(400, 'regionId is required');
    if (!locationId) throw createError(400, 'locationId is required');

    const q = RegionMap.findByIdAndUpdate(
      regionId,
      { $pull: { locations: { locationId: mongoose.Types.ObjectId(String(locationId)) } } },
      { new: true, session: o.session, runValidators: o.runValidators }
    );

    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();

    const doc = await q.exec();
    return doc;
  }

  /* -------------------------
   * Delete
   * ------------------------- */

  /**
   * Hard delete by id
   * @param {String|ObjectId} id
   * @param {Object} opts
   */
  async deleteById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const o = normalizeOpts(opts);
    const q = RegionMap.findByIdAndDelete(id);
    if (o.session) q.session(o.session);
    return q.exec();
  }

  /**
   * Upsert by filter
   * @param {Object} filter
   * @param {Object} update
   * @param {Object} opts
   */
  async upsert(filter = {}, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!filter || Object.keys(filter).length === 0) throw createError(400, 'filter is required');
    const payload = { ...update, updatedAt: Date.now() };
    const q = RegionMap.findOneAndUpdate(filter, payload, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: o.runValidators,
      session: o.session
    });
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();
    return q.exec();
  }

  /**
   * Bulk insert (ordered=false)
   */
  async bulkInsert(docs = [], opts = {}) {
    if (!Array.isArray(docs) || docs.length === 0) return [];
    const options = { ordered: false };
    if (opts.session) options.session = opts.session;
    return RegionMap.insertMany(docs, options);
  }

  /**
   * Count documents matching filter
   */
  async count(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const f = { ...filter };
    return RegionMap.countDocuments(f).exec();
  }

  /**
   * Start a mongoose session for transactions
   */
  async startSession() {
    return mongoose.startSession();
  }

  /**
   * Delegate to model static findNearestLocations
   */
  async findNearestLocations(lng, lat, opts = {}) {
    return RegionMap.findNearestLocations(lng, lat, opts);
  }
}

module.exports = new RegionMapRepo();
