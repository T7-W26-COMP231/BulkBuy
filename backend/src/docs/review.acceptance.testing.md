### Review Acceptance Tests

**Base path**: **`/api/reviews`**  
**Auth**: Bearer token via **Authorization: Bearer <accessToken>**  
**Correlation**: Include **x-correlation-id** header when available; audit events must include the same correlation id.

---

### Summary and Success Criteria

- **Create**: `POST /reviews` creates a review with required fields and returns the created resource with `_id`, `rating`, `status` defaulting to `draft`, and timestamps.  
- **List and Get**: `GET` endpoints return paginated lists and single resources; missing ids return `404`.  
- **Publish**: `POST /reviews/:id/publish` transitions `draft` to `submitted`.  
- **Delete**: `soft-delete` marks review deleted; `hard` delete removes it and requires admin role.  
- **Queries**: Lookup by reviewer and reviewee work and return expected items.  
- **Average**: `GET /reviews/average` computes average rating and count for product, item, or reviewee.  
- **Audit**: All mutating operations emit audit events with `eventType`, `actor`, `target`, `outcome`, and `correlationId`.  
- **Security**: Only authenticated users may mutate reviews; admin-only endpoints enforce role checks.

---

### Data Contract

**Review object**
- **_id**: ObjectId  
- **reviewerId**: ObjectId required  
- **revieweeId**: ObjectId required  
- **productId**: ObjectId optional  
- **itemId**: ObjectId optional  
- **messageId**: ObjectId optional  
- **rating**: Number between **1** and **5** required  
- **ops_region**: String optional  
- **status**: enum **draft | submitted | deleted** default **draft**  
- **metadata**: Map<string, mixed> optional  
- **createdAt** and **updatedAt**: ISO timestamps

**Behavior rules**
- `rating` must be numeric and within bounds.  
- `status` defaults to `draft`. `publish` sets `status` to `submitted`. `soft-delete` sets `deleted: true` and `status: deleted`.  
- Soft-deleted reviews are excluded from normal queries unless `includeDeleted` is true.  
- Average rating ignores deleted reviews by default.

---

### Endpoints and Expected Responses

| Endpoint | Method | Success Status | Notes |
|---|---:|---:|---|
| `/` | POST | **201** | Create review |
| `/` | GET | **200** | Paginated list |
| `/:id` | GET | **200** | Or **404** if missing |
| `/:id` | PATCH | **200** | Partial update |
| `/:id/publish` | POST | **200** | Draft → submitted |
| `/:id/soft-delete` | POST | **200** | Soft delete |
| `/:id/hard` | DELETE | **200** | Admin only; non-admin **403** |
| `/by-reviewer/:reviewerId` | GET | **200** | Reviews by reviewer |
| `/by-reviewee/:revieweeId` | GET | **200** | Reviews by reviewee |
| `/average` | GET | **200** | Returns `{ avgRating, count }` |

---

### Test Cases

#### Create review happy path
- **Request**: `POST /api/reviews` with `reviewerId`, `revieweeId`, `rating`, optional `productId`, `itemId`, `messageId`, `ops_region`.  
- **Expect**: `201` with `{ success: true, data: <review> }`. `data._id` present; `data.status === 'draft'`; `createdAt` present. Audit event `review.create.success` with `target.id === data._id`.

#### Create validation failures
- **Requests**: Missing `reviewerId`, missing `revieweeId`, missing `rating`, or `rating` out of range.  
- **Expect**: `400` with structured validation errors and audit `review.create.failed`.

#### List reviews pagination and filtering
- **Request**: `GET /api/reviews?page=1&limit=25&filter={"ops_region":"west"}`  
- **Expect**: `200` with `{ items, total, page, limit, pages }`. Items match filter.

#### Get review by id happy and not found
- **Requests**: `GET /api/reviews/:id` existing → `200`; non-existent → `404`.  
- **Expect**: Correct data or structured 404; audit `review.get.failed` for failures.

#### Update review partial
- **Request**: `PATCH /api/reviews/:id` with `{ rating: 4 }`  
- **Expect**: `200` with updated review; audit `review.update.success`. Reject invalid rating values.

#### Publish review
- **Request**: `POST /api/reviews/:id/publish`  
- **Expect**: `200` and `status === 'submitted'`; audit `review.publish.success`.

#### Soft delete and hard delete
- **Requests**: `POST /api/reviews/:id/soft-delete` → `200`; `DELETE /api/reviews/:id/hard` as admin → `200`; non-admin → `403`.  
- **Expect**: Soft delete sets `deleted: true` and `status: deleted`; hard delete removes record; audit events logged.

#### Find by reviewer and reviewee
- **Requests**: `GET /api/reviews/by-reviewer/:reviewerId` and `GET /api/reviews/by-reviewee/:revieweeId`  
- **Expect**: `200` with `items` array containing matching reviews.

#### Average rating
- **Requests**: `GET /api/reviews/average?productId=<id>` or `?itemId=<id>` or `?revieweeId=<id>`  
- **Expect**: `200` with `{ avgRating: <number|null>, count: <int> }`. Deleted reviews excluded unless `includeDeleted=true`.

#### Edge cases and errors
- Invalid ObjectId in path or body → `400`.  
- Empty update payload → `400`.  
- Malformed JSON → `400`.  
- Server errors → `500` and audit failure events.

---

### Concurrency and Data Integrity Tests

- **Concurrent publishes**: Two concurrent `publish` calls should result in `submitted` status without race conditions.  
- **Concurrent soft-delete and update**: Ensure update either fails or applies consistently; verify audit events reflect outcome.  
- **Aggregation under load**: Average rating calculation should be stable under concurrent writes; consider snapshotting or read-after-write expectations.

---

### Audit and Observability Checks

For each mutating operation assert an audit event exists with:
- **eventType** (e.g., `review.create.success`)  
- **actor** containing `userId` when available  
- **target** referencing the review id  
- **outcome** set to `success` or `failure`  
- **correlationId** matching request header when provided

Audit events should include timestamps and be searchable by `correlationId`.

---

### Test Environment and Runbook

- **Environment**: Isolated test database; reset DB between runs or use unique identifiers.  
- **Authentication**: Create test users including an admin and obtain tokens before tests.  
- **IDs**: Use valid ObjectIds for `reviewerId`, `revieweeId`, `productId`, `itemId`, `messageId`.  
- **Timing**: Allow ±2000 ms tolerance for timestamp assertions.  
- **Cleanup**: Remove or soft-delete created reviews after tests.  
- **Concurrency**: Run concurrency tests in a controlled environment with transactions enabled if possible.

---

### Example Assertion Checklist Per Test

- HTTP status matches expectation.  
- Response schema contains required fields and omits internal fields.  
- Database state reflects the operation.  
- Audit event recorded with correct `eventType`, `actor`, `target`, `outcome`, and `correlationId`.  
- Role-based access control enforced where applicable.

---

End of review acceptance tests.