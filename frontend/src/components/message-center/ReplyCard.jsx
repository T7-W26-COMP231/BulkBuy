// src/components/MessageTree/ReplyCard.jsx
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { MessageTreeContext } from "./MessageTree";
import MessageDetail from "./MessageDetail";
import MessageForm from "./MessageForm";
import theme from "./MessageTree.styles";
import Swal from "sweetalert2";

/* Layout (unchanged) */
const Wrapper = styled.div`
  position: relative;
  padding-left: ${(p) => p.indent}px;
`;

const Connector = styled.div`
  position: absolute;
  left: ${(p) => Math.max(0, p.indent) - 12}px;
  top: 8px;
  bottom: 8px;
  width: 1px;
  background: ${theme.colors.border};
  opacity: 0.9;
  pointer-events: none;
`;

const Card = styled.div`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 8px;
  border-radius: 8px;
  background: ${(p) => (p.highlight ? theme.colors.replyHighlight : theme.colors.replyBg)};
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02);
  transition: background 120ms ease, transform 120ms ease;
  cursor: pointer;
  &:hover {
    transform: translateY(-1px);
  }
  &:focus {
    outline: 2px solid ${theme.colors.focus};
    outline-offset: 2px;
  }
`;

const Avatar = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: ${(p) => p.bg || theme.colors.avatarBg};
  color: ${theme.colors.onAvatar};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex: 0 0 36px;
  font-size: 13px;
  overflow: hidden;
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
`;

const TopRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const Title = styled.div`
  font-weight: 600;
  color: ${theme.colors.onSurface};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70%;
`;

const Time = styled.div`
  color: ${theme.colors.muted};
  font-size: 12px;
  flex-shrink: 0;
`;

const Body = styled.div`
  color: ${theme.colors.onSurface};
  font-size: 14px;
  line-height: 1.3;
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: ${(p) => (p.expanded ? "none" : 3)};
  -webkit-box-orient: vertical;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
  justify-content: flex-end;
  align-items: center;
`;

const ActionButton = styled.button`
  background: ${(p) => (p.primary ? theme.colors.primary : "transparent")};
  color: ${(p) => (p.primary ? theme.colors.onPrimary : theme.colors.onSurface)};
  border: 1px solid ${(p) => (p.primary ? "transparent" : theme.colors.border)};
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:focus {
    outline: 2px solid ${theme.colors.focus};
    outline-offset: 2px;
  }
`;

const Children = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
`;

const responsive = css`
  @media (max-width: 640px) {
    .reply-avatar {
      width: 32px;
      height: 32px;
      flex: 0 0 32px;
      font-size: 12px;
    }
    .reply-title {
      max-width: 60%;
      font-size: 14px;
    }
    .reply-body {
      font-size: 13px;
      -webkit-line-clamp: 4;
    }
  }
`;

const VerticalSeparator = styled.span`
  width: 1px;
  height: 20px;
  background: ${theme.colors.border};
  border-radius: 1px;
  margin: 0 8px;
`;

