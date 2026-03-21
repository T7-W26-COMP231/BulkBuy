### Item Acceptance Tests

**Base path**: **`/api/items`**  
**Auth**: Bearer token via **Authorization: Bearer <accessToken>**  
**Correlation**: Include **x-correlation-id** header; audit events must include the same correlation id

---

### Summary and Success Criteria

- **Create and uniqueness**: Creating an item with a unique **sku** succeeds with **201**. Duplicate **sku** returns **409 Conflict**.  
- **CRUD**: Get, update, soft delete, and hard delete behave as expected and return appropriate HTTP statuses.  
- **Inventory**: Stock adjustments, reservations, and releases update inventory atomically and enforce constraints.  
- **Pricing**: Price resolution returns the correct effective price for a given date.  
- **Search and listing**: Public search returns only **active** and **published** items unless filters override. Pagination and filters work correctly.  
- **Audit**: All mutating operations emit audit events with **eventType**, **actor**, **target**, **outcome**, and **correlationId**.  
- **Security**: Authenticated users required for protected endpoints. Admin role required for hard delete.  
- **Data integrity**: Variants, warehouses, and pricing tiers remain consistent after concurrent operations.

---

### Data Contract

**Item object fields**

- **_id**: ObjectId  
- **sku**: string unique indexed  
- **title**: string  
- **slug**: string unique  
- **description**: string  
- **shortDescription**: string  
- **brand**: `{ id: ObjectId, name: string }`  
- **categories**: `[ObjectId]`  
- **tags**: `[string]`  
- **images**: `[ObjectId]`  
- **media**: `[{ type: video|image, s3: ObjectId }]`  
- **price**: `[{ list: number, sale: number|null, currency: string, effectiveFrom: ISODate|null, effectiveTo: ISODate|null }]`  
- **pricingTiers**: `[{ minQty: number, price: number, currency: string }]`  
- **inventory**: `{ stock: number, reserved: number, backorder: boolean, warehouses: [{ id: ObjectId, qty: number }] }`  
- **variants**: `[{ sku: string, attributes: Map<string,string>, price: array, inventory: object }]`  
- **weight**: `{ value: number, unit: string }`  
- **dimensions**: `{ length: number, width: number, height: number, unit: string }`  
- **shipping**: `{ class: string, freightClass: string, shipsFrom: string }`  
- **taxClass**: string  
- **ratings**: `{ avg: number, count: number }`  
- **reviews**: `[ObjectId]`  
- **relatedProducts**: `[ObjectId]`  
- **seller**: `{ id: ObjectId, name: string }`  
- **metadata**: Map<string,mixed>  
- **status**: enum **active | suspended | draft | deleted**  
- **ops_region**: string  
- **published**: boolean  
- **createdAt** and **updatedAt**: ISO timestamps

---

### Endpoints and Expected Responses

| Endpoint | Method | Success Status | Notes |
|---|---:|---:|---|
| `/` | POST | **201** | Create item; duplicate sku returns **409** |
| `/:id` | GET | **200** | Returns item or **404** |
| `/sku/:sku` | GET | **200** | Lookup by sku |
| `/:id` | PATCH | **200** | Partial update |
| `/upsert` | POST | **200** | Upsert by filter |
| `/bulk-insert` | POST | **200** | Bulk insert many items |
| `/:id/adjust-stock` | POST | **200** | Body `{ delta }` |
| `/:id/reserve` | POST | **200** | Body `{ qty }` |
| `/:id/release` | POST | **200** | Body `{ qty }` |
| `/:id/apply-rating` | POST | **200** | Body `{ rating }` |
| `/:id/soft-delete` | POST | **200** | Marks status deleted |
| `/:id/hard` | DELETE | **200** | Admin only; removes document |
| `/:id/publish` | POST | **200** | Sets published true |
| `/:id/unpublish` | POST | **200** | Sets published false |
| `/search` | GET | **200** | Public search; filters and pagination supported |

---

### Test Cases

#### Create item happy path
- **Request**: `POST /api/items` with valid payload including unique **sku**, **title**, and required fields.  
- **Expect**: `201` with `{ success: true, data: <item> }`. `data._id` present. `data.sku` equals request sku. Audit event `item.create.success` with correlation id.

