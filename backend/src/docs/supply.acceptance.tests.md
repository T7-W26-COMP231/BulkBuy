### Supply Acceptance Tests

Base path: **`/api/supplies`**  
API style: JSON over HTTPS. Tests assume authentication via **Authorization: Bearer \<accessToken\>** and refresh cookie semantics for auth flows. Each request should include an `x-correlation-id` header when available; audit events must include that correlation id.

---

### Summary / Success Criteria

- **Create**: POST `/supplies` creates a supply record with required fields and returns the created resource with `_id`, `items`, `status` defaulting to `quote`, and timestamps.
- **List / Get**: GET endpoints return paginated lists and single resources; 404 for missing ids.
- **Item operations**: Add, read, update, remove items within a supply.
- **Quote operations**: Add a quote to an item and accept a quote so only one quote per item has `isAccepted: true`.
- **Status transitions**: Valid status updates succeed; invalid transitions or values return 400.
- **Delete**: Hard delete removes the record (admin only).
- **Audit**: Every mutating operation emits an audit event with `eventType`, `actor`, `target`, `outcome`, and `correlationId`.
- **Security**: Only authenticated users may mutate supplies; admin-only endpoints enforce role checks.

---

### Data contract (concise)

- **Supply**:  
  - `_id`: ObjectId  
  - `supplierId`: ObjectId (required)  
  - `requesterId`: ObjectId (optional)  
  - `items`: array of `{ itemId: ObjectId, requestedQuantity?: number, quotes: [{ _id, pricePerBulkUnit, numberOfBulkUnits, discountingScheme?, isAccepted, createdAt }] }`  
  - `deliveryLocation`: object (address)  
  - `status`: enum `quote | accepted | dispatched | cancelled | delivered | received`  
  - `ops_region`: string  
  - `metadata`: map  
  - `createdAt`, `updatedAt`: ISO timestamps

- **Quote**: must include `pricePerBulkUnit` (number) and `numberOfBulkUnits` (integer ≥ 1). `isAccepted` is boolean.

---

### Test cases

#### 1) Create supply — happy path
**Purpose**: create a supply request.  
**Request**
```
POST /api/supplies
Authorization: Bearer <accessToken>
Content-Type: application/json
x-correlation-id: test-create-<unique>

{
  "supplierId": "<supplierObjectId>",
  "requesterId": "<requesterObjectId>",
  "items": [
    { "itemId": "<itemObjectId>", "requestedQuantity": 100 }
  ],
  "deliveryLocation": { "line1": "123 Main St", "city": "Brampton" },
  "ops_region": "north",
  "metadata": { "project": "alpha" }
}
```
**Expect**
- `201`
- Response body: `{ success: true, data: <supply> }`
- `data._id` present; `data.status === 'quote'`; `data.items` length ≥ 1; `createdAt` present.
**Assertions**
- `supplierId` equals request value.
- Audit event `supply.create.success` exists with `target.id === data._id` and `correlationId` matches header.

#### 2) Create supply — validation failures
**Purpose**: missing required fields or invalid ObjectId.  
**Requests**
- Missing `supplierId` or `items` → expect `400`.
- `items` empty array → expect `422` (or `400` depending on implementation).
**Expect**
- `400` or `422` with structured validation errors.
- Audit event `supply.create.failed` or `supply.create.failed.validation` logged.

#### 3) List supplies — pagination and filtering
**Purpose**: retrieve paginated supplies.  
**Request**
```
GET /api/supplies?page=1&limit=25&filter={"ops_region":"north"}
Authorization: Bearer <accessToken>
```
**Expect**
- `200`
- Response contains `{ items: [...], total, page, limit, pages }`.
**Assertions**
- All returned items have `ops_region === "north"` when filter applied.
- Pagination metadata consistent with `total` and `limit`.

#### 4) Get supply by id — happy / not found
**Purpose**: fetch single supply.  
**Requests**
- `GET /api/supplies/:id` with valid id → `200` and supply data.
- `GET /api/supplies/:id` with non-existent id → `404`.
**Assertions**
- `200` response contains `data._id === requested id`.
- `404` returns structured error and audit `supply.get.failed`.

#### 5) Add item to supply
**Purpose**: append an item to an existing supply.  
**Request**
```
POST /api/supplies/:id/items
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "itemId": "<newItemId>", "requestedQuantity": 50 }
```
**Expect**
- `200`
- Response supply contains the new item in `items`.
- Audit `supply.addItem.success` logged with `details.itemId`.

