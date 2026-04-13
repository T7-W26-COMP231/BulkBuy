// src/hooks/useMessages.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import messageService from "./messageService";

/**
 * useMessages
 *
 * Normalized message state with lazy reply loading and optimistic CRUD.
 *
 * API:
 *   { messages, byId, loading, error, create, update, remove, loadReplies, refresh }
 *
 * Options:
 *   - mockPersistence (bool) - simulate latency (default true)
 *   - sortFn (fn) - comparator for ordering root messages (default: createdAt desc)
 */

const DEFAULT_OPTIONS = {
  mockPersistence: true,
  sortFn: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
};

function normalizeList(list = []) {
  return (list || []).map((m) => ({ ...m }));
}

function ensureId(obj) {
  if (!obj) return obj;
  if (!obj._id) obj._id = `tmp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  return obj;
}

export function useMessages(initialMessages = [], opts = {}) {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const mountedRef = useRef(true);

  // blocked types that should not accept CRUD or replies at the hook/service level
  const blockedTypes = useMemo(() => new Set(["email", "notification", "system"]), []);

  const [byId, setById] = useState(() => {
    const map = {};
    normalizeList(initialMessages).forEach((m) => {
      if (m && m._id) map[String(m._id)] = { ...m };
    });
    return map;
  });

  const [rootIds, setRootIds] = useState(() =>
    normalizeList(initialMessages).filter((m) => !m.replyTo).map((m) => String(m._id))
  );

  const [repliesLoaded, setRepliesLoaded] = useState(() => ({}));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const messages = useMemo(() => {
    const arr = rootIds
      .map((id) => byId[id])
      .filter(Boolean)
      .map((m) => ({ ...m }));
    if (options.sortFn) arr.sort(options.sortFn);
    return arr;
  }, [byId, rootIds, options.sortFn]);

  /* Internal helpers */
  const upsertMessage = useCallback((msg) => {
    if (!msg || !msg._id) return;
    const id = String(msg._id);
    setById((prev) => ({ ...prev, [id]: { ...msg } }));
    setRootIds((prev) => {
      // If message is root (no replyTo) ensure it's in rootIds
      if (!msg.replyTo) {
        return prev.includes(id) ? prev : [id, ...prev];
      }
      return prev;
    });
  }, []);

  const replaceMessage = useCallback((id, patch) => {
    if (!id) return;
    setById((prev) => {
      const cur = prev[String(id)];
      if (!cur) return prev;
      return { ...prev, [String(id)]: { ...cur, ...patch } };
    });
  }, []);

  const removeMessageLocal = useCallback((id) => {
    if (!id) return;
    setById((prev) => {
      const cur = prev[String(id)];
      if (!cur) return prev;
      return { ...prev, [String(id)]: { ...cur, deleted: true, status: "deleted" } };
    });
  }, []);

  /* Load replies for a parent message (lazy). Works for any parentId (root or nested).
     NOTE: defined early so other callbacks can safely reference it. */
  const loadReplies = useCallback(
    async (parentId, force = false) => {
      if (!parentId) return [];
      // If parent is a blocked type, avoid returning replies (defensive)
      const parent = byId && byId[String(parentId)];
      if (parent && blockedTypes.has(String(parent.type).toLowerCase())) {
        // mark replies as loaded to avoid repeated fetch attempts
        setRepliesLoaded((prev) => ({ ...prev, [String(parentId)]: true }));
        // ensure parent.replies is an empty array in state
        setById((prev) => {
          const newMap = { ...prev };
          const p = newMap[String(parentId)] || {};
          newMap[String(parentId)] = { ...p, replies: [], _replyCount: 0 };
          return newMap;
        });
        return [];
      }

      if (repliesLoaded[String(parentId)] && !force) {
        const parentCached = byId[String(parentId)];
        return parentCached ? parentCached.replies || [] : [];
      }
      try {
        const loaded = await messageService.fetchReplies(parentId, { mock: options.mockPersistence });
        if (!mountedRef.current) return loaded || [];
        setById((prev) => {
          const newMap = { ...prev };
          const parent = newMap[String(parentId)] || {};
          newMap[String(parentId)] = {
            ...parent,
            replies: normalizeList(loaded || []),
            _replyCount: (loaded || []).length,
          };
          (loaded || []).forEach((r) => {
            if (r && r._id) newMap[String(r._id)] = { ...r };
          });
          return newMap;
        });
        setRepliesLoaded((prev) => ({ ...prev, [String(parentId)]: true }));
        return loaded || [];
      } catch (err) {
        setRepliesLoaded((prev) => ({ ...prev, [String(parentId)]: true }));
        return [];
      }
    },
    // include byId and repliesLoaded in deps to ensure latest state is used
    [byId, options.mockPersistence, repliesLoaded, blockedTypes]
  );

  /* Public: refresh (fetch all root messages)
     Accepts optional filter (Mongo-style object). */
  const refresh = useCallback(
    async (filter = {}) => {
      setLoading(true);
      setError(null);
      try {
        // Prefer messageService.listMessages(filter, opts) if available
        let fetched = [];
        if (messageService && typeof messageService.listMessages === "function") {
          try {
            const res = await messageService.listMessages(filter, { mock: options.mockPersistence });
            // listMessages may return { items: [] } or raw array
            if (Array.isArray(res)) fetched = res;
            else if (res && Array.isArray(res.items)) fetched = res.items;
            else if (res && Array.isArray(res.data)) fetched = res.data;
            else fetched = [];
          } catch (err) {
            // fallback to fetchMessages
            const res2 = await messageService.fetchMessages({ mock: options.mockPersistence });
            fetched = Array.isArray(res2) ? res2 : (res2 && Array.isArray(res2.items) ? res2.items : []);
          }
        } else {
          const res = await messageService.fetchMessages({ mock: options.mockPersistence });
          fetched = Array.isArray(res) ? res : (res && Array.isArray(res.items) ? res.items : []);
        }

        if (!mountedRef.current) return;
        const map = {};
        const ids = [];
        normalizeList(fetched).forEach((m) => {
          if (m && m._id) {
            const id = String(m._id);
            map[id] = { ...m };
            if (!m.replyTo) ids.push(id);
          }
        });
        setById(map);
        setRootIds(ids);
        setRepliesLoaded({});
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [options.mockPersistence]
  );

  /* Create (supports root and replyTo) */
  const create = useCallback(
    async (payload = {}) => {
      // Defensive: if creating a reply, ensure parent type allows replies
      const isReply = !!payload.replyTo;
      if (isReply) {
        const parent = payload.replyTo && byId ? byId[String(payload.replyTo)] : null;
        if (parent && blockedTypes.has(String(parent.type).toLowerCase())) {
          const err = new Error("Replies are not allowed for this message type.");
          err.code = "REPLY_BLOCKED";
          throw err;
        }
      }

      const temp = ensureId({
        ...payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        replies: [],
        _replyCount: 0,
        _optimistic: true,
      });

      if (isReply) {
        // optimistic: attach child to byId safely (do not write undefined parent)
        setById((prev) => {
          const parent = prev[String(payload.replyTo)];
          const newChild = { ...temp };
          const newMap = { ...prev, [String(temp._id)]: newChild };
          if (parent) {
            newMap[String(payload.replyTo)] = {
              ...parent,
              replies: Array.isArray(parent.replies) ? [...parent.replies, newChild] : [newChild],
              _replyCount: (parent._replyCount || 0) + 1,
            };
          }
          return newMap;
        });
      } else {
        setById((prev) => ({ ...prev, [String(temp._id)]: temp }));
        setRootIds((prev) => [String(temp._id), ...prev]);
      }

      try {
        const created = await messageService.createMessage(payload, { mock: options.mockPersistence });
        if (!mountedRef.current) return created;

        // Replace optimistic entries and ensure created is present
        setById((prev) => {
          const newMap = { ...prev };
          // if server returned a different id, remove temp key
          if (String(created._id) !== String(temp._id)) {
            delete newMap[String(temp._id)];
          }
          newMap[String(created._id)] = { ...created };
          return newMap;
        });

        if (!isReply) {
          // ensure root ordering and then refresh top-level list to get authoritative state
          setRootIds((prev) => {
            const withoutTemp = prev.filter((i) => i !== String(temp._id));
            if (!withoutTemp.includes(String(created._id))) return [String(created._id), ...withoutTemp];
            return withoutTemp;
          });
          // reload top-level list to ensure server ordering and permissions
          try {
            await refresh();
          } catch {
            // ignore refresh errors
          }
        } else {
          // replace optimistic child in parent's replies if parent exists
          setById((prev) => {
            const newMap = { ...prev };
            const parent = newMap[String(payload.replyTo)];
            if (parent && Array.isArray(parent.replies)) {
              newMap[String(payload.replyTo)] = {
                ...parent,
                replies: parent.replies.map((r) => (String(r._id) === String(temp._id) ? created : r)),
                _replyCount: parent._replyCount || parent.replies.length,
              };
            }
            newMap[String(created._id)] = { ...created };
            return newMap;
          });

          // reload this parent's replies so UI shows authoritative children
          const parentId = String(created.replyTo);
          try {
            await loadReplies(parentId, true);
          } catch {
            // ignore
          }
        }

        return created;
      } catch (err) {
        // rollback optimistic
        if (isReply) {
          setById((prev) => {
            const newMap = { ...prev };
            const parent = newMap[String(payload.replyTo)];
            if (parent && Array.isArray(parent.replies)) {
              newMap[String(payload.replyTo)] = {
                ...parent,
                replies: parent.replies.filter((r) => String(r._id) !== String(temp._id)),
                _replyCount: Math.max(0, (parent._replyCount || 1) - 1),
              };
            }
            delete newMap[String(temp._id)];
            return newMap;
          });
        } else {
          setById((prev) => {
            const newMap = { ...prev };
            delete newMap[String(temp._id)];
            return newMap;
          });
          setRootIds((prev) => prev.filter((i) => i !== String(temp._id)));
        }
        throw err;
      }
    },
    [options.mockPersistence, byId, repliesLoaded, blockedTypes, refresh, loadReplies]
  );

  /* Update */
  const update = useCallback(
    async (id, patch = {}) => {
      if (!id) throw new Error("id is required for update");
      // Defensive: block updates on blocked types
      const target = byId && byId[String(id)];
      if (target && blockedTypes.has(String(target.type).toLowerCase())) {
        const err = new Error("Updates are not allowed for this message type.");
        err.code = "UPDATE_BLOCKED";
        throw err;
      }

      replaceMessage(id, { ...patch, updatedAt: new Date().toISOString() });

      try {
        const updated = await messageService.updateMessage(id, patch, { mock: options.mockPersistence });
        if (!mountedRef.current) return updated;
        if (updated && updated._id) {
          setById((prev) => ({ ...prev, [String(updated._id)]: { ...prev[String(updated._id)], ...updated } }));
        }

        // Reload appropriate scope after update:
        // - if this message is a child, reload its parent's children
        // - otherwise refresh top-level list
        try {
          const parentId = updated?.replyTo ?? target?.replyTo ?? null;
          if (parentId) {
            await loadReplies(String(parentId), true);
          } else {
            await refresh();
          }
        } catch {
          // ignore reload errors
        }

        return updated;
      } catch (err) {
        // on failure, refresh to restore server state
        await refresh().catch(() => {});
        throw err;
      }
    },
    [options.mockPersistence, replaceMessage, refresh, byId, blockedTypes, loadReplies]
  );

  /* Remove (soft-delete locally, then call service) */
  const remove = useCallback(
    async (id) => {
      if (!id) throw new Error("id is required for remove");
      // Defensive: block deletes on blocked types
      const target = byId && byId[String(id)];
      if (target && blockedTypes.has(String(target.type).toLowerCase())) {
        const err = new Error("Deletes are not allowed for this message type.");
        err.code = "DELETE_BLOCKED";
        throw err;
      }

      removeMessageLocal(id);
      try {
        const res = await messageService.deleteMessage(id, { mock: options.mockPersistence });
        if (!mountedRef.current) return res;
        if (res && res._id) {
          setById((prev) => ({ ...prev, [String(res._id)]: { ...prev[String(res._id)], ...res } }));
        }

        // After delete, reload appropriate scope:
        // - if deleted item had a parent, reload that parent's children
        // - otherwise refresh top-level list
        try {
          const parentId = target?.replyTo ?? null;
          if (parentId) {
            await loadReplies(String(parentId), true);
          } else {
            await refresh();
          }
        } catch {
          // ignore
        }

        return res;
      } catch (err) {
        await refresh().catch(() => {});
        throw err;
      }
    },
    [options.mockPersistence, removeMessageLocal, refresh, byId, blockedTypes, loadReplies]
  );

  /* Initial load if no initial messages provided and mockPersistence enabled */
  useEffect(() => {
    if ((!initialMessages || initialMessages.length === 0) && options.mockPersistence) {
      refresh().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    messages,
    byId,
    loading,
    error,
    create,
    update,
    remove,
    loadReplies,
    refresh,
  };
}

export default useMessages;
