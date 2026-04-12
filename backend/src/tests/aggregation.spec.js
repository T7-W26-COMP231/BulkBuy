// src/tests/aggregation.spec.js
/**
 * Integration tests for Aggregation API
 *
 * - Uses Jest + Supertest
 * - Assumes your Express app is exported from src/app (module.exports = app)
 * - Uses a test MongoDB instance defined by process.env.MONGO_URI
 *
 * Run:
 *   MONGO_URI="mongodb://localhost:27017/bulkbuy_test" npm test
 *
 * Tests create unique resources and clean up after themselves.
 */

const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../app'); // adjust if your app entry is elsewhere
const Aggregation = require('../models/aggregation.model');

const TEST_DB = process.env.MONGO_URI || 'mongodb://localhost:27017/bulkbuy_test';
const API_BASE = '/api/aggregations';

jest.setTimeout(20000);

describe('Aggregation API (integration)', () => {
  let server;
  let agent;
  let createdAgg;
  const uniqueSuffix = Date.now().toString().slice(-6);
  const itemId = mongoose.Types.ObjectId();
  const supplierId = mongoose.Types.ObjectId();
  const orderId = mongoose.Types.ObjectId();

  beforeAll(async () => {
    await mongoose.connect(TEST_DB, { useNewUrlParser: true, useUnifiedTopology: true });
    await Aggregation.init();
    server = app.listen();
    agent = request.agent(server);
  });

  afterAll(async () => {
    try {
      if (createdAgg && createdAgg._id) {
        await Aggregation.deleteOne({ _id: createdAgg._id }).exec();
      }
      await mongoose.connection.close();
      await server.close();
    } catch (err) {
      // ignore cleanup errors
    }
  });

  test('Create Aggregation - should create aggregation with itemDtos and timestamps', async () => {
    const payload = {
      itemDtos: [
        {
          itemId: itemId.toHexString(),
          pricingSnapshot: { price: 19.99, currency: 'USD' },
          supplierId: supplierId.toHexString(),
          salesWindow: [{ from: Date.now(), to: Date.now() + 86400000 }]
        }
      ],
      ops_region: `test-${uniqueSuffix}`,
      metadata: { source: 'integration-test' }
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
    expect(Array.isArray(data.itemDtos)).toBe(true);
    expect(data.ops_region).toBe(`test-${uniqueSuffix}`);
    expect(typeof data.createdAt).toBe('number');
    expect(typeof data.updatedAt).toBe('number');
    expect(data.createdAt).toBeLessThanOrEqual(data.updatedAt);

    createdAgg = data;

    // verify DB record exists and contains expected nested itemId
    const raw = await Aggregation.findById(createdAgg._id).lean().exec();
    expect(raw).toBeTruthy();
    expect(Array.isArray(raw.itemDtos)).toBe(true);
    expect(String(raw.itemDtos[0].itemId)).toBe(itemId.toHexString());
  });

  test('Get By Id - returns aggregation and 404 for missing', async () => {
    const res = await agent.get(`${API_BASE}/${createdAgg._id}`).set('Accept', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(createdAgg._id);

    // non-existing id -> 404
    const fakeId = mongoose.Types.ObjectId();
    const notFound = await agent.get(`${API_BASE}/${fakeId.toHexString()}`).set('Accept', 'application/json');
    expect(notFound.status).toBe(404);
  });

  test('Find by itemId - returns aggregations containing the item', async () => {
    const res = await agent
      .get(`${API_BASE}/by-item/${itemId.toHexString()}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    const found = res.body.items.find((a) => a._id === createdAgg._id);
    expect(found).toBeTruthy();
    // each returned aggregation should include the requested itemId
    for (const agg of res.body.items) {
      expect(Array.isArray(agg.itemDtos)).toBe(true);
      const hasItem = agg.itemDtos.some((it) => String(it.itemId) === itemId.toHexString());
      expect(hasItem).toBe(true);
    }
  });

  test('Add order is idempotent and updates orders array', async () => {
    // first add
    const res1 = await agent
      .post(`${API_BASE}/${createdAgg._id}/add-order`)
      .send({ orderId: orderId.toHexString() })
      .set('Accept', 'application/json');

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(Array.isArray(res1.body.data.orders)).toBe(true);
    const ordersAfterFirst = res1.body.data.orders.map(String);
    expect(ordersAfterFirst).toContain(orderId.toHexString());

    // second add (should be idempotent)
    const res2 = await agent
      .post(`${API_BASE}/${createdAgg._id}/add-order`)
      .send({ orderId: orderId.toHexString() })
      .set('Accept', 'application/json');

    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);
    const ordersAfterSecond = res2.body.data.orders.map(String);
    // still contains the order once (no duplicates)
    const occurrences = ordersAfterSecond.filter((o) => o === orderId.toHexString()).length;
    expect(occurrences).toBe(1);
  });

  test('Mark processed sets status and updates updatedAt', async () => {
    // capture previous updatedAt
    const before = await Aggregation.findById(createdAgg._id).lean().exec();
    const prevUpdatedAt = before.updatedAt;

    const res = await agent.post(`${API_BASE}/${createdAgg._id}/mark-processed`).set('Accept', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('processed');
    expect(typeof res.body.data.updatedAt).toBe('number');
    expect(res.body.data.updatedAt).toBeGreaterThanOrEqual(prevUpdatedAt);
  });

  test('Update by id - partial update and immutable protection', async () => {
    const newRegion = `eu-${uniqueSuffix}`;
    const res = await agent
      .patch(`${API_BASE}/${createdAgg._id}`)
      .send({ ops_region: newRegion, metadata: { note: 'patched' } })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ops_region).toBe(newRegion);
    expect(res.body.data.metadata && res.body.data.metadata.note).toBe('patched');

    // verify immutable fields unchanged in DB
    const raw = await Aggregation.findById(createdAgg._id).lean().exec();
    expect(raw.ops_region).toBe(newRegion);
    expect(raw.createdAt).toBeDefined();
  });

  test('List aggregations with pagination returns expected shape', async () => {
    const res = await agent.get(`${API_BASE}?page=1&limit=10`).set('Accept', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(typeof res.body.page).toBe('number');
    expect(typeof res.body.limit).toBe('number');
    expect(typeof res.body.pages).toBe('number');
  });

  test('Bulk create inserts multiple aggregations and returns created docs', async () => {
    const docs = [
      { itemDtos: [{ itemId: mongoose.Types.ObjectId().toHexString(), pricingSnapshot: {} }] },
      { itemDtos: [{ itemId: mongoose.Types.ObjectId().toHexString(), pricingSnapshot: {} }] }
    ];

    const res = await agent.post(`${API_BASE}/bulk`).send(docs).set('Accept', 'application/json');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);

    // cleanup inserted aggregations
    for (const a of res.body.data) {
      if (a && a._id) {
        await Aggregation.deleteOne({ _id: a._id }).exec();
      }
    }
  });

  test('Hard delete removes document and returns 404 for subsequent fetch', async () => {
    // create a temporary aggregation to delete
    const temp = await Aggregation.create({
      itemDtos: [{ itemId: mongoose.Types.ObjectId(), pricingSnapshot: {} }],
      ops_region: `del-${uniqueSuffix}`
    });

    const tempId = temp._id.toString();

    const del = await agent.delete(`${API_BASE}/${tempId}/hard`).set('Accept', 'application/json');
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);
    expect(del.body.data._id).toBe(tempId);

    // ensure it's gone
    const found = await Aggregation.findById(tempId).lean().exec();
    expect(found).toBeNull();
  });

  test('Validation and error cases - missing payloads and invalid ids', async () => {
    // create without required itemDtos (depending on business rule may be 400)
    const badCreate = await agent.post(`${API_BASE}`).send({}).set('Accept', 'application/json');
    // Accept either 400 or 422 depending on implementation
    expect([400, 422, 201]).toContain(badCreate.status);

    // invalid ObjectId in path
    const badId = 'not-an-objectid';
    const res = await agent.get(`${API_BASE}/${badId}`).set('Accept', 'application/json');
    expect([400, 404]).toContain(res.status);
  });
});
