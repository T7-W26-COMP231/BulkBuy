### Message Acceptance Tests

Base path: **`/api/messages`**  
API style: JSON over HTTPS. Tests assume authentication via **Authorization: Bearer \<accessToken\>**. Each request should include an **x-correlation-id** header when available; audit events must include that correlation id.

---

### Summary and Success Criteria

- **Create**: POST `/messages` creates a message record with required fields and returns the created resource with `_id`, `type`, `recipients`, `status` defaulting to `draft`, and timestamps.  
- **List and Get**: GET endpoints return paginated lists and single resources; 404 for missing ids.  
- **Attachments and Recipients**: Add and remove attachments and recipients atomically.  
- **Status transitions**: Draft → submitted via send endpoint; read/unread toggles work as expected. Soft delete marks message deleted; hard delete removes it (admin only).  
- **Reply and Send**: Reply creates a new message with `replyTo` set; send transitions status to `submitted`.  
- **Audit**: Every mutating operation emits an audit event with `eventType`, `actor`, `target`, `outcome`, and `correlationId`.  
- **Security**: Only authenticated users may mutate messages; admin-only endpoints enforce role checks.

---

### Data Contract

**Message**
- **_id**: ObjectId  
- **avatar**: ObjectId or null  
- **type**: enum `issue_wall | email | notification | order | review`  
- **recipients**: `{ all: boolean, users: [ObjectId] }`  
- **fromUserId**: ObjectId or null  
- **subject**: string  
- **details**: string  
- **attachments**: array of ObjectId  
- **ops_region**: string  
- **status**: enum `draft | submitted | deleted | read | unread`  
- **replyTo**: ObjectId or null  
- **metadata**: Map<string, mixed>  
- **createdAt**, **updatedAt**: ISO timestamps

**Behavioral rules**
- `type` is required on create and must be one of the allowed enums.  
- `status` defaults to `draft`. `send` endpoint sets `status` to `submitted`. `mark-read` and `mark-unread` set `status` accordingly. `soft-delete` sets `deleted: true` and `status: deleted`.  
- Attachments and recipients are modified atomically using `$push`, `$pull`, or `$addToSet` semantics.  
- `replyTo` on reply points to the original message id.

---

### Endpoints and Expected Responses

- **POST /messages** create message → `201`  
- **GET /messages** list messages (pagination/filter) → `200`  
- **GET /messages/:id** get message by id → `200` or `404`  
- **PATCH /messages/:id** update message partial → `200` or `404`  
- **POST /messages/:id/soft-delete** soft delete → `200`  
- **DELETE /messages/:id/hard** hard delete (admin) → `200` or `403`  
- **POST /messages/:id/add-attachment** add attachment → `200`  
- **POST /messages/:id/remove-attachment** remove attachment → `200`  
- **POST /messages/:id/add-recipient** add recipient → `200`  
- **POST /messages/:id/remove-recipient** remove recipient → `200`  
- **POST /messages/:id/mark-read** mark read → `200`  
- **POST /messages/:id/mark-unread** mark unread → `200`  
- **POST /messages/:id/send** send message (draft → submitted) → `200`  
- **POST /messages/:id/reply** reply to message → `201`

---

### Test Cases

#### Create message happy path
**Request**
- POST `/api/messages` with valid `type`, optional `recipients`, `subject`, `details`, `attachments`.  
**Expect**
- `201` with `{ success: true, data: <message> }`.  
- `data._id` present; `data.type` matches request; `data.status === 'draft'`; `createdAt` present.  
- Audit event `message.create.success` with `target.id === data._id` and matching `correlationId`.

#### Create message validation failures
**Requests**
- Missing `type` or invalid `type` → `400`.  
- Invalid ObjectId in `recipients.users` or `attachments` → `400`.  
**Expect**
- Structured validation error and audit `message.create.failed`.

#### List messages pagination and filtering
**Request**
- GET `/api/messages?page=1&limit=25&filter={"ops_region":"east"}`  
**Expect**
- `200` with `{ items, total, page, limit, pages }`.  
- Returned items match filter when provided.

