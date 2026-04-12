// tests/review.spec.js
//
// End-to-end review spec using Jest + supertest
// Assumes your Express app is exported from src/app.js as `app`
// Run with: jest tests/review.spec.js --runInBand
//
// Requirements:
// - Test DB isolated from production
// - Auth endpoints exist at /api/auth for register/login
// - Audit service is stubbed to avoid external side effects

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../src/app'); // adjust path if your app export differs
const auditService = require('../src/services/audit.service');

const BASE = '/api/reviews';
const AUTH_BASE = '/api/auth';

describe('Review API', () => {
  const unique = Date.now();
  const userEmail = `user+${unique}@example.com`;
  const otherEmail = `other+${unique}@example.com`;
  const adminEmail = `admin+${unique}@example.com`;
  const password = 'TestPassw0rd!';

  let userToken = null;
  let otherToken = null;
  let adminToken = null;
  let createdReview = null;
  let productId = mongoose.Types.ObjectId().toHexString();
  let itemId = mongoose.Types.ObjectId().toHexString();
  let messageId = mongoose.Types.ObjectId().toHexString();
  let reviewerId = null;
  let revieweeId = null;

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
    reviewerId = decoded && (decoded.userId || decoded.sub);

    // Register other user (will be reviewee)
    await request(app)
      .post(`${AUTH_BASE}/register`)
      .send({
        firstName: 'Other',
        emails: [{ address: otherEmail, primary: true }],
        password
      })
      .set('Accept', 'application/json');

    const otherLogin = await request(app)
      .post(`${AUTH_BASE}/login`)
      .send({ email: otherEmail, password })
      .set('Accept', 'application/json');

    otherToken = otherLogin.body && otherLogin.body.accessToken;
    const decodedOther = jwt.decode(otherToken);
    revieweeId = decodedOther && (decodedOther.userId || decodedOther.sub);

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
  });

  afterAll(async () => {
    if (auditService && auditService.logEvent && auditService.logEvent.mockRestore) {
      auditService.logEvent.mockRestore();
    }
  });

  test('POST /reviews - create review (happy path)', async () => {
    const payload = {
      reviewerId,
      revieweeId,
      productId,
      itemId,
      messageId,
      rating: 5,
      ops_region: 'north',
      metadata: { helpful: true }
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
    const r = res.body.data;
    expect(r._id).toBeDefined();
    expect(String(r.reviewerId)).toBe(String(reviewerId));
    expect(String(r.revieweeId)).toBe(String(revieweeId));
    expect(r.rating).toBe(5);
    expect(r.status).toBe('draft');
    createdReview = r;
  });

  test('GET /reviews - list reviews (filter by ops_region)', async () => {
    const filter = { ops_region: 'north' };
    const res = await request(app)
      .get(`${BASE}?page=1&limit=10&filter=${encodeURIComponent(JSON.stringify(filter))}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
    const found = (res.body.items || []).some((m) => m.ops_region === 'north');
    expect(found).toBe(true);
  });

  test('GET /reviews/:id - get review by id', async () => {
    expect(createdReview).toBeTruthy();
    const res = await request(app)
      .get(`${BASE}/${createdReview._id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data._id).toBe(createdReview._id);
  });

  test('PATCH /reviews/:id - update review partial', async () => {
    expect(createdReview).toBeTruthy();
    const res = await request(app)
      .patch(`${BASE}/${createdReview._id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ rating: 4, ops_region: 'south' });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.rating).toBe(4);
    expect(res.body.data.ops_region).toBe('south');
  });

  test('POST /reviews/:id/publish - publish review (draft -> submitted)', async () => {
    expect(createdReview).toBeTruthy();
    const res = await request(app)
      .post(`${BASE}/${createdReview._id}/publish`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('submitted');
  });

  test('GET /reviews/by-reviewer/:reviewerId and /by-reviewee/:revieweeId', async () => {
    const resByReviewer = await request(app)
      .get(`${BASE}/by-reviewer/${reviewerId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resByReviewer.status).toBe(200);
    expect(Array.isArray(resByReviewer.body.items || resByReviewer.body)).toBe(true);

    const resByReviewee = await request(app)
      .get(`${BASE}/by-reviewee/${revieweeId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resByReviewee.status).toBe(200);
    expect(Array.isArray(resByReviewee.body.items || resByReviewee.body)).toBe(true);
  });

  test('GET /reviews/average - average rating for product/item/reviewee', async () => {
    // average by productId
    const resProduct = await request(app)
      .get(`${BASE}/average?productId=${productId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resProduct.status).toBe(200);
    expect(resProduct.body.data).toBeDefined();
    expect(resProduct.body.data).toHaveProperty('avgRating');
    expect(resProduct.body.data).toHaveProperty('count');

    // average by revieweeId
    const resReviewee = await request(app)
      .get(`${BASE}/average?revieweeId=${revieweeId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resReviewee.status).toBe(200);
    expect(resReviewee.body.data).toBeDefined();
    expect(resReviewee.body.data).toHaveProperty('avgRating');
    expect(resReviewee.body.data).toHaveProperty('count');
  });

  test('POST /reviews/:id/soft-delete and DELETE /reviews/:id/hard (admin only)', async () => {
    expect(createdReview).toBeTruthy();

    // Soft delete
    const resSoft = await request(app)
      .post(`${BASE}/${createdReview._id}/soft-delete`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(resSoft.status).toBe(200);
    expect(resSoft.body.data).toBeDefined();
    expect(resSoft.body.data.deleted).toBe(true);
    expect(resSoft.body.data.status).toBe('deleted');

    // Non-admin hard delete should be forbidden or unauthorized
    const resForbidden = await request(app)
      .delete(`${BASE}/${createdReview._id}/hard`)
      .set('Authorization', `Bearer ${otherToken}`)
      .set('Accept', 'application/json');

    expect([401, 403]).toContain(resForbidden.status);

    // Admin hard delete
    const resAdmin = await request(app)
      .delete(`${BASE}/${createdReview._id}/hard`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Accept', 'application/json');

    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.data).toBeDefined();
  });

  test('Validation errors and edge cases', async () => {
    // Missing required fields
    const resMissing = await request(app)
      .post(`${BASE}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ rating: 3 });

    expect([400, 422]).toContain(resMissing.status);

    // Invalid rating
    const resInvalidRating = await request(app)
      .post(`${BASE}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ reviewerId, revieweeId, rating: 10 });

    expect(resInvalidRating.status).toBe(400);

    // Invalid ObjectId param
    const resInvalidId = await request(app)
      .get(`${BASE}/invalid-id`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect([400, 404]).toContain(resInvalidId.status);
  });
});
