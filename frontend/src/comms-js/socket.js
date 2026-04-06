// client/src/comms-js/socket.js
// Central Socket.IO client wrapper for comms (notifications + ui:update).
// - initSocket(token, opts) -> connects and returns socket
// - identifyUserAfterLogin({ token, userId }) -> upgrade anonymous socket to authenticated
// - disconnectSocket(), getSocket(), ackViaRest(seq)
// - opts: { url, path, region, onNotification, onConnected, onWelcome, getAuth, getOpsContext, reconnectionAttempts }
// Notes:
// - Do NOT call React hooks from this module. Pass `getAuth` and `getOpsContext` functions via opts
//   that return the latest auth/ops state when invoked (e.g., () => authContext).
// - Keep payload handling lightweight and idempotent.

import { io } from "socket.io-client";

let socket = null;
let currentToken = null;
let currentOpts = {};

/**
 * initSocket(accessToken, opts)
 * - accessToken: optional string (JWT or token expected by server socketAuth)
 * - opts:
 *    url: string (default from env or http://localhost:5000)
 *    path: string (socket path, default /socket.io)
 *    region: string (optional region to identify)
 *    onNotification: fn(msg)
 *    onConnected: fn(payload)
 *    onWelcome: fn(payload)
 *    getAuth: fn() -> { user, accessToken }   // optional getter to access latest auth state
 *    getOpsContext: fn() -> { ... }           // optional getter
 *    reconnectionAttempts: number
 */
export function initSocket(accessToken = null, opts = {}) {
  // If socket exists and connected, return it (no-op)
  if (socket && socket.connected) return socket;

  // Save opts for later use (identifyUserAfterLogin, reconnects)
  currentOpts = Object.assign({}, opts);

  currentOpts.onWelcome = (message) => {
    // console.log('server sent welcome message @ ---> ', JSON.stringify(message))
  };

  // Track token used for auth; may be null for anonymous connection
  currentToken = accessToken || null;
  const url = opts.url || process.env.REACT_APP_WS_URL || "http://localhost:5000";
  const path = opts.path || "/socket.io";
  const reconnectionAttempts = opts.reconnectionAttempts ?? 10;

  // Create socket instance (allow polling fallback)
  socket = io(url, {
    path,
    autoConnect: true,
    auth: currentToken ? { token: currentToken } : undefined,
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnectionAttempts,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  // Ensure auth is refreshed on each reconnect attempt using latest token getter if provided
  socket.io.on("reconnect_attempt", () => {
    try {
      const getAuth = typeof currentOpts.getAuth === "function" ? currentOpts.getAuth : null;
      const latest = getAuth ? getAuth() : null;
      const latestToken = latest && latest.accessToken ? latest.accessToken : currentToken;
      if (latestToken) {
        socket.auth = { token: latestToken };
        socket.user = latest.user;
      }
    } catch (e) {
      // swallow
    }
  });

  // Core lifecycle
  socket.on("connect", () => {
    console.log("[ socket 🟢 ] Connected to server:", `[${socket.id }]`);

    // console.debug("[socket] connected", socket.id);
    
    // announce region immediately if provided
    if (currentOpts.region) {
      try {
        socket.emit("identifyRegion", { region: currentOpts.region }, (resp) => {
          console.debug("[socket] identifyRegion ack", resp);
          console.log("[ socket 🟢 ] identifyRegion ack", resp);
        });
      } catch (e) {
        console.debug("[ socket 🔴 ] identifyRegion emit failed", e && e.message);
      }
    }

    if (typeof currentOpts.onConnected === "function") {
      try {
        currentOpts.onConnected({ socketId: socket.id });
      } catch (e) {
        console.debug("[ socket 🔴 ] onConnected handler error", e && e.message);
      }
    }
  });

  socket.on("disconnect", (reason) => {
    console.debug("[ socket 🔴 ] disconnected", reason);
  });

  socket.on("connect_error", (err) => {
    console.warn("[ socket 🔴 ] connect_error", err && (err.message || err));
  });

  // server sends a safe connected ack { socketId, serverTime }
  socket.on("connected", (payload) => {
    if (typeof currentOpts.onConnected === "function") {
      try {
        currentOpts.onConnected(payload);
        console.log("'this is the Connected message from the server ======> ',[ socket 🟢 ] Socket Connected", payload);
      } catch (e) {
        console.debug("[ socket 🔴 ] onConnected callback error", e && e.message);
      }
    }
    console.debug("[ socket] server connected ack", payload);
  });

  // server may send a welcome message after login upgrade
  socket.on("welcome", (payload) => {
    if (typeof currentOpts.onWelcome === "function") {
      try {
        currentOpts.onWelcome(payload);
      } catch (e) {
        console.debug("[socket] onWelcome handler error", e && e.message);
      }
    }
    console.info("[socket] welcome", payload);
  });

  // notification handler
  socket.on("notification", (msg) => {
    try {
      if (typeof currentOpts.onNotification === "function") {
        currentOpts.onNotification(msg);
      } else {
        console.info("[socket] notification", msg);
      }

      // best-effort ack via socket
      const seq = msg?.metadata?.notification?.seq;
      if (seq && socket && socket.connected) {
        socket.emit("ackNotification", { id: msg.id, seq }, (ackResp) => {
          console.debug("[socket] ackNotification callback", ackResp);
        });
      }
    } catch (e) {
      console.debug("[socket] notification handler error", e && e.message);
    }
  });

  // system broadcasts
  socket.on("system:update", (payload) => {
    console.info("[socket] system update", payload);
  });

  // generic error logging
  socket.on("error", (err) => {
    console.warn("[socket] error", err);
  });

  // ui:update-products+orders (specialized handler)
  socket.on("ui:update-products+orders", (cmd) => {
    try {
      const getOpsContext = typeof currentOpts.getOpsContext === "function" ? currentOpts.getOpsContext : () => ({});
      const ops = getOpsContext() || {};
      const { wsuproducts = 0, setWsuproducts = () => {}, wsuorders = 0, setWsuorders = () => {} } = ops;

      console.debug("[socket] ui:update received", cmd && cmd.action);

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
              // call setter with updater if available
              setWsuproducts((prev) => (typeof prev === "number" ? prev + 1 : wsuproducts + 1));
            }
          } catch (e) {
            console.debug("[socket] update-products handler error", e && e.message);
          }
          break;

        case "update-orders":
          // only update orders UI if ops context indicates an authenticated user
          if (ops.user && (ops.user.userId || ops.user._id)) {
            try {
              if (typeof setWsuorders === "function") {
                setWsuorders((prev) => (typeof prev === "number" ? prev + 1 : wsuorders + 1));
              }
            } catch (e) {
              console.debug("[socket] update-orders handler error", e && e.message);
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
          console.debug("[socket] ui:update ack callback", ackResp);
        });
      }
    } catch (e) {
      console.debug("[socket] ui:update handler error", e && e.message);
    }
  });

  return socket;
}

