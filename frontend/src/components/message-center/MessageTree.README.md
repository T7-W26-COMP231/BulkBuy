# MessageTree README

A compact, reusable React component suite for threaded messages and lightweight issue walls. Includes a main **MessageTree** component, UI subcomponents, a local hook with optimistic updates, a mock service for development, and utilities for permissions and styling.

---

### Installation

**Runtime**
```bash
npm install @emotion/react @emotion/styled
```

**Dev (Vite)**
```bash
npm install -D @emotion/babel-plugin @vitejs/plugin-react
```

**Optional Tailwind (PostCSS)**
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init
```

---

### Vite configuration

Enable Emotion’s compile-time transform so component selectors and Emotion features work correctly:

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      jsxImportSource: '@emotion/react',
      babel: { plugins: ['@emotion/babel-plugin'] }
    })
  ]
});
```

**Notes**
- Restart the dev server after installing packages.
- For plain JavaScript projects no `tsconfig` changes are required.

---

### Quick start (default import)

**Typical usage**
```jsx
import MessageTree from 'src/components/MessageTree';

export default function App() {
  return <MessageTree />;
}
```

---

### Use case 1 — Quick mount with built-in mock handlers

**Purpose:** mount `MessageTree` quickly during development using the included `useMessages` hook and mock persistence.

```jsx
// src/App.jsx
import React from 'react';
import MessageTree, { useMessages } from 'src/components/MessageTree';

export default function App() {
  const { messages, create, update, remove, loadReplies, refresh } = useMessages([], {
    mockPersistence: true
  });

  const handlers = { create, update, remove, loadReplies, refresh };

  return (
    <div style={{ padding: 24 }}>
      <MessageTree
        messages={messages}
        handlers={handlers}
        permissions={{ canRead: true, canReply: true, canCreate: true }}
        maxReplyDepth={3}
      />
    </div>
  );
}
```

---

### Use case 2 — Integrate with your backend (custom handlers)

**Purpose:** integrate `MessageTree` into an app with your own API functions. This example shows fetching root messages, wiring create/update/delete, lazy reply loading, and refresh.

```jsx
// src/App.jsx
import React, { useEffect, useState } from 'react';
import MessageTree from 'src/components/MessageTree';
import api from './lib/api'; // your API wrapper

export default function App() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    api.fetchRootMessages().then(setMessages).catch(() => setMessages([]));
  }, []);

  const handlers = {
    create: async (payload) => {
      const created = await api.createMessage(payload);
      setMessages((m) => [created, ...m]);
      return created;
    },
    update: async (id, patch) => {
      const updated = await api.updateMessage(id, patch);
      setMessages((m) => m.map((x) => (x._id === id ? updated : x)));
      return updated;
    },
    remove: async (id) => {
      const res = await api.deleteMessage(id);
      setMessages((m) => m.map((x) => (x._id === id ? res : x)));
      return res;
    },
    loadReplies: async (parentId) => {
      const replies = await api.fetchReplies(parentId);
      return replies;
    },
    refresh: async () => {
      const fresh = await api.fetchRootMessages();
      setMessages(fresh);
      return fresh;
    }
  };

  return (
    <MessageTree
      messages={messages}
      handlers={handlers}
      permissions={{ canRead: true, canReply: true, canCreate: false }}
      maxReplyDepth={4}
    />
  );
}
```

---

### Direct snippet

Use this snippet when you want to pass your own root messages array and custom handlers directly to `MessageTree`:

```jsx
<MessageTree
  messages={rootMessagesArray}
  handlers={{
    create: myCreateFn,
    update: myUpdateFn,
    remove: myRemoveFn,
    loadReplies: myLoadRepliesFn
  }}
  permissions={{ canRead: true, canReply: false, canUpdate: true }}
  maxReplyDepth={3}
/>
```

---

### Exports and API

**Default export**
- **MessageTree** main component

**Named exports**
- **theme** design tokens and colors  
- **containerStyles** shared container CSS fragment  
- **useMessages** hook for local state and mock persistence  
- **permissions** helpers and presets

**Re-exported components**
- **RowCard**, **MessageDetail**, **ReplyCard**, **MessageForm**, **SearchFilterBar**, **EmptyState**