#### Get message by id happy and not found
**Requests**
- GET `/api/messages/:id` with existing id → `200`.  
- GET `/api/messages/:id` with non-existent id → `404`.  
**Expect**
- Correct data or structured 404 error; audit `message.get.failed` for failures.

#### Update message partial
**Request**
- PATCH `/api/messages/:id` with `{ subject: "New subject" }`  
**Expect**
- `200` with updated message; audit `message.update.success`.

#### Add and remove attachment
**Requests**
- POST `/api/messages/:id/add-attachment` with `{ fileId }` → `200`.  
- POST `/api/messages/:id/remove-attachment` with `{ fileId }` → `200`.  
**Expect**
- Attachments array updated atomically; audit events `message.addAttachment.success` and `message.removeAttachment.success`.

#### Add and remove recipient
**Requests**
- POST `/api/messages/:id/add-recipient` with `{ userId }` → `200`.  
- POST `/api/messages/:id/remove-recipient` with `{ userId }` → `200`.  
**Expect**
- Recipients updated atomically; duplicate adds are idempotent; audit events logged.

#### Mark read and unread
**Requests**
- POST `/api/messages/:id/mark-read` → `200`.  
- POST `/api/messages/:id/mark-unread` → `200`.  
**Expect**
- `status` updated to `read` or `unread`; audit events `message.markRead.success` and `message.markUnread.success`.

#### Send message
**Request**
- POST `/api/messages/:id/send` → `200`.  
**Expect**
- `status` becomes `submitted`; audit `message.send.success`.

#### Reply to message
**Request**
- POST `/api/messages/:id/reply` with reply payload (type, subject, details, recipients optional) → `201`.  
**Expect**
- New message created with `replyTo` set to original id; recipients default to original `fromUserId` if not provided; audit `message.reply.success`.

#### Soft delete and hard delete
**Requests**
- POST `/api/messages/:id/soft-delete` → `200`.  
- DELETE `/api/messages/:id/hard` as admin → `200`. Non-admin → `403`.  
**Expect**
- Soft delete sets `deleted: true` and `status: deleted`; hard delete removes record; audit events logged.

#### Concurrency and atomicity checks
**Tests**
- Concurrent `add-attachment` and `remove-attachment` operations should not corrupt attachments array.  
- Concurrent `add-recipient` operations should be idempotent and not create duplicates.  
- Use transactions where supported to assert atomic behavior.

#### Error and edge cases
- Malformed JSON → `400`.  
- Invalid ObjectId in path or body → `400`.  
- Missing required fields → `400`.  
- Message not found → `404`.  
- Server errors → `500` and audit failure events.

---

### Audit and Observability Checks

For each mutating operation assert an audit event exists with:
- **eventType** (e.g., `message.create.success`, `message.addAttachment.failed`)  
- **actor** containing `userId` when available  
- **target** referencing the message id and relevant details in `details`  
- **outcome** set to `success` or `failure`  
- **correlationId** matching the request header when provided

Ensure audit events include timestamps and are searchable by `correlationId`.

---

### Test Environment and Runbook

- **Environment**: run tests against an isolated staging DB; reset DB between test runs or use unique identifiers per test.  
- **Authentication**: create test users (regular user and admin) and obtain access tokens before running message tests.  
- **IDs**: generate valid ObjectIds for `fromUserId`, `recipients.users`, and `attachments`.  
- **Timing**: allow ±2000 ms tolerance for timestamp assertions.  
- **Cleanup**: ensure created messages are removed or soft-deleted after tests (unless testing delete behavior).  
- **Concurrency**: run concurrency tests in a controlled environment (single-node DB or transaction-capable cluster) to avoid nondeterministic failures.

---

### Example Assertion Checklist Per Test

- HTTP status matches expectation.  
- Response schema contains required fields and omits internal fields.  
- DB state reflects the operation (e.g., attachment added, recipient removed).  
- Audit event recorded with correct `eventType`, `actor`, `target`, `outcome`, and `correlationId`.  
- Role-based access control enforced where applicable.

---

End of Message acceptance tests.