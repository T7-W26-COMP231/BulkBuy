### Authentication Acceptance Tests

This document defines end‑to‑end acceptance tests and success criteria for the **Auth** API. Tests assume the API base path is **/api/auth**, JSON over HTTPS, and that service‑level audit logging records events with **eventType**, **actor**, **target**, **outcome**, and **correlationId**. Replace `{{BASE_URL}}`, `{{AUTH_TOKEN}}`, and example ids as needed.

---

### Summary of expected behavior

- **Register**: create a new user, return sanitized user and tokens; audit `auth.register.*`.
- **Login**: validate credentials, return access token and set refresh token cookie; audit `auth.login.*`.
- **Refresh**: accept refresh token (cookie or body), return new tokens; audit `auth.refresh.*`.
- **Logout**: revoke refresh token (best‑effort), clear cookie; audit `auth.logout.*`.
- **Me**: protected endpoint returning authenticated user; audit `auth.me.*`.
- Access tokens are short‑lived JWTs; refresh tokens are long‑lived JWTs and may be stored server‑side for revocation checks.

---

### Data model / token contract (concise)

- **User (returned)**: sanitized object (no `passwordHash`, no `refreshTokens`), contains `userId` or `_id`, `role`, `emails`, `createdAt`, `updatedAt`.
- **Access token**: JWT containing at least `{ userId, role, exp }`.
- **Refresh token**: JWT containing at least `{ userId, exp }`.
- **Cookies**: refresh token set as `HttpOnly`, `SameSite=lax`, `secure` in production.

---

### Endpoints (contract)

| Method | Path | Auth | Body | Success status | Response |
|---|---:|:---:|---|---:|---|
| POST | `/api/auth/register` | public | register payload (see schema) | `201` | `{ user, accessToken, refreshToken }` |
| POST | `/api/auth/login` | public | `{ email, password }` | `200` | `{ accessToken, user }` + `refreshToken` cookie |
| POST | `/api/auth/refresh` | public | optional `{ refreshToken }` or cookie | `200` | `{ accessToken, refreshToken, user? }` + cookie |
| POST | `/api/auth/logout` | protected | none (cookie used) | `200` | `{ message: 'Logged out' }` |
| GET | `/api/auth/me` | protected | none | `200` | `{ user }` |

---

### Acceptance test cases

#### 1) Register — happy path
**Purpose**: create a new user and receive tokens.  
**Request**
```http
POST {{BASE_URL}}/auth/register
Content-Type: application/json

{
  "firstName": "Alice",
  "lastName": "Smith",
  "emails": [{ "address": "alice@example.com", "primary": true }],
  "password": "S3cureP@ssw0rd"
}
```
**Expect**
- `201`
- Response contains **user** object (no `passwordHash`, no `refreshTokens`) and `accessToken`, `refreshToken`.
- `user.userId` or `user._id` present; `user.emails[0].address` equals `alice@example.com`.
**Assertions**
- `accessToken` is a JWT; decode to assert `userId` claim matches returned user.
- Audit log `auth.register.success` exists with `target.id` equal to user id and `outcome: success`.

#### 2) Register — validation failure
**Purpose**: invalid payload rejected.  
**Request**: missing password or email.  
**Expect**
- `400` with validation errors.
- Audit `auth.register.failed.validation` logged with `outcome: failure`.

#### 3) Login — happy path
**Purpose**: authenticate and receive access token and refresh cookie.  
**Request**
```http
POST {{BASE_URL}}/auth/login
Content-Type: application/json

{ "email": "alice@example.com", "password": "S3cureP@ssw0rd" }
```
**Expect**
- `200`
- JSON body contains `accessToken` and `user` (sanitized).
- Response sets `refreshToken` cookie with `HttpOnly` flag.
**Assertions**
- `accessToken` decodes to `{ userId, role, exp }`.
- Audit `auth.login.success` logged with `actor.userId` equal to user id.

#### 4) Login — invalid credentials
**Purpose**: wrong password returns 401.  
**Expect**
- `401` (or `400` depending on policy) with message.
- Audit `auth.login.failed` logged with `outcome: failure`.

#### 5) Refresh — cookie flow
**Purpose**: exchange refresh cookie for new tokens.  
**Setup**: client has `refreshToken` cookie from login.  
**Request**
```http
POST {{BASE_URL}}/auth/refresh
Cookie: refreshToken={{OLD_REFRESH_TOKEN}}
```
**Expect**
- `200`
- New `accessToken` and `refreshToken` in body; cookie updated to new refresh token.
- Audit `auth.refresh.success` logged.
**Assertions**
- New `accessToken` decodes and `userId` matches original.
- If server supports revocation, ensure revoked tokens are rejected.

#### 6) Refresh — missing/invalid token
**Expect**
- `400` when no token provided.
- `401` when token invalid or revoked.
- Audit `auth.refresh.failed` or `auth.refresh.failed.validation` logged.

#### 7) Logout — protected
**Purpose**: revoke refresh token and clear cookie.  
**Request**
- `POST /auth/logout` with `Authorization: Bearer <accessToken>` and `refreshToken` cookie.
**Expect**
- `200` and cookie cleared.
- If server stores refresh tokens, token is revoked (no longer valid for refresh).
- Audit `auth.logout.success` logged.
**Assertions**
- Subsequent `POST /auth/refresh` with the same refresh token returns `401`.

#### 8) Me — protected
**Purpose**: return authenticated user.  
**Request**
- `GET /auth/me` with `Authorization: Bearer <accessToken>`.
**Expect**
- `200` with `{ user }`.
- Audit `auth.me.success` logged.
**Assertions**
- `user.userId` matches token `userId`.
- Missing/invalid token returns `401` and `auth.me.failed` audit.

#### 9) Token expiry behavior
**Purpose**: ensure access token expiry enforced.  
**Test**
- Use an access token with expired `exp` claim (or wait until expiry).
**Expect**
- Protected endpoints return `401`.
- Refresh endpoint still works if refresh token valid.

#### 10) Security checks
- **Cookie flags**: `HttpOnly` always; `secure` in production; `SameSite=lax`.
- **No password leakage**: responses never include `passwordHash` or raw `password`.
- **Rate limiting**: repeated failed login attempts should be rate‑limited (if implemented).
- **Admin-only operations**: not part of auth endpoints but ensure role claims are present in tokens.

---

### Error cases and validation

- **Malformed JSON** → `400`.
- **Invalid email format** → `400`.
- **Password too short** → `400`.
- **Expired access token** → `401` on protected endpoints.
- **Expired/invalid refresh token** → `401` on refresh.
- **Missing required fields** → `400` with validation details.
- **Server errors** → `500` and audit event with `severity: error`.

---

### Audit and observability checks

For each test that modifies state or performs auth flows assert that an audit event exists with:
- **eventType** matching operation (e.g., `auth.login.success`, `auth.register.failed`).
- **actor** containing `userId` when available.
- **target** referencing the user id where applicable.
- **outcome** set to `success`, `failure`, or `partial`.
- **correlationId** propagated from request header `x-correlation-id` if provided.

---

### Test environment notes

- Run tests against a staging environment with isolated DB.
- Use unique email addresses per test run to avoid collisions.
- Ensure clocks are synchronized (allow ±2000 ms tolerance for timestamp assertions).
- If refresh tokens are persisted, clear or rotate them between tests to avoid interference.

---

End of auth acceptance tests.