**MessageTree props**
- **messages** `Array` — root messages (use `useMessages` or your API)  
- **handlers** `Object` — methods the component calls:
  - `create(payload)` → `Promise<createdMessage>`  
  - `update(id, patch)` → `Promise<updatedMessage>`  
  - `remove(id)` → `Promise<updatedMessage>`  
  - `loadReplies(parentId)` → `Promise<Array<reply>>`  
  - `refresh()` → `Promise<Array<message>>`  
- **permissions** `Object` — permission flags (see `permissions.defaultPermissions`)  
- **maxReplyDepth** `number` — maximum nesting depth for replies  
- **other** optional UI props for customization and callbacks

---

### Troubleshooting

**Component selector error with Vite**
- Ensure Emotion transform is enabled in `vite.config.js` (see Vite configuration above).
- Install `@emotion/react`, `@emotion/styled`, and `@emotion/babel-plugin`.
- Restart the dev server.

**Missing @emotion/styled**
```bash
npm install @emotion/react @emotion/styled
```

**If you cannot enable Emotion transform**
- Avoid component selectors in `css` interpolations. Use class names or styled composition:
  - Add a `className` to the child and target that class in parent CSS.
  - Compose styled components: `const StyledSubject = styled(Subject)\`...\`;`

**Monorepo or workspace issues**
- Ensure Emotion packages are installed in the package where `MessageTree` is consumed, or hoisted to the workspace root if appropriate.

---

### Contributing and extending

- Replace the mock `messageService` by providing `handlers` that call your backend.
- Use `theme` tokens to align visuals with your design system.
- Import individual components for custom layouts or tests:
```js
import { RowCard, MessageForm } from 'src/components/MessageTree';
```

---

### Notes

- The included `useMessages` hook and `messageService` provide optimistic updates and a mock-friendly development experience.
- Permission logic is centralized in `permissions.js` for consistent UI behavior.
- All examples use plain JavaScript and are ready for Vite projects.

---

### Overview

**MessageTree** is a lightweight React message/thread UI with a normalized data hook, optimistic CRUD, lazy reply loading, and a mock service for local development. It supports nested replies, inline reply forms at any depth, and configurable permissions and behavior.

---

### Quick install and import

```bash
# copy files into your project
src/components/MessageTree/*
src/hooks/useMessages.js
src/services/messageService.js
```

```javascript
// import defaults and helpers
import MessageTree, { theme, useMessages, permissions } from './components/MessageTree';
```

---

### Core API

#### useMessages hook
**Returns:** `{ messages, byId, loading, error, create, update, remove, loadReplies, refresh }`

**Options:**  
- **mockPersistence** `boolean` — simulate latency and use in-memory store. Default `true`.  
- **sortFn** `function` — comparator for root message ordering. Default sorts by `createdAt` descending.

**Behavior:**  
- Normalizes messages into `byId` map and `messages` array of root messages.  
- Supports optimistic create for root and replies.  
- `loadReplies(parentId, force = false)` fetches and caches replies for any parent (root or nested).  
- On create of a reply, the hook ensures the parent is present and refreshes parent replies when needed.

#### messageService
**Exports:** `fetchMessages`, `fetchReplies`, `createMessage`, `updateMessage`, `deleteMessage`

**Modes:**  
- **Mock mode** (default) — in-memory store with seeded data and simulated latency. Parent `replies` arrays are kept consistent.  
- **Real mode** — set `baseUrl` and pass `mock: false` to call REST endpoints.

---

### MessageTree component

**Default export:** `MessageTree`  
**Named exports:** `theme`, `containerStyles`, `useMessages`, `permissions`, child components

#### Props (most used)
| Prop | Type | Default | Description |
|---|---:|---|---|
| **messages** | `array` | `[]` | Initial messages to seed the hook |
| **permissions** | `object` | `{ canRead:true, canReply:true, canUpdate:true, canDelete:true, canCreate:true }` | Controls which actions are enabled |
| **maxReplyDepth** | `number` | `3` | Maximum nesting depth for replies |
| **singleOpen** | `boolean` | `true` | Only one message open at a time |
| **mockPersistence** | `boolean` | `true` | Use mock service with latency |
| **settingsProp** | `object` | `{}` | UI options passed to forms and components |

#### Context provided to children
`MessageTreeContext` contains:
- **permissions** — same as prop
- **maxReplyDepth**
- **singleOpen**
- **handlers** — `{ create, update, remove, loadReplies, openMessage, toggleReplyForm, openReplyForm }`
- **replyFormMap** — map of inline reply form visibility keyed by message id

