// src/tests/product.spec.js
/**
 * Integration tests for Product API
 *
 * - Uses Jest + Supertest
 * - Assumes your Express app is exported from src/app (module.exports = app)
 * - Uses a test MongoDB instance defined by process.env.MONGO_URI
 *
 * Run:
 *   MONGO_URI="mongodb://localhost:27017/bulkbuy_test" npm test
 *
 * Tests are written to be resilient: they create unique names per run and clean up created documents.
 */

const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../app'); // adjust if your app entry is elsewhere
const Product = require('../models/product.model');

const TEST_DB = process.env.MONGO_URI || 'mongodb://localhost:27017/bulkbuy_test';
const API_BASE = '/api/products';

jest.setTimeout(20000);

describe('Product API (integration)', () => {
  let server;
  let agent;
  let createdProduct;
  let createdRaw;
  const uniqueSuffix = Date.now().toString().slice(-6);
  const productName = `Test Product ${uniqueSuffix}`;
  const itemId = mongoose.Types.ObjectId();

  beforeAll(async () => {
    await mongoose.connect(TEST_DB, { useNewUrlParser: true, useUnifiedTopology: true });
    await Product.init();
    server = app.listen();
    agent = request.agent(server);
  });

  afterAll(async () => {
    try {
      if (createdProduct && createdProduct._id) {
        await Product.deleteOne({ _id: createdProduct._id }).exec();
      }
      await mongoose.connection.close();
      await server.close();
    } catch (err) {
      // ignore cleanup errors
    }
  });

  test('Create Product - should create product with nested structures and timestamps', async () => {
    const payload = {
      name: productName,
      descriptions: [{ locale: 'en', title: 'Premium', body: 'High quality product.' }],
      items: [{ itemId: itemId.toHexString(), salesPrices: [{ price: 19.99, currency: 'USD', from: Date.now() }] }],
      discountScheme: { tiers: [{ minQty: 10, discountPercent: 5 }] },
      salesWindow: { fromEpoch: Date.now(), toEpoch: Date.now() + 86400000 },
      ops_region: 'na'
    };

    const res = await agent
      .post(`${API_BASE}`)
      .send(payload)
      .set('Accept', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const data = res.body.data;
    expect(data).toHaveProperty('_id');
    expect(data.name).toBe(productName);
    expect(Array.isArray(data.descriptions)).toBe(true);
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.createdAt).toBe('number');
    expect(typeof data.updatedAt).toBe('number');
    expect(data.createdAt).toBeLessThanOrEqual(data.updatedAt);

    createdProduct = data;

    // verify DB record exists and contains expected nested itemId
    createdRaw = await Product.findById(createdProduct._id).lean().exec();
    expect(createdRaw).toBeTruthy();
    expect(Array.isArray(createdRaw.items)).toBe(true);
    expect(String(createdRaw.items[0].itemId)).toBe(itemId.toHexString());
  });

  test('Get Product By Id - returns product and respects includeDeleted flag', async () => {
    const res = await agent
      .get(`${API_BASE}/${createdProduct._id}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(createdProduct._id);
    expect(res.body.data.name).toBe(productName);

    // Soft-delete via repo to test includeDeleted behavior
    const deleted = await Product.findByIdAndUpdate(createdProduct._id, { deleted: true, deletedAt: Date.now(), status: 'deleted' }, { new: true }).lean().exec();
    expect(deleted.deleted).toBe(true);

    // Normal GET should 404
    const notFound = await agent.get(`${API_BASE}/${createdProduct._id}`).set('Accept', 'application/json');
    expect(notFound.status).toBe(404);

    // includeDeleted=true should return the product
    const include = await agent.get(`${API_BASE}/${createdProduct._id}?includeDeleted=true`).set('Accept', 'application/json');
    expect(include.status).toBe(200);
    expect(include.body.success).toBe(true);
    expect(include.body.data.deleted).toBe(true);

    // restore for subsequent tests
    await Product.findByIdAndUpdate(createdProduct._id, { deleted: false, deletedAt: null, status: 'active' }, { new: true }).lean().exec();
  });

  test('Find by itemId - returns products containing the item', async () => {
    const res = await agent
      .get(`${API_BASE}/by-item/${itemId.toHexString()}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    const found = res.body.items.find((p) => p._id === createdProduct._id);
    expect(found).toBeTruthy();
  });

  test('List products with pagination returns expected shape', async () => {
    const res = await agent
      .get(`${API_BASE}?page=1&limit=10`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(typeof res.body.page).toBe('number');
    expect(typeof res.body.limit).toBe('number');
    expect(typeof res.body.pages).toBe('number');
  });

  test('Public search returns active, non-deleted products and applies filters', async () => {
    const res = await agent
      .get(`${API_BASE}/public-search?q=Premium&page=1&limit=5&filters=${encodeURIComponent(JSON.stringify({ ops_region: 'na' }))}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
    if (res.body.items.length > 0) {
      expect(res.body.items[0]).toHaveProperty('status');
      expect(res.body.items[0].status).toBeDefined();
    }
  });

  test('Update product by id - partial update updates fields and updatedAt', async () => {
    const newName = `${productName} v2`;
    const res = await agent
      .patch(`${API_BASE}/${createdProduct._id}`)
      .send({ name: newName })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(newName);
    expect(typeof res.body.data.updatedAt).toBe('number');

    // verify DB updated
    const raw = await Product.findById(createdProduct._id).lean().exec();
    expect(raw.name).toBe(newName);
  });

  test('Update one by filter - updates single document', async () => {
    const filter = { _id: createdProduct._id };
    const update = { ops_region: 'eu' };
    const res = await agent
      .patch(`${API_BASE}`)
      .send({ filter, update })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ops_region).toBe('eu');

    const raw = await Product.findById(createdProduct._id).lean().exec();
    expect(raw.ops_region).toBe('eu');
  });

  test('Soft delete and restore via service/repo', async () => {
    // soft delete via API
    const del = await agent.delete(`${API_BASE}/${createdProduct._id}`).set('Accept', 'application/json');
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);
    expect(del.body.data.deleted).toBe(true);

    // normal GET should 404
    const notFound = await agent.get(`${API_BASE}/${createdProduct._id}`).set('Accept', 'application/json');
    expect(notFound.status).toBe(404);

    // restore via API
    const restore = await agent.post(`${API_BASE}/${createdProduct._id}/restore`).set('Accept', 'application/json');
    expect(restore.status).toBe(200);
    expect(restore.body.success).toBe(true);
    expect(restore.body.data.deleted).toBe(false);

    // verify GET now returns product
    const res = await agent.get(`${API_BASE}/${createdProduct._id}`).set('Accept', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Bulk create - inserts multiple products and normalizes data', async () => {
    const nameA = `Bulk A ${uniqueSuffix}`;
    const nameB = `Bulk B ${uniqueSuffix}`;
    const docs = [
      { name: nameA, items: [], salesWindow: {} },
      { name: nameB, items: [], salesWindow: {} }
    ];

    const res = await agent
      .post(`${API_BASE}/bulk`)
      .send(docs)
      .set('Accept', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);

    // cleanup inserted users
    for (const u of res.body.data) {
      if (u && u._id) {
        await Product.deleteOne({ _id: u._id }).exec();
      }
    }
  });

  test('Validation errors - missing required fields and invalid JSON filter', async () => {
    // missing name on create
    const badCreate = await agent.post(`${API_BASE}`).send({}).set('Accept', 'application/json');
    expect([400, 422]).toContain(badCreate.status);
    expect(badCreate.body.success).toBe(false);

    // invalid filter JSON on list
    const badList = await agent.get(`${API_BASE}?filter=not-a-json`).set('Accept', 'application/json');
    expect(badList.status).toBe(400);
  });
});
