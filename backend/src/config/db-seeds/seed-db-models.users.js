// src/config/db-seeds/seed-db-models.users.js
/**
 * Seed script for Users collection
 *
 * Exports: { run }
 *
 * Behavior:
 *  - If DB already has users and force !== true, seeding is skipped.
 *  - Creates at least 5 users: 2 suppliers, 2 customers, 1 administrator.
 *  - Uses User repository create method so each user receives a Config document (repo handles that).
 *  - Returns created dependencies and missingDependencies for later resolution (e.g., supplier AllowedSupplyItems).
 *
 * Usage:
 *   const seed = require('./seed-db-models.users');
 *   await seed.run({ force: false, dryRun: false, logger: console });
 *
 * Note on fix:
 *   Previously the seed provided `password` which the model pre-save hook does not hash.
 *   This file sets `passwordHash` (plain text) so the model's pre-save hook will detect
 *   the field change and hash it before persisting. This preserves repo/model behavior.
 */

const mongoose = require('mongoose');
const UserRepo = require('../../repositories/user.repo');
const DEFAULT_LOGGER = console;

/**
 * Minimal helper to build an email object
 */
function emailObj(address, primary = false, verified = false) {
  return { address: String(address).toLowerCase().trim(), primary, verified, verifiedAt: verified ? Date.now() : null };
}

/**
 * Build a sample user payload
 * role: 'customer' | 'supplier' | 'administrator'
 *
 * Important: set passwordHash (plain) so model pre-save will hash it.
 */
function makeUserPayload({ idx = 0, role = 'customer', firstName, lastName, email, password = 'Password123!' }) {
  const baseFirst = firstName || (role === 'administrator' ? 'Admin' : `${role.charAt(0).toUpperCase()}User${idx}`);
  const baseLast = lastName || 'Seed';
  const emails = email ? [emailObj(email, true, true)] : [emailObj(`${role}${idx}@example.com`, true, true)];

  const metadata = { origin: 'seed', seededAt: Date.now() };

  // For suppliers include AllowedSupplyItems placeholder to be filled by orchestrator
  if (role === 'supplier') {
    metadata.AllowedSupplyItems = []; // to be populated by index orchestrator with item _ids
  }

  // Provide passwordHash (plain) so model pre-save hook hashes it into bcrypt hash.
  // We intentionally do not include `password` field to avoid bypassing hashing logic elsewhere.
  return {
    firstName: baseFirst,
    lastName: baseLast,
    role,
    emails,
    passwordHash: String(password),
    metadata
  };
}

/**
 * Run seeding for users
 * @param {Object} opts
 *   - force: boolean (if true, will seed even if users exist)
 *   - dryRun: boolean (if true, will not persist changes)
 *   - logger: console-like logger
 */