**Handlers behavior**
- **create(payload)** — creates root or reply; if reply, forces `loadReplies(parentId, true)` so parent shows new child.
- **loadReplies(parentId, force)** — fetches replies and upserts them into `byId`.
- **toggleReplyForm(id)** — toggles inline reply form for that id.
- **openReplyForm(id)** — resolves thread root and opens inline form at root when needed.

---

### Key components

#### MessageForm
- Controlled form used for create, reply, and edit.
- Props: `initial`, `onSubmit`, `onCancel`, `allowedTargets`, `settingsProp`, `mode` (`create|reply|edit`).
- **Behavior:** pre-fills `subject` for replies, attaches `replyTo` when `mode === "reply"`, validates subject and details, supports attachments (names only in mock).

#### ReplyCard
- Renders a single reply node with actions: **Reply**, **Update**, **Delete**, **Load replies**.
- Reads `replyFormMap` from context to show inline form for that specific reply id.
- On **Reply** click calls `handlers.toggleReplyForm(reply._id)` so inline form opens under that reply.
- After creating a nested reply it forces `handlers.loadReplies(reply._id, true)` to refresh children.

#### RowCard and MessageDetail
- `RowCard` shows a root message summary and toggles full view.
- `MessageDetail` renders full message, children area, and can host inline `MessageForm`.

---

### Usage examples

#### Basic mount with mock data
```jsx
import MessageTree from './components/MessageTree';

export default function App() {
  return <MessageTree mockPersistence={true} />;
}
```

#### Create a message programmatically using the hook
```jsx
import { useEffect } from 'react';
import { useMessages } from './components/MessageTree';

function Demo() {
  const { create, messages } = useMessages([], { mockPersistence: true });

  useEffect(() => {
    async function seed() {
      await create({ subject: 'Hello', details: 'First message' });
    }
    seed();
  }, [create]);

  return <div>{messages.length} root messages</div>;
}
```

#### Inline reply on a reply (works same as root)
```jsx
// User clicks Reply on a ReplyCard
// ReplyCard calls handlers.toggleReplyForm(reply._id)
// MessageForm is rendered with:
initial = { subject: `Re: ${reply.subject}`, replyTo: reply._id }
mode = "reply"

// On submit MessageForm calls handlers.create(payload)
// handlers.create ensures loadReplies(reply._id, true) runs after create
// UI refreshes and new nested reply appears under that reply
```

#### Custom handlers integration (real backend)
```jsx
// Provide your own create/update/remove that call your API and then call tree handlers to refresh
const handlers = {
  create: async (payload) => {
    const created = await api.post('/messages', payload);
    // return created object
    return created;
  }
};
```

#### Respecting maxReplyDepth
```jsx
<MessageTree maxReplyDepth={2} />
// Reply buttons are disabled or hidden when depth >= 2
```

---

### Troubleshooting and tips

- **Inline form not appearing:** ensure `ReplyCard` calls `handlers.toggleReplyForm(id)` and `MessageTree` exposes `replyFormMap` in context. The inline form visibility is driven by `replyFormMap[id]`.
- **Reply not visible after create:** confirm `handlers.create` triggers `loadReplies(parentId, true)` after server returns. Mock mode already inserts replies into parent.replies.
- **Optimistic UI:** temporary IDs are created for optimistic replies. The hook replaces temp IDs with server IDs when the create resolves.
- **Server integration:** set `baseUrl` in `messageService.js` and call service functions with `{ mock: false }` to use real endpoints.
- **Testing:** use `mockPersistence: true` for deterministic local behavior and simulated latency.

---

### Short checklist for reply-on-reply flow

1. Click **Reply** on a reply node.  
2. `ReplyCard` calls `handlers.toggleReplyForm(replyId)`.  
3. Inline `MessageForm` appears prefilled with `subject: Re: <parent subject>` and `replyTo: replyId`.  
4. Submit form → `handlers.create(payload)` runs.  
5. After create resolves, `loadReplies(replyId, true)` refreshes the parent replies.  
6. New nested reply appears under the reply node.

---

### Where to pass `isAdminPermitted`

Pass it as a prop on the `MessageTree` component. The component shows the **Create Message** tab when `showAdminTab` is true **and** either `isAdminPermitted` **or** `permissions.canCreate` is truthy.

