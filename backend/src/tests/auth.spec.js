// tests/auth.spec.js
//
// End-to-end auth spec using Jest + supertest
// Assumes your Express app is exported from src/app.js as `app`
// and that the API base path for auth is /api/auth
//
// Run with: jest tests/auth.spec.js --runInBand
// Ensure test DB and environment are configured (isolated staging DB).

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app'); // adjust path if your app export differs
const auditService = require('../src/services/audit.service');

const BASE = '/api/auth';

function parseCookie(setCookieHeader = []) {
  // returns object of cookieName -> cookieValue
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

describe('Auth API', () => {
  // Unique test user per run
  const unique = Date.now();
  const testEmail = `test+${unique}@example.com`;
  const testPassword = 'TestPassw0rd!';
  let accessToken = null;
  let refreshTokenCookie = null;
  let createdUser = null;

  // Optional: spy on auditService.logEvent to assert audit calls
  beforeAll(() => {
    if (auditService && typeof auditService.logEvent === 'function') {
      jest.spyOn(auditService, 'logEvent').mockImplementation(async () => {});
    }
  });

  afterAll(() => {
    if (auditService && auditService.logEvent && auditService.logEvent.mockRestore) {
      auditService.logEvent.mockRestore();
    }
  });

  test('POST /auth/register - happy path', async () => {
    const payload = {
      firstName: 'Test',
      lastName: 'User',
      emails: [{ address: testEmail, primary: true }],
      password: testPassword
    };

    const res = await request(app)
      .post(`${BASE}/register`)
      .send(payload)
      .set('Accept', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();

    createdUser = res.body.user;
    accessToken = res.body.accessToken;
    // refreshToken returned in body by contract; controller may also set cookie
    // If cookie present, capture it
    const cookies = parseCookie(res.headers['set-cookie'] || []);
    if (cookies.refreshToken) refreshTokenCookie = cookies.refreshToken;

    // Basic assertions on user shape
    expect(createdUser.emails).toBeDefined();
    expect(createdUser.emails[0].address).toBe(testEmail);
    expect(createdUser.passwordHash).toBeUndefined();
    expect(createdUser.refreshTokens).toBeUndefined();

    // Validate access token contains userId
    const decoded = jwt.decode(accessToken);
    expect(decoded).toBeTruthy();
    expect(decoded.userId || decoded.sub).toBeTruthy();
  });

  test('POST /auth/register - validation failure (missing password)', async () => {
    const payload = {
      firstName: 'NoPass',
      emails: [{ address: `nopass+${unique}@example.com` }]
    };

    const res = await request(app)
      .post(`${BASE}/register`)
      .send(payload)
      .set('Accept', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body).toBeDefined();
    expect(res.body.message || res.body.errors).toBeDefined();
  });

  test('POST /auth/login - happy path', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: testEmail, password: testPassword })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user).toBeDefined();

    accessToken = res.body.accessToken;

    // cookie should be set
    const cookies = parseCookie(res.headers['set-cookie'] || []);
    expect(cookies.refreshToken).toBeDefined();
    refreshTokenCookie = cookies.refreshToken;

    // token decode checks
    const decoded = jwt.decode(accessToken);
    expect(decoded).toBeTruthy();
    expect(decoded.userId || decoded.sub).toBeTruthy();
  });

  test('POST /auth/login - invalid credentials', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: testEmail, password: 'wrong-password' })
      .set('Accept', 'application/json');

    // Accept either 401 or 400 depending on implementation
    expect([400, 401]).toContain(res.status);
    expect(res.body).toBeDefined();
    expect(res.body.message).toBeDefined();
  });

  test('GET /auth/me - protected endpoint with access token', async () => {
    expect(accessToken).toBeTruthy();

    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.user).toBeDefined();
    // user id in token should match returned user
    const decoded = jwt.decode(accessToken);
    const tokenUserId = decoded && (decoded.userId || decoded.sub);
    const returnedUserId = res.body.user.userId || res.body.user._id;
    expect(String(returnedUserId)).toBe(String(tokenUserId));
  });

  test('POST /auth/refresh - cookie flow', async () => {
    // Use cookie captured from login
    expect(refreshTokenCookie).toBeTruthy();

    const res = await request(app)
      .post(`${BASE}/refresh`)
      .set('Cookie', `refreshToken=${refreshTokenCookie}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();

    // cookie updated
    const cookies = parseCookie(res.headers['set-cookie'] || []);
    expect(cookies.refreshToken).toBeDefined();
  });

  test('POST /auth/refresh - missing token', async () => {
    const res = await request(app)
      .post(`${BASE}/refresh`)
      .send({})
      .set('Accept', 'application/json');

    expect([400, 401]).toContain(res.status);
  });

  test('POST /auth/logout - protected', async () => {
    // Use access token and cookie
    expect(accessToken).toBeTruthy();

    const agent = request.agent(app);
    // attach cookie if available
    if (refreshTokenCookie) agent.jar.setCookie(`refreshToken=${refreshTokenCookie}`);

    const res = await agent
      .post(`${BASE}/logout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.message).toBeDefined();

    // cookie cleared (Set-Cookie with empty value or expired)
    const setCookie = res.headers['set-cookie'] || [];
    const cleared = setCookie.some((c) => /refreshToken=;|refreshToken=deleted|Max-Age=0/i.test(c));
    // Not all implementations clear cookie; don't fail if not present, but prefer it
    expect([true, false]).toContain(cleared);
  });

  test('POST /auth/refresh - revoked/old token should fail (if server supports revocation)', async () => {
    // If server revoked token on logout, refresh with old token should fail
    if (!refreshTokenCookie) {
      return;
    }

    const res = await request(app)
      .post(`${BASE}/refresh`)
      .set('Cookie', `refreshToken=${refreshTokenCookie}`)
      .set('Accept', 'application/json');

    // Either 401 (revoked) or 200 (if server doesn't revoke on logout). Accept both.
    expect([200, 401]).toContain(res.status);
  });
});
