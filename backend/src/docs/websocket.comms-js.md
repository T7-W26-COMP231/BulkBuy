### WebSocket Comms — Overview

A compact, production-ready Socket.IO layer for real-time notifications and lightweight UI updates.  
**Purpose:** deliver personal, scoped (region/role), and global messages reliably; support client acking and per-user cursor persistence inside the existing Config document.

---

### Architecture and Components

- **Socket handlers** `src/comms-js/websocket/socketHandlers.js`  
  - Registers `io.on('connection')` and per-socket listeners.  
  - Maps sockets to users via `socketRegistry`.  
  - Joins sockets to rooms using `rooms` helpers.  
  - Exposes emit helpers: **emitToSockets**, **emitToUsers**, **emitToRegion**, **emitToAll**, **disconnectUserSockets**.

- **Rooms helper** `src/comms-js/websocket/rooms.js`  
  - Canonical room names: **region:ID**, **role:NAME**.  
  - Per-socket join/leave helpers and bulk `joinRoomsForUser` / `leaveRoomsForUser`.

- **Cursor persistence** `src/models/usercursor.metadata.js` (helper)  
  - Stores per-user cursor inside `Config.metadata.notificationCursor`.  
  - Atomic `advanceCursor(userId, seq)` implemented with `$max` to avoid regressions.

- **Notification controller and services** `src/comms-js/controllers/notifications.controller.js` and `src/comms-js/services/*`  
  - REST endpoints: `GET /api/comms/missed`, `POST /api/comms/ack`, `POST /api/comms/create`, `POST /api/comms/broadcast`.  
  - `createAndPushNotifications` and `emitUiUpdate` helpers build payloads and call socket emit helpers.

- **Client integration** `client/src/comms-js/socket.js`  
  - `initSocket(token)` connects with `auth: { token }`.  
  - Listens for `connected`, `notification`, `ui:update`, `system:update`.  
  - Best-effort ack via `socket.emit('ackNotification', { id, seq })` or REST `/api/comms/ack`.

---

### Events and Payloads

| **Event** | **Scope** | **Purpose** | **Minimal payload** |
|---|---:|---|---|
| `notification` | user, region, role, all | user-facing messages, ordered, ackable | `{ id, type, scope, target, metadata: { notification: { seq } }, payload, createdAt }` |
| `ui:update` | user, region, role, all | lightweight UI instructions from backend | `{ id, action, scope, payload, metadata?: { notification: { seq } }, createdAt }` |
| `connected` | socket | server ack on connect | `{ socketId, serverTime }` |
| `ackNotification` (client→server) | user | client acknowledges seq | `{ id, seq }` |

**Seq contract**  
- Include a monotonic numeric `seq` in `metadata.notification.seq` for messages that require ordering or acking.  
- Server persists cursor with `$max` to ensure monotonicity.

---

### Client Behavior (recommended)

- **On connect**: wait for `connected` ack before treating socket as ready.  
- **On `notification`**: display or enqueue message, then best-effort ack the `seq`.  
- **On `ui:update`**: perform lightweight, idempotent UI changes or dispatch a custom event for the app to handle.  
- **Ack strategy**: prefer socket ack for low latency and REST ack for authoritative persistence. Use both if needed.  
- **Reconnect**: use exponential backoff and preserve auth token across reconnects. Remove listeners on disconnect to avoid leaks.

---

### Server Best Practices and Operational Notes

- **Atomic cursor updates**: use `Config.findOneAndUpdate` with `$max` on `metadata.notificationCursor.lastSeq`.  
- **Room naming**: use `rooms.regionRoom(regionId)` and `rooms.roleRoom(role)` consistently.  
- **Emit helpers**: call `emitToUsers` for personal messages, `emitToRegion` for region-scoped, `emitToAll` for global.  
- **Multi-instance**: enable Socket.IO Redis adapter in production to ensure `io.emit` and `io.to(room)` reach all instances.  
- **Logging**: avoid PII in logs; log socket ids and error messages only.  
- **Rate control**: debounce or summarize high-frequency `ui:update` messages to avoid client overload.  
- **Security**: validate sender permissions for region/role/global broadcasts and sanitize payloads.

---

### Quick examples

**Server: emit UI update to a region**
```js
const uiUpdate = require('./comms-js/services/uiUpdate.service');
await uiUpdate.emitUiUpdate('refreshActivity', { count: 5 }, { scope: 'region', region: 'north', seq: 123 });
```

**Client: handle ui:update**
```js
socket.on('ui:update', (cmd) => {
  switch (cmd.action) {
    case 'refreshActivity':
      window.dispatchEvent(new CustomEvent('ui:update', { detail: cmd }));
      break;
    default:
      window.dispatchEvent(new CustomEvent('ui:update', { detail: cmd }));
  }
  if (cmd.metadata?.notification?.seq) socket.emit('ackNotification', { id: cmd.id, seq: cmd.metadata.notification.seq });
});
```

---

**Where to look in the repo**  
- `src/comms-js/websocket/socketHandlers.js`  
- `src/comms-js/websocket/rooms.js`  
- `src/comms-js/controllers/notifications.controller.js`  
- `src/models/usercursor.metadata.js` (Config-embedded cursor helper)  
- `client/src/comms-js/socket.js`

---

