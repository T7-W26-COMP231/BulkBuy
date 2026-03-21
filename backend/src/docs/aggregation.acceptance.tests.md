### Aggregation Acceptance Criteria

This document defines end‑to‑end acceptance tests and success criteria for the **Aggregation** domain API. Tests assume the API base path is **/api/aggregations**, JSON over HTTPS, and that service‑level audit logging records events with **eventType**, **actor**, **target**, **outcome**, and **correlationId**. Replace `{{BASE_URL}}`, `{{AUTH_TOKEN}}`, and example ids as needed.

---

### Data Model Summary

**Key fields**
- **_id**: ObjectId  
- **itemDtos**: array of objects with **itemId**, **pricingSnapshot**, **supplierId**, **salesWindow** (from, to as epoch ms)  
- **orders**: array of ObjectId  
- **ops_region**: string  
- **status**: one of **in_process**, **pending**, **processed**, **suspended**  
- **metadata**: map of arbitrary values  
- **createdAt** and **updatedAt**: epoch milliseconds

---

### API Endpoints and Expected Behavior

**Create aggregation**
- **POST** `/api/aggregations`
- **Success** `201` with `{ success: true, data: aggregation }`
- **Required**: at least one `itemDtos` entry or explicit business rule satisfied
- **Audit**: `create.aggregation` logged with actor and correlationId

**Get aggregation by id**
- **GET** `/api/aggregations/:id`
- **Success** `200` with `{ success: true, data: aggregation }`
- **Not found** `404` when id missing or not present

**Find by itemId**
- **GET** `/api/aggregations/by-item/:itemId`
- **Success** `200` with `{ success: true, items: [...] }`
- **Query flag** `includeSuspended=true` returns suspended results

**List with pagination**
- **GET** `/api/aggregations?page=1&limit=25&filter={"status":"pending"}`
- **Success** `200` with `{ success: true, items, total, page, limit, pages }`

**Update by id**
- **PATCH** `/api/aggregations/:id`
- **Success** `200` with `{ success: true, data: updatedAggregation }`
- Immutable fields such as `_id` and `createdAt` must not change

**Update one by filter**
- **PATCH** `/api/aggregations` body `{ filter, update }`
- **Success** `200` with `{ success: true, data: updatedAggregation }`

**Add order**
- **POST** `/api/aggregations/:id/add-order` body `{ orderId }`
- **Success** `200` with updated aggregation; operation is idempotent
- **Audit**: `aggregation.addOrder` logged

**Mark processed**
- **POST** `/api/aggregations/:id/mark-processed`
- **Success** `200` with aggregation status set to `processed`
- **Audit**: `aggregation.markProcessed` logged

**Bulk create**
- **POST** `/api/aggregations/bulk` body `[]`
- **Success** `201` with `{ success: true, data: [ ... ] }`
- **Audit**: `create.aggregation.bulk` logged with count

**Hard delete**
- **DELETE** `/api/aggregations/:id/hard`
- **Success** `200` with removed document
- **Access**: admin only; audit `delete.aggregation.hard`

---

### Acceptance Tests

Use the following tests as automated acceptance checks. Each test includes purpose, request, expected response, and assertions.

#### Create Aggregation Test
**Purpose** create aggregation with itemDtos and timestamps  
**Request**
```http
POST {{BASE_URL}}/aggregations
Content-Type: application/json

{
  "itemDtos": [
    {
      "itemId": "60f7c2...abcd",
      "pricingSnapshot": { "price": 19.99, "currency": "USD" },
      "supplierId": "60f7c2...sup1",
      "salesWindow": [{ "from": 1700000000000, "to": 1702592000000 }]
    }
  ],
  "ops_region": "na",
  "metadata": { "source": "batch" }
}
```
**Expect**
- `201` and `data._id`, `data.itemDtos`, `data.createdAt`, `data.updatedAt`
**Assertions**
- `itemDtos[0].itemId` is valid ObjectId string
- `createdAt` and `updatedAt` are numbers and `createdAt <= updatedAt`
- Audit entry `create.aggregation` exists with `outcome: success`

