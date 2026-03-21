### SalesWindow Acceptance Tests

**Base path**: **`/api/sales-windows`**  
**Auth**: Bearer token via **Authorization: Bearer <accessToken>** for protected endpoints  
**Correlation**: Include **x-correlation-id** header; audit events must include the same correlation id

---

### Summary and Success Criteria

- **Create and validation**: Creating a SalesWindow with a valid `window.fromEpoch` and `window.toEpoch` succeeds with **201**. Invalid ranges return **400**.  
- **CRUD**: Get, update, upsert, bulk-insert, and hard delete behave as expected and return appropriate HTTP statuses.  
- **Item management**: Adding, updating, and removing item snapshots under products work correctly and preserve timestamps and metadata.  
- **Defaults**: When adding an item without `pricing_snapshot`, defaults are taken from the most recent previous SalesWindow when available.  
- **Overflow chaining**: When a document exceeds the configured size threshold, an overflow SalesWindow is created and linked via `overflow_id`.  
- **Audit**: All mutating operations emit audit events with **eventType**, **actor**, **target**, **outcome**, and **correlationId**.  
- **Security**: Authenticated users required for protected endpoints; admin role required for hard delete.  
- **Data integrity**: Product and item identifiers are validated as ObjectIds, geo or pricing shapes preserved, and nested timestamps set and updated.

---

### Data Contract

**SalesWindow object fields**

- **_id**: ObjectId  
- **window**: `{ fromEpoch: number, toEpoch: number }` epoch milliseconds  
- **products**: `[{ productId: ObjectId, items: [{ itemId: ObjectId, pricing_snapshot: object, metadata: object, createdAt: ISODate, updatedAt: ISODate }], metadata: object }]`  
- **overflow_id**: ObjectId or null  
- **metadata**: object  
- **createdAt** and **updatedAt**: ISO timestamps

Validation expectations

- `window.fromEpoch` and `window.toEpoch` are required on create and must be integers with `toEpoch > fromEpoch`.  
- `productId` and `itemId` must be valid ObjectIds when provided.  
- `pricing_snapshot` and `metadata` are objects when present.  
- `overflow_id` must be a valid ObjectId when present.

---

### Endpoints and Expected Responses

| Endpoint | Method | Success Status | Notes |
|---|---:|---:|---|
| `/` | POST | **201** | Create sales window |
| `/:id` | GET | **200** | Returns sales window or **404** |
| `/range` | GET | **200** | Query by `fromEpoch` and `toEpoch` |
| `/` | GET | **200** | List / paginate sales windows |
| `/:id` | PATCH | **200** | Partial update |
| `/upsert` | POST | **200** | Upsert by filter |
| `/bulk-insert` | POST | **200** | Bulk insert many windows |
| `/:id/items` | POST | **200** | Add or update item snapshot |
| `/:id/items/:productId/:itemId` | DELETE | **200** | Remove item snapshot |
| `/:id/items/:productId/:itemId` | GET | **200** | Get item snapshot; `?fallback=true` to fallback to last window |
| `/:id/overflow-chain` | GET | **200** | Return linked overflow windows |
| `/:id` | DELETE | **200** | Hard delete (admin only) |

---

### Test Cases

#### Create SalesWindow happy path
- **Request**: `POST /api/sales-windows` with valid `window.fromEpoch`, `window.toEpoch`, optional `products`.  
- **Expect**: `201` with `{ success: true, data: <salesWindow> }`. `data._id` present. Audit event `salesWindow.create.success` with correlation id.

#### Create invalid window range
- **Request**: `POST /api/sales-windows` with `toEpoch <= fromEpoch`.  
- **Expect**: `400` with validation error. Audit event `salesWindow.create.failed`.

#### Get by id and range
- **Requests**: `GET /api/sales-windows/:id` and `GET /api/sales-windows/range?fromEpoch=...&toEpoch=...`.  
- **Expect**: `200` and correct resources. Non-existent id returns `404`.

#### Update partial
- **Request**: `PATCH /api/sales-windows/:id` with partial fields.  
- **Expect**: `200` with updated fields. Empty payload returns `400`. Audit event `salesWindow.update.success`.

#### Upsert create and update
- **Request**: `POST /api/sales-windows/upsert` with `filter` and `update`.  
- **Expect**: `200` with created or updated document. Audit event `salesWindow.upsert.success`.