/**
 * identifyUserAfterLogin
 * - Call this after the user successfully logs in on the client.
 * - Provide either the new auth token or the userId (server must accept chosen format).
 * - If socket is disconnected, this will set auth and connect.
 */
// export function identifyUserAfterLogin({ token, userId } = {}, opts = {}) {
//   // update tracked token
//   if (token) currentToken = token;

//   if (!socket) {
//     // create a new socket with token if none exists
//     return initSocket(currentToken, currentOpts);
//   }

//   // If socket exists but is not connected, update auth and connect
//   if (!socket.connected || !socket?.auth?.token ) {
//     socket.auth = token ? { token } : socket.auth;
//     try {
//       socket.connect();
//     } catch (e) {
//       console.debug("[socket] connect after identify failed", e && e.message);
//     }
//     return socket;
//   }

//   // If already connected, prefer emitting identifyUser to upgrade session
//   if (token) {
//     try {
//       // update auth for future reconnects
//       socket.auth = { token };
//       socket.emit("identifyUser", { token }, (resp) => {
//         console.debug("[socket] identifyUser ack", resp);
//       });
//     } catch (e) {
//       console.debug("[socket] identifyUser emit failed", e && e.message);
//     }
//     return socket;
//   }

//   // Fallback: send userId if token not available (less secure)
//   if (userId) {
//     try {
//       socket.emit("identifyUser", { userId }, (resp) => {
//         console.debug("[socket] identifyUser (userId) ack", resp);
//       });
//     } catch (e) {
//       console.debug("[socket] identifyUser (userId) emit failed", e && e.message);
//     }
//   }

//   return socket;
// }

export function identifyUserAfterLogin({ token, userId } = {}, opts={}) {
  if (token) currentToken = token;

  // Ensure socket exists; create anonymous one if needed
  if (!socket) {
    return initSocket(currentToken, {...currentOpts, ...opts});
  }

  // Helper to emit identify once connected
  const doIdentify = () => {
    // prefer token
    if (token) {
      // update auth for future reconnects
      socket.auth = { token };
      try {
        socket.emit('identifyUser', { token, userId }, (resp) => {
          console.debug('[socket] identifyUser ack', resp);
          if (resp && resp.ok && resp.userId) {
            // reflect authenticated state locally
            socket.user = { _id: resp.userId };
            console.log(`[ socket 🟢 ] identifyUser (ack) -> socketId= [ ${socket.id} ] user= [ ${resp.userId} ]`);
          }
        });
      } catch (e) {
        console.debug('[ socket 🔴 ] identifyUser emit failed', e && e.message);
      }
      return;
    }
  };

  // If not connected yet, wait for connect then identify
  if (!socket.connected) {
    socket.once('connect', () => {
      doIdentify();
    });
    // ensure socket has auth set so the handshake on connect (if any) includes token
    if (token) socket.auth = { token };
    try { socket.connect(); } catch (e) { /* ignore */ }
    return socket;
  }

  // Already connected: identify immediately
  doIdentify();
  return socket;
}


/**
 * disconnectSocket
 * - Cleanly disconnects and removes listeners
 */
export function disconnectSocket() {
  if (!socket) return;
  try {
    socket.removeAllListeners();
    socket.disconnect();
  } catch (e) {
    console.debug("[socket] disconnectSocket error", e && e.message);
  } finally {
    socket = null;
    currentToken = null;
    currentOpts = {};
  }
}

/**
 * getSocket
 * - Returns the current socket instance (or null)
 */
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
    if (currentToken) headers.Authorization = `Bearer ${currentToken}`;
    const res = await fetch("/api/comms/ack", {
      method: "POST",
      headers,
      body: JSON.stringify({ seq: Number(seq) }),
      credentials: "same-origin",
    });
    if (!res.ok) {
      console.debug("[socket] ackViaRest non-ok", res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.debug("[socket] ackViaRest failed", err && err.message);
    return null;
  }
}
