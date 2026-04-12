// tests/regionMap.spec.js
//
// End-to-end RegionMap spec using Jest + supertest
// Assumes your Express app is exported from src/app.js as `app`
// Run with: jest tests/regionMap.spec.js --runInBand
//
// Requirements:
// - Test DB isolated from production
// - Auth endpoints exist at /api/auth for register/login
// - Audit service is stubbed to avoid external side effects
// - User model and RegionMap model exist and are wired as in the project

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../src/app'); // adjust path if your app export differs
const auditService = require('../src/services/audit.service');
const User = require('../src/models/user.model');
const RegionMap = require('../src/models/regionMap.model');

const BASE = '/api/region-maps';
const AUTH_BASE = '/api/auth';

describe('RegionMap API', () => {
  const unique = Date.now();
  const userEmail = `user+${unique}@example.com`;
  const adminEmail = `admin+${unique}@example.com`;
  const password = 'TestPassw0rd!';

  let userToken = null;
  let adminToken = null;
  let userId = null;
  let adminId = null;
  let createdRegion = null;

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
      if (createdRegion && createdRegion._id) await RegionMap.findByIdAndDelete(createdRegion._id).exec();
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

  test('POST /region-maps - create region map (happy path)', async () => {
    const code = `RM-${unique}-1`;
    const payload = {
      ops_region: 'north-america',
      code,
      name: 'Test Region',
      description: { subject: 'About', text: 'Test region description' }
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
    const rm = res.body.data;
    expect(rm._id).toBeDefined();
    expect(rm.code).toBe(code);
    expect(rm.ops_region).toBe('north-america');
    createdRegion = rm;
  });

  test('POST /region-maps - duplicate code returns 409', async () => {
    const payload = {
      ops_region: 'north-america',
      code: createdRegion.code,
      name: 'Duplicate Region'
    };

    const res = await request(app)
      .post(`${BASE}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send(payload);

    expect([409, 400]).toContain(res.status);
  });

  test('GET /region-maps/:id and GET /region-maps/by-ops/:opsRegion', async () => {
    const resById = await request(app)
      .get(`${BASE}/${createdRegion._id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resById.status).toBe(200);
    expect(resById.body.data).toBeDefined();
    expect(String(resById.body.data._id)).toBe(String(createdRegion._id));

    const resByOps = await request(app)
      .get(`${BASE}/by-ops/${encodeURIComponent(createdRegion.ops_region)}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resByOps.status).toBe(200);
    expect(resByOps.body.data).toBeDefined();
    expect(resByOps.body.data.ops_region).toBe(createdRegion.ops_region);
  });

  test('PATCH /region-maps/:id - partial update', async () => {
    const res = await request(app)
      .patch(`${BASE}/${createdRegion._id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ name: 'Updated Region Name' });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.name).toBe('Updated Region Name');
  });

  test('POST /region-maps/upsert - create or update', async () => {
    const filter = { code: createdRegion.code };
    const update = { name: 'Upserted Name' };

    const res = await request(app)
      .post(`${BASE}/upsert`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ filter, update });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.name).toBe('Upserted Name');
  });

  test('POST /region-maps/bulk-insert - bulk insert region maps', async () => {
    const docs = [
      { ops_region: `region-${unique}-a`, code: `RM-${unique}-bulk-1`, name: 'Bulk A' },
      { ops_region: `region-${unique}-b`, code: `RM-${unique}-bulk-2`, name: 'Bulk B' }
    ];

    const res = await request(app)
      .post(`${BASE}/bulk-insert`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send(docs);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    const inserted = Array.isArray(res.body.data) ? res.body.data : (res.body.data.inserted || []);
    expect(inserted.length).toBeGreaterThanOrEqual(1);

    // cleanup inserted bulk items
    try {
      for (const d of docs) {
        await RegionMap.deleteOne({ code: d.code }).exec();
      }
    } catch (e) { /* ignore */ }
  });

  test('Add, update, remove location', async () => {
    // Add location
    const locPayload = {
      name: 'Warehouse 1',
      type: 'warehouse',
      address: { line1: '123 Test St', city: 'Testville', country: 'CA' },
      geo: { type: 'Point', coordinates: [-79.7624, 43.7315] }, // lng, lat
      contact: { phone: '+1-555-0100', email: `loc+${unique}@example.com` },
      metadata: { capacity: 1000 }
    };

    const resAdd = await request(app)
      .post(`${BASE}/${createdRegion._id}/locations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send(locPayload);

    expect(resAdd.status).toBe(200);
    expect(resAdd.body.data).toBeDefined();
    const added = resAdd.body.data;
    expect(added.locationId).toBeDefined();
    expect(added.name).toBe('Warehouse 1');
    const locationId = added.locationId;

    // Update location
    const resUpdate = await request(app)
      .patch(`${BASE}/${createdRegion._id}/locations/${locationId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ name: 'Warehouse 1 - Updated', metadata: { capacity: 1200 } });

    expect(resUpdate.status).toBe(200);
    expect(resUpdate.body.data).toBeDefined();
    // The update returns the whole region map; ensure nested location updated
    const updatedRegion = resUpdate.body.data;
    const updatedLoc = (updatedRegion.locations || []).find((l) => String(l.locationId) === String(locationId));
    expect(updatedLoc).toBeDefined();
    expect(updatedLoc.name).toBe('Warehouse 1 - Updated');

    // Remove location
    const resRemove = await request(app)
      .delete(`${BASE}/${createdRegion._id}/locations/${locationId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resRemove.status).toBe(200);
    expect(resRemove.body.data).toBeDefined();
    const afterRemove = resRemove.body.data;
    const found = (afterRemove.locations || []).find((l) => String(l.locationId) === String(locationId));
    expect(found).toBeUndefined();
  });

  test('GET /region-maps/nearest - nearest locations', async () => {
    // Create a region with two locations near each other
    const code = `RM-${unique}-geo`;
    const region = await RegionMap.create({
      ops_region: `geo-${unique}`,
      code,
      name: 'Geo Region',
      locations: [
        {
          locationId: new mongoose.Types.ObjectId(),
          name: 'Loc A',
          geo: { type: 'Point', coordinates: [-79.4, 43.7] } // Toronto-ish
        },
        {
          locationId: new mongoose.Types.ObjectId(),
          name: 'Loc B',
          geo: { type: 'Point', coordinates: [-79.5, 43.65] }
        }
      ]
    });

    // Query near a point
    const res = await request(app)
      .get(`${BASE}/nearest?lng=-79.45&lat=43.68&maxDistance=50000&limit=5`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    // results should include region/location entries with distance
    const first = res.body.data[0];
    expect(first).toHaveProperty('location');
    expect(first.location).toHaveProperty('distance');

    // cleanup
    try {
      await RegionMap.findByIdAndDelete(region._id).exec();
    } catch (e) { /* ignore */ }
  });

  test('DELETE /region-maps/:id - hard delete (admin only)', async () => {
    // Create a temp region to delete
    const temp = await RegionMap.create({ ops_region: `del-${unique}`, code: `RM-${unique}-del`, name: 'ToDelete' });

    // Non-admin should be forbidden
    const resForbidden = await request(app)
      .delete(`${BASE}/${temp._id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect([401, 403]).toContain(resForbidden.status);

    // Admin delete
    const resAdmin = await request(app)
      .delete(`${BASE}/${temp._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Accept', 'application/json');

    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.data).toBeDefined();

    // Ensure removed
    const found = await RegionMap.findById(temp._id).lean().exec();
    expect(found === null).toBe(true);
  });

  test('Validation and concurrency edge cases', async () => {
    // Invalid ObjectId
    const resInvalidId = await request(app)
      .get(`${BASE}/invalid-id`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect([400, 404]).toContain(resInvalidId.status);

    // Malformed filter JSON (list endpoint)
    const resBadFilter = await request(app)
      .get(`${BASE}?filter=not-a-json`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect([400, 500]).toContain(resBadFilter.status);

    // Concurrent creates with same code
    const cCode = `RM-${unique}-concurrent`;
    const cEmail = `concurrent+${unique}@example.com`;
    // create a fresh user for concurrency test
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
          .send({ ops_region: `concurrent-${unique}`, code: cCode, name: `Concurrent ${i}` })
      );
    }

    const results = await Promise.all(promises);
    const successCount = results.filter((r) => r.status === 201).length;
    const conflictCount = results.filter((r) => r.status === 409 || r.status === 400).length;

    expect(successCount).toBeGreaterThanOrEqual(1);
    expect(successCount).toBeLessThanOrEqual(1);
    expect(successCount + conflictCount).toBe(attempts);

    // cleanup concurrent user and region
    try {
      const created = await RegionMap.findOne({ code: cCode }).lean().exec();
      if (created) await RegionMap.findByIdAndDelete(created._id).exec();
      const cUserDoc = await User.findOne({ 'emails.address': cEmail }).lean().exec();
      if (cUserDoc) await User.findByIdAndDelete(cUserDoc._id).exec();
    } catch (e) { /* ignore */ }
  });
});
