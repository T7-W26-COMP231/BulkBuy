// tests/item.spec.js
//
// End-to-end item spec using Jest + supertest
// Assumes your Express app is exported from src/app.js as `app`
// Run with: jest tests/item.spec.js --runInBand
//
// Requirements:
// - Test DB isolated from production
// - Auth endpoints exist at /api/auth for register/login
// - Audit service is stubbed to avoid external side effects
// - User model and Item model exist and are wired as in the project

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../src/app'); // adjust path if your app export differs
const auditService = require('../src/services/audit.service');
const User = require('../src/models/user.model');
const Item = require('../src/models/item.model');

const BASE = '/api/items';
const AUTH_BASE = '/api/auth';

describe('Item API', () => {
  const unique = Date.now();
  const userEmail = `user+${unique}@example.com`;
  const adminEmail = `admin+${unique}@example.com`;
  const password = 'TestPassw0rd!';

  let userToken = null;
  let adminToken = null;
  let userId = null;
  let adminId = null;
  let createdItem = null;

  beforeAll(async () => {
    // stub auditService.logEvent to avoid external side effects and allow assertions
    if (auditService && typeof auditService.logEvent === 'function') {
      jest.spyOn(auditService, 'logEvent').mockImplementation(async () => {});
    }

    // Register user
    await request(app)
      .post(`${AUTH_BASE}/register`)
      .send({
        firstName: 'User',
        emails: [{ address: userEmail, primary: true }],
        password
      })
      .set('Accept', 'application/json');

    const loginRes = await request(app)
      .post(`${AUTH_BASE}/login`)
      .send({ email: userEmail, password })
      .set('Accept', 'application/json');

    userToken = loginRes.body && loginRes.body.accessToken;
    const decoded = jwt.decode(userToken);
    userId = decoded && (decoded.userId || decoded.sub);

    // Register admin
    await request(app)
      .post(`${AUTH_BASE}/register`)
      .send({
        firstName: 'Admin',
        emails: [{ address: adminEmail, primary: true }],
        password,
        role: 'administrator'
      })
      .set('Accept', 'application/json');

    const adminLogin = await request(app)
      .post(`${AUTH_BASE}/login`)
      .send({ email: adminEmail, password })
      .set('Accept', 'application/json');

    adminToken = adminLogin.body && adminLogin.body.accessToken;
    const decodedAdmin = jwt.decode(adminToken);
    adminId = decodedAdmin && (decodedAdmin.userId || decodedAdmin.sub);
  });

  afterAll(async () => {
    if (auditService && auditService.logEvent && auditService.logEvent.mockRestore) {
      auditService.logEvent.mockRestore();
    }
    // cleanup created data
    try {
      if (createdItem && createdItem._id) await Item.findByIdAndDelete(createdItem._id).exec();
      if (userId) await User.findByIdAndDelete(userId).exec();
      if (adminId) await User.findByIdAndDelete(adminId).exec();
    } catch (e) {
      // ignore cleanup errors
    }
    // close mongoose connection if tests started it
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });

  test('POST /items - create item (happy path)', async () => {
    const sku = `SKU-${unique}-1`;
    const payload = {
      sku,
      title: 'Test Item',
      description: 'Full description',
      shortDescription: 'Short desc',
      price: [{ list: 100.0, sale: 80.0, currency: 'USD' }],
      inventory: { stock: 10, reserved: 0, backorder: false }
    };

    const res = await request(app)
      .post(`${BASE}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toBeDefined();
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    const it = res.body.data;
    expect(it._id).toBeDefined();
    expect(it.sku).toBe(sku);
    expect(it.title).toBe('Test Item');
    createdItem = it;
  });

  test('POST /items - duplicate sku returns 409', async () => {
    const payload = {
      sku: createdItem.sku,
      title: 'Duplicate Item',
      price: [{ list: 50.0, currency: 'USD' }]
    };

    const res = await request(app)
      .post(`${BASE}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send(payload);

    expect([409, 400]).toContain(res.status);
  });

  test('GET /items/:id and GET /items/sku/:sku', async () => {
    const resById = await request(app)
      .get(`${BASE}/${createdItem._id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resById.status).toBe(200);
    expect(resById.body.data).toBeDefined();
    expect(String(resById.body.data._id)).toBe(String(createdItem._id));

    const resBySku = await request(app)
      .get(`${BASE}/sku/${encodeURIComponent(createdItem.sku)}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resBySku.status).toBe(200);
    expect(resBySku.body.data).toBeDefined();
    expect(resBySku.body.data.sku).toBe(createdItem.sku);
  });

  test('PATCH /items/:id - partial update', async () => {
    const res = await request(app)
      .patch(`${BASE}/${createdItem._id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ ops_region: 'eu-west' });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.ops_region).toBe('eu-west');
  });

  test('POST /items/upsert - create or update', async () => {
    const filter = { sku: createdItem.sku };
    const update = { $set: { title: 'Upserted Title' } };

    const res = await request(app)
      .post(`${BASE}/upsert`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ filter, update });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.title).toBe('Upserted Title');
  });

  test('POST /items/bulk-insert - bulk insert items', async () => {
    const docs = [
      { sku: `SKU-${unique}-bulk-1`, title: 'Bulk 1', price: [{ list: 10, currency: 'USD' }] },
      { sku: `SKU-${unique}-bulk-2`, title: 'Bulk 2', price: [{ list: 20, currency: 'USD' }] }
    ];

    const res = await request(app)
      .post(`${BASE}/bulk-insert`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send(docs);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    // inserted may be returned as array or object depending on implementation
    const inserted = Array.isArray(res.body.data) ? res.body.data : (res.body.data.inserted || []);
    expect(inserted.length).toBeGreaterThanOrEqual(1);

    // cleanup inserted bulk items
    try {
      for (const d of docs) {
        await Item.deleteOne({ sku: d.sku }).exec();
      }
    } catch (e) { /* ignore */ }
  });

  test('Inventory operations: adjust-stock, reserve, release', async () => {
    // Ensure starting stock
    const resAdjust = await request(app)
      .post(`${BASE}/${createdItem._id}/adjust-stock`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ delta: 5 });

    expect(resAdjust.status).toBe(200);
    expect(resAdjust.body.data).toBeDefined();
    const afterAdjust = resAdjust.body.data;
    expect(afterAdjust.stock).toBeGreaterThanOrEqual(0);

    // Reserve qty
    const resReserve = await request(app)
      .post(`${BASE}/${createdItem._id}/reserve`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ qty: 2 });

    if (resReserve.status === 200) {
      expect(resReserve.body.data).toBeDefined();
      expect(resReserve.body.data.reserved).toBeGreaterThanOrEqual(0);
    } else {
      // insufficient stock case
      expect([409, 400]).toContain(resReserve.status);
    }

    // Release qty
    const resRelease = await request(app)
      .post(`${BASE}/${createdItem._id}/release`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ qty: 1 });

    expect(resRelease.status).toBe(200);
    expect(resRelease.body.data).toBeDefined();
    expect(resRelease.body.data.reserved).toBeGreaterThanOrEqual(0);
  });

  test('POST /items/:id/apply-rating - apply rating', async () => {
    const res = await request(app)
      .post(`${BASE}/${createdItem._id}/apply-rating`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ rating: 4.5 });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.ratings).toBeDefined();
    expect(res.body.data.ratings.count).toBeGreaterThanOrEqual(1);
    expect(res.body.data.ratings.avg).toBeGreaterThanOrEqual(0);
  });

  test('Soft delete and hard delete (admin only)', async () => {
    // Soft delete
    const resSoft = await request(app)
      .post(`${BASE}/${createdItem._id}/soft-delete`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resSoft.status).toBe(200);
    expect(resSoft.body.data).toBeDefined();
    expect(resSoft.body.data.status).toBeDefined();

    // Non-admin hard delete should be forbidden
    const resForbidden = await request(app)
      .delete(`${BASE}/${createdItem._id}/hard`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect([401, 403]).toContain(resForbidden.status);

    // Admin hard delete
    const resAdmin = await request(app)
      .delete(`${BASE}/${createdItem._id}/hard`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Accept', 'application/json');

    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.data).toBeDefined();

    // Ensure item removed
    const found = await Item.findById(createdItem._id).lean().exec();
    expect(found === null).toBe(true);
    createdItem = null;
  });

  test('GET /items - list/paginate and /search', async () => {
    // Create a fresh item for listing/search tests
    const tempSku = `SKU-${unique}-list`;
    const tempItem = await Item.create({ sku: tempSku, title: 'List Test', price: [{ list: 5, currency: 'USD' }], status: 'active', published: true });

    // List
    const resList = await request(app)
      .get(`${BASE}?page=1&limit=10&filter=${encodeURIComponent(JSON.stringify({ sku: tempSku }))}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resList.status).toBe(200);
    expect(resList.body.items).toBeDefined();
    expect(Array.isArray(resList.body.items)).toBe(true);

    // Search
    const resSearch = await request(app)
      .get(`${BASE}/search?q=List&limit=10`)
      .set('Accept', 'application/json');

    expect(resSearch.status).toBe(200);
    expect(resSearch.body.results || resSearch.body.items).toBeDefined();

    // cleanup
    try {
      await Item.findByIdAndDelete(tempItem._id).exec();
    } catch (e) { /* ignore */ }
  });

  test('Validation and concurrency edge cases', async () => {
    // Invalid ObjectId
    const resInvalidId = await request(app)
      .get(`${BASE}/invalid-id`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect([400, 404]).toContain(resInvalidId.status);

    // Malformed filter JSON
    const resBadFilter = await request(app)
      .get(`${BASE}?filter=not-a-json`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect([400, 500]).toContain(resBadFilter.status);

    // Concurrent creates with same sku
    const cSku = `SKU-${unique}-concurrent`;
    // create a fresh user for concurrency test
    const cEmail = `concurrent+${unique}@example.com`;
    await request(app)
      .post(`${AUTH_BASE}/register`)
      .send({ firstName: 'Concurrent', emails: [{ address: cEmail, primary: true }], password })
      .set('Accept', 'application/json');

    const login = await request(app)
      .post(`${AUTH_BASE}/login`)
      .send({ email: cEmail, password })
      .set('Accept', 'application/json');

    const token = login.body && login.body.accessToken;

    const attempts = 6;
    const promises = [];
    for (let i = 0; i < attempts; i += 1) {
      promises.push(
        request(app)
          .post(`${BASE}`)
          .set('Authorization', `Bearer ${token}`)
          .set('Accept', 'application/json')
          .send({ sku: cSku, title: `Concurrent ${i}`, price: [{ list: 1, currency: 'USD' }] })
      );
    }

    const results = await Promise.all(promises);
    const successCount = results.filter((r) => r.status === 201).length;
    const conflictCount = results.filter((r) => r.status === 409 || r.status === 400).length;

    expect(successCount).toBeGreaterThanOrEqual(1);
    expect(successCount).toBeLessThanOrEqual(1);
    expect(successCount + conflictCount).toBe(attempts);

    // cleanup concurrent user and item
    try {
      const created = await Item.findOne({ sku: cSku }).lean().exec();
      if (created) await Item.findByIdAndDelete(created._id).exec();
      const cUserDoc = await User.findOne({ 'emails.address': cEmail }).lean().exec();
      if (cUserDoc) await User.findByIdAndDelete(cUserDoc._id).exec();
    } catch (e) { /* ignore */ }
  });
});
