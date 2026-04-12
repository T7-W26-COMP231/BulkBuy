// tests/message.spec.js
//
// End-to-end message spec using Jest + supertest
// Assumes your Express app is exported from src/app.js as `app`
// Run with: jest tests/message.spec.js --runInBand
//
// Notes:
// - Tests create real users via the auth API and obtain access tokens.
// - Uses unique emails per run to avoid collisions.
// - Requires an isolated test DB and the app to be configured for tests.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app'); // adjust path if your app export differs
const auditService = require('../src/services/audit.service');

const BASE = '/api/messages';
const AUTH_BASE = '/api/auth';

describe('Message API', () => {
  const unique = Date.now();
  const userEmail = `user+${unique}@example.com`;
  const otherEmail = `other+${unique}@example.com`;
  const adminEmail = `admin+${unique}@example.com`;
  const password = 'TestPassw0rd!';

  let userToken = null;
  let otherToken = null;
  let adminToken = null;
  let createdMessage = null;
  let replyMessage = null;
  let attachmentFileId = '0000000000000000000000aa';
  let recipientUserId = null;

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
    recipientUserId = decoded && (decoded.userId || decoded.sub);

    // Register other user
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

  test('POST /messages - create message (happy path)', async () => {
    const payload = {
      type: 'notification',
      recipients: { all: false, users: [recipientUserId] },
      subject: 'Test message',
      details: 'This is a test message',
      attachments: [],
      ops_region: 'east'
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
    const msg = res.body.data;
    expect(msg._id).toBeDefined();
    expect(msg.type).toBe('notification');
    expect(msg.status).toBe('draft');
    expect(msg.recipients).toBeDefined();
    expect(Array.isArray(msg.recipients.users)).toBe(true);
    expect(String(msg.recipients.users[0])).toBe(String(recipientUserId));
    createdMessage = msg;
  });

  test('GET /messages - list messages (filter by ops_region)', async () => {
    const res = await request(app)
      .get(`${BASE}?page=1&limit=10&filter=${encodeURIComponent(JSON.stringify({ ops_region: 'east' }))}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
    const found = (res.body.items || []).some((m) => m.ops_region === 'east');
    expect(found).toBe(true);
  });

  test('GET /messages/:id - get message by id', async () => {
    expect(createdMessage).toBeTruthy();
    const res = await request(app)
      .get(`${BASE}/${createdMessage._id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data._id).toBe(createdMessage._id);
  });

  test('PATCH /messages/:id - update message partial', async () => {
    expect(createdMessage).toBeTruthy();
    const res = await request(app)
      .patch(`${BASE}/${createdMessage._id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ subject: 'Updated subject' });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.subject).toBe('Updated subject');
  });

  test('POST /messages/:id/add-attachment - add attachment', async () => {
    expect(createdMessage).toBeTruthy();
    const res = await request(app)
      .post(`${BASE}/${createdMessage._id}/add-attachment`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ fileId: attachmentFileId });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    const attachments = res.body.data.attachments || [];
    expect(attachments.some((a) => String(a) === String(attachmentFileId))).toBe(true);
  });

  test('POST /messages/:id/add-recipient - add recipient', async () => {
    expect(createdMessage).toBeTruthy();
    // add the "other" user as recipient
    const decodedOther = jwt.decode(otherToken);
    const otherUserId = decodedOther && (decodedOther.userId || decodedOther.sub);

    const res = await request(app)
      .post(`${BASE}/${createdMessage._id}/add-recipient`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ userId: otherUserId });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    const users = (res.body.data.recipients && res.body.data.recipients.users) || [];
    expect(users.some((u) => String(u) === String(otherUserId))).toBe(true);
  });

  test('POST /messages/:id/mark-read and mark-unread', async () => {
    expect(createdMessage).toBeTruthy();

    const resRead = await request(app)
      .post(`${BASE}/${createdMessage._id}/mark-read`)
      .set('Authorization', `Bearer ${otherToken}`)
      .set('Accept', 'application/json');

    expect(resRead.status).toBe(200);
    expect(resRead.body.data).toBeDefined();
    expect(resRead.body.data.status).toBe('read');

    const resUnread = await request(app)
      .post(`${BASE}/${createdMessage._id}/mark-unread`)
      .set('Authorization', `Bearer ${otherToken}`)
      .set('Accept', 'application/json');

    expect(resUnread.status).toBe(200);
    expect(resUnread.body.data).toBeDefined();
    expect(resUnread.body.data.status).toBe('unread');
  });

  test('POST /messages/:id/send - send message (draft -> submitted)', async () => {
    expect(createdMessage).toBeTruthy();

    const res = await request(app)
      .post(`${BASE}/${createdMessage._id}/send`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('submitted');
  });

  test('POST /messages/:id/reply - reply to message', async () => {
    expect(createdMessage).toBeTruthy();

    const payload = {
      type: 'email',
      subject: 'Re: ' + (createdMessage.subject || 'no-subject'),
      details: 'Thanks for the update'
      // recipients omitted to test defaulting to original.fromUserId (if present)
    };

    const res = await request(app)
      .post(`${BASE}/${createdMessage._id}/reply`)
      .set('Authorization', `Bearer ${otherToken}`)
      .set('Accept', 'application/json')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.replyTo).toBe(createdMessage._id);
    replyMessage = res.body.data;
  });

  test('POST /messages/:id/soft-delete and DELETE /messages/:id/hard (admin only)', async () => {
    expect(replyMessage).toBeTruthy();

    // Soft delete
    const resSoft = await request(app)
      .post(`${BASE}/${replyMessage._id}/soft-delete`)
      .set('Authorization', `Bearer ${otherToken}`)
      .set('Accept', 'application/json');

    expect(resSoft.status).toBe(200);
    expect(resSoft.body.data).toBeDefined();
    expect(resSoft.body.data.deleted).toBe(true);
    expect(resSoft.body.data.status).toBe('deleted');

    // Non-admin hard delete should be forbidden or unauthorized
    const resForbidden = await request(app)
      .delete(`${BASE}/${replyMessage._id}/hard`)
      .set('Authorization', `Bearer ${otherToken}`)
      .set('Accept', 'application/json');

    expect([401, 403]).toContain(resForbidden.status);

    // Admin hard delete
    const resAdmin = await request(app)
      .delete(`${BASE}/${replyMessage._id}/hard`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Accept', 'application/json');

    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.data).toBeDefined();
  });

  test('Edge cases: invalid ObjectId and missing fields', async () => {
    // Invalid id param
    const resInvalidId = await request(app)
      .get(`${BASE}/invalid-id`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json');

    expect([400, 404]).toContain(resInvalidId.status);

    // Create with missing type
    const resMissing = await request(app)
      .post(`${BASE}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Accept', 'application/json')
      .send({ subject: 'no type' });

    expect([400, 422]).toContain(resMissing.status);
  });
});