#### Bulk insert
- **Request**: `POST /api/sales-windows/bulk-insert` with array of valid windows.  
- **Expect**: `200` with inserted docs. Duplicates handled gracefully.

#### Add, update, remove item snapshot
- **Add**: `POST /api/sales-windows/:id/items` with `{ productId, itemId, pricing_snapshot?, metadata? }`.  
  - **Expect**: `200` and returned result indicating success or overflow. New item has `createdAt` and `updatedAt`. Audit event `salesWindow.item.addOrUpdate.success`.
- **Update**: `POST /api/sales-windows/:id/items` with same `productId` and `itemId` and changed fields.  
  - **Expect**: `200` and nested item `updatedAt` changed. Audit event `salesWindow.item.addOrUpdate.success`.
- **Remove**: `DELETE /api/sales-windows/:id/items/:productId/:itemId`.  
  - **Expect**: `200` and `{ removed: true }`. Audit event `salesWindow.item.remove.success`.

#### Defaults from last window
- **Setup**: Create a previous SalesWindow containing a product/item with a `pricing_snapshot`.  
- **Request**: Add the same product/item to a new SalesWindow without `pricing_snapshot`.  
- **Expect**: New item receives `pricing_snapshot` copied from last window. Audit event recorded.

#### Overflow chaining
- **Setup**: Configure a low `createOverflowThresholdBytes` for test or craft a large payload.  
- **Request**: Add items until the document exceeds threshold.  
- **Expect**: Response indicates `movedToOverflow: true` and `overflowId` returned. `overflow_id` on source window set. `GET /:id/overflow-chain` returns linked windows.

#### Hard delete (admin only)
- **Request**: `DELETE /api/sales-windows/:id` as admin.  
- **Expect**: `200` and removed document. Non-admin returns `403`. Audit event `salesWindow.delete.hard.success`.

---

### Edge Cases and Concurrency

- **Invalid ObjectId** in path returns `400`.  
- **Missing required fields** on create returns `400`.  
- **Malformed JSON** in query parameters returns `400`.  
- **Concurrent upserts** with same filter should not create duplicates; assert single final document.  
- **Concurrent item operations**: concurrently add/update/remove items; verify final state consistent and no duplicate item entries for same `itemId` under a product.  
- **Overflow repeated chaining**: if overflow doc also exceeds threshold, ensure chain continues and `overflow_id` links form a list.  
- **Partial failures**: simulate failures during overflow creation and assert source window remains consistent.

---

### Audit and Observability Checks

For each mutating operation assert an audit event exists with:

- **eventType** such as `salesWindow.create.success`, `salesWindow.item.addOrUpdate.failed`  
- **actor** containing `userId` when available  
- **target** referencing the sales window id  
- **outcome** set to `success` or `failure`  
- **correlationId** matching request header

Audit events should include timestamps and be searchable by `correlationId`. Application logs should record errors and stack traces for failures.

---

### Test Environment and Runbook

- **Environment**: Isolated test database. Reset DB between runs or use unique identifiers.  
- **Authentication**: Create test users including an admin and obtain tokens before tests.  
- **IDs**: Use valid ObjectIds for `windowId`, `productId`, `itemId`, and `overflow_id`.  
- **Transactions**: If testing session behavior, ensure MongoDB replica set or in-memory server supports transactions.  
- **Overflow threshold**: For overflow tests, set a low threshold in test opts or craft large payloads.  
- **Timing**: Allow ±2000 ms tolerance for timestamp assertions.  
- **Cleanup**: Remove created sales windows and test users after tests.

---

### Example Assertion Checklist Per Test

- **HTTP status** matches expectation.  
- **Response schema** contains required fields and omits internal fields such as `__v`.  
- **Database state** reflects the operation and enforces constraints.  
- **Defaults** copied from last window when applicable.  
- **Overflow** returns `overflowId` and source window `overflow_id` set.  
- **Nested timestamps** (`createdAt`, `updatedAt`) are set and updated correctly.  
- **Audit event** recorded with correct `eventType`, `actor`, `target`, `outcome`, and `correlationId`.  
- **Role checks** enforced for admin-only endpoints.

---

End of SalesWindow acceptance tests.