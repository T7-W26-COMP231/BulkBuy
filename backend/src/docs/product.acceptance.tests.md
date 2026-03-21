### Product Acceptance Tests

**From the provided models document:** *“Product · _id: ObjectId · name: string · descriptions: [{ locale: string, title: string, body: string }] · items: [{ itemId: ObjectId, salesPrices: [{ price: number, currency: string, from: ISODate, to: ISODate }] }] · discountScheme: object (tiered rules) · salesWindow: { fromEpoch: number, toEpoch: number }.”*  
**Also:** *“Status : active, inactive, deleted, suspended, on_sale, ... · createdAt: ISODate · updatedAt: ISODate.”*

This file lists end‑to‑end acceptance tests for the **Product** domain. Each test includes **purpose**, **preconditions**, **request**, **expected response**, and **assertions**. Tests assume the API base path is `/api/products` and JSON over HTTPS. Replace `{{BASE_URL}}` and `{{AUTH_TOKEN}}` as needed.

---

### Create and Validation Tests
**Purpose** Ensure product creation, required fields, nested structures, and normalization.

**Preconditions** No product exists with the same unique identifiers (e.g., slug or sku if used).

**Request**
```http
POST {{BASE_URL}}/products
Content-Type: application/json

{
  "name": "Premium Widget",
  "descriptions": [{ "locale": "en", "title": "Premium Widget", "body": "High quality widget." }],
  "items": [{ "itemId": "60f7c2...", "salesPrices": [{ "price": 19.99, "currency": "USD", "from": 1700000000000 }] }],
  "discountScheme": { "tiers": [{ "minQty": 10, "discountPercent": 5 }] },
  "salesWindow": { "fromEpoch": 1700000000000, "toEpoch": 1702592000000 },
  "ops_region": "na"
}
```

**Expected Response**
- **Status** `201`
- **Body** `{ success: true, data: { _id, name, descriptions, items, discountScheme, salesWindow, ops_region, status, createdAt, updatedAt } }`

**Assertions**
- `data.name` equals submitted name.
- `data.items[*].itemId` are valid ObjectId strings.
- `createdAt` and `updatedAt` are numbers (epoch ms) and `createdAt <= updatedAt`.
- Response does **not** include internal-only fields (e.g., internal DB version keys).
- Missing required `name` returns **400** with validation details.

---

### Read, Lookup and Pagination Tests
**Purpose** Retrieve products by id, by itemId, and validate pagination, sorting, and filters.

**Preconditions** At least 15 products exist for pagination tests.

**Requests & Expected Responses**
- **Get by id**
  ```http
  GET {{BASE_URL}}/products/:id
  Authorization: Bearer {{AUTH_TOKEN}}
  ```
  **Expect** `200` and `{ success: true, data: { _id, name, descriptions, items, status } }`.

- **Find by itemId**
  ```http
  GET {{BASE_URL}}/products/by-item/:itemId
  ```
  **Expect** `200` and `{ success: true, items: [...] }` where each item contains the `items` array referencing the requested `itemId`.

- **List with pagination**
  ```http
  GET {{BASE_URL}}/products?page=2&limit=10&sort=updatedAt:-1&filter={"status":"active"}
  ```
  **Expect** `200` and `{ success: true, items: [...], total, page: 2, limit: 10, pages }`.

**Assertions**
- `_id` in response matches requested id.
- `findByItemId` returns only products containing that `itemId`.
- `items.length <= limit`.
- `total` equals `countDocuments(filter)`.
- `pages === Math.ceil(total/limit)`.

---

### Public Search and Text Search Tests
**Purpose** Validate public search behavior, text scoring, and filter enforcement.

**Request**
```http
GET {{BASE_URL}}/products/public-search?q=premium&page=1&limit=10&filters={"ops_region":"na"}
```

**Expected Response**
- **Status** `200`
- **Body** `{ success: true, total, items: [...], page, limit, pages }`

**Assertions**
- Returned products have `status === 'active'` and `deleted === false`.
- `ops_region` filter applied.
- When `q` provided, results are ordered by relevance (textScore) or by fallback sort.
- Items do not include internal-only fields.

---

### Update, Soft Delete and Restore Tests
**Purpose** Partial updates, immutable field protection, soft delete behavior, and restore.

**Update Request**
```http
PATCH {{BASE_URL}}/:id
Content-Type: application/json

{ "name": "Premium Widget v2", "discountScheme": { "tiers": [{ "minQty": 5, "discountPercent": 3 }] } }
```
**Expected** `200` and `{ success: true, data: { name: "Premium Widget v2", updatedAt } }`

**Soft Delete Request**
```http
DELETE {{BASE_URL}}/:id
```
**Expected** `200` and `{ success: true, data: { deleted: true, deletedAt, status: 'deleted' } }`

**Restore Request**
```http
POST {{BASE_URL}}/:id/restore
```
**Expected** `200` and `{ success: true, data: { deleted: false, status: 'active' } }`

**Assertions**
- Immutable fields (`_id`, `createdAt`) remain unchanged after update.
- `updatedAt` is updated on modifications.
- After soft delete, normal GET returns **404**; `?includeDeleted=true` returns the soft-deleted product.
- Restore clears `deleted`, `deletedAt`, `deletedBy` and sets `status` to `active`.

---

### Bulk Create, Error Cases and Test Execution Notes
**Bulk Create Request**
```http
POST {{BASE_URL}}/products/bulk
Content-Type: application/json

[
  { "name": "Bulk A", "items": [], "salesWindow": {} },
  { "name": "Bulk B", "items": [], "salesWindow": {} }
]
```
**Expected** `201` and `{ success: true, data: [ { _id, name }, ... ] }`

**Validation & Error Cases**
- Invalid `itemId` format → **400** with validation details.
- Invalid JSON in `filter` query → **400**.
- Attempt to modify `_id` or `createdAt` → **400**.
- Duplicate unique constraint (if slug/sku unique) → **409** or **400** depending on error mapping.

**Security & Audit**
- Service-level audit logging must record create/update/delete events with actor and correlation id (verify audit entries exist for each audited operation).

**Test Execution Notes**
- Run acceptance tests against a staging DB with a fresh dataset.
- Allow small clock skew tolerance (±2000 ms) when asserting timestamps.
- Ensure text indexes are built before running search tests.
- Use environment variable `DEFAULT_OPS_REGION` or explicit `ops_region` in fixtures to make region-dependent tests deterministic.

---

End of product acceptance tests document.