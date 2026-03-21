// tests/config.spec.js
//
// End-to-end config spec using Jest + supertest
// Assumes your Express app is exported from src/app.js as `app`
// Run with: jest tests/config.spec.js --runInBand
//
// Requirements:
// - Test DB isolated from production
// - Auth endpoints exist at /api/auth for register/login
// - Audit service is stubbed to avoid external side effects
// - User model and Config model exist and are wired as in the project

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../src/app'); // adjust path if your app export differs
const auditService = require('../src/services/audit.service');
const User = require('../src/models/user.model');
const Config = require('../src/models/config.model');

const BASE = '/api/configs';
const AUTH_BASE = '/api/auth';

describe('Config API', () => {
  const unique = Date.now();
  const userEmail = `user+${unique}@example.com`;
  const adminEmail = `admin+${unique}@example.com`;
  const password = 'TestPassw0rd!';

  let userToken = null;
  let adminToken = null;
  let userId = null;
  let adminId = null;
  let createdConfig = null;

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
      if (createdConfig && createdConfig._id) await Config.findByIdAndDelete(createdConfig._id).exec();
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

  test('POST /configs/for-user/:userId - create config (happy path)', async () => {
    const payload = {
      location: { lat: 43.7, lng: -79.7, address: 'Brampton, ON' },
      theme: 'dark',
      isPrivate: false,
      ops_region: 'north',
      metadata: { beta: true }
    };

    const res = await request(app)
      .post(`${BASE}/for-user/${userId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toBeDefined();
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    const cfg = res.body.data;
    expect(cfg._id).toBeDefined();
    expect(cfg.userId).toBeDefined();
    expect(String(cfg.userId)).toBe(String(userId));
    expect(cfg.theme).toBe('dark');
    expect(cfg.isPrivate).toBe(false);
    createdConfig = cfg;

    // Verify user.config is set
    const userDoc = await User.findById(userId).lean().exec();
    expect(userDoc).toBeDefined();
    expect(String(userDoc.config)).toBe(String(cfg._id));
  });

  test('POST /configs/for-user/:userId - conflict when config exists', async () => {
    // Attempt to create another config for same user should return 409
    const res = await request(app)
      .post(`${BASE}/for-user/${userId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ theme: 'light' });

    expect([409, 400]).toContain(res.status);
  });

  test('POST /configs/by-user/:userId/upsert - create or update config', async () => {
    // Upsert should update existing config
    const res = await request(app)
      .post(`${BASE}/by-user/${userId}/upsert`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ ops_region: 'west', isPrivate: true });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.ops_region).toBe('west');
    expect(res.body.data.isPrivate).toBe(true);

    // user.config should still point to same config id
    const userDoc = await User.findById(userId).lean().exec();
    expect(String(userDoc.config)).toBe(String(res.body.data._id));
  });

  test('GET /configs/by-user/:userId and GET /configs/:id', async () => {
    const resByUser = await request(app)
      .get(`${BASE}/by-user/${userId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resByUser.status).toBe(200);
    expect(resByUser.body.data).toBeDefined();
    expect(String(resByUser.body.data.userId)).toBe(String(userId));

    const resById = await request(app)
      .get(`${BASE}/${createdConfig._id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resById.status).toBe(200);
    expect(resById.body.data).toBeDefined();
    expect(String(resById.body.data._id)).toBe(String(createdConfig._id));
  });

  test('PATCH /configs/:id - partial update', async () => {
    const res = await request(app)
      .patch(`${BASE}/${createdConfig._id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ ops_region: 'central' });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.ops_region).toBe('central');
  });

  test('POST /configs/by-user/:userId/theme - set theme', async () => {
    const res = await request(app)
      .post(`${BASE}/by-user/${userId}/theme`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ theme: 'light' });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.theme).toBe('light');
  });

  test('POST /configs/by-user/:userId/location - set location', async () => {
    const payload = { lat: 45.4, lng: -75.7, address: 'Ottawa, ON' };
    const res = await request(app)
      .post(`${BASE}/by-user/${userId}/location`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.location).toBeDefined();
    expect(res.body.data.location.lat).toBeCloseTo(45.4);
    expect(res.body.data.location.address).toBe('Ottawa, ON');
  });

  test('POST /configs/:id/soft-delete and DELETE /configs/:id/hard (admin only)', async () => {
    // Soft delete
    const resSoft = await request(app)
      .post(`${BASE}/${createdConfig._id}/soft-delete`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resSoft.status).toBe(200);
    expect(resSoft.body.data).toBeDefined();
    expect(resSoft.body.data.deleted).toBe(true);

    // After soft delete, GET by user should return 404
    const resAfterSoft = await request(app)
      .get(`${BASE}/by-user/${userId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect([404, 200]).toContain(resAfterSoft.status);
    if (resAfterSoft.status === 200) {
      // If service returns the soft-deleted config, ensure deleted flag is true
      expect(resAfterSoft.body.data.deleted).toBe(true);
    }

    // Non-admin hard delete should be forbidden
    const resForbidden = await request(app)
      .delete(`${BASE}/${createdConfig._id}/hard`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect([401, 403]).toContain(resForbidden.status);

    // Admin hard delete
    const resAdmin = await request(app)
      .delete(`${BASE}/${createdConfig._id}/hard`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Accept', 'application/json');

    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.data).toBeDefined();

    // Ensure user.config is unset
    const userDoc = await User.findById(userId).lean().exec();
    expect(userDoc).toBeDefined();
    expect(userDoc.config === undefined || userDoc.config === null).toBe(true);
  });

  test('GET /configs - list/paginate and /find', async () => {
    // Create a fresh config for listing tests
    const tempUser = await request(app)
      .post(`${AUTH_BASE}/register`)
      .send({
        firstName: 'Temp',
        emails: [{ address: `temp+${unique}@example.com`, primary: true }],
        password
      })
      .set('Accept', 'application/json');

    const tempLogin = await request(app)
      .post(`${AUTH_BASE}/login`)
      .send({ email: `temp+${unique}@example.com`, password })
      .set('Accept', 'application/json');

    const tempToken = tempLogin.body && tempLogin.body.accessToken;
    const tempDecoded = jwt.decode(tempToken);
    const tempUserId = tempDecoded && (tempDecoded.userId || tempDecoded.sub);

    // Upsert config for temp user
    await request(app)
      .post(`${BASE}/by-user/${tempUserId}/upsert`)
      .set('Authorization', `Bearer ${tempToken}`)
      .set('Accept', 'application/json')
      .send({ ops_region: 'list-test' });

    // List
    const resList = await request(app)
      .get(`${BASE}?page=1&limit=10&filter=${encodeURIComponent(JSON.stringify({ ops_region: 'list-test' }))}`)
      .set('Authorization', `Bearer ${tempToken}`)
      .set('Accept', 'application/json');

    expect(resList.status).toBe(200);
    expect(resList.body.items).toBeDefined();
    expect(Array.isArray(resList.body.items)).toBe(true);

    // Find
    const resFind = await request(app)
      .get(`${BASE}/find?filter=${encodeURIComponent(JSON.stringify({ ops_region: 'list-test' }))}`)
      .set('Authorization', `Bearer ${tempToken}`)
      .set('Accept', 'application/json');

    expect(resFind.status).toBe(200);
    expect(Array.isArray(resFind.body.items || resFind.body)).toBe(true);

    // cleanup temp user and config
    try {
      const tempUserDoc = await User.findById(tempUserId).lean().exec();
      if (tempUserDoc && tempUserDoc.config) await Config.findByIdAndDelete(tempUserDoc.config).exec();
      await User.findByIdAndDelete(tempUserId).exec();
    } catch (e) { /* ignore */ }
  });

  test('Validation and edge cases', async () => {
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
  });

  test('Concurrent create attempts result in at most one config', async () => {
    // Create a fresh user for concurrency test
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
    const decoded = jwt.decode(token);
    const cUserId = decoded && (decoded.userId || decoded.sub);

    // Fire multiple concurrent create requests
    const attempts = 6;
    const promises = [];
    for (let i = 0; i < attempts; i += 1) {
      promises.push(
        request(app)
          .post(`${BASE}/for-user/${cUserId}`)
          .set('Authorization', `Bearer ${token}`)
          .set('Accept', 'application/json')
          .send({ theme: 'system' })
      );
    }

    const results = await Promise.all(promises);
    const successCount = results.filter((r) => r.status === 201).length;
    const conflictCount = results.filter((r) => r.status === 409 || r.status === 400).length;

    expect(successCount).toBeGreaterThanOrEqual(1);
    expect(successCount).toBeLessThanOrEqual(1);
    expect(successCount + conflictCount).toBe(attempts);

    // cleanup
    try {
      const userDoc = await User.findById(cUserId).lean().exec();
      if (userDoc && userDoc.config) await Config.findByIdAndDelete(userDoc.config).exec();
      await User.findByIdAndDelete(cUserId).exec();
    } catch (e) { /* ignore */ }
  });
});
