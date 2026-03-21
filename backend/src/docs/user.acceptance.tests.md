### User Acceptance Tests

#### Overview
This document lists end-to-end acceptance tests for the User domain. Each test includes **purpose**, **preconditions**, **request**, **expected response**, and **assertions**. Timestamps are epoch milliseconds. Tests assume the API base path is `/api/users` and the system uses JSON over HTTPS. Replace `{{BASE_URL}}` and `{{AUTH_TOKEN}}` as needed.

---

### Create User Test
**Purpose** Ensure user creation, password hashing, userId generation, and email normalization.

**Preconditions** No user exists with the provided email.

**Request**
```http
POST {{BASE_URL}}/users
Content-Type: application/json

{
  "firstName": "Alice",
  "lastName": "Smith",
  "emails": [{ "address": "ALICE@Example.COM", "primary": true }],
  "password": "P@ssw0rd!"
}
```

**Expected Response**
- **Status** 201
- **Body** `{ success: true, data: { userId, firstName, lastName, emails, createdAt, updatedAt } }`

**Assertions**
- `data.userId` is a 16-character numeric string.
- `data.emails[0].address` is lowercased (`alice@example.com`).
- `data` does **not** include `passwordHash` or `password`.
- `createdAt` and `updatedAt` are numbers (epoch ms) and `createdAt <= updatedAt`.
- Database record stores `passwordHash` (bcrypt format) and it differs from the plain password.

---

### Authenticate User Test
**Purpose** Verify authentication by email and password.

**Preconditions** User exists with email `alice@example.com` and password hashed.

**Request**
```http
POST {{BASE_URL}}/users/authenticate
Content-Type: application/json

{ "email": "alice@example.com", "password": "P@ssw0rd!" }
```

**Expected Response**
- **Status** 200
- **Body** `{ success: true, data: { userId, firstName, lastName, emails } }`

**Assertions**
- Response returns sanitized user (no `passwordHash`, no `refreshTokens`).
- Wrong password returns **401** with `{ success: false }`.

---

### Get User By Id Test
**Purpose** Retrieve a user by Mongo `_id`.

**Preconditions** User created.

**Request**
```http
GET {{BASE_URL}}/users/:id
Authorization: Bearer {{AUTH_TOKEN}}
```

**Expected Response**
- **Status** 200
- **Body** `{ success: true, data: { _id, userId, firstName, emails, createdAt } }`

**Assertions**
- `_id` matches requested id.
- Sensitive fields are absent.
- `includeDeleted=true` returns soft-deleted users when requested.

---

### Get User By UserId Test
**Purpose** Retrieve by human-friendly `userId`.

**Request**
```http
GET {{BASE_URL}}/users/by-userid/:userId
```

**Expected Response**
- **Status** 200
- **Body** `{ success: true, data: { userId, firstName, emails } }`

**Assertions**
- Returns same user as `findByUserId` repo method.
- `includeDeleted` flag behaves consistently.

---

### Get User By Email Test
**Purpose** Ensure lookup by email works and is case-insensitive.

**Request**
```http
GET {{BASE_URL}}/users/by-email?email=ALICE@Example.COM
```

**Expected Response**
- **Status** 200
- **Body** `{ success: true, data: { userId, emails } }`

**Assertions**
- Email lookup returns the user regardless of case.
- If email not found, returns **404**.

---

### List and Pagination Test
**Purpose** Validate pagination, sorting, and filter behavior.

**Preconditions** At least 30 users exist.

**Request**
```http
GET {{BASE_URL}}/users?page=2&limit=10&sort=createdAt:-1
```

**Expected Response**
- **Status** 200
- **Body** `{ success: true, items: [...], total, page: 2, limit: 10, pages }`

**Assertions**
- `items.length <= limit`.
- `total` equals countDocuments(filter).
- `pages` equals `Math.ceil(total/limit)`.

---

### Search Users Test
**Purpose** Generic search endpoint supports filters and text search.

**Request**
```http
POST {{BASE_URL}}/users/search
Content-Type: application/json

{
  "filters": { "role": "customer" },
  "page": 1,
  "limit": 20
}
```

**Expected Response**
- **Status** 200
- **Body** `{ success: true, items: [...], total, page, limit, pages }`

**Assertions**
- Returned items match filter.
- Text search via `$text` returns relevant results when provided.

---

### Public Search Test
**Purpose** Public provider search returns only opted-in, active providers.

**Request**
```http
GET {{BASE_URL}}/users/public-search?q=plumber&page=1&limit=10
```

