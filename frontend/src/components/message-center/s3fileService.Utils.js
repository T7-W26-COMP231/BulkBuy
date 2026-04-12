// src/utils/s3fileService.Utils.js
/**
 * s3fileService.Utils.js
 *
 * Exposed API:
 *   generateUploadKey,
 *   uploadFile,
 *   uploadFiles,
 *   presignDownloadFile,
 *   presignDownloadFiles,
 *   deleteFile,
 *   deleteFiles
 *
 * Auth:
 *  - Token read from localStorage key "app_auth_session_v1".
 *  - Uses jwt-decode to validate JWT exp claim; requests are blocked if token is determinably expired.
 *  - All server calls that require auth include Authorization: Bearer <token>.
 *  - S3 PUT to presigned URLs validates token expiry before proceeding but does NOT attach Authorization header.
 *
 * Behavior:
 *  - All uploads use the presign flow (POST /request-upload -> PUT presign.url -> POST /confirm)
 *    and return the persisted DB file record returned by the backend.
 *
 * Errors:
 *  - Thrown Error objects include .code and .details.
 */

import { jwtDecode } from "jwt-decode";

const DEFAULT_STORAGE_BASE = "http://localhost:5000/api/s3fgo";
const STORAGE_KEY = "app_auth_session_v1";

/* -------------------------
 * Small helpers
 * ------------------------- */

function _safeStr(v) {
  return v == null ? "" : String(v);
}
function _pad3chars(name = "") {
  const cleaned = _safeStr(name).replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (cleaned.length >= 3) return cleaned.slice(0, 3);
  return (cleaned + "xxx").slice(0, 3);
}
function _extFromFilename(name = "") {
  const n = _safeStr(name);
  const idx = n.lastIndexOf(".");
  if (idx === -1) return "bin";
  return n.slice(idx + 1).toLowerCase() || "bin";
}
function _nowEpoch() {
  return Date.now();
}
function _makeError(code, message, details) {
  const e = new Error(message || code);
  e.code = code;
  if (details !== undefined) e.details = details;
  return e;
}
async function _jsonOrText(res) {
  const ct = res && res.headers && typeof res.headers.get === "function" ? res.headers.get("content-type") || "" : "";
  if (ct.includes("application/json")) return res.json().catch(() => null);
  return res.text().catch(() => null);
}
function _joinBase(base) {
  return (base || DEFAULT_STORAGE_BASE).replace(/\/+$/, "");
}

/* -------------------------
 * Auth helpers (jwt-decode)
 * ------------------------- */

/**
 * _extractTokenFromStorage
 * - Reads localStorage[STORAGE_KEY]
 * - Returns token string or null
 */
function _extractTokenFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      const token =
        parsed.token ||
        parsed.accessToken ||
        parsed.authToken ||
        parsed.access_token ||
        parsed.auth_token ||
        null;
      if (token && typeof token === "string") return token;
      if (parsed.session && typeof parsed.session === "object") {
        const s = parsed.session;
        const t = s.token || s.accessToken || s.authToken || null;
        if (t && typeof t === "string") return t;
      }
      return null;
    } catch (_) {
      // raw is not JSON, treat as token string
      return raw;
    }
  } catch (_) {
    return null;
  }
}

/**
 * _isJwtExpiredUsingDecode
 * - Uses jwtDecode to parse token payload and check exp (seconds).
 * - Returns { expired: boolean|null, exp: number|null } where null means not determinable.
 */
function _isJwtExpiredUsingDecode(token) {
  if (!token || typeof token !== "string") return { expired: null, exp: null };
  try {
    const payload = jwtDecode(token);
    if (!payload || typeof payload !== "object") return { expired: null, exp: null };
    const exp = payload.exp ? Number(payload.exp) : null; // seconds
    if (!exp) return { expired: null, exp: null };
    const nowSec = Math.floor(Date.now() / 1000);
    return { expired: nowSec >= exp, exp };
  } catch (_) {
    return { expired: null, exp: null };
  }
}

/**
 * _getValidAuthTokenOrThrow
 * - Reads token from storage, validates expiry if determinable.
 * - If token missing -> throws AUTH_MISSING
 * - If determinably expired -> throws AUTH_EXPIRED
 * - Otherwise returns token string
 */