#### 6) Read item
**Purpose**: read a specific item.  
**Request**
```
GET /api/supplies/:id/items/:itemId
Authorization: Bearer <accessToken>
```
**Expect**
- `200` with item object.
- `404` if item or supply not found.

#### 7) Update item (partial)
**Purpose**: update fields on an item (e.g., requestedQuantity or meta).  
**Request**
```
PATCH /api/supplies/:id/items/:itemId
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "requestedQuantity": 120 }
```
**Expect**
- `200` supply returned with updated item value.
- Audit `supply.updateItem.success` logged.

#### 8) Remove item
**Purpose**: remove an item from a supply.  
**Request**
```
DELETE /api/supplies/:id/items/:itemId
Authorization: Bearer <accessToken>
```
**Expect**
- `200` supply returned without the removed item.
- Audit `supply.removeItem.success` logged.

#### 9) Add quote to item
**Purpose**: supplier posts a quote for an item.  
**Request**
```
POST /api/supplies/:id/add-quote
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "itemId": "<itemId>",
  "quote": {
    "pricePerBulkUnit": 12.5,
    "numberOfBulkUnits": 10,
    "discountingScheme": [{ "minQty": 100, "discountPercent": 5, "description": "volume" }]
  }
}
```
**Expect**
- `200` supply returned; the specified item contains a new quote with `pricePerBulkUnit` and `createdAt`.
- Audit `supply.addQuote.success` logged.

#### 10) Accept quote — ensure single accepted
**Purpose**: accept one quote; others become unaccepted.  
**Request**
```
POST /api/supplies/:id/accept-quote
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "itemId": "<itemId>", "quoteId": "<quoteId>" }
```
**Expect**
- `200` supply returned.
- The specified quote has `isAccepted: true`; all other quotes for that item have `isAccepted: false`.
- Audit `supply.acceptQuote.success` logged with `details.quoteId` or `quoteIndex`.

#### 11) Update status — valid and invalid values
**Purpose**: change supply lifecycle status.  
**Requests**
- Valid: `status` in `quote|accepted|dispatched|cancelled|delivered|received` → `200`.
- Invalid: `status: "unknown"` → `400`.
**Expect**
- `200` and `data.status` updated for valid values.
- `400` for invalid values; audit `supply.updateStatus.failed`.

#### 12) Hard delete — admin only
**Purpose**: permanently remove supply.  
**Request**
```
DELETE /api/supplies/:id/hard
Authorization: Bearer <adminAccessToken>
```
**Expect**
- `200` and resource removed.
- Non-admin user receives `403`.
- Audit `supply.delete.hard` success/failure logged.

#### 13) Concurrency and atomicity checks
**Purpose**: ensure item-level updates and quote acceptance are consistent under concurrent requests.  
**Tests**
- Simulate concurrent `addQuote` and `acceptQuote` operations; verify final state is consistent (only one accepted quote).
- Use DB transactions (if supported) to assert atomic behavior where implemented.

#### 14) Error and edge cases
- **Malformed JSON** → `400`.
- **Invalid ObjectId** → `400`.
- **Missing required fields** → `400` with validation details.
- **Item or quote not found** → `404`.
- **Server errors** → `500` and audit event with `severity: error`.

---

### Audit and observability checks

For each mutating operation assert an audit event exists with:
- **eventType** (e.g., `supply.create.success`, `supply.addQuote.failed`)  
- **actor** containing `userId` when available  
- **target** referencing the supply id (and item/quote details in `details`)  
- **outcome** set to `success`, `failure`, or `partial`  
- **correlationId** matching the request header when provided

Log timestamps and ensure events are searchable by `correlationId`.

---

### Test environment and runbook

- **Environment**: run tests against an isolated staging DB; reset DB between test runs or use unique identifiers per test.
- **Authentication**: create test users (supplier, requester, admin) and obtain access tokens before running supply tests.
- **IDs**: generate valid ObjectIds for `supplierId`, `requesterId`, and `itemId` to avoid collisions.
- **Timing**: allow ±2000 ms tolerance for timestamp assertions.
- **Cleanup**: ensure created supplies are removed or soft-deleted after tests (unless testing delete behavior).
- **Concurrency**: run concurrency tests in a controlled environment (single-node DB or transaction-capable cluster) to avoid nondeterministic failures.

---

### Example assertion checklist (per test)
- HTTP status matches expectation.
- Response schema contains required fields and omits sensitive/internal fields.
- DB state reflects the operation (e.g., quote added, item removed).
- Audit event recorded with correct `eventType`, `actor`, `target`, `outcome`, and `correlationId`.
- Role-based access control enforced where applicable.

---

End of Supply acceptance tests.