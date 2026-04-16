// client/src/comms-js/socket.js
/**
 * Central Socket.IO client wrapper for comms (notifications + ui:update).
 *
 * Guarantees:
 * - Keeps a persistent connection for the lifetime of the client (infinite reconnect attempts).
 * - On sign-in (identifyUserAfterLogin) the connection is upgraded/identified.
 * - On any reconnect (including transport/polling that yields a new socket id) the client
 *   re-attaches the latest token and re-identifies the user automatically.
 * - Token is read from currentOpts.getAuth() when available, otherwise from localStorage key "app_auth_session_v1".
 * - Uses clear log markers: [ socket 🟢 ], [ socket 🔴 ], [ socket 🔁 ], etc.
 *
 * Usage:
 *   initSocket(null, { url, path, getAuth, onNotification, onConnected, onWelcome, region })
 *   identifyUserAfterLogin({ token, userId })
 *   disconnectSocket()
 *   getSocket()
 *   ackViaRest(seq)
 *
 * Notes:
 * - Do NOT call React hooks from this module. Provide getAuth/getOpsContext functions via opts.
 * - This file is defensive and idempotent: emits are best-effort and handlers swallow non-fatal errors.
 */

import { io } from "socket.io-client";
import { jwtDecode } from "jwt-decode";

const STORAGE_KEY = "app_auth_session_v1";

let socket = null;
let currentToken = null;
let currentOpts = {};

/* -------------------------
 * Token helpers
 * ------------------------- */

function _tokenFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      return parsed.token || parsed.accessToken || parsed.authToken || parsed.access_token || parsed.auth_token || null;
    } catch (_) {
      return raw;
    }
  } catch (_) {
    return null;
  }
}