function _getValidAuthTokenOrThrow() {
  const token = _extractTokenFromStorage();
  if (!token) throw _makeError("AUTH_MISSING", "Authentication token not found in local storage", { key: STORAGE_KEY });

  const jwtCheck = _isJwtExpiredUsingDecode(token);
  if (jwtCheck.expired === true) {
    throw _makeError("AUTH_EXPIRED", "Authentication token is expired (JWT exp claim)", { exp: jwtCheck.exp });
  }

  // If we can't determine expiry, assume token is valid
  return token;
}

/**
 * _authHeaders
 * - Returns headers object with Authorization if token present and valid.
 * - Throws if token determinably expired or missing.
 */
function _authHeaders(opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = _getValidAuthTokenOrThrow();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/* -------------------------
 * Key generator
 * ------------------------- */

/**
 * generateUploadKey({ ownerId, filename, epoch })
 * Format: db-bb/messages/<ownerId?>-<epoch>-<3chars>.<ext>
 */
export function generateUploadKey({ ownerId = null, filename = "file", epoch = null } = {}) {
  const owner = ownerId ? String(ownerId) : "system";
  const e = epoch ? String(Number(epoch)) : String(_nowEpoch());
  const three = _pad3chars(filename);
  const ext = _extFromFilename(filename);
  return `db-bb/messages/${owner}-${e}-${three}.${ext}`;
}

/* -------------------------
 * Low-level presign + confirm flows
 * ------------------------- */

/**
 * requestUploadPresign(file, storageBase, opts)
 * - POST {storageBase}/request-upload
 * - Expects backend to return { ok:true, data|file: <pendingFile>, presign: { url, key } } or similar.
 */
async function requestUploadPresign(file, storageBase, opts = {}) {
  const url = `${_joinBase(storageBase)}/request-upload`;
  const body = {
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size ?? null,
    ownerId: opts.ownerId ?? null,
    purpose: opts.purpose ?? null,
    idempotencyKey: opts.idempotencyKey ?? null,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, _authHeaders(opts)),
    body: JSON.stringify(body),
    credentials: opts.credentials ?? "same-origin",
  });

  if (!res.ok) {
    const b = await _jsonOrText(res);
    throw _makeError("PRESIGN_REQUEST_FAILED", `Presign request failed: ${res.status}`, { status: res.status, body: b });
  }

  const json = await res.json().catch(() => null);
  if (!json) throw _makeError("PRESIGN_REQUEST_INVALID", "Presign request returned invalid response", { body: json });

  const fileRecord = json.data || json.file || json.fileRecord || json;
  const presign = json.presign || json.presigned || json.presignedUrl || null;

  if (!presign || !presign.url) {
    throw _makeError("PRESIGN_REQUEST_INVALID", "Presign request did not return presign.url", { body: json });
  }

  return { file: fileRecord, presign };
}

/**
 * putToPresignUrl(presignUrl, file, opts)
 * - PUT to presigned URL (S3). Validate token expiry before proceeding but do not attach Authorization header.
 */
async function putToPresignUrl(presignUrl, file, opts = {}) {
  // Validate token expiry before performing S3 PUT (per requirement)
  try {
    _getValidAuthTokenOrThrow();
  } catch (err) {
    throw err;
  }

  const res = await fetch(presignUrl, {
    method: "PUT",
    headers: Object.assign({ "Content-Type": file.type || "application/octet-stream" }, opts.s3Headers || {}),
    body: file,
  });

  if (!res.ok) {
    const b = await _jsonOrText(res);
    throw _makeError("S3_PUT_FAILED", `S3 PUT failed: ${res.status}`, { status: res.status, body: b });
  }
  return true;
}

/**
 * confirmUpload(storageBase, confirmPayload, opts)
 * - POST {storageBase}/confirm
 * - Expects persisted file record in response (json.data or json.file or top-level)
 */
