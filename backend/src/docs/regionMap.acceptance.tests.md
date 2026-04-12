### RegionMap Acceptance Tests

**Base path**: **`/api/region-maps`**  
**Auth**: Bearer token via **Authorization: Bearer <accessToken>** for protected endpoints  
**Correlation**: Include **x-correlation-id** header; audit events must include the same correlation id

---

### Summary and Success Criteria

- **Create and uniqueness**: Creating a RegionMap with a unique **code** and **ops_region** succeeds with **201**. Duplicate **code** returns **409 Conflict**.  
- **CRUD**: Get, update, add/remove locations, and hard delete behave as expected and return appropriate HTTP statuses.  
- **Geospatial**: `nearest` queries return locations ordered by distance and respect `maxDistance` and `limit`.  
- **Nested operations**: Adding, updating, and removing nested `locations` are atomic and preserve timestamps and metadata.  
- **Audit**: All mutating operations emit audit events with **eventType**, **actor**, **target**, **outcome**, and **correlationId**.  
- **Security**: Authenticated users required for protected endpoints; admin role required for hard delete.  
- **Data integrity**: Location `locationId` uniqueness within a region, geo coordinates validated, and address/contact fields preserved.

---

### Data Contract

**RegionMap object fields**

- **_id**: ObjectId  
- **ops_region**: string (logical region key)  
- **code**: string (short code, unique)  
- **name**: string  
- **description**: `{ subject: string, text: string, files: [S3file._id] }`  
- **locations**: `[{ locationId: ObjectId, name: string, type: string, description: {...}, address: { line1, line2, city, region, postalCode, country }, geo: { type: 'Point', coordinates: [lng, lat] }, contact: { phone, email }, metadata: Map<string,mixed>, createdAt: ISODate, updatedAt: ISODate }]`  
- **metadata**: Map<string,mixed>  
- **createdAt** and **updatedAt**: ISO timestamps

Validation expectations:
- `geo` must be a GeoJSON Point with `coordinates: [lng, lat]`.
- `contact.email` must be a valid email when provided.
- `code`, `ops_region`, and `name` are required on create.

---

### Endpoints and Expected Responses

| Endpoint | Method | Success Status | Notes |
|---|---:|---:|---|
| `/` | POST | **201** | Create region map; duplicate `code` returns **409** |
| `/:id` | GET | **200** | Returns region map or **404** |
| `/by-ops/:opsRegion` | GET | **200** | Lookup by ops_region |
| `/` | GET | **200** | List / paginate region maps |
| `/:id` | PATCH | **200** | Partial update |
| `/upsert` | POST | **200** | Upsert by filter |
| `/bulk-insert` | POST | **200** | Bulk insert many region maps |
| `/:id/locations` | POST | **200** | Add location; body contains location payload |
| `/:id/locations/:locationId` | PATCH | **200** | Update nested location |
| `/:id/locations/:locationId` | DELETE | **200** | Remove nested location |
| `/nearest` | GET | **200** | Query nearest locations; public endpoint |
| `/:id` | DELETE | **200** | Hard delete (admin only) |

---

### Test Cases

#### Create RegionMap happy path
- **Request**: `POST /api/region-maps` with `{ ops_region, code, name, description?, locations? }`.  
- **Expect**: `201` with `{ success: true, data: <regionMap> }`. `data._id` present; `data.code` equals request code. Audit event `regionMap.create.success` with correlation id.

#### Create duplicate code
- **Setup**: Create RegionMap with `code: RM-1`.  
- **Request**: `POST /api/region-maps` with same `code`.  
- **Expect**: `409` with message about duplicate code. Audit event `regionMap.create.failed`.

#### Get by id and by ops_region
- **Requests**: `GET /api/region-maps/:id` and `GET /api/region-maps/by-ops/:opsRegion`.  
- **Expect**: `200` and correct resource. Non-existent returns `404`.

