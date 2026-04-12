// tests/supply.spec.js
//
// End-to-end supply spec using Jest + supertest
// Assumes your Express app is exported from src/app.js as `app`
// and that auth endpoints exist at /api/auth for creating test users.
// Run with: jest tests/supply.spec.js --runInBand
//
// Notes:
// - Tests create real users via the auth API and obtain access tokens.
// - Uses unique emails per run to avoid collisions.
// - Requires an isolated test DB and the app to be configured for tests.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app'); // adjust path if your app export differs
const auditService = require('../src/services/audit.service');

const BASE = '/api/supplies';
const AUTH_BASE = '/api/auth';

function parseCookie(setCookieHeader = []) {
  const cookies = {};
  (Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]).forEach((c) => {
    if (!c) return;
    const parts = c.split(';')[0].split('=');
    const name = parts.shift();
    const value = parts.join('=');
    cookies[name] = value;
  });
  return cookies;
}

describe('Supply API', () => {
  const unique = Date.now();
  const supplierEmail = `supplier+${unique}@example.com`;
  const requesterEmail = `requester+${unique}@example.com`;
  const adminEmail = `admin+${unique}@example.com`;
  const password = 'TestPassw0rd!';

  let supplierToken = null;
  let requesterToken = null;
  let adminToken = null;
  let createdSupply = null;
  let addedItemId = null;
  let addedQuoteId = null;

  // Spy auditService.logEvent to avoid noisy external calls and to assert audit events
  beforeAll(async () => {
    if (auditService && typeof auditService.logEvent === 'function') {
      jest.spyOn(auditService, 'logEvent').mockImplementation(async () => {});
    }

    // Create supplier
    await request(app)
      .post(`${AUTH_BASE}/register`)
      .send({
        firstName: 'Supplier',
        emails: [{ address: supplierEmail, primary: true }],
        password
      })
      .set('Accept', 'application/json');

    const supLogin = await request(app)
      .post(`${AUTH_BASE}/login`)
      .send({ email: supplierEmail, password })
      .set('Accept', 'application/json');

    supplierToken = supLogin.body && supLogin.body.accessToken;

    // Create requester
    await request(app)
      .post(`${AUTH_BASE}/register`)
      .send({
        firstName: 'Requester',
        emails: [{ address: requesterEmail, primary: true }],
        password
      })
      .set('Accept', 'application/json');

    const reqLogin = await request(app)
      .post(`${AUTH_BASE}/login`)
      .send({ email: requesterEmail, password })
      .set('Accept', 'application/json');

    requesterToken = reqLogin.body && reqLogin.body.accessToken;

    // Create admin (role administrator)
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

  test('POST /supplies - create supply (happy path)', async () => {
    const payload = {
      supplierId: null, // will be filled from token
      requesterId: null,
      items: [{ itemId: '000000000000000000000001', requestedQuantity: 100 }],
      deliveryLocation: { line1: '123 Main St', city: 'Brampton' },
      ops_region: 'north',
      metadata: { project: 'alpha' }
    };

    // Extract supplierId from token (token must include userId or sub)
    const decoded = jwt.decode(supplierToken);
    const supplierId = decoded && (decoded.userId || decoded.sub);
    const requesterDecoded = jwt.decode(requesterToken);
    const requesterId = requesterDecoded && (requesterDecoded.userId || requesterDecoded.sub);

    payload.supplierId = supplierId;
    payload.requesterId = requesterId;

    const res = await request(app)
      .post(`${BASE}`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('Accept', 'application/json')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toBeDefined();
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    const supply = res.body.data;
    expect(supply._id).toBeDefined();
    expect(supply.status).toBe('quote');
    expect(Array.isArray(supply.items)).toBe(true);
    expect(supply.items.length).toBeGreaterThanOrEqual(1);
    expect(supply.supplierId).toBe(String(supplierId));
    createdSupply = supply;
  });

  test('GET /supplies - list supplies (filter by ops_region)', async () => {
    const res = await request(app)
      .get(`${BASE}?page=1&limit=10&filter=${encodeURIComponent(JSON.stringify({ ops_region: 'north' }))}`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
    // At least one item should match ops_region north
    const found = (res.body.items || []).some((s) => s.ops_region === 'north' || s.ops_region === 'north');
    expect(found).toBe(true);
  });

  test('GET /supplies/:id - get supply by id', async () => {
    expect(createdSupply).toBeTruthy();
    const res = await request(app)
      .get(`${BASE}/${createdSupply._id}`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data._id).toBe(createdSupply._id);
  });

  test('POST /supplies/:id/items - add item to supply', async () => {
    expect(createdSupply).toBeTruthy();
    const newItem = { itemId: '000000000000000000000002', requestedQuantity: 50 };

    const res = await request(app)
      .post(`${BASE}/${createdSupply._id}/items`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('Accept', 'application/json')
      .send(newItem);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    const items = res.body.data.items || [];
    const added = items.find((it) => String(it.itemId) === String(newItem.itemId));
    expect(added).toBeDefined();
    addedItemId = newItem.itemId;
  });

  test('GET /supplies/:id/items/:itemId - read item', async () => {
    expect(createdSupply).toBeTruthy();
    expect(addedItemId).toBeTruthy();

    const res = await request(app)
      .get(`${BASE}/${createdSupply._id}/items/${addedItemId}`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(String(res.body.data.itemId)).toBe(String(addedItemId));
  });

  test('PATCH /supplies/:id/items/:itemId - update item (partial)', async () => {
    expect(createdSupply).toBeTruthy();
    expect(addedItemId).toBeTruthy();

    const res = await request(app)
      .patch(`${BASE}/${createdSupply._id}/items/${addedItemId}`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('Accept', 'application/json')
      .send({ requestedQuantity: 120 });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    const item = (res.body.data.items || []).find((it) => String(it.itemId) === String(addedItemId));
    expect(item).toBeDefined();
    expect(item.requestedQuantity).toBe(120);
  });

  test('POST /supplies/:id/add-quote - add quote to item', async () => {
    expect(createdSupply).toBeTruthy();
    expect(addedItemId).toBeTruthy();

    const quote = {
      pricePerBulkUnit: 12.5,
      numberOfBulkUnits: 10,
      discountingScheme: [{ minQty: 100, discountPercent: 5, description: 'volume' }]
    };

    const res = await request(app)
      .post(`${BASE}/${createdSupply._id}/add-quote`)
      .set('Authorization', `Bearer ${supplierToken}`)
      .set('Accept', 'application/json')
      .send({ itemId: addedItemId, quote });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    const item = (res.body.data.items || []).find((it) => String(it.itemId) === String(addedItemId));
    expect(item).toBeDefined();
    expect(Array.isArray(item.quotes)).toBe(true);
    const q = item.quotes.find((qq) => Number(qq.pricePerBulkUnit) === 12.5);
    expect(q).toBeDefined();
    addedQuoteId = q && (q._id || q.id);
  });

  test('POST /supplies/:id/accept-quote - accept quote (single accepted)', async () => {
    expect(createdSupply).toBeTruthy();
    expect(addedItemId).toBeTruthy();
    expect(addedQuoteId).toBeTruthy();

    const res = await request(app)
      .post(`${BASE}/${createdSupply._id}/accept-quote`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('Accept', 'application/json')
      .send({ itemId: addedItemId, quoteId: addedQuoteId });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    const item = (res.body.data.items || []).find((it) => String(it.itemId) === String(addedItemId));
    expect(item).toBeDefined();
    const accepted = (item.quotes || []).filter((qq) => qq.isAccepted);
    expect(accepted.length).toBe(1);
    expect(String(accepted[0]._id || accepted[0].id)).toBe(String(addedQuoteId));
  });

  test('POST /supplies/:id/update-status - valid and invalid values', async () => {
    expect(createdSupply).toBeTruthy();

    // valid update
    const resValid = await request(app)
      .post(`${BASE}/${createdSupply._id}/update-status`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('Accept', 'application/json')
      .send({ status: 'accepted' });

    expect(resValid.status).toBe(200);
    expect(resValid.body.data).toBeDefined();
    expect(resValid.body.data.status).toBe('accepted');

    // invalid update
    const resInvalid = await request(app)
      .post(`${BASE}/${createdSupply._id}/update-status`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('Accept', 'application/json')
      .send({ status: 'unknown' });

    expect([400, 422]).toContain(resInvalid.status);
  });

  test('DELETE /supplies/:id/hard - admin only', async () => {
    expect(createdSupply).toBeTruthy();

    // Non-admin should be forbidden
    const resForbidden = await request(app)
      .delete(`${BASE}/${createdSupply._id}/hard`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('Accept', 'application/json');

    expect([403, 401]).toContain(resForbidden.status);

    // Admin can delete
    const resAdmin = await request(app)
      .delete(`${BASE}/${createdSupply._id}/hard`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Accept', 'application/json');

    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.data).toBeDefined();
  });

  test('Edge cases: invalid ObjectId and missing fields', async () => {
    // Invalid ObjectId for get
    const resInvalidId = await request(app)
      .get(`${BASE}/invalid-id`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('Accept', 'application/json');

    expect([400, 404]).toContain(resInvalidId.status);

    // Create with missing items
    const resMissing = await request(app)
      .post(`${BASE}`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('Accept', 'application/json')
      .send({ supplierId: '000000000000000000000003' });

    expect([400, 422]).toContain(resMissing.status);
  });
});