/* initials helper */
function initialsFrom(text) {
  if (!text) return "R";
  const parts = String(text).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * ReplyCard
 *
 * - Children inherit permissions from the root via settingsProp when present.
 * - After create/update/delete we reload the appropriate scope:
 *   * child actions reload parent children via handlers.loadReplies(parentId)
 *   * root actions attempt handlers.refresh() if available, otherwise best-effort reload
 */

export default function ReplyCard({
  reply,
  depth = 1,
  parentId = null,
  rootSubject = null,
  isOpen: controlledIsOpen,
  onToggle: controlledOnToggle,
  settingsProp = {}, // inherited permissions from ancestor (root)
}) {
  const { handlers = {}, permissions = {}, maxReplyDepth = 3, replyFormMap = {}, canPerform = null } =
    useContext(MessageTreeContext);

  const [children, setChildren] = useState(Array.isArray(reply?.replies) ? reply.replies : []);
  const [childrenLoaded, setChildrenLoaded] = useState(Array.isArray(reply?.replies) && reply.replies.length > 0);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [highlight, setHighlight] = useState(Boolean(reply?._justCreated));
  const [localDetails, setLocalDetails] = useState(reply?.details ?? "");
  const [internalOpen, setInternalOpen] = useState(Boolean(controlledIsOpen));
  const isControlled = typeof controlledIsOpen === "boolean";
  const isOpen = isControlled ? controlledIsOpen : internalOpen;
  const [localShowReplyForm, setLocalShowReplyForm] = useState(false);
  const showReplyForm = Boolean(replyFormMap?.[reply._id]) || localShowReplyForm;

  /* Permission helpers */
  function _capFirst(s = "") {
    return String(s).charAt(0).toUpperCase() + String(s).slice(1);
  }

  /**
   * hasPermission(action, msg)
   * - Try canPerform(msg, action) first.
   * - If inconclusive, use settingsProp (inherited from root) if present.
   * - Finally fall back to global permissions flags.
   */
  function hasPermission(action, msg = reply) {
    // 1) explicit per-message check
    if (typeof canPerform === "function") {
      try {
        const p = canPerform(msg, action);
        if (p === true || p === false) return p;
      } catch (e) {
        // swallow and continue
      }
    }

    // 2) inherited from root (settingsProp passed down)
    if (settingsProp && typeof settingsProp[`can${_capFirst(action)}`] !== "undefined") {
      return Boolean(settingsProp[`can${_capFirst(action)}`]);
    }

    // 3) try parent stub via canPerform if reply has replyTo (best-effort)
    const parentIdToCheck = (msg && (msg.replyTo || msg._parentId || parentId)) || null;
    if (parentIdToCheck && typeof canPerform === "function") {
      try {
        const parentStub = { _id: parentIdToCheck, type: msg?.type || "issue_wall" };
        const p2 = canPerform(parentStub, action);
        if (p2 === true || p2 === false) return p2;
      } catch (e) {
        // swallow
      }
    }

    // 4) global fallback
    const globalFlag =
      permissions && typeof permissions[`can${_capFirst(action)}`] !== "undefined"
        ? Boolean(permissions[`can${_capFirst(action)}`])
        : false;
    return globalFlag;
  }

  const canReply = hasPermission("reply") && depth < maxReplyDepth;
  const canUpdate = hasPermission("update");
  const canDelete = hasPermission("delete");

  const indent = depth * 16;

  const avatarLabel = useMemo(() => {
    const defaultAvatar = `https://cfg-j.s3.amazonaws.com/db-bb/avatars/img_avatar.png` || null;
    if (reply?.avatar && typeof reply.avatar === "string") return reply.avatar;
    if (reply?.fromUserName) return initialsFrom(reply.fromUserName);
    if (reply?.subject) return defaultAvatar ?? initialsFrom(reply.subject);
    return reply.avatar ?? defaultAvatar ?? initialsFrom(reply?.details);
  }, [reply]);

  useEffect(() => {
    let t;
    if (reply?._justCreated) {
      setHighlight(true);
      t = setTimeout(() => setHighlight(false), 1200);
    }
    return () => clearTimeout(t);
  }, [reply]);

  useEffect(() => {
    setLocalDetails(reply?.details ?? "");
  }, [reply?.details]);

  useEffect(() => {
    if (!isControlled) setInternalOpen(Boolean(controlledIsOpen));
  }, [controlledIsOpen, isControlled]);

  /**
   * loadChildren
   * - When replies are loaded from handlers.loadReplies, attach inherited permissions
   *   coming from the root (settingsProp) if present; otherwise attach this node's permissions.
   */
  const loadChildren = useCallback(
    async (force = true) => {
      if (typeof handlers.loadReplies !== "function") {
        setChildren([]);
        setChildrenLoaded(true);
        return [];
      }

      setLoadingChildren(true);
      try {
        const loaded = await handlers.loadReplies(reply?._id, force);
        const arr = Array.isArray(loaded) ? loaded : [];

        // Determine inherited permissions for children:
        // Prefer root-level settingsProp (passed down from top-level root).
        // If not present, inherit from this node's computed permissions.
        const inherited = {
          canReply: settingsProp && typeof settingsProp.canReply !== "undefined" ? Boolean(settingsProp.canReply) : Boolean(canReply),
          canUpdate: settingsProp && typeof settingsProp.canUpdate !== "undefined" ? Boolean(settingsProp.canUpdate) : Boolean(canUpdate),
          canDelete: settingsProp && typeof settingsProp.canDelete !== "undefined" ? Boolean(settingsProp.canDelete) : Boolean(canDelete),
        };

        const enriched = arr.map((c) => {
          if (!c) return c;
          if (!c._inheritedPermissions) c._inheritedPermissions = inherited;
          return c;
        });

        setChildren(enriched);
        setChildrenLoaded(true);
        return enriched;
      } catch {
        setChildren([]);
        setChildrenLoaded(true);
        return [];
      } finally {
        setLoadingChildren(false);
      }
    },
    [handlers, reply?._id, settingsProp, canReply, canUpdate, canDelete]
  );

  const toggleOpen = useCallback(
    async (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      if (typeof controlledOnToggle === "function") {
        controlledOnToggle(reply._id);
      } else {
        setInternalOpen((v) => !v);
      }
      const willOpen = !isOpen;
      if (willOpen) await loadChildren(true).catch(() => {});
    },
    [controlledOnToggle, isOpen, loadChildren, reply._id]
  );

  const handleReplyClick = useCallback(
    (e) => {
      e && e.stopPropagation();
      if (!isOpen && typeof controlledOnToggle !== "function") {
        setInternalOpen(true);
      }
      if (typeof handlers.toggleReplyForm === "function") {
        handlers.toggleReplyForm(reply._id);
        return;
      }
      setLocalShowReplyForm((s) => !s);
    },
    [handlers, reply._id, isOpen, controlledOnToggle]
  );

  const handleCreateReply = useCallback(
    async (payload) => {
      const payloadWithReplyTo = { ...payload, replyTo: reply._id };
      try {
        let created = null;
        if (typeof handlers.create === "function") {
          created = await handlers.create(payloadWithReplyTo);
        } else {
          // optimistic fallback: create a local child and then refresh
          const nowId = `local-${Date.now()}`;
          const newChild = {
            _id: nowId,
            subject: payloadWithReplyTo.subject || `Re: ${reply?.subject || ""}`,
            details: payloadWithReplyTo.details || "",
            createdAt: new Date().toISOString(),
            replyTo: reply._id,
            fromUserName: payloadWithReplyTo.fromUserName || "You",
            type: payloadWithReplyTo.type || reply?.type || "issue_wall",
            replies: [],
            _replyCount: 0,
            imsg: payloadWithReplyTo.imsg || { ...payloadWithReplyTo, _id: nowId },
            _inheritedPermissions: { canReply, canUpdate, canDelete },
          };
          setChildren((prev) => [newChild, ...prev]);
          await loadChildren(true).catch(() => {});
          setChildrenLoaded(true);
          created = newChild;
        }

        // After create, reload this parent's children so UI shows the new child
        try {
          if (typeof handlers.loadReplies === "function") {
            await handlers.loadReplies(reply._id, true);
            // re-run local loadChildren to attach inherited permissions
            await loadChildren(true).catch(() => {});
          } else if (typeof handlers.refresh === "function") {
            // fallback: if a refresh exists, call it to refresh top-level list
            await handlers.refresh().catch(() => {});
          }
        } catch {
          // ignore
        }

        // close inline form
        if (typeof handlers.toggleReplyForm === "function") {
          try {
            handlers.toggleReplyForm(reply._id);
          } catch {}
        } else {
          setLocalShowReplyForm(false);
        }

        return created;
      } catch (err) {
        throw err;
      }
    },
    [handlers, reply._id, loadChildren, canReply, canUpdate, canDelete]
  );

  const handleUpdate = useCallback(
    async (e) => {
      e && e.stopPropagation();
      if (!canUpdate) return;

      const { value: newDetails } = await Swal.fire({
        title: "Edit reply details",
        input: "textarea",
        inputValue: localDetails ?? "",
        showCancelButton: true,
        inputAttributes: { rows: 6 },
        width: "600px",
        confirmButtonColor: "#184119",
        cancelButtonColor: "#b88c89",
        confirmButtonText: "Save Changes",
        cancelButtonText: "Nevermind",
      });

      if (newDetails === undefined) return;

      try {
        if (typeof handlers.update === "function") {
          await handlers.update(reply._id, { details: newDetails });

          // reload appropriate scope:
          // if this node has a parent, reload that parent's children; otherwise attempt top-level refresh
          const parentToReload = parentId ?? reply?.replyTo ?? null;
          try {
            if (parentToReload && typeof handlers.loadReplies === "function") {
              await handlers.loadReplies(parentToReload, true).catch(() => {});
            } else if (typeof handlers.refresh === "function") {
              await handlers.refresh().catch(() => {});
            } else {
              // best-effort: reload this node's children
              await loadChildren(true).catch(() => {});
            }
          } catch {
            // ignore
          }

          setLocalDetails(newDetails);
        } else {
          setLocalDetails(newDetails);
        }
      } catch (err) {
        Swal.fire("Error", `Failed to update reply: ${err?.message || err}`, "error");
      }
    },
    [canUpdate, handlers, reply, parentId, loadChildren, localDetails]
  );

  const handleDelete = useCallback(
    async (e) => {
      e && e.stopPropagation();
      if (!canDelete || typeof handlers.remove !== "function") return;

      const ok = window.confirm("Delete this reply? This will mark it as deleted.");
      if (!ok) return;

      try {
        await handlers.remove(reply._id);

        // After delete, reload the correct scope:
        // If this reply has a parent, reload that parent's children; otherwise attempt top-level refresh.
        const parentToReload = parentId ?? reply?.replyTo ?? null;
        try {
          if (parentToReload && typeof handlers.loadReplies === "function") {
            await handlers.loadReplies(parentToReload, true).catch(() => {});
          } else if (typeof handlers.refresh === "function") {
            await handlers.refresh().catch(() => {});
          } else {
            // best-effort: reload this node's children
            await loadChildren(true).catch(() => {});
          }
        } catch {
          // ignore
        }
      } catch {
        window.alert("Failed to delete reply.");
      }
    },
    [canDelete, handlers, reply, parentId, loadChildren]
  );

  const createdAtText = useMemo(() => {
    try {
      const d = reply?.createdAt ? new Date(reply.createdAt) : null;
      return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : "";
    } catch {
      return "";
    }
  }, [reply]);

  const prefillSubject = useMemo(() => {
    const root = rootSubject || reply?.subject || "";
    return `Re: ${root}`;
  }, [rootSubject, reply]);

  return (
    <Wrapper indent={indent} css={responsive}>
      {depth > 0 && <Connector indent={indent} aria-hidden="true" />}
      <Card
        role="button"
        tabIndex={0}
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleOpen(e);
          }
        }}
        highlight={highlight}
        aria-expanded={!!isOpen}
        aria-controls={`reply-detail-${reply?._id}`}
        aria-label={`Open reply ${reply?._id}`}
        style={{ borderLeft: "0.25em solid #648e73" }}
      >
        <Avatar
          className="reply-avatar"
          aria-hidden="true"
          bg={theme.avatarBgForType?.[reply?.type] ?? theme.colors.avatarBg}
        >
          {typeof avatarLabel === "string" && avatarLabel.startsWith("http") ? (
            <img src={avatarLabel} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            avatarLabel
          )}
        </Avatar>

        <Content>
          <TopRow>
            <Title className="reply-title" id={`reply-${reply._id}`} title={reply?.subject ?? ""}>
              {reply?.subject ?? "(no subject)"}
            </Title>
            <Time aria-hidden="true">{createdAtText}</Time>
          </TopRow>

          <Body expanded={isOpen} className="reply-body">
            {localDetails ?? <em>No details</em>}
          </Body>

          <ActionRow>
            {children.length > 0 && (
              <>
                <ActionButton
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await loadChildren(true);
                    toggleOpen(e);
                  }}
                  disabled={loadingChildren}
                  aria-pressed={childrenLoaded}
                  title="Load replies"
                >
                  {loadingChildren ? "Loading..." : childrenLoaded ? `Hide Replies (${children.length})` : `Replies (${reply._replyCount || 0})`}
                </ActionButton>

                <VerticalSeparator aria-hidden="true" />
              </>
            )}

            {canReply && (
              <ActionButton
                type="button"
                primary
                onClick={(e) => {
                  e.stopPropagation();
                  if (!showReplyForm) {
                    setInternalOpen(false);
                    handleReplyClick(e);
                  } else handleReplyClick(e);
                }}
              >
                {showReplyForm ? "Cancel Reply" : "Reply"}
              </ActionButton>
            )}

            {canUpdate && (
              <ActionButton
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdate(e);
                }}
              >
                Update
              </ActionButton>
            )}

            {canDelete && (
              <ActionButton
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(e);
                }}
              >
                Delete
              </ActionButton>
            )}
          </ActionRow>
        </Content>
      </Card>

      {isOpen && (
        <>
          <MessageDetail message={reply} depth={0} showActions={false} />

          {childrenLoaded && Array.isArray(children) && children.length > 0 && (
            <Children>
              {children.map((c) => {
                // pass down inherited permissions if present, otherwise pass this node's permissions
                const childSettings = c && c._inheritedPermissions ? c._inheritedPermissions : { canReply, canUpdate, canDelete };
                return (
                  <ReplyCard
                    key={c._id}
                    reply={c}
                    depth={depth + 1}
                    parentId={reply?._id}
                    rootSubject={reply?.subject || rootSubject}
                    isOpen={controlledIsOpen}
                    onToggle={controlledOnToggle}
                    settingsProp={childSettings}
                  />
                );
              })}
            </Children>
          )}

          {showReplyForm && (
            <div style={{ marginTop: 12 }} id={`reply-form-${reply?._id}`}>
              <MessageForm
                initial={{ imsg: reply, subject: prefillSubject, replyTo: reply._id }}
                onSubmit={async (payload) => {
                  await handleCreateReply(payload);
                  toggleOpen();
                }}
                onCancel={() => {
                  if (typeof handlers.toggleReplyForm === "function") {
                    try {
                      handlers.toggleReplyForm(reply._id);
                    } catch {}
                  } else {
                    setLocalShowReplyForm(false);
                  }
                }}
                allowedTargets={{ users: true, ops_region: true, all: true }}
                settingsProp={{}}
                mode="reply"
              />
            </div>
          )}
        </>
      )}
    </Wrapper>
  );
}

ReplyCard.propTypes = {
  reply: PropTypes.shape({
    _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    subject: PropTypes.string,
    details: PropTypes.string,
    createdAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    replies: PropTypes.array,
    _replyCount: PropTypes.number,
    replyTo: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    fromUserName: PropTypes.string,
    avatar: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    type: PropTypes.string,
    ops_region: PropTypes.string,
    _justCreated: PropTypes.bool,
    _inheritedPermissions: PropTypes.object,
  }).isRequired,
  depth: PropTypes.number,
  parentId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  rootSubject: PropTypes.string,
  isOpen: PropTypes.bool,
  onToggle: PropTypes.func,
  settingsProp: PropTypes.object,
};

ReplyCard.defaultProps = {
  depth: 1,
  parentId: null,
  rootSubject: null,
  isOpen: undefined,
  onToggle: undefined,
  settingsProp: {},
};