#### Update partial
- **Request**: `PATCH /api/region-maps/:id` with `{ name: 'New Name' }`.  
- **Expect**: `200` with updated field. Empty payload returns `400`. Audit event `regionMap.update.success`.

#### Upsert create and update
- **Request A**: `POST /api/region-maps/upsert` with filter `{ code }` and update payload.  
- **Expect A**: `200` with created or updated document. Audit event `regionMap.upsert.success`.

#### Bulk insert
- **Request**: `POST /api/region-maps/bulk-insert` with array of valid region maps.  
- **Expect**: `200` with inserted docs count. Duplicates handled gracefully and reported.

#### Add, update, remove location
- **Add**: `POST /api/region-maps/:id/locations` with `{ name, geo?, address?, contact?, metadata? }`.  
  - **Expect**: `200` and returned location with `locationId`, `createdAt`, `updatedAt`. Audit event `regionMap.location.add.success`.
- **Update**: `PATCH /api/region-maps/:id/locations/:locationId` with partial fields.  
  - **Expect**: `200` and nested location updated; `updatedAt` changed. Audit event `regionMap.location.update.success`.
- **Remove**: `DELETE /api/region-maps/:id/locations/:locationId`.  
  - **Expect**: `200` and region map returned without the removed location. Audit event `regionMap.location.remove.success`.

#### Nearest locations
- **Request**: `GET /api/region-maps/nearest?lng=<lng>&lat=<lat>&maxDistance=5000&limit=10`.  
- **Expect**: `200` with array of nearest locations ordered by distance; each result includes `regionId`, `ops_region`, and `location` with `distance` field.

#### Hard delete (admin only)
- **Request**: `DELETE /api/region-maps/:id` as admin.  
- **Expect**: `200` and removed document. Non-admin returns `403`. Audit event `regionMap.delete.hard.success`.

---

### Edge Cases and Concurrency

- **Invalid ObjectId** in path returns `400`.  
- **Malformed JSON** in `filter` query returns `400`.  
- **Missing required fields** on create returns `400`.  
- **Geo validation**: `geo` without `type: 'Point'` or invalid coordinates returns `400`.  
- **Concurrent creates with same code**: Run N concurrent `POST /region-maps` with same `code`. Assert exactly one success and others return `409`.  
- **Concurrent location operations**: Concurrently add/update/remove locations; verify no duplicate `locationId` and final state consistent.  
- **Partial failures**: If addLocation fails mid-process, ensure no partial nested documents remain; tests should simulate session and non-session flows.

---

### Audit and Observability Checks

For each mutating operation assert an audit event exists with:
- **eventType** such as `regionMap.create.success`, `regionMap.location.add.failed`  
- **actor** containing `userId` when available  
- **target** referencing the region map id  
- **outcome** set to `success` or `failure`  
- **correlationId** matching request header when provided

Audit events should include timestamps and be searchable by `correlationId`.

---

### Test Environment and Runbook

- **Environment**: Isolated test database. Reset DB between runs or use unique identifiers.  
- **Authentication**: Create test users including an admin and obtain tokens before tests.  
- **IDs**: Use valid ObjectIds for `regionMapId`, `locationId`, and related references.  
- **Transactions**: If testing session behavior, ensure MongoDB replica set or in-memory server supports transactions.  
- **Timing**: Allow ±2000 ms tolerance for timestamp assertions.  
- **Cleanup**: Remove or hard-delete created region maps and test users after tests.

---

### Example Assertion Checklist Per Test

- **HTTP status** matches expectation.  
- **Response schema** contains required fields and omits internal fields (e.g., `__v`).  
- **Database state** reflects the operation and enforces uniqueness and constraints.  
- **Geo results** include `distance` and are ordered by proximity.  
- **Nested timestamps** (`createdAt`, `updatedAt`) are set and updated correctly.  
- **Audit event** recorded with correct `eventType`, `actor`, `target`, `outcome`, and `correlationId`.  
- **Role checks** enforced for admin-only endpoints.

---

End of RegionMap acceptance tests.