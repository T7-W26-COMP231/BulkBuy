/**
 * test-harness.js
 *
 * One-file test harness for the comms websocket stack.
 * - Starts a minimal HTTP + Socket.IO server and attaches your socketHandlers
 * - Adds a tiny auth middleware for sockets (test token -> mock user)
 * - Connects a test client (socket.io-client) that listens for ui:update and notification
 * - Server emits a region-scoped ui:update and a user-scoped notification
 * - Client best-effort acks via socket.emit('ackNotification', { id, seq })
 *
 * Usage:
 *   1) Place this file at project root (next to package.json).
 *   2) Ensure dependencies are installed:
 *        npm install socket.io socket.io-client express pino
 *   3) Run:
 *        node test-harness.js
 *
 * Notes:
 * - Non-destructive: does not touch DB or production services.
 * - Uses a tiny in-memory mock user derived from the token "test-user".
 * - Adjust PORT or tokens below as needed.
 */

const http = require('http');
const express = require('express');
const { Server: IOServer } = require('socket.io');
const { io: ClientIO } = require('socket.io-client');
const socketHandlers = require('./src/comms-js/websocket/socketHandlers');
const rooms = require('./src/comms-js/websocket/rooms');

const PORT = process.env.TEST_PORT || 6001;
const WS_URL = `http://localhost:${PORT}`;
const TEST_TOKEN = 'test-user'; // client will send this token

async function start() {
  // Minimal express server (health endpoint)
  const app = express();
  app.get('/health', (req, res) => res.json({ ok: true }));
  const server = http.createServer(app);

  // Create Socket.IO server
  const io = new IOServer(server, {
    cors: { origin: '*' }
  });

  // Small socket auth middleware for the harness:
  // If client sends auth.token === TEST_TOKEN, attach a mock user object to socket.user
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (token === TEST_TOKEN) {
        // mock user shape expected by your handlers
        socket.user = {
          _id: '000000000000000000000001',
          roles: ['user'],
          ops_region: 'north'
        };
      }
      return next();
    } catch (err) {
      return next(err);
    }
  });

  // Attach your socket handlers (this registers the main connection handler)
  socketHandlers.attachHandlers(io);

  // Also attach a lightweight listener to observe ackNotification from clients
  io.on('connection', (socket) => {
    socket.on('ackNotification', (ack, cb) => {
      console.log('[server] received ackNotification from', socket.id, 'ack=', ack);
      if (cb && typeof cb === 'function') cb({ ok: true });
    });
  });

  // Start server
  server.listen(PORT, () => {
    console.log(`Test harness HTTP+WS server listening on ${PORT}`);
    runClientAndEmit(io);
  });
}

/**
 * runClientAndEmit(io)
 * - Connects a test client
 * - Waits for connect, then server emits messages (region and user)
 * - Observes client acks printed on server console
 */
function runClientAndEmit(io) {
  // Create client socket
  const client = ClientIO(WS_URL, {
    auth: { token: TEST_TOKEN },
    transports: ['websocket'],
    reconnection: false
  });

  client.on('connect', () => {
    console.log('[client] connected', client.id);
  });

  client.on('connected', (payload) => {
    console.log('[client] server connected ack', payload);
  });

  client.on('disconnect', (reason) => {
    console.log('[client] disconnected', reason);
  });

  // Handle notification events
  client.on('notification', (msg) => {
    console.log('[client] notification received:', JSON.stringify(msg));
    // best-effort ack if seq present
    const seq = msg?.metadata?.notification?.seq;
    if (seq) {
      client.emit('ackNotification', { id: msg.id, seq }, (resp) => {
        console.log('[client] ackNotification callback', resp);
      });
    }
  });

  // Handle ui:update events
  client.on('ui:update', (cmd) => {
    console.log('[client] ui:update received:', JSON.stringify(cmd));
    // perform a trivial local action (log) and ack if seq present
    const seq = cmd?.metadata?.notification?.seq;
    if (seq) {
      client.emit('ackNotification', { id: cmd.id, seq }, (resp) => {
        console.log('[client] ui:update ack callback', resp);
      });
    }
  });

  // Wait a moment for client to connect, then emit messages from server side
  setTimeout(async () => {
    console.log('[harness] emitting test messages...');

    // 1) Region-scoped ui:update (to region 'north')
    const uiMsg = {
      id: `ui-${Date.now()}`,
      type: 'ui',
      action: 'refreshActivity',
      scope: 'region',
      target: { region: 'north' },
      metadata: { notification: { seq: 101 } },
      payload: { count: 7 },
      createdAt: new Date().toISOString()
    };
    console.log('[harness] emitToRegion north ui:update', uiMsg);
    io.to(rooms.regionRoom('north')).emit('ui:update', uiMsg);

    // 2) User-scoped notification (to the mock user)
    const notif = {
      id: `notif-${Date.now()}`,
      type: 'info',
      scope: 'user',
      target: { userId: '000000000000000000000001' },
      metadata: { notification: { seq: 102 } },
      payload: { title: 'Hello test user', body: 'This is a personal test notification' },
      createdAt: new Date().toISOString()
    };

    // Use socketHandlers.emitToUsers helper to target user sockets (best-effort)
    try {
      const result = await socketHandlers.emitToUsers(['000000000000000000000001'], 'notification', notif);
      console.log('[harness] emitToUsers result', result);
    } catch (e) {
      console.error('[harness] emitToUsers error', e && e.message);
    }

    // After a short delay, disconnect client and exit
    setTimeout(() => {
      console.log('[harness] cleaning up client and exiting');
      try { client.disconnect(); } catch (e) {}
      // allow server to print ack logs before exit
      setTimeout(() => process.exit(0), 500);
    }, 1500);
  }, 500);
}

start().catch((err) => {
  console.error('Test harness failed', err);
  process.exit(1);
});
