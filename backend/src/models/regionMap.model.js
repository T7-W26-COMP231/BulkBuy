// src/models/regionMap.model.js
/**
 * RegionMap Mongoose model
 *
 * Represents an operational region and its mapped locations.
 *
 * Fields:
 * - ops_region: string (logical region key)
 * - code: string (short code, unique)
 * - name: string
 * - description: { subject, text, files: [S3file._id] }
 * - locations: [{
 *     locationId: ObjectId,
 *     name: string,
 *     type: string,
 *     description: { subject, text, files: [S3file._id] },
 *     address: { line1, line2, city, region, postalCode, country },
 *     geo: GeoJSON Point { type: 'Point', coordinates: [lng, lat] },
 *     contact: { phone, email },
 *     metadata: Map<string,mixed>,
 *     createdAt, updatedAt
 *   }]
 * - metadata: Map<string,mixed>
 * - createdAt, updatedAt
 *
 * Includes:
 * - 2dsphere index on locations.geo for geospatial queries
 * - convenience static helpers and instance methods for location management
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const DescriptionSchema = new Schema(
  {
    subject: { type: String, trim: true, default: '' },
    text: { type: String, trim: true, default: '' },
    files: [{ type: Schema.Types.ObjectId, ref: 'S3file' }]
  },
  { _id: false }
);

const AddressSchema = new Schema(
  {
    line1: { type: String, trim: true, default: '' },
    line2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    region: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

/* GeoJSON Point for location */
const GeoPointSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [lng, lat]
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length === 2 && isFinite(v[0]) && isFinite(v[1]);
        },
        message: 'geo.coordinates must be [lng, lat]'
      }
    }
  },
  { _id: false }
);

const ContactSchema = new Schema(
  {
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' }
  },
  { _id: false }
);

const LocationSchema = new Schema(
  {
    locationId: { type: Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId(), index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, trim: true, default: '' },
    description: { type: DescriptionSchema, default: () => ({}) },
    address: { type: AddressSchema, default: () => ({}) },
    geo: { type: GeoPointSchema, default: () => ({ type: 'Point', coordinates: [] }) },
    contact: { type: ContactSchema, default: () => ({}) },
    metadata: { type: Map, of: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const RegionMapSchema = new Schema(
  {
    ops_region: { type: String, trim: true, index: true, required: true },
    code: { type: String, trim: true, required: true, unique: true, index: true },
    name: { type: String, trim: true, required: true },
    description: { type: DescriptionSchema, default: () => ({}) },
    locations: { type: [LocationSchema], default: [] },
    metadata: { type: Map, of: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true }
  }
);

/* -------------------------
 * Indexes
 * ------------------------- */
// Geospatial index on nested locations.geo
RegionMapSchema.index({ 'locations.geo': '2dsphere' }, { name: 'locations_geo_2dsphere' });

/* -------------------------
 * Pre hooks
 * ------------------------- */
RegionMapSchema.pre('save', function (next) {
  // update nested location timestamps
  if (Array.isArray(this.locations)) {
    const now = new Date();
    this.locations.forEach((loc) => {
      if (!loc.createdAt) loc.createdAt = now;
      loc.updatedAt = now;
    });
  }
  next();
});

/* -------------------------
 * Instance methods
 * ------------------------- */

/**
 * Add a location to the region map
 * @param {Object} locPayload - partial location payload
 * @returns {Object} added location (plain object)
 */
RegionMapSchema.methods.addLocation = async function addLocation(locPayload = {}) {
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
  this.locations.push(loc);
  await this.save();
  return this.locations[this.locations.length - 1].toObject ? this.locations[this.locations.length - 1].toObject() : this.locations[this.locations.length - 1];
};

/**
 * Remove a location by locationId
 * @param {ObjectId|String} locationId
 * @returns {Boolean} true if removed
 */
RegionMapSchema.methods.removeLocation = async function removeLocation(locationId) {
  const idStr = String(locationId);
  const before = this.locations.length;
  this.locations = this.locations.filter((l) => String(l.locationId) !== idStr);
  if (this.locations.length === before) return false;
  await this.save();
  return true;
};

/**
 * Find a location by locationId
 * @param {ObjectId|String} locationId
 * @returns {Object|null}
 */
RegionMapSchema.methods.findLocationById = function findLocationById(locationId) {
  const idStr = String(locationId);
  const loc = (this.locations || []).find((l) => String(l.locationId) === idStr);
  if (!loc) return null;
  return loc.toObject ? loc.toObject() : loc;
};

/* -------------------------
 * Static helpers
 * ------------------------- */

/**
 * Find region by ops_region code
 */
RegionMapSchema.statics.findByOpsRegion = function findByOpsRegion(opsRegion, opts = {}) {
  const q = this.findOne({ ops_region: opsRegion });
  if (opts.select) q.select(opts.select);
  if (opts.lean) q.lean();
  return q.exec();
};

/**
 * Find nearest locations to a point (lng, lat)
 * @param {Number} lng
 * @param {Number} lat
 * @param {Object} opts - { maxDistance, limit }
 */
RegionMapSchema.statics.findNearestLocations = async function findNearestLocations(lng, lat, opts = {}) {
  if (!isFinite(lng) || !isFinite(lat)) return [];
  const maxDistance = Number(opts.maxDistance) || 5000; // meters
  const limit = Number(opts.limit) || 10;

  // Aggregate across region maps to unwind locations and perform geoNear
  const pipeline = [
    { $unwind: '$locations' },
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        distanceField: 'locations.distance',
        spherical: true,
        maxDistance,
        key: 'locations.geo'
      }
    },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        regionId: '$_id',
        ops_region: '$ops_region',
        code: '$code',
        name: '$name',
        location: '$locations'
      }
    }
  ];

  return this.aggregate(pipeline).exec();
};

/* -------------------------
 * Export model
 * ------------------------- */
module.exports = mongoose.models.RegionMap || mongoose.model('RegionMap', RegionMapSchema);
