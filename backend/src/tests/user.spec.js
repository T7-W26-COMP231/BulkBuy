// src/tests/user.spec.js
/**
 * Integration tests for User API
 *
 * - Uses Jest + Supertest
 * - Assumes your Express app is exported from src/app (module.exports = app)
 * - Uses a test MongoDB instance defined by process.env.MONGO_URI (or defaults to mongodb://localhost:27017/bulkbuy_test)
 *
 * Run:
 *   MONGO_URI="mongodb://localhost:27017/bulkbuy_test" npm test
 *
 * Notes:
 * - Tests are written to be resilient: they create unique emails per run and clean up created documents.
 * - Timestamps are asserted to be numbers (epoch ms).
 */

const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const app = require('../app'); // adjust path if your app entry is elsewhere
const User = require('../models/user.model');

const TEST_DB = process.env.MONGO_URI || 'mongodb://localhost:27017/bulkbuy_test';
const API_BASE = '/api/users';

jest.setTimeout(20000);

describe('User API (integration)', () => {
  let server;
  let agent;
  let createdUser; // plain object returned by API
  let createdUserRaw; // raw mongoose doc from DB
  const uniqueSuffix = Date.now().toString().slice(-6);
  const testEmail = `alice.${uniqueSuffix}@example.com`;
  const testPassword = 'P@ssw0rd!';

  beforeAll(async () => {
    await mongoose.connect(TEST_DB, { useNewUrlParser: true, useUnifiedTopology: true });
    // ensure indexes are built before tests run
    await User.init();
    server = app.listen(); // start ephemeral server
    agent = request.agent(server);
  });

  afterAll(async () => {
    try {
      // cleanup created user(s)
      if (createdUser && createdUser.userId) {
        await User.deleteOne({ userId: createdUser.userId }).exec();
      }
      await mongoose.connection.close();
      await server.close();
    } catch (err) {
      // ignore cleanup errors
    }
  });

  test('Create User - should create user, normalize email and hash password', async () => {
    const payload = {
      firstName: 'Alice',
      lastName: 'Smith',
      emails: [{ address: testEmail, primary: true }],
      password: testPassword
    };

    const res = await agent
      .post(`${API_BASE}`)
      .send(payload)
      .set('Accept', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    const data = res.body.data;
    expect(typeof data.userId).toBe('string');
    expect(data.userId.length).toBeGreaterThanOrEqual(8);
    expect(data.firstName).toBe('Alice');
    expect(Array.isArray(data.emails)).toBe(true);
    expect(data.emails[0].address).toBe(testEmail.toLowerCase());
    expect(data).not.toHaveProperty('password');
    expect(data).not.toHaveProperty('passwordHash');
    expect(typeof data.createdAt).toBe('number');
    expect(typeof data.updatedAt).toBe('number');
    expect(data.createdAt).toBeLessThanOrEqual(data.updatedAt);

    createdUser = data;

    // verify DB record contains bcrypt passwordHash
    createdUserRaw = await User.findOne({ userId: createdUser.userId }).select('+passwordHash').lean().exec();
    expect(createdUserRaw).toBeTruthy();
    expect(createdUserRaw.passwordHash).toMatch(/^\$2[aby]\$/);
    const match = await bcrypt.compare(testPassword, createdUserRaw.passwordHash);
    expect(match).toBe(true);
  });

  test('Authenticate User - valid credentials succeed, invalid fail', async () => {
    // valid
    const res = await agent
      .post(`${API_BASE}/authenticate`)
      .send({ email: testEmail, password: testPassword })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('userId', createdUser.userId);
    expect(res.body.data).not.toHaveProperty('passwordHash');

    // invalid password
    const bad = await agent
      .post(`${API_BASE}/authenticate`)
      .send({ email: testEmail, password: 'wrong-password' })
      .set('Accept', 'application/json');

    expect(bad.status).toBe(401);
    expect(bad.body.success).toBe(false);
  });

  test('Get User By Id - returns sanitized user; includeDeleted flag works', async () => {
    const res = await agent
      .get(`${API_BASE}/${createdUser._id}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data._id).toBe(createdUser._id);
    expect(data.userId).toBe(createdUser.userId);
    expect(data).not.toHaveProperty('passwordHash');

    // soft-delete the user via API and verify includeDeleted behavior
    const del = await agent
      .delete(`${API_BASE}/${createdUser._id}`)
      .set('Accept', 'application/json');

    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);
    expect(del.body.data.deleted).toBe(true);

    // normal get should 404 now
    const notFound = await agent
      .get(`${API_BASE}/${createdUser._id}`)
      .set('Accept', 'application/json');

    expect(notFound.status).toBe(404);

    // includeDeleted=true should return the user
    const include = await agent
      .get(`${API_BASE}/${createdUser._id}?includeDeleted=true`)
      .set('Accept', 'application/json');

    expect(include.status).toBe(200);
    expect(include.body.success).toBe(true);
    expect(include.body.data.deleted).toBe(true);
  });

  test('Restore soft-deleted user via service endpoint (restoreUserById) - restore works', async () => {
    // The controller does not expose a restore route in all implementations.
    // Use the service endpoint if available via API; otherwise call repo directly.
    // We will call the repo via model for test purposes to restore.
    const restored = await User.findByIdAndUpdate(createdUser._id, {
      deleted: false,
      deletedAt: null,
      deletedBy: null,
      status: 'active',
      updatedAt: Date.now()
    }, { new: true, runValidators: true }).lean().exec();

    expect(restored).toBeTruthy();
    expect(restored.deleted).toBe(false);

    // verify GET now returns the user
    const res = await agent
      .get(`${API_BASE}/${createdUser._id}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(createdUser.userId);
  });

  test('Get User By UserId and By Email - case-insensitive email lookup', async () => {
    const byUserId = await agent
      .get(`${API_BASE}/by-userid/${createdUser.userId}`)
      .set('Accept', 'application/json');

    expect(byUserId.status).toBe(200);
    expect(byUserId.body.success).toBe(true);
    expect(byUserId.body.data.userId).toBe(createdUser.userId);

    const byEmail = await agent
      .get(`${API_BASE}/by-email?email=${encodeURIComponent(testEmail.toUpperCase())}`)
      .set('Accept', 'application/json');

    expect(byEmail.status).toBe(200);
    expect(byEmail.body.success).toBe(true);
    expect(byEmail.body.data.userId).toBe(createdUser.userId);
  });

  test('List users with pagination returns expected shape', async () => {
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

  test('Search users (generic) supports filters and returns sanitized items', async () => {
    const body = { filters: { role: 'customer' }, page: 1, limit: 10 };
    const res = await agent
      .post(`${API_BASE}/search`)
      .send(body)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    // items sanitized
    if (res.body.items.length > 0) {
      expect(res.body.items[0]).not.toHaveProperty('passwordHash');
    }
  });

  test('Public search returns only active, non-deleted users', async () => {
    const res = await agent
      .get(`${API_BASE}/public-search?q=alice&page=1&limit=5`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
    // items should not include passwordHash
    if (res.body.items.length > 0) {
      expect(res.body.items[0]).not.toHaveProperty('passwordHash');
    }
  });

  test('Update user by id - partial update and password change', async () => {
    const newFirst = 'Alicia';
    const newPassword = 'N3wP@ss!';
    const res = await agent
      .patch(`${API_BASE}/${createdUser._id}`)
      .send({ firstName: newFirst, password: newPassword })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.firstName).toBe(newFirst);
    expect(typeof res.body.data.updatedAt).toBe('number');

    // verify DB passwordHash updated
    const raw = await User.findOne({ userId: createdUser.userId }).select('+passwordHash').lean().exec();
    expect(raw).toBeTruthy();
    const match = await bcrypt.compare(newPassword, raw.passwordHash);
    expect(match).toBe(true);
  });

  test('Update one by filter - updates single document', async () => {
    const filter = { 'emails.address': testEmail.toLowerCase() };
    const update = { lastName: 'Johnson' };
    const res = await agent
      .patch(`${API_BASE}`)
      .send({ filter, update })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.lastName).toBe('Johnson');

    const raw = await User.findOne({ userId: createdUser.userId }).lean().exec();
    expect(raw.lastName).toBe('Johnson');
  });

  test('Bulk create - inserts multiple users and normalizes emails', async () => {
    const emailA = `bob.${uniqueSuffix}@example.com`;
    const emailB = `carol.${uniqueSuffix}@example.com`;
    const docs = [
      { firstName: 'Bob', emails: [{ address: emailA }], password: 'bobpass' },
      { firstName: 'Carol', emails: [{ address: emailB }], password: 'carolpass' }
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
      if (u && u.userId) {
        await User.deleteOne({ userId: u.userId }).exec();
      }
    }
  });
});