async function confirmUpload(storageBase, confirmPayload, opts = {}) {
  const url = `${_joinBase(storageBase)}/confirm`;
  const res = await fetch(url, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, _authHeaders(opts)),
    body: JSON.stringify(confirmPayload),
    credentials: opts.credentials ?? "same-origin",
  });

  if (!res.ok) {
    const b = await _jsonOrText(res);
    throw _makeError("CONFIRM_FAILED", `Confirm request failed: ${res.status}`, { status: res.status, body: b });
  }

  const json = await res.json().catch(() => null);
  if (!json) throw _makeError("CONFIRM_INVALID", "Confirm endpoint returned invalid response", { body: json });
  return json.data || json.file || json.fileRecord || json;
}

/* -------------------------
 * Public write APIs
 * ------------------------- */

/**
 * uploadFile(file, actor, opts)
 * - Uses presign flow (request-upload -> PUT -> confirm) and returns persisted DB record.
 * - opts:
 *    storageBase, ownerId, purpose, idempotencyKey, s3Headers, credentials
 */
export async function uploadFile(file, actor = {}, opts = {}) {
  if (!file || typeof file !== "object" || !file.name) {
    throw _makeError("INVALID_FILE", "Invalid File object provided", { file });
  }

  const storageBase = opts.storageBase ?? DEFAULT_STORAGE_BASE;
  const ownerId = opts.ownerId ?? actor?.userId ?? actor?._id ?? null;

  // 1) request presign (creates DB placeholder)
  const presignJson = await requestUploadPresign(file, storageBase, { ...opts, ownerId });

  // 2) PUT to presigned URL (validate token expiry before PUT)
  await putToPresignUrl(presignJson.presign.url, file, opts);

  // 3) confirm upload and return persisted DB record
  const persisted = await confirmUpload(storageBase, {
    key: presignJson.presign.key,
    fileId: presignJson.file && (presignJson.file.id || presignJson.file._id) ? (presignJson.file.id || presignJson.file._id) : null,
    filename: file.name,
    size: file.size,
    contentType: file.type || null,
  }, opts);

  return persisted;
}

/**
 * uploadFiles(files[], actor, opts)
 * - Sequential by default; returns array of persisted DB records.
 * - On failure attempts cleanup via POST {storageBase}/cleanup with items [{ id, key }] if backend supports it.
 * - opts:
 *    parallel: boolean (default false)
 *    cleanupEndpoint: override
 */
export async function uploadFiles(files = [], actor = {}, opts = {}) {
  if (!Array.isArray(files)) throw _makeError("INVALID_INPUT", "files must be an array of File objects", { files });
  if (files.length === 0) return [];

  const storageBase = opts.storageBase ?? DEFAULT_STORAGE_BASE;
  const cleanupEndpoint = opts.cleanupEndpoint ?? `${_joinBase(storageBase)}/cleanup`;
  const uploaded = [];

  async function _attemptCleanup(items = []) {
    if (!items || items.length === 0) return;
    try {
      await fetch(cleanupEndpoint, {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, _authHeaders(opts)),
        body: JSON.stringify({ items }),
        credentials: opts.credentials ?? "same-origin",
      }).catch(() => {});
    } catch (_) {
      // swallow cleanup errors
    }
  }

  if (!opts.parallel) {
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      try {
        const rec = await uploadFile(f, actor, opts);
        uploaded.push(rec);
      } catch (err) {
        const items = uploaded.map((u) => ({ id: u.id || u._id || null, key: u.key || null }));
        await _attemptCleanup(items);
        throw _makeError("ATTACH_PERSIST_FAILED", `Failed to persist attachment "${f.name}": ${err.message || err}`, { file: f.name, cause: err, uploaded });
      }
    }
    return uploaded;
  }

  // parallel path (best-effort cleanup)
  try {
    const promises = files.map((f) => uploadFile(f, actor, opts));
    const results = await Promise.all(promises);
    return results;
  } catch (err) {
    await _attemptCleanup([]);
    throw _makeError("ATTACH_PERSIST_FAILED", `One or more attachments failed to persist: ${err.message || err}`, { cause: err });
  }
}

/* -------------------------
 * Public read / presign APIs
 * ------------------------- */

/**
 * presignDownloadFile({ key?, fileId?, expiresIn? }, opts)
 * - Uses GET /presign-download?key=... or ?fileId=...
 * - Returns { file: <fileRecord|null>, presign: { url, key, bucket, expiresIn } }
 */