async function run(opts = {}) {
  const { force = false, dryRun = false, logger = DEFAULT_LOGGER } = opts;

  const log = {
    info: logger.info || logger.log || DEFAULT_LOGGER.log,
    warn: logger.warn || DEFAULT_LOGGER.warn,
    error: logger.error || DEFAULT_LOGGER.error
  };

  // Ensure mongoose connection
  if (!mongoose || !mongoose.connection || mongoose.connection.readyState === 0) {
    throw new Error('Mongoose connection is not established. Connect to DB before running seeds.');
  }

  // Check existing users
  const existingCount = await UserRepo.count({}, { includeDeleted: true }).catch((e) => {
    log.error('Failed to count users:', e && e.message ? e.message : e);
    return 0;
  });

  if (existingCount > 0 && !force) {
    log.info(`Users collection already has ${existingCount} documents. Skipping users seed (force=false).`);
    return {
      skipped: true,
      reason: 'users_exist',
      totalExisting: existingCount,
      created: [],
      dependencies: {},
      missingDependencies: []
    };
  }

  // Build payloads: 5 users (2 suppliers, 2 customers, 1 admin)
  const payloads = [
    makeUserPayload({ idx: 1, role: 'supplier', firstName: 'Supply', lastName: 'One', email: 'supplier1@bulkbuy.example.com' }),
    makeUserPayload({ idx: 2, role: 'supplier', firstName: 'Supply', lastName: 'Two', email: 'supplier2@bulkbuy.example.com' }),
    makeUserPayload({ idx: 3, role: 'customer', firstName: 'Customer', lastName: 'One', email: 'customer1@bulkbuy.example.com' }),
    makeUserPayload({ idx: 4, role: 'customer', firstName: 'Customer', lastName: 'Two', email: 'customer2@bulkbuy.example.com' }),
    makeUserPayload({ idx: 0, role: 'administrator', firstName: 'System', lastName: 'Admin', email: 'admin@bulkbuy.example.com', password: 'AdminPass!234' })
  ];

  if (dryRun) {
    log.info('Dry run enabled — no users will be persisted. Returning payload preview.');
    const preview = payloads.map((p) => ({
      role: p.role,
      email: p.emails[0].address,
      firstName: p.firstName,
      lastName: p.lastName,
      // show that a password would be set (do not reveal actual hash)
      passwordProvided: !!p.passwordHash
    }));
    return {
      skipped: false,
      dryRun: true,
      preview,
      created: [],
      dependencies: {},
      missingDependencies: []
    };
  }

  const created = [];
  const dependencies = {}; // map user role + index -> _id
  const missingDependencies = []; // list of placeholders to be resolved by index orchestrator

  // Create users sequentially to ensure Config creation per user (repo.create handles config creation)
  for (let i = 0; i < payloads.length; i++) {
    const payload = { ...payloads[i] };
    try {
      // Use repo.create so Config is created and linked
      // Repo.create expects the password hash field to be present (model pre-save will hash it)
      const createdUser = await UserRepo.create(payload, { session: null });
      const plain = createdUser && typeof createdUser.toObject === 'function' ? createdUser.toObject() : createdUser;

      // Record created user
      created.push({
        _id: plain._id ? String(plain._id) : null,
        userId: plain.userId || null,
        role: plain.role,
        emails: plain.emails || []
      });

      // Build dependency key
      const key = `${plain.role}:${plain.emails && plain.emails[0] ? plain.emails[0].address : i}`;
      dependencies[key] = plain._id ? String(plain._id) : null;

      // If supplier, register missingDependencies entry for AllowedSupplyItems to be filled later
      if (plain.role === 'supplier') {
        missingDependencies.push({
          type: 'supplier.allowedSupplyItems',
          userId: plain._id ? String(plain._id) : null,
          note: 'Populate metadata.AllowedSupplyItems with item _ids once items are seeded',
          placeholderSkus: [] // orchestrator may fill with SKUs to resolve later
        });
      }
    } catch (err) {
      log.error(
        'Failed to create user payload:',
        payload && payload.emails && payload.emails[0] ? payload.emails[0].address : JSON.stringify(payload),
        err && err.message ? err.message : err
      );
    }
  }

  log.info(`Seeded ${created.length} users.`);

  return {
    skipped: false,
    dryRun: false,
    totalCreated: created.length,
    created,
    dependencies,
    missingDependencies
  };
}

module.exports = { run };

/* ---------------------------------------------------------------------------
   Postman payload examples (use these to test the User routes)

   1) Create user (POST /api/users)
   Endpoint: POST http://localhost:3000/api/users
   Headers:
     - Authorization: Bearer <admin-token>
     - Content-Type: application/json
   Body (JSON):
   {
     "firstName": "Jane",
     "lastName": "Doe",
     "role": "customer",
     "emails": [{ "address": "jane.doe@example.com", "primary": true }],
     "password": "SecurePass!234"
   }

   2) Authenticate (POST /api/users/authenticate)
   Endpoint: POST http://localhost:3000/api/users/authenticate
   Headers:
     - Content-Type: application/json
   Body (JSON):
   {
     "email": "admin@bulkbuy.example.com",
     "password": "AdminPass!234"
   }

   3) Get user by id (GET /api/users/:id)
   Endpoint: GET http://localhost:3000/api/users/{userId}
   Headers:
     - Authorization: Bearer <admin-token>

   4) Update user (PATCH /api/users/:id)
   Endpoint: PATCH http://localhost:3000/api/users/{userId}
   Headers:
     - Authorization: Bearer <admin-token>
     - Content-Type: application/json
   Body (JSON):
   {
     "firstName": "Janet",
     "metadata": { "notes": "Updated via Postman" }
   }

   5) Bulk create users (POST /api/users/bulk)
   Endpoint: POST http://localhost:3000/api/users/bulk
   Headers:
     - Authorization: Bearer <admin-token>
     - Content-Type: application/json
   Body (JSON): Array of user objects (same shape as create). Example:
   [
     { "firstName": "Bulk", "lastName": "User1", "emails": [{ "address": "bulk1@example.com" }], "password": "BulkPass1!" },
     { "firstName": "Bulk", "lastName": "User2", "emails": [{ "address": "bulk2@example.com" }], "password": "BulkPass2!" }
   ]
   --------------------------------------------------------------------------- */