**Expected Response**
- **Status** 200
- **Body** `{ success: true, total, items: [...], page, limit, pages }`

**Assertions**
- All returned users have `role === 'service_provider'`, `status === 'active'`, and `IsPublicSearchable === true`.
- Text scoring applied when `q` provided.

---

### Update User Test
**Purpose** Partial update, password change hashing, and immutable field protection.

**Request**
```http
PATCH {{BASE_URL}}/users/:id
Content-Type: application/json

{ "firstName": "Alicia", "password": "N3wP@ss!" }
```

**Expected Response**
- **Status** 200
- **Body** `{ success: true, data: { firstName: "Alicia", updatedAt } }`

**Assertions**
- `firstName` updated.
- `passwordHash` in DB updated and is bcrypt hash.
- `userId`, `_id`, `createdAt` remain unchanged.

---

### Update One By Filter Test
**Purpose** Update a single document matching a filter.

**Request**
```http
PATCH {{BASE_URL}}/
Content-Type: application/json

{ "filter": { "emails.address": "alice@example.com" }, "update": { "lastName": "Johnson" } }
```

**Expected Response**
- **Status** 200
- **Body** `{ success: true, data: { lastName: "Johnson" } }`

**Assertions**
- Only one document updated.
- Returns updated document.

---

### Soft Delete and Restore Test
**Purpose** Soft delete sets flags and restore clears them.

**Soft Delete Request**
```http
DELETE {{BASE_URL}}/users/:id
```

**Expected Response**
- **Status** 200
- **Body** `{ success: true, data: { deleted: true, deletedAt, deletedBy, status: 'deleted' } }`

**Restore Request**
```http
POST {{BASE_URL}}/users/:id/restore
```

**Expected Response**
- **Status** 200
- **Body** `{ success: true, data: { deleted: false, status: 'active' } }`

**Assertions**
- Soft-deleted user excluded from normal queries.
- `includeDeleted=true` returns soft-deleted user.
- Restore resets `deleted`, `deletedAt`, `deletedBy`, and `status`.

---

### Bulk Create Test
**Purpose** Bulk insert many users with normalization and password hashing.

**Request**
```http
POST {{BASE_URL}}/users/bulk
Content-Type: application/json

[
  { "firstName": "Bob", "emails": [{ "address": "bob@example.com" }], "password": "bobpass" },
  { "firstName": "Carol", "emails": [{ "address": "carol@example.com" }], "password": "carolpass" }
]
```

**Expected Response**
- **Status** 201
- **Body** `{ success: true, data: [ { userId, firstName, emails }, ... ] }`

**Assertions**
- Each inserted user has `userId`.
- Emails normalized to lowercase.
- Passwords hashed in DB.
- Partial failures do not block other inserts when `ordered: false` used.

---

### Validation and Error Cases
**Purpose** Ensure validators reject invalid input.

**Examples**
- Missing required fields on create → **422** with validation errors.
- Invalid `userId` format in route param → **400**.
- Duplicate email on create → **400** or **409** depending on API error mapping.

**Assertions**
- Error responses include `success: false` or appropriate HTTP error codes and messages.

---

### Security and Audit Tests
**Purpose** Verify sensitive data handling and audit fields.

**Checks**
- `passwordHash` never returned in normal responses.
- `refreshTokens` not returned in public endpoints.
- `createdAt` and `updatedAt` are epoch ms and updated on modifications.
- `userId` uniqueness enforced.

---

### Transactional Create Test
**Purpose** Ensure session-aware creation and rollback behavior.

**Flow**
1. Start a session.
2. Create user via transactional API that passes session to repo.
3. Perform a second write that fails.
4. Abort transaction and assert no user was created.

**Assertions**
- On abort, no partial writes remain.

---

### Admin Hard Delete Note
**Purpose** Hard delete is admin-only and not exposed by service endpoints.

**Checks**
- Repo exposes `hardDeleteById` but service/controller do not call it.
- Admin tooling calling repo directly can permanently remove records.

---

### Test Data Cleanup
**Purpose** Ensure tests leave the system in a clean state.

**Steps**
- Use soft-delete for test users where possible.
- For permanent cleanup in CI, call repo `hardDeleteById` from admin teardown scripts.

---

### Test Execution Notes
- Run acceptance tests against a staging database with a fresh dataset.
- Use environment variable `BCRYPT_SALT_ROUNDS` consistent with production for hashing behavior.
- Ensure index creation is complete before running tests (unique email/userId indexes).
- When asserting timestamps, allow small clock skew tolerance (e.g., ±2000 ms) between client and server.

---

End of acceptance tests document.