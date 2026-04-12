// src/components/MessageTree/MessageTree.jsx
import React, { useMemo, useState, useCallback, createContext, useEffect } from "react";
import PropTypes from "prop-types";
import { css } from "@emotion/react";
import styled from "@emotion/styled";

import useMessages from "./useMessages";
import RowCard from "./RowCard";
import MessageDetail from "./MessageDetail";
import MessageForm from "./MessageForm";
import SearchFilterBar from "./SearchFilterBar";
import EmptyState from "./EmptyState";
import theme, { containerStyles } from "./MessageTree.styles";

/**
 * MessageTree
 *
 * - Provides a threaded message UI with lazy reply loading and inline reply forms.
 * - Exposes a context so child components can call handlers and read permissions.
 */

export const MessageTreeContext = createContext({
  permissions: {},
  maxReplyDepth: 3,
  singleOpen: true,
  handlers: {},
  replyFormMap: {},
  canPerform: null,
  settingsProp: {},
});

/* Layout */
const Wrapper = styled.div`
  ${containerStyles}
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
`;

const Tabs = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const TabButton = styled.button`
  background: ${(p) => (p.active ? theme.colors.primary : theme.colors.surface)};
  color: ${(p) => (p.active ? theme.colors.onPrimary : theme.colors.onSurface)};
  border: none;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  &:focus {
    outline: 2px solid ${theme.colors.focus};
  }
`;

const ListArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const listResponsive = css`
  @media (max-width: 640px) {
    padding: 8px;
  }
`;

/* Helper: filter root messages (no replyTo) */
function rootMessagesFrom(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter((m) => !m?.replyTo);
}

