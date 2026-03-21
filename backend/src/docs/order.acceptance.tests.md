### Order Acceptance Criteria

This document defines end‑to‑end acceptance tests and success criteria for the **Order** domain API. Tests assume the API base path is **/api/orders**, JSON over HTTPS, and that service‑level audit logging records events with **eventType**, **actor**, **target**, **outcome**, and **correlationId**. Replace `{{BASE_URL}}`, `{{AUTH_TOKEN}}`, and example ids as needed.

---

### Data Model Summary

**Key fields**
- **_id**: ObjectId  
- **userId**: ObjectId (owner of the order/cart)  
- **items**: array of objects with **productId**, **itemId**, **pricingSnapshot**, **saveForLater**, **quantity**  
- **orderLocation**: address object with optional geo point  
- **deliveryLocation**: address object with optional geo point  
- **paymentMethod**: ObjectId or embedded payment reference  
- **salesWindow**: object with **fromEpoch**, **toEpoch** (epoch ms)  
- **ops_region**: string  
- **messages**: array of ObjectId  
- **metadata**: Map<string, mixed>  
- **status**: enum **draft | submitted | confirmed | cancelled | dispatched | fulfilled**  
- **createdAt** and **updatedAt**: epoch milliseconds

**PricingSnapshot structure**
- **atInstantPrice**: number (price when snapshot taken)  
- **discountedPercentage**: number (0–100)  
- **discountBracket**: object with **initial** and **final** numeric bounds  
- **meta**: mixed (currency, promoCode, etc.)

**Business notes**
- **draft** means the order is the user's shopping cart. The latest draft for a user is considered the active cart.  
- When an order is **submitted**, business logic may create a new blank draft and carry over items marked **saveForLater**.  
- Item-level operations must support **add**, **update** (quantity and saveForLater), **set quantity** (0 removes item), **remove**, and **extract saveForLater**.

---

### API Endpoints and Expected Behavior

**Create order**
- **POST** `/api/orders`
- **Success** `201` with `{ success: true, data: order }`
- **Required**: `userId`
- **Audit**: `create.order` logged with actor and correlationId

**Get order by id**
- **GET** `/api/orders/:id`
- **Success** `200` with `{ success: true, data: order }`
- **Not found** `404` when id missing or not present

**Find by userId**
- **GET** `/api/orders/user/:userId`
- **Success** `200` with `{ success: true, items: [...] }`
- **Pagination** via `page` and `limit` query params

**List with pagination**
- **GET** `/api/orders?page=1&limit=25&filter={"status":"draft"}`
- **Success** `200` with `{ success: true, items, total, page, limit, pages }`

**Update by id**
- **PATCH** `/api/orders/:id`
- **Success** `200` with `{ success: true, data: updatedOrder }`
- Immutable fields such as `_id` and `createdAt` must not change

**Update one by filter**
- **PATCH** `/api/orders` body `{ filter, update }`
- **Success** `200` with `{ success: true, data: updatedOrder }`

**Add message**
- **POST** `/api/orders/:id/add-message` body `{ messageId }`
- **Success** `200` with updated order; operation idempotent
- **Audit**: `order.addMessage` logged

**Update status**
- **POST** `/api/orders/:id/update-status` body `{ status }`
- **Success** `200` with order status updated
- **Audit**: `order.updateStatus` logged

**Add item**
- **POST** `/api/orders/:id/add-item` body `{ productId, itemId, pricingSnapshot?, saveForLater?, quantity? }`
- **Success** `200` with updated order
- If item exists, quantity increments; `saveForLater` and `pricingSnapshot` merge per business rules
- **Audit**: `order.addItem` logged

**Set item quantity**
- **PATCH** `/api/orders/:id/set-item-quantity` body `{ itemId, quantity }`
- **Success** `200` with updated order
- If `quantity === 0` the item is removed
- **Audit**: `order.setItemQuantity` logged

**Update item**
- **PATCH** `/api/orders/:id/update-item` body `{ itemId, changes }`
- **Success** `200` with updated order
- `changes` may include `quantity`, `saveForLater`, `pricingSnapshot`
- If `changes.quantity === 0` the item is removed
- **Audit**: `order.updateItem` logged

**Remove item**
- **DELETE** `/api/orders/:id/items/:itemId`
- **Success** `200` with updated order
- **Audit**: `order.removeItem` logged

**Extract saveForLater**
- **POST** `/api/orders/:id/extract-save-for-later`
- **Success** `200` with `{ success: true, data: { saved: [...], order } }`
- Returns saved items and the updated order with those items removed
- **Audit**: `order.extractSaveForLater` logged

**Bulk create**
- **POST** `/api/orders/bulk` body `[]`
- **Success** `201` with `{ success: true, data: [ ... ] }`
- **Audit**: `create.order.bulk` logged with count

**Hard delete**
- **DELETE** `/api/orders/:id/hard`
- **Success** `200` with removed document
- **Access**: admin only; audit `delete.order.hard`

---

### Acceptance Tests

Use the following tests as automated acceptance checks. Each test includes purpose, request, expected response, and assertions.