#### Create duplicate sku
- **Setup**: Create item with sku `SKU-123`.  
- **Request**: `POST /api/items` with same sku.  
- **Expect**: `409` with message about duplicate sku. No second item created. Audit event `item.create.failed`.

#### Get by id and sku
- **Requests**: `GET /api/items/:id` and `GET /api/items/sku/:sku`.  
- **Expect**: `200` and correct resource. Non-existent returns `404`.

#### Update partial
- **Request**: `PATCH /api/items/:id` with `{ ops_region: 'eu-west' }`.  
- **Expect**: `200` with updated field. Empty payload returns `400`. Audit event `item.update.success`.

#### Upsert create and update
- **Request A**: `POST /api/items/upsert` with filter `{ sku }` and update payload.  
- **Expect A**: `200` with created or updated item. Audit event `item.upsert.success`.

#### Bulk insert
- **Request**: `POST /api/items/bulk-insert` with array of valid items.  
- **Expect**: `200` with inserted docs count. Duplicates handled gracefully and reported.

#### Adjust stock, reserve, release
- **Adjust**: `POST /api/items/:id/adjust-stock` with `{ delta: 10 }` increases stock.  
- **Reserve**: `POST /api/items/:id/reserve` with `{ qty: 2 }` increments reserved when available or if backorder true.  
- **Release**: `POST /api/items/:id/release` with `{ qty: 1 }` decrements reserved.  
- **Expect**: `200` and inventory reflects changes. Insufficient stock without backorder returns `409`. Audit events logged.

#### Apply rating
- **Request**: `POST /api/items/:id/apply-rating` with `{ rating: 4.5 }`.  
- **Expect**: `200` and ratings updated with recalculated avg and count. Audit event `item.rating.apply.success`.

#### Soft delete and hard delete
- **Soft delete**: `POST /api/items/:id/soft-delete` sets `status` to `deleted`.  
- **Hard delete**: `DELETE /api/items/:id/hard` as admin removes document. Non-admin returns `403`. After hard delete, references should be cleaned where applicable. Audit events logged.

#### Public search and list
- **Requests**: `GET /api/items/search?q=term&limit=10` and `GET /api/items?page=1&limit=20&filter=...`.  
- **Expect**: `200` with results matching filters. Only active and published items returned by default.

---

### Edge Cases and Concurrency

- **Invalid ObjectId** in path returns `400`.  
- **Malformed JSON** in `filter` query returns `400`.  
- **Empty update payload** returns `400`.  
- **Concurrent creates with same sku**: Run N concurrent `POST /items` with same sku. Assert exactly one success and others return `409`.  
- **Concurrent inventory operations**: Run concurrent reserve and adjust operations. Verify final inventory is consistent and no negative stock occurs.  
- **Partial failures**: If create fails mid-process without transaction, ensure no orphaned references remain. Tests should simulate session and non-session flows.  
- **Pricing windows**: Test price resolution across `effectiveFrom` and `effectiveTo` boundaries including null windows.

---

### Audit and Observability Checks

For each mutating operation assert an audit event exists with:
- **eventType** such as `item.create.success` or `item.inventory.reserve.failed`  
- **actor** containing `userId` when available  
- **target** referencing the item id  
- **outcome** set to `success` or `failure`  
- **correlationId** matching request header when provided

Audit events should include timestamps and be searchable by `correlationId`.

---

### Test Environment and Runbook

- **Environment**: Isolated test database. Reset DB between runs or use unique identifiers.  
- **Authentication**: Create test users including an admin and obtain tokens before tests.  
- **IDs**: Use valid ObjectIds for `userId`, `itemId`, and related references.  
- **Transactions**: If testing session behavior, ensure MongoDB replica set or in-memory server supports transactions.  
- **Timing**: Allow ±2000 ms tolerance for timestamp assertions.  
- **Cleanup**: Remove or hard-delete created items and related test users after tests.

---

### Example Assertion Checklist Per Test

- **HTTP status** matches expectation.  
- **Response schema** contains required fields and omits internal fields.  
- **Database state** reflects the operation and enforces uniqueness and constraints.  
- **Inventory** values never go negative and reserved does not exceed stock unless backorder allowed.  
- **Pricing** resolution returns expected price for test dates.  
- **Audit event** recorded with correct `eventType`, `actor`, `target`, `outcome`, and `correlationId`.  
- **Role checks** enforced for admin-only endpoints.

---

End of item acceptance tests.