function _isJwtExpired(token) {
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

function _latestAuthFromOpts() {
  try {
    if (typeof currentOpts.getAuth === "function") {
      return currentOpts.getAuth() || null;
    }
  } catch (_) {
    // swallow
  }
  return null;
}

function _resolveLatestToken() {
  const latest = _latestAuthFromOpts();
  if (latest && (latest.accessToken || latest.token)) return latest.accessToken || latest.token;
  return currentToken || _tokenFromStorage();
}

function _isTokenValid(token) {
  if (!token) return false;
  const check = _isJwtExpired(token);
  if (check.expired === true) return false;
  return true;
}

/* -------------------------
 * Internal: identify logic
 * ------------------------- */

function _maybeIdentifyOnConnect({ token, userId } = {}) {
  if (!socket) return;
  const t = token || _resolveLatestToken();
  const uid = userId || (typeof currentOpts.getAuth === "function" ? (currentOpts.getAuth()?.user?.userId || currentOpts.getAuth()?.user?._id) : null);

  // If no token and no userId, nothing to do
  if (!t && !uid) return;

  // If socket already has an authenticated user, skip re-identify
  if (socket.user && (socket.user.userId || socket.user._id)) return;

  try {
    // update auth for future reconnects
    if (t) socket.auth = { token: t };

    // emit identifyUser to upgrade session on server
    socket.emit("identifyUser", { token: t, userId: uid }, (resp) => {
      try {
        console.debug("[ socket 🟢 ] identifyUser ack", resp);
        if (resp && resp.ok && (resp.userId || resp._id)) {
          socket.user = { _id: resp.userId || resp._id };
          console.log(`[ socket 🟢 ] identifyUser (ack) -> socketId=[ ${socket.id} ] user=[ ${socket.user._id} ]`);
        } else if (resp && resp.ok && resp.user) {
          socket.user = resp.user;
          console.log(`[ socket 🟢 ] identifyUser (ack) -> socketId=[ ${socket.id} ] user=[ ${JSON.stringify(resp.user)} ]`);
        } else {
          console.debug("[ socket 🔁 ] identifyUser ack without user payload", resp);
        }
      } catch (e) {
        console.debug("[ socket 🔴 ] identifyUser ack handler error", e && e.message);
      }
    });
  } catch (e) {
    console.debug("[ socket 🔴 ] identifyUser emit failed", e && e.message);
  }
}

/* -------------------------
 * Public: initSocket
 * ------------------------- */

/**
 * initSocket(accessToken, opts)
 * - accessToken: optional token to use for initial handshake
 * - opts:
 *    url, path, region, onNotification, onConnected, onWelcome, getAuth, getOpsContext, reconnectionDelay, reconnectionDelayMax
 */
export function initSocket(accessToken = null, opts = {}) {
  // If socket exists and connected, return it (no-op)
  if (socket && socket.connected) return socket;

  currentOpts = Object.assign({}, opts);
  currentToken = accessToken || currentToken || null;

  const url = opts.url || process.env.REACT_APP_WS_URL || "http://localhost:5000";
  const path = opts.path || "/socket.io";
  // Do not limit reconnection attempts: keep connection alive for lifetime of client
  const reconnectionDelay = opts.reconnectionDelay ?? 1000;
  const reconnectionDelayMax = opts.reconnectionDelayMax ?? 5000;

  // Create socket instance with infinite reconnect attempts (omit reconnectionAttempts)
  socket = io(url, {
    path,
    autoConnect: true,
    auth: currentToken ? { token: currentToken } : undefined,
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnection: true,
    reconnectionDelay,
    reconnectionDelayMax,
    // do not set reconnectionAttempts so socket.io will keep trying indefinitely
  });

  // Refresh auth on each reconnect attempt using latest token getter if provided
  socket.io.on("reconnect_attempt", () => {
    try {
      const latest = _latestAuthFromOpts();
      const latestToken = latest && (latest.accessToken || latest.token) ? (latest.accessToken || latest.token) : (currentToken || _tokenFromStorage());
      if (latestToken) {
        socket.auth = { token: latestToken };
        socket.user = latest && latest.user ? latest.user : socket.user;
      }
    } catch (e) {
      // swallow
    }
  });

  // Also refresh auth on handshake retry errors
  socket.io.on("reconnect_error", () => {
    try {
      const latest = _latestAuthFromOpts();
      const latestToken = latest && (latest.accessToken || latest.token) ? (latest.accessToken || latest.token) : (currentToken || _tokenFromStorage());
      if (latestToken) socket.auth = { token: latestToken };
    } catch (_) {}
  });

  /* -------------------------
   * Core lifecycle
   * ------------------------- */

  socket.on("connect", () => {
    console.log("[ socket 🟢 ] Connected to server:", `[ ${socket.id} ]`);

    // announce region immediately if provided
    if (currentOpts.region) {
      try {
        socket.emit("identifyRegion", { region: currentOpts.region }, (resp) => {
          console.debug("[ socket 🟢 ] identifyRegion ack", resp);
        });
      } catch (e) {
        console.debug("[ socket 🔴 ] identifyRegion emit failed", e && e.message);
      }
    }

    // onConnected callback
    if (typeof currentOpts.onConnected === "function") {
      try {
        currentOpts.onConnected({ socketId: socket.id });
      } catch (e) {
        console.debug("[ socket 🔴 ] onConnected handler error", e && e.message);
      }
    }

    // Always attempt to identify after connect (covers sign-in and reconnects)
    try {
      const latest = _latestAuthFromOpts();
      const latestToken = latest && (latest.accessToken || latest.token) ? (latest.accessToken || latest.token) : (currentToken || _tokenFromStorage());
      const latestUserId = latest && latest.user ? (latest.user.userId || latest.user._id) : null;
      _maybeIdentifyOnConnect({ token: latestToken, userId: latestUserId });
    } catch (e) {
      // swallow
    }
  });

  socket.on("reconnect", (attemptNumber) => {
    console.debug("[ socket 🔁 ] reconnected attempt:", attemptNumber, "socketId:", socket && socket.id);
    try {
      const latest = _latestAuthFromOpts();
      const latestToken = latest && (latest.accessToken || latest.token) ? (latest.accessToken || latest.token) : (currentToken || _tokenFromStorage());
      const latestUserId = latest && latest.user ? (latest.user.userId || latest.user._id) : null;
      _maybeIdentifyOnConnect({ token: latestToken, userId: latestUserId });
    } catch (e) {
      // swallow
    }
  });

  socket.on("disconnect", (reason) => {
    console.debug("[ socket 🔴 ] disconnected", reason);
    // socket.io will attempt reconnect automatically; nothing to do here
  });

  socket.on("connect_error", (err) => {
    console.warn("[ socket 🔴 ] connect_error", err && (err.message || err));
  });

  socket.on("connected", (payload) => {
    if (typeof currentOpts.onConnected === "function") {
      try {
        currentOpts.onConnected(payload);
        console.log("[ socket 🟢 ] server connected ack", payload);
      } catch (e) {
        console.debug("[ socket 🔴 ] onConnected callback error", e && e.message);
      }
    } else {
      console.debug("[ socket 🟢 ] server connected ack", payload);
    }
  });

  socket.on("welcome", (payload) => {
    if (typeof currentOpts.onWelcome === "function") {
      try {
        currentOpts.onWelcome(payload);
      } catch (e) {
        console.debug("[ socket 🔴 ] onWelcome handler error", e && e.message);
      }
    }
    console.info("[ socket 🟢 ] welcome", payload);
  });

  /* -------------------------
   * Notification & domain handlers
   * ------------------------- */

  socket.on("notification", (msg) => {
    try {
      if (typeof currentOpts.onNotification === "function") {
        currentOpts.onNotification(msg);
      } else {
        console.info("[ socket 🟢 ] notification", msg);
      }

      // best-effort ack via socket
      const seq = msg?.metadata?.notification?.seq;
      if (seq && socket && socket.connected) {
        socket.emit("ackNotification", { id: msg.id, seq }, (ackResp) => {
          console.debug("[ socket 🟢 ] ackNotification callback", ackResp);
        });
      }
    } catch (e) {
      console.debug("[ socket 🔴 ] notification handler error", e && e.message);
    }
  });

  socket.on("system:update", (payload) => {
    try {
      console.info("[ socket 🟢 ] system update", payload);
    } catch (e) {
      console.debug("[ socket 🔴 ] system:update handler error", e && e.message);
    }
  }); 
  
  
  socket.on("Region-UI-Update:RefreshActivity", (payload) => {
    try {
      console.info("[ socket 🟢 ] Region-UI-Update:RefreshActivity update-", payload);
    } catch (e) {
      console.debug("[ socket 🔴 ] Region-UI-Update:RefreshActivity handler error", e && e.message);
    }
  }); 
  
  socket.on("UI-Update:RefreshActivity", (payload) => {
    try {
      console.info("[ socket 🟢 ] UI-Update:RefreshActivity update-", payload);
    } catch (e) {
      console.debug("[ socket 🔴 ] UI-Update:RefreshActivity handler error", e && e.message);
    }
  });

  socket.on("error", (err) => {
    console.warn("[ socket 🔴 ] error", err);
  });

  socket.on("ui:update-products+orders", (cmd) => {
    try {
      const getOpsContext = typeof currentOpts.getOpsContext === "function" ? currentOpts.getOpsContext : () => ({});
      const ops = getOpsContext() || {};
      const { wsuproducts = 0, setWsuproducts = () => {}, wsuorders = 0, setWsuorders = () => {} } = ops;

      console.debug("[ socket 🟢 ] ui:update received", cmd && cmd.action);

      switch (cmd.action) {
        case "refreshActivity":
          if (typeof window.updateActivityCounter === "function") {
            window.updateActivityCounter(cmd.payload);
          } else {
            window.dispatchEvent(new CustomEvent("ui:update", { detail: cmd }));
          }
          break;

        case "update-products":
          try {
            if (typeof setWsuproducts === "function") {
              setWsuproducts((prev) => (typeof prev === "number" ? prev + 1 : wsuproducts + 1));
            }
          } catch (e) {
            console.debug("[ socket 🔴 ] update-products handler error", e && e.message);
          }
          break;

        case "update-orders":
          if (ops.user && (ops.user.userId || ops.user._id)) {
            try {
              if (typeof setWsuorders === "function") {
                setWsuorders((prev) => (typeof prev === "number" ? prev + 1 : wsuorders + 1));
              }
            } catch (e) {
              console.debug("[ socket 🔴 ] update-orders handler error", e && e.message);
            }
          }
          break;

        case "invalidateCache":
          window.dispatchEvent(new CustomEvent("ui:invalidate", { detail: cmd.payload }));
          break;

        case "openInbox":
          window.dispatchEvent(new CustomEvent("ui:openInbox", { detail: cmd.payload }));
          break;

        default:
          window.dispatchEvent(new CustomEvent("ui:update", { detail: cmd }));
      }

      // best-effort ack if seq present
      const seq = cmd?.metadata?.notification?.seq;
      if (seq && socket && socket.connected) {
        socket.emit("ackNotification", { id: cmd.id, seq }, (ackResp) => {
          console.debug("[ socket 🟢 ] ui:update ack callback", ackResp);
        });
      }
    } catch (e) {
      console.debug("[ socket 🔴 ] ui:update handler error", e && e.message);
    }
  });

  return socket;
}

/* -------------------------
 * Public: identifyUserAfterLogin
 * ------------------------- */

export function identifyUserAfterLogin({ token, userId } = {}, opts = {}) {
  if (token) currentToken = token;

  // Ensure socket exists; create anonymous one if needed
  if (!socket) {
    return initSocket(currentToken, { ...currentOpts, ...opts });
  }

  const doIdentify = () => {
    if (token) {
      socket.auth = { token };
      try {
        socket.emit("identifyUser", { token, userId , ops_region : opts.ops_region || null }, (resp) => {
          console.debug("[ socket 🟢 ] identifyUser ack", resp);
          if (resp && resp.ok && resp.userId) {
            socket.user = { _id: resp.userId };
            console.log(`[ socket 🟢 ] identifyUser (ack) -> socketId=[ ${socket.id} ] user=[ ${resp.userId} ]`);
          }
        });
      } catch (e) {
        console.debug("[ socket 🔴 ] identifyUser emit failed", e && e.message);
      }
      return;
    }

    if (userId) {
      try {
        socket.emit("identifyUser", { userId }, (resp) => {
          console.debug("[ socket 🟢 ] identifyUser (userId) ack", resp);
        });
      } catch (e) {
        console.debug("[ socket 🔴 ] identifyUser (userId) emit failed", e && e.message);
      }
    }
  };

  if (!socket.connected) {
    socket.once("connect", () => doIdentify());
    if (token) socket.auth = { token };
    try { socket.connect(); } catch (_) {}
    return socket;
  }

  doIdentify();
  return socket;
}

/* -------------------------
 * Public: disconnect, getSocket, ackViaRest
 * ------------------------- */

export function disconnectSocket() {
  if (!socket) return;
  try {
    socket.removeAllListeners();
    socket.disconnect();
  } catch (e) {
    console.debug("[ socket 🔴 ] disconnectSocket error", e && e.message);
  } finally {
    socket = null;
    currentToken = null;
    currentOpts = {};
  }
}

export function getSocket() {
  return socket;
}

/**
 * ackViaRest(seq)
 * - Fallback authoritative ack via HTTP POST /api/comms/ack using fetch
 * - If token is available, include Authorization header
 */
export async function ackViaRest(seq) {
  if (!seq) return null;
  try {
    const headers = { "Content-Type": "application/json" };
    const latest = typeof currentOpts.getAuth === "function" ? currentOpts.getAuth() : null;
    const token = (latest && (latest.accessToken || latest.token)) || currentToken || _tokenFromStorage();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch("/api/comms/ack", {
      method: "POST",
      headers,
      body: JSON.stringify({ seq: Number(seq) }),
      credentials: "same-origin",
    });
    if (!res.ok) {
      console.debug("[ socket 🔴 ] ackViaRest non-ok", res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.debug("[ socket 🔴 ] ackViaRest failed", err && err.message);
    return null;
  }
}