export async function presignDownloadFile(params = {}, opts = {}) {
  const storageBase = opts.storageBase ?? DEFAULT_STORAGE_BASE;
  if (!params || (!params.key && !params.fileId)) throw _makeError("INVALID_INPUT", "key or fileId required");

  const qs = new URLSearchParams();
  if (params.key) qs.set("key", String(params.key));
  if (params.fileId) qs.set("fileId", String(params.fileId));
  if (params.expiresIn) qs.set("expiresIn", String(params.expiresIn));

  const url = `${_joinBase(storageBase)}/presign-download?${qs.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: Object.assign({}, _authHeaders(opts)),
    credentials: opts.credentials ?? "same-origin",
  });

  if (!res.ok) {
    const b = await _jsonOrText(res);
    throw _makeError("PRESIGN_DOWNLOAD_FAILED", `Presign download failed: ${res.status}`, { status: res.status, body: b });
  }

  const json = await res.json().catch(() => null);
  if (!json) throw _makeError("PRESIGN_DOWNLOAD_INVALID", "Presign download returned invalid response", { body: json });

  const presign = json.presign || { url: json.url, key: json.key, bucket: json.bucket, expiresIn: json.expiresIn };
  const file = json.data || json.file || json.fileRecord || null;
  return { file, presign };
}

/**
 * presignDownloadFiles(arrayOfParams, opts)
 * - Sequentially requests presigns and returns array of { file, presign }
 */
export async function presignDownloadFiles(paramsArray = [], opts = {}) {
  if (!Array.isArray(paramsArray)) throw _makeError("INVALID_INPUT", "paramsArray must be an array");
  const results = [];
  for (let i = 0; i < paramsArray.length; i += 1) {
    const p = paramsArray[i];
    const r = await presignDownloadFile(p, opts);
    results.push(r);
  }
  return results;
}

/* -------------------------
 * Management helpers
 * ------------------------- */

/**
 * deleteFile(params, opts)
 * - params: { fileId } or { key }
 * - Controller exposes DELETE /:id and may accept POST /delete for key-based deletes.
 */
export async function deleteFile(params = {}, opts = {}) {
  if (!params || (!params.fileId && !params.key)) throw _makeError("INVALID_INPUT", "fileId or key required");
  const storageBase = opts.storageBase ?? DEFAULT_STORAGE_BASE;

  if (params.fileId) {
    const url = `${_joinBase(storageBase)}/${encodeURIComponent(params.fileId)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: Object.assign({}, _authHeaders(opts)),
      credentials: opts.credentials ?? "same-origin",
    });

    if (!res.ok) {
      const b = await _jsonOrText(res);
      throw _makeError("DELETE_FAILED", `Delete failed: ${res.status}`, { status: res.status, body: b });
    }

    const json = await res.json().catch(() => null);
    return json.data || json.file || json;
  }

  // fallback to POST /delete with { key }
  const url = `${_joinBase(storageBase)}/delete`;
  const res = await fetch(url, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, _authHeaders(opts)),
    body: JSON.stringify({ key: params.key }),
    credentials: opts.credentials ?? "same-origin",
  });

  if (!res.ok) {
    const b = await _jsonOrText(res);
    throw _makeError("DELETE_FAILED", `Delete failed: ${res.status}`, { status: res.status, body: b });
  }

  const json = await res.json().catch(() => null);
  return json.data || json.file || json;
}

/**
 * deleteFiles(paramsArray, opts)
 * - paramsArray: [{ fileId } | { key }, ...]
 * - Sequentially deletes and returns array of results.
 */
export async function deleteFiles(paramsArray = [], opts = {}) {
  if (!Array.isArray(paramsArray)) throw _makeError("INVALID_INPUT", "paramsArray must be an array");
  const results = [];
  for (let i = 0; i < paramsArray.length; i += 1) {
    const p = paramsArray[i];
    const r = await deleteFile(p, opts);
    results.push(r);
  }
  return results;
}

/* -------------------------
 * Default export
 * ------------------------- */

const s3fileService = {
  generateUploadKey,
  uploadFile,
  uploadFiles,
  presignDownloadFile,
  presignDownloadFiles,
  deleteFile,
  deleteFiles,
};

export default s3fileService;