**Example — enable admin tab:**
```jsx
<MessageTree
  mockPersistence={true}
  isAdminPermitted={true}
/>
```

**Example — control via permissions instead:**
```jsx
<MessageTree
  mockPersistence={true}
  isAdminPermitted={false}
  permissions={{ canRead: true, canCreate: true, canReply: true, canUpdate: true, canDelete: true }}
/>
```

**Notes**
- The tab is rendered only when `showAdminTab` prop is true (default) and `(isAdminPermitted || permissions.canCreate)` evaluates to true.
- To hide the tab entirely, pass `showAdminTab={false}`.

=====

### Turn CRUD off globally
Pass the `permissions` prop to `MessageTree`. Set the CRUD flags to `false` to remove all create/update/delete/reply controls.

```jsx
<MessageTree
  permissions={{
    canRead: true,
    canCreate: false,
    canReply: false,
    canUpdate: false,
    canDelete: false,
  }}
/>
```

---

### Turn controls off selectively per message
Add a **filter function** prop (example name: `actionFilter`) to `MessageTree`. The function receives the message and an action string and returns `true`/`false`. Use it to decide visibility of buttons per message.

#### 1) `MessageTree` — accept `actionFilter` and expose `canPerform` in context
```jsx
// props: actionFilter?: (message, action) => boolean
function MessageTree({ actionFilter, permissions, ... }) {
  // helper used by children
  const canPerform = useCallback(
    (message, action) => {
      if (typeof actionFilter === "function") return Boolean(actionFilter(message, action));
      // fallback to global permissions
      switch (action) {
        case "create": return Boolean(permissions.canCreate);
        case "reply":  return Boolean(permissions.canReply);
        case "update": return Boolean(permissions.canUpdate);
        case "delete": return Boolean(permissions.canDelete);
        default: return false;
      }
    },
    [actionFilter, permissions]
  );

  const ctxValue = useMemo(() => ({
    permissions,
    maxReplyDepth,
    singleOpen,
    handlers,
    replyFormMap,
    canPerform, // expose it
  }), [permissions, maxReplyDepth, singleOpen, handlers, replyFormMap, canPerform]);

  return <MessageTreeContext.Provider value={ctxValue}>…</MessageTreeContext.Provider>;
}
```

#### 2) `ReplyCard` / `RowCard` — use `canPerform` instead of raw `permissions`
```jsx
const { canPerform, maxReplyDepth } = useContext(MessageTreeContext);

const canReply = canPerform(reply, "reply") && depth < maxReplyDepth;
const canUpdate = canPerform(reply, "update");
const canDelete = canPerform(reply, "delete");
```

---

### Example `actionFilter` usages

**Allow replies only for messages in Toronto**
```js
const actionFilter = (message, action) => {
  if (action === "reply") return message.ops_region === "Toronto";
  return true; // other actions follow global permissions
};
<MessageTree actionFilter={actionFilter} />
```

**Disable update/delete for messages older than 24 hours**
```js
const actionFilter = (message, action) => {
  if (action === "update" || action === "delete") {
    const ageMs = Date.now() - new Date(message.createdAt).getTime();
    return ageMs < 24 * 60 * 60 * 1000;
  }
  return true;
};
```

**Per-message override stored on the message**
```js
// message.meta = { allowReply: false, allowUpdate: true }
const actionFilter = (message, action) => {
  if (message.meta && typeof message.meta[`allow${capitalize(action)}`] !== "undefined") {
    return Boolean(message.meta[`allow${capitalize(action)}`]);
  }
  return true;
};
```

---

### Quick checklist
- **Global off:** set `permissions` flags to `false`.  
- **Per-message control:** pass `actionFilter` to `MessageTree`.  
- **Implementation:** expose `canPerform` in context and use it in components to show/hide or disable buttons.  
- **Depth cap:** still enforced by `depth < maxReplyDepth` when deciding whether to show Reply.

---

### Minimal example usage
```jsx
<MessageTree
  permissions={{ canRead:true, canCreate:true, canReply:true, canUpdate:true, canDelete:true }}
  actionFilter={(msg, action) => {
    if (action === "reply") return msg.ops_region === "Toronto";
    return true;
  }}
/>
```

This will keep the Create tab (global) but only show **Reply** on messages whose `ops_region` is `"Toronto"`.