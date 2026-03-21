### Config Acceptance Tests

**Base path**: **`/api/configs`**  
**Auth**: Bearer token via **Authorization: Bearer <accessToken>**  
**Correlation**: Include **x-correlation-id** header; audit events must include the same correlation id

---

### Summary and Success Criteria

- **One config per user**: Creating a config for a user that already has a non-deleted config returns **409 Conflict**.  
- **Create**: `POST /configs/for-user/:userId` creates a config and sets `user.config` to the config `_id`.  
- **Get and List**: `GET` endpoints return single resources and paginated lists. Missing resources return **404**.  
- **Upsert**: `POST /configs/by-user/:userId/upsert` creates or updates the single config for the user and ensures `user.config` is set.  
- **Mutations**: `setTheme` and `setLocation` update the config and return the updated resource.  
- **Delete**: `soft-delete` marks config deleted and `hard` delete removes it and unsets `user.config`. Hard delete requires admin role.  
- **Audit**: All mutating operations emit audit events with `eventType`, `actor`, `target`, `outcome`, and `correlationId`.  
- **Security**: Only authenticated users may mutate configs. Admin-only endpoints enforce role checks.

---

### Data Contract

**Config object**
- **_id**: ObjectId  
- **userId**: ObjectId required and unique per non-deleted config  
- **location**: `{ lat: Number, lng: Number, address: String }` optional  
- **theme**: enum **light | dark | system** default **system**  
- **isPrivate**: Boolean default **true**  
- **ops_region**: String optional  
- **metadata**: Map<string, mixed> optional  
- **createdAt** and **updatedAt**: ISO timestamps  
- **deleted**: Boolean for soft delete

**User object update**
- **config**: ObjectId set to created or upserted config `_id`  
- When a config is hard deleted the user document must no longer reference that config

---

### Endpoints and Expected Responses

| Endpoint | Method | Success Status | Notes |
|---|---:|---:|---|
| `/for-user/:userId` | POST | **201** | Create config for user; fails **409** if non-deleted config exists |
| `/by-user/:userId` | GET | **200** | Returns config or **404** |
| `/:id` | GET | **200** | Returns config or **404** |
| `/:id` | PATCH | **200** | Partial update |
| `/by-user/:userId/upsert` | POST | **200** | Create or update single config and set `user.config` |
| `/by-user/:userId/theme` | POST | **200** | Set theme |
| `/by-user/:userId/location` | POST | **200** | Set location |
| `/:id/soft-delete` | POST | **200** | Soft delete |
| `/:id/hard` | DELETE | **200** | Admin only; unsets `user.config` |
| `/` | GET | **200** | Paginated list |
| `/find` | GET | **200** | Find by filter returns array |

---

### Test Cases

#### Create config happy path
- **Request**: `POST /api/configs/for-user/:userId` with valid `userId` and optional payload `location`, `theme`, `isPrivate`, `ops_region`, `metadata`.  
- **Expect**: `201` with `{ success: true, data: <config> }`. `data._id` present. `user.config` equals `data._id`. Audit event `config.create.success` with matching `correlationId`.

#### Create conflict when config exists
- **Setup**: Ensure user already has a non-deleted config.  
- **Request**: `POST /api/configs/for-user/:userId`.  
- **Expect**: `409` with message indicating config exists. No new config created. Audit event `config.create.failed`.

#### Upsert creates when missing and updates when present
- **Request A**: `POST /api/configs/by-user/:userId/upsert` with payload to create.  
- **Expect A**: `200` with created config and `user.config` set.  
- **Request B**: Same endpoint with different payload to update.  
- **Expect B**: `200` with updated fields and `user.config` unchanged or updated to same `_id`. Audit events `config.upsert.success`.

#### Get by user and by id
- **Requests**: `GET /api/configs/by-user/:userId` and `GET /api/configs/:id`.  
- **Expect**: `200` and correct resource. Non-existent returns `404`.

#### Update partial
- **Request**: `PATCH /api/configs/:id` with `{ ops_region: 'west' }`.  
- **Expect**: `200` with updated config. Audit `config.update.success`. Reject invalid fields or empty payload with `400`.

#### Set theme and set location
- **Requests**: `POST /api/configs/by-user/:userId/theme` with `{ theme: 'dark' }` and `POST /api/configs/by-user/:userId/location` with `{ lat, lng, address }`.  
- **Expect**: `200` with updated config. Validate theme enum and lat/lng ranges. Audit events `config.setTheme.success` and `config.setLocation.success`.

#### Soft delete and hard delete
- **Requests**: `POST /api/configs/:id/soft-delete` then `DELETE /api/configs/:id/hard` as admin.  
- **Expect**: Soft delete sets `deleted: true` and `status` or equivalent. Hard delete removes document and unsets `user.config`. Non-admin hard delete returns `403`. Audit events logged for each operation.

#### List and find
- **Requests**: `GET /api/configs?page=1&limit=10&filter={"ops_region":"west"}` and `GET /api/configs/find?filter=...`.  
- **Expect**: `200` with paginated result or array. Filters applied correctly. Soft-deleted configs excluded unless `includeDeleted=true`.

---

### Edge Cases and Error Conditions

- **Invalid ObjectId** in path or body returns `400`.  
- **Malformed JSON** in `filter` query returns `400`.  
- **Empty update payload** returns `400`.  
- **Concurrent create attempts** for same user must result in at most one successful create and the other request returns `409` or fails cleanly.  
- **Partial failures** during create with no session must not leave orphaned user or config. Tests should verify cleanup behavior.  
- **Session transactions** when provided must create user and config atomically in integration tests that simulate transactions.

---

### Concurrency and Data Integrity Tests

- **Concurrent creates**: Run N concurrent `POST /for-user/:userId` calls. Assert exactly one success and others return `409` or fail without creating extra configs.  
- **Concurrent upsert and delete**: Run upsert and soft-delete concurrently. Verify final state is consistent and audit events reflect outcomes.  
- **Read-after-write**: Immediately after create or upsert, `GET /by-user/:userId` returns the new config and `user.config` is set.

---

### Audit and Observability Checks

For each mutating operation assert an audit event exists with:
- **eventType** such as `config.create.success` or `config.upsert.failed`  
- **actor** containing `userId` when available  
- **target** referencing the config id  
- **outcome** set to `success` or `failure`  
- **correlationId** matching request header when provided

Audit events should include timestamps and be searchable by `correlationId`.

---

### Test Environment and Runbook

- **Environment**: Isolated test database. Reset DB between runs or use unique identifiers.  
- **Authentication**: Create test users including an admin and obtain tokens before tests.  
- **IDs**: Use valid ObjectIds for `userId` and config references.  
- **Transactions**: If testing session behavior, ensure MongoDB replica set or in-memory server supports transactions.  
- **Timing**: Allow ±2000 ms tolerance for timestamp assertions.  
- **Cleanup**: Remove or hard-delete created configs and unset `user.config` after tests.

---

### Example Assertion Checklist Per Test

- HTTP status matches expectation.  
- Response schema contains required fields and omits internal fields.  
- Database state reflects the operation and enforces one config per user.  
- `user.config` is set after create or upsert and unset after hard delete.  
- Audit event recorded with correct `eventType`, `actor`, `target`, `outcome`, and `correlationId`.  
- Role-based access control enforced where applicable.

---

End of config acceptance tests.