#### Get By Id and Not Found Behavior
**Purpose** verify retrieval and 404 semantics  
**Steps**
1. GET existing id → expect `200` and matching `_id`
2. GET non existing id → expect `404`
**Assertions**
- Response shape matches contract
- Missing id returns `400`

#### Find By ItemId Test
**Purpose** return aggregations containing itemId  
**Request**
```http
GET {{BASE_URL}}/aggregations/by-item/60f7c2...abcd
```
**Expect**
- `200` and `items` array containing aggregations that include the itemId
**Assertions**
- Each returned aggregation has `itemDtos` referencing the requested `itemId`
- `includeSuspended=true` toggles suspended results

#### Add Order Idempotency Test
**Purpose** ensure adding order is idempotent and audited  
**Request**
```http
POST {{BASE_URL}}/aggregations/:id/add-order
Content-Type: application/json

{ "orderId": "60f7c2...order1" }
```
**Expect**
- `200` and `orders` array contains `order1` once
**Assertions**
- Repeating the request does not duplicate `orderId`
- Audit `aggregation.addOrder` logged with `orderId`

#### Mark Processed Test
**Purpose** set status to processed and update timestamp  
**Request**
```http
POST {{BASE_URL}}/aggregations/:id/mark-processed
```
**Expect**
- `200` and `data.status === "processed"`
**Assertions**
- `updatedAt` changed
- Audit `aggregation.markProcessed` logged

#### Update Tests
**Purpose** partial updates and immutable field protection  
**Request**
```http
PATCH {{BASE_URL}}/:id
Content-Type: application/json

{ "ops_region": "eu", "metadata": { "note": "updated" } }
```
**Expect**
- `200` and updated fields reflected
**Assertions**
- `_id` and `createdAt` unchanged
- `updatedAt` updated
- Audit `update.aggregation` logged

#### Bulk Create Test
**Purpose** insert multiple aggregations and return created docs  
**Request**
```http
POST {{BASE_URL}}/aggregations/bulk
Content-Type: application/json

[
  { "itemDtos": [{ "itemId": "60f7...", "pricingSnapshot": {} }] },
  { "itemDtos": [{ "itemId": "60f8...", "pricingSnapshot": {} }] }
]
```
**Expect**
- `201` and array of created aggregations
**Assertions**
- Returned array length equals inserted count
- Audit `create.aggregation.bulk` logged with count

#### Hard Delete Test
**Purpose** permanent removal and admin guard  
**Request**
```http
DELETE {{BASE_URL}}/:id/hard
Authorization: Bearer {{ADMIN_TOKEN}}
```
**Expect**
- `200` and removed document returned
**Assertions**
- Document no longer exists in DB
- Non-admin receives `403`
- Audit `delete.aggregation.hard` logged

---

### Error Cases and Validation

- **Invalid ObjectId** in path or body → `400` with validation details  
- **Invalid filter JSON** in query → `400`  
- **Missing required payload** on create or add-order → `400`  
- **Empty bulk array** → `400`  
- **Repository unique constraint errors** → map to `409` or `400` depending on service mapping  
- **Server errors** produce `500` and an audit event with `severity: error`

---

### Security Audit and Test Notes

- **Audit verification**: For each create, update, delete, addOrder, and markProcessed operation assert an audit log exists with:
  - **eventType** matching the operation
  - **actor** containing user id or service identity
  - **target** referencing aggregation id or relevant identifier
  - **outcome** set to `success` or `failure`
  - **correlationId** propagated from request header `x-correlation-id` if provided
- **Authentication**: endpoints require authentication where appropriate; admin endpoints require role check
- **Timestamps**: allow clock skew tolerance of ±2000 ms when asserting createdAt/updatedAt
- **Indexes**: ensure text or field indexes are present before running large search or filter tests
- **Test environment**: run against a staging DB with isolated dataset; reset or use unique suffixes to avoid collisions

---

End of acceptance criteria for Aggregation domain.