export default function MessageTree({
  messages: initialMessages = [],
  permissions = {
    canRead: true,
    canReply: true,
    canUpdate: true,
    canDelete: true,
    canCreate: true,
  },
  maxReplyDepth = 3,
  singleOpen = true,
  showAdminTab = true,
  mockPersistence = true,
  settingsProp = {},
  isAdminPermitted = false,
  actionFilter = null, // optional: (message, action) => boolean
}) {
  // data hook (workhorse-backed)
  const { messages, byId, create, update, remove, loadReplies, refresh } = useMessages(initialMessages, {
    mockPersistence,
  });

  // UI state
  const [activeTab, setActiveTab] = useState(1);
  const [openMap, setOpenMap] = useState({});
  const [replyFormMap, setReplyFormMap] = useState({});
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ type: "all", status: "all", ops_region: "all" });

  // blocked types that should have no CRUD and no replies
  const blockedTypes = useMemo(() => new Set(["email", "notification", "system"]), []);

  // Derived root messages (no client-side filtering)
  const rootMessages = useMemo(() => rootMessagesFrom(messages), [messages]);

  // NOTE: filtering/searching is delegated to backend via refresh(filter).
  // The UI shows whatever the backend returns. We still keep the SearchFilterBar
  // but it triggers refresh() with a Mongo-style filter object.

  /* Build a Mongo-style filter object from UI state */
  const buildFilterFromUI = useCallback(
    (q = "", f = {}) => {
      const filter = {};
      // type/status/ops_region filters
      if (f.type && f.type !== "all") filter.type = f.type;
      if (f.status && f.status !== "all") filter.status = f.status;
      if (f.ops_region && f.ops_region !== "all") filter.ops_region = f.ops_region;

      // simple text search: prefer backend regex or text search
      const text = (q || "").trim();
      if (text) {
        // Use a conservative $or with case-insensitive regex so backend can handle it
        filter.$or = [
          { subject: { $regex: text, $options: "i" } },
          { details: { $regex: text, $options: "i" } },
          { "metadata": { $regex: text, $options: "i" } },
        ];
      }

      return filter;
    },
    []
  );

  /* Initial load: refresh with current UI filters on mount */
  useEffect(() => {
    const f = buildFilterFromUI(query, filters);
    // refresh expects a filter object; workhorse/backend will parse it
    if (typeof refresh === "function") {
      refresh(f).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  /* Search / filter callbacks that delegate to backend */
  const onSearch = useCallback(
    (q) => {
      setQuery(q);
      const f = buildFilterFromUI(q, filters);
      if (typeof refresh === "function") refresh(f).catch(() => {});
    },
    [buildFilterFromUI, filters, refresh]
  );

  const onFilterChange = useCallback(
    (f) => {
      setFilters((prev) => {
        const next = { ...prev, ...f };
        // trigger backend refresh with new filter
        const filterObj = buildFilterFromUI(query, next);
        if (typeof refresh === "function") refresh(filterObj).catch(() => {});
        return next;
      });
    },
    [buildFilterFromUI, query, refresh]
  );

  /* Open/close a message or reply full view */
  const openMessage = useCallback(
    async (id) => {
      setOpenMap((prev) => {
        const currentlyOpen = Boolean(prev[id]);
        if (currentlyOpen) return { ...prev, [id]: false };
        if (singleOpen) return { [id]: true };
        return { ...prev, [id]: true };
      });

      if (typeof loadReplies === "function") {
        loadReplies(id).catch(() => {});
      }
    },
    [singleOpen, loadReplies]
  );

  /* Toggle inline reply form for a message/reply (central map) */
  const toggleReplyForm = useCallback((id) => {
    setReplyFormMap((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  /* Optional per-message action filter helper */
  const canPerform = useCallback(
    (message, action) => {
      if (!message || !action) return false;
      // blocked types have no CRUD and no replies
      if (blockedTypes.has(String(message.type).toLowerCase())) return false;
      if (typeof actionFilter === "function") {
        try {
          return Boolean(actionFilter(message, action));
        } catch {
          // fall through to global permissions
        }
      }
      // fallback to global permissions
      switch (action) {
        case "create":
          return Boolean(permissions.canCreate);
        case "reply":
          return Boolean(permissions.canReply);
        case "update":
          return Boolean(permissions.canUpdate);
        case "delete":
          return Boolean(permissions.canDelete);
        default:
          return false;
      }
    },
    [actionFilter, permissions, blockedTypes]
  );

  /* Handlers provided to children via context */
  const handlers = useMemo(
    () => ({
      create: async (payload) => {
        // defensive: block creating replies under blocked parent types
        if (payload && payload.replyTo) {
          const parent = byId && byId[String(payload.replyTo)];
          if (parent && blockedTypes.has(String(parent.type).toLowerCase())) {
            const err = new Error("Replies are not allowed for this message type.");
            err.code = "REPLY_BLOCKED";
            throw err;
          }
        }

        const created = await create(payload);

        // if created root, open it
        if (created && created._id && !created.replyTo) {
          setOpenMap((prev) => ({ ...prev, [created._id]: true }));
        }

        // if created as a child, force-refresh its parent's replies so UI shows the new child
        if (created && created._id && created.replyTo && typeof loadReplies === "function") {
          try {
            await loadReplies(created.replyTo, true);
          } catch {
            // ignore
          }
        }

        return created;
      },

      update: async (id, patch) => {
        // defensive: block updates on blocked types
        const target = byId && byId[String(id)];
        if (target && blockedTypes.has(String(target.type).toLowerCase())) {
          const err = new Error("Updates are not allowed for this message type.");
          err.code = "UPDATE_BLOCKED";
          throw err;
        }

        const res = await update(id, patch);

        // attempt to refresh parent replies so UI shows updated content
        try {
          const parentId = byId?.[String(id)]?.replyTo ?? null;
          const reloadTarget = parentId || id;
          if (reloadTarget && typeof loadReplies === "function") {
            await loadReplies(reloadTarget, true);
          }
        } catch {
          // ignore
        }

        return res;
      },

      remove: async (id) => {
        // defensive: block deletes on blocked types
        const target = byId && byId[String(id)];
        if (target && blockedTypes.has(String(target.type).toLowerCase())) {
          const err = new Error("Deletes are not allowed for this message type.");
          err.code = "DELETE_BLOCKED";
          throw err;
        }

        await remove(id);
        setOpenMap((prev) => ({ ...prev, [id]: false }));
      },

      loadReplies: async (parentId, force = false) => {
        // if parent is blocked type, return empty array
        const parent = byId && byId[String(parentId)];
        if (parent && blockedTypes.has(String(parent.type).toLowerCase())) {
          return [];
        }
        // delegate to data layer (workhorse)
        return loadReplies(parentId, force);
      },

      openMessage: (id) => openMessage(id),
      toggleReplyForm: (id) => toggleReplyForm(id),
      openReplyForm: (id) => {
        // walk up to thread root, open it and show inline form there
        let cur = id;
        try {
          while (cur && byId && byId[String(cur)] && byId[String(cur)].replyTo) {
            cur = byId[String(cur)].replyTo;
          }
        } catch {
          cur = id;
        }
        const rootId = cur || id;

        // if root is blocked type, do not open reply form
        const root = byId && byId[String(rootId)];
        if (root && blockedTypes.has(String(root.type).toLowerCase())) {
          return;
        }

        setOpenMap((prev) => ({ ...prev, [rootId]: true }));
        setReplyFormMap((prev) => ({ ...prev, [rootId]: true }));
        if (typeof loadReplies === "function") {
          loadReplies(rootId).catch(() => {});
        }
      },
    }),
    [create, update, remove, loadReplies, openMessage, toggleReplyForm, byId, blockedTypes]
  );

  const ctxValue = useMemo(
    () => ({
      permissions,
      maxReplyDepth,
      singleOpen,
      handlers,
      replyFormMap,
      canPerform,
      settingsProp,
    }),
    [permissions, maxReplyDepth, singleOpen, handlers, replyFormMap, canPerform, settingsProp]
  );

  /* Inline reply submit handler used when parent injects a MessageForm */
  const handleInlineReplySubmit = useCallback(
    async (parentId, payload) => {
      // defensive: check parent type before attempting create
      const parent = byId && byId[String(parentId)];
      if (parent && blockedTypes.has(String(parent.type).toLowerCase())) {
        const err = new Error("Replies are not allowed for this message type.");
        err.code = "REPLY_BLOCKED";
        throw err;
      }

      const replyPayload = { ...payload, replyTo: parentId };
      const created = await handlers.create(replyPayload);

      try {
        await loadReplies(parentId, true);
      } catch {
        // ignore
      }

      setReplyFormMap((prev) => ({ ...prev, [parentId]: false }));
      return created;
    },
    [handlers, loadReplies, byId, blockedTypes]
  );

  const setActions = (msg) => {
    const allActions = {
      replies: canPerform(msg, "reply"),
      reply: canPerform(msg, "reply"),
      update: canPerform(msg, "update"),
      delete: canPerform(msg, "delete"),
    };
    const valuesSet = new Set(Object.values(allActions));
    const isNoAction = valuesSet.size === 1 && valuesSet.has(false);
    return { isAction: !isNoAction, allActions };
  };

  return (
    <MessageTreeContext.Provider value={ctxValue}>
      <Wrapper role="region" aria-label="Message tree">
        <Tabs>
          <TabButton active={activeTab === 1} onClick={() => setActiveTab(1)} aria-pressed={activeTab === 1}>
            Messages
          </TabButton>
          {showAdminTab && (isAdminPermitted || permissions.canCreate) && (
            <TabButton active={activeTab === 2} onClick={() => setActiveTab(2)} aria-pressed={activeTab === 2}>
              Create Message
            </TabButton>
          )}
        </Tabs>

        {activeTab === 1 && (
          <>
            <SearchFilterBar onSearch={onSearch} onFilterChange={onFilterChange} />
            <ListArea css={listResponsive}>
              {rootMessages.length === 0 ? (
                <EmptyState canCreate={permissions.canCreate} onCreateClick={() => setActiveTab(2)} />
              ) : (
                rootMessages.map((msg) => {
                  const isOpen = Boolean(openMap[msg._id]);
                  const showReplyFormForMsg = Boolean(replyFormMap[msg._id]);
                  // if message type is blocked, ensure reply form is never shown
                  const replyAllowedForMsg = !blockedTypes.has(String(msg.type).toLowerCase()) && canPerform(msg, "reply");

                  return (
                    <div key={msg._id}>
                      <RowCard
                        message={msg}
                        isOpen={isOpen}
                        onToggle={() => openMessage(msg._id)}
                        depth={0}
                        replies={Array.isArray(msg.replies) ? msg.replies : []}
                        handlers={handlers}
                        permissions={permissions}
                        canPerform={canPerform}
                        maxReplyDepth={maxReplyDepth}
                        settingsProp={settingsProp}
                      />

                      {isOpen && (
                        <div style={{ paddingLeft: "1em", paddingRight: "0.5em" }}>
                          <div
                            style={{
                              paddingLeft: "1em",
                              paddingRight: "0.25em",
                              border: "1px dashed transparent",
                              borderRadius: "0px 0px 10px 10px",
                            }}
                          >
                            <MessageDetail
                              message={msg}
                              depth={0}
                              onLoadReplies={() => handlers.loadReplies(msg._id)}
                              showActions={setActions(msg).isAction}
                              allowedButtons={setActions(msg).allActions}
                              onToggleReplyForm={() => {
                                // only toggle if replies allowed for this message
                                if (replyAllowedForMsg) toggleReplyForm(msg._id);
                              }}
                              settingsProp={settingsProp}
                              canPerform={canPerform}
                            >
                              {showReplyFormForMsg && replyAllowedForMsg && (
                                <div style={{ marginTop: 12 }}>
                                  <MessageForm
                                    initial={{ imsg: msg, subject: `Re: ${msg?.subject ?? ""}`, replyTo: msg._id }}
                                    onSubmit={async (payload) => {
                                      await handleInlineReplySubmit(msg._id, payload);
                                    }}
                                    onCancel={() => toggleReplyForm(msg._id)}
                                    allowedTargets={{ users: true, ops_region: true, all: true }}
                                    settingsProp={settingsProp}
                                    mode="reply"
                                  />
                                </div>
                              )}
                            </MessageDetail>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </ListArea>
          </>
        )}

        {activeTab === 2 && (isAdminPermitted || permissions.canCreate) && (
          <MessageForm
            initial={null}
            onSubmit={async (payload) => {
              await handlers.create(payload);
              setActiveTab(1);
            }}
            onCancel={() => setActiveTab(1)}
            allowedTargets={{ users: true, ops_region: true, all: true }}
            settingsProp={settingsProp}
            mode="create"
          />
        )}
      </Wrapper>
    </MessageTreeContext.Provider>
  );
}

MessageTree.propTypes = {
  messages: PropTypes.array,
  permissions: PropTypes.shape({
    canRead: PropTypes.bool,
    canReply: PropTypes.bool,
    canUpdate: PropTypes.bool,
    canDelete: PropTypes.bool,
    canCreate: PropTypes.bool,
  }),
  maxReplyDepth: PropTypes.number,
  singleOpen: PropTypes.bool,
  showAdminTab: PropTypes.bool,
  mockPersistence: PropTypes.bool,
  settingsProp: PropTypes.object,
  isAdminPermitted: PropTypes.bool,
  actionFilter: PropTypes.func,
};