#### Create Order Test
**Purpose** create order with userId and optional items  
**Request**
```http
POST {{BASE_URL}}/orders
Content-Type: application/json

{
  "userId": "60f7c2...user1",
  "items": [
    {
      "productId": "60f7c2...prod1",
      "itemId": "60f7c2...item1",
      "pricingSnapshot": { "atInstantPrice": 19.99, "discountedPercentage": 10, "discountBracket": { "initial": 1, "final": 5 } },
      "quantity": 2
    }
  ],
  "ops_region": "na",
  "metadata": { "source": "web" }
}
```
**Expect**
- `201` and `data._id`, `data.items`, `data.createdAt`, `data.updatedAt`
**Assertions**
- `userId` and `items[0].itemId` are valid ObjectId strings
- `createdAt` and `updatedAt` are numbers and `createdAt <= updatedAt`
- Audit entry `create.order` exists with `outcome: success`

#### Get By Id and Not Found Behavior
**Purpose** verify retrieval and 404 semantics  
**Steps**
1. GET existing id → expect `200` and matching `_id`
2. GET non existing id → expect `404`
**Assertions**
- Response shape matches contract
- Missing id returns `400`

#### Find By UserId Test
**Purpose** return orders for a user  
**Request**
```http
GET {{BASE_URL}}/orders/user/60f7c2...user1
```
**Expect**
- `200` and `items` array containing orders for the user
**Assertions**
- Each returned order has `userId` equal to requested `userId`
- Pagination params `page` and `limit` respected

#### Add Item and Idempotency Test
**Purpose** ensure adding item increments or creates and merges flags  
**Request**
```http
POST {{BASE_URL}}/orders/:id/add-item
Content-Type: application/json

{ "productId": "60f7...prod1", "itemId": "60f7...item1", "quantity": 1 }
```
**Expect**
- `200` and `items` contains the item with correct quantity
**Assertions**
- Repeating the request increments quantity, not duplicate entries
- `saveForLater` flag can be set and updated
- Audit `order.addItem` logged

#### Set Item Quantity Test
**Purpose** set quantity and remove when zero  
**Request**
```http
PATCH {{BASE_URL}}/orders/:id/set-item-quantity
Content-Type: application/json

{ "itemId": "60f7...item1", "quantity": 0 }
```
**Expect**
- `200` and item removed from `items`
**Assertions**
- Setting to 0 removes item
- Setting to positive integer updates quantity
- Audit `order.setItemQuantity` logged

#### Update Item Test
**Purpose** update quantity, saveForLater, pricingSnapshot  
**Request**
```http
PATCH {{BASE_URL}}/orders/:id/update-item
Content-Type: application/json

{ "itemId": "60f7...item1", "changes": { "quantity": 3, "saveForLater": true, "pricingSnapshot": { "discountedPercentage": 15 } } }
```
**Expect**
- `200` and updated item attributes reflected
**Assertions**
- `quantity` updated; `saveForLater` toggled; pricing snapshot merged
- If `quantity` set to 0 item removed
- Audit `order.updateItem` logged

#### Extract SaveForLater Test
**Purpose** remove saved items and return them  
**Request**
```http
POST {{BASE_URL}}/orders/:id/extract-save-for-later
```
**Expect**
- `200` with `{ saved: [...], order }`
**Assertions**
- `saved` contains items that had `saveForLater: true`
- `order.items` no longer contains those items
- Audit `order.extractSaveForLater` logged

#### Update and Immutable Field Protection Test
**Purpose** partial updates and immutable field protection  
**Request**
```http
PATCH {{BASE_URL}}/orders/:id
Content-Type: application/json

{ "ops_region": "eu", "metadata": { "note": "updated" } }
```
**Expect**
- `200` and updated fields reflected
**Assertions**
- `_id` and `createdAt` unchanged
- `updatedAt` updated
- Audit `update.order` logged

#### Bulk Create Test
**Purpose** insert multiple orders and return created docs  
**Request**
```http
POST {{BASE_URL}}/orders/bulk
Content-Type: application/json

[
  { "userId": "60f7...", "items": [] },
  { "userId": "60f8...", "items": [] }
]
```
**Expect**
- `201` and array of created orders
**Assertions**
- Returned array length equals inserted count
- Audit `create.order.bulk` logged with count

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
- Audit `delete.order.hard` logged

---

### Error Cases and Validation

- **Invalid ObjectId** in path or body → `400` with validation details  
- **Invalid filter JSON** in query → `400`  
- **Missing required payload** on create or add-item → `400` or `422` depending on validation vs business rule  
- **Setting quantity to negative** → `400`  
- **Item not found when updating** → `404`  
- **Empty bulk array** → `400`  
- **Repository unique constraint errors** → map to `409` or `400` depending on service mapping  
- **Server errors** produce `500` and an audit event with `severity: error`

---

### Security, Audit and Test Notes

- **Audit verification**: For each create, update, delete, addItem, setItemQuantity, updateItem, removeItem, extractSaveForLater operation assert an audit log exists with:
  - **eventType** matching the operation  
  - **actor** containing user id or service identity  
  - **target** referencing order id or relevant identifier  
  - **outcome** set to `success` or `failure`  
  - **correlationId** propagated from request header `x-correlation-id` if provided
- **Authentication**: endpoints require authentication where appropriate; admin endpoints require role check  
- **Timestamps**: allow clock skew tolerance of ±2000 ms when asserting createdAt/updatedAt  
- **Indexes**: ensure indexes on `userId`, `createdAt`, `ops_region`, `status`, and `deliveryLocation.geo` exist before running large search or filter tests  
- **Test environment**: run against a staging DB with isolated dataset; reset or use unique suffixes to avoid collisions  
- **Cart semantics**: tests that exercise cart lifecycle should verify that the latest draft is used as the active cart and that `saveForLater` items are preserved when a new blank draft is created after submission

---

End of acceptance criteria for Order domain.