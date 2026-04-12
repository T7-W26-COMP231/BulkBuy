// src/components/MessageTree/RowCard.jsx
import React, { useContext, useMemo, useCallback } from "react";
import PropTypes from "prop-types";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { MessageTreeContext } from "./MessageTree";
import theme from "./MessageTree.styles";
import Swal from "sweetalert2";

/* Wrapper provides left indent for tree connector */
const Wrapper = styled.div`
  position: relative;
  padding-left: ${(p) => Math.max(0, p.depth) * 16}px;
`;

/* Vertical 1px connector line for tree tracing */
const Connector = styled.div`
  position: absolute;
  left: ${(p) => Math.max(0, p.depth) * 16 - 8}px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: ${theme.colors.border};
  opacity: 0.9;
  pointer-events: none;
`;

/* Card container (clicking the card opens the full detail) */
const Card = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: ${theme.colors.surface};
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
  transition: background 120ms ease, transform 120ms ease;
  cursor: pointer;
  &:hover {
    background: ${theme.colors.surfaceHover};
    transform: translateY(-1px);
  }
  &:focus-within {
    outline: 2px solid ${theme.colors.focus};
  }
`;

/* Avatar */
const Avatar = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 6px;
  background: ${(p) => p.bg || theme.colors.avatarBg};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${theme.colors.onAvatar};
  font-weight: 700;
  flex: 0 0 48px;
  overflow: hidden;
`;

/* Content */
const Content = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
`;

/* Top row */
const TopRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

/* Subject */
const Subject = styled.div`
  font-weight: 600;
  color: ${theme.colors.onSurface};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
`;

/* Meta group */
const MetaGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

/* Badge */
const Badge = styled.span`
  background: ${(p) => theme.typeColors[p.type] || theme.colors.badgeBg};
  color: ${theme.colors.onBadge};
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  text-transform: capitalize;
  white-space: nowrap;
`;

/* Bottom row */
const BottomRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
  color: ${theme.colors.muted};
  font-size: 13px;
`;

/* Snippet */
const Snippet = styled.div`
  color: ${theme.colors.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.2;
  max-width: 100%;
`;

/* Reply pill */
const ReplyPill = styled.span`
  background: ${theme.colors.pillBg};
  color: ${theme.colors.onPill};
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  flex-shrink: 0;
`;

/* Action bar */
const ActionBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
`;

/* Vertical separator between Replies and other actions */
const VerticalSeparator = styled.span`
  width: 1px;
  height: 20px;
  background: ${theme.colors.border};
  border-radius: 1px;
  margin: 0 8px;
`;

/* Action button */
const ActionButton = styled.button`
  background: transparent;
  border: none;
  color: ${(p) => (p.primary ? theme.colors.primary : theme.colors.onSurface)};
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
  &:hover {
    background: ${theme.colors.surfaceHover};
  }
  &:focus {
    outline: 3px solid ${theme.colors.focus};
    outline-offset: 2px;
  }
`;

/* Toggle icon */
const ToggleIcon = styled.span`
  margin-left: 8px;
  color: ${theme.colors.muted};
  flex-shrink: 0;
`;

/* Responsive adjustments */
const responsive = css`
  @media (max-width: 640px) {
    .row-subject {
      max-width: 50%;
      font-size: 14px;
    }
    .row-avatar {
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
    }
  }
`;

/* Helper for initials */
function initialsFrom(text) {
  if (!text) return "M";
  const parts = String(text).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function RowCard({
  message,
  isOpen,
  onToggle,
  depth = 0,
  replies = [],
  handlers = {},
  permissions = {},
}) {
  const ctx = useContext(MessageTreeContext);
  const effectiveHandlers = { ...(ctx.handlers || {}), ...(handlers || {}) };

  // Use canPerform from context when available; otherwise fall back to permissions prop
  const canPerform = ctx?.canPerform;
  const canUpdate = typeof canPerform === "function" ? canPerform(message, "update") : Boolean(permissions.canUpdate);
  const canReply = typeof canPerform === "function" ? canPerform(message, "reply") : Boolean(permissions.canReply);
  const canDelete = typeof canPerform === "function" ? canPerform(message, "delete") : Boolean(permissions.canDelete);

  const subject = message?.subject || "(no subject)";
  const snippet = message?.details || "";
  const replyCount = message?._replyCount ?? (replies ? replies.length : 0);
  const type = message?.type || "notification";
  const opsRegion = message?.ops_region || "";
  const status = message?.status || "draft";

  const avatarLabel = useMemo(() => {
    const defaultAvatar = `https://cfg-j.s3.amazonaws.com/db-bb/avatars/img_avatar.png` || null;
    if (message?.avatar && typeof message.avatar === "string") return initialsFrom(message.avatar);
    if (message?.fromUserName) return initialsFrom(message.fromUserName);
    return message.avatar ?? defaultAvatar ?? initialsFrom(subject);
  }, [message, subject]);

  const createdAtText = useMemo(() => {
    try {
      const d = message?.createdAt ? new Date(message.createdAt) : null;
      return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : "";
    } catch {
      return "";
    }
  }, [message]);

  const handleCardClick = useCallback(
    (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      if (typeof onToggle === "function") onToggle(message._id);
      else if (typeof effectiveHandlers.openMessage === "function") effectiveHandlers.openMessage(message._id);
    },
    [onToggle, effectiveHandlers, message._id]
  );

  const handleRepliesClick = useCallback(
    async (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      try {
        if (typeof effectiveHandlers.openMessage === "function") effectiveHandlers.openMessage(message._id);
        if (typeof effectiveHandlers.loadReplies === "function") await effectiveHandlers.loadReplies(message._id, true);
      } catch {
        // non-fatal
      }
    },
    [effectiveHandlers, message._id]
  );

  const handleUpdate = useCallback(async () => {
    if (typeof effectiveHandlers.update !== "function") return;
    const { value: newDetails } = await Swal.fire({
      title: "Edit message details:",
      input: "textarea",
      inputValue: message?.details ?? "",
      showCancelButton: true,
      inputAttributes: { rows: "6" },
      width: "600px",
      confirmButtonColor: "#184119",
      cancelButtonColor: "#b88c89",
      confirmButtonText: "Save Changes",
      cancelButtonText: "Nevermind",
    });

    // user cancelled
    if (newDetails === undefined) return;

    try {
      const patch = { details: newDetails };
      await effectiveHandlers.update(message?._id, patch);

      // reload appropriate scope:
      // if this message is a child, reload its parent's children; otherwise refresh root list
      const parentId = message?.replyTo ?? null;
      try {
        if (parentId && typeof effectiveHandlers.loadReplies === "function") {
          await effectiveHandlers.loadReplies(parentId, true);
        } else if (typeof effectiveHandlers.refresh === "function") {
          await effectiveHandlers.refresh();
        } else if (typeof effectiveHandlers.loadReplies === "function") {
          // fallback: reload this message's replies (best-effort)
          await effectiveHandlers.loadReplies(message._id, true);
        }
      } catch {
        // ignore reload errors
      }
    } catch (err) {
      Swal.fire("Error", "Failed to update message.", "error");
    }
  }, [effectiveHandlers, message]);

  const handleDelete = useCallback(
    async (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      if (typeof effectiveHandlers.remove !== "function") return;

      const ok = window.confirm("Delete this message? This will mark it as deleted.");
      if (!ok) return;

      try {
        await effectiveHandlers.remove(message._id);

        // after delete, reload appropriate scope
        const parentId = message?.replyTo ?? null;
        try {
          if (parentId && typeof effectiveHandlers.loadReplies === "function") {
            await effectiveHandlers.loadReplies(parentId, true);
          } else if (typeof effectiveHandlers.refresh === "function") {
            await effectiveHandlers.refresh();
          } else if (typeof effectiveHandlers.loadReplies === "function") {
            await effectiveHandlers.loadReplies(message._id, true);
          }
        } catch {
          // ignore
        }
      } catch {
        window.alert("Failed to delete message.");
      }
    },
    [effectiveHandlers, message]
  );

  const handleReply = useCallback(
    async (e) => {
      if (e && e.stopPropagation) e.stopPropagation();

      // open detail and reply form via handlers if available
      try {
        if (typeof onToggle === "function") onToggle(message._id);
        if (typeof effectiveHandlers.openReplyForm === "function") {
          await effectiveHandlers.openReplyForm(message._id);
          // ensure replies are loaded so inline form appears with current children
          if (typeof effectiveHandlers.loadReplies === "function") await effectiveHandlers.loadReplies(message._id, true);
          return;
        }

        if (typeof effectiveHandlers.toggleReplyForm === "function") {
          effectiveHandlers.toggleReplyForm(message._id);
          if (typeof effectiveHandlers.loadReplies === "function") await effectiveHandlers.loadReplies(message._id, true);
          return;
        }

        // fallback: open message detail
        if (typeof effectiveHandlers.openMessage === "function") effectiveHandlers.openMessage(message._id);
      } catch {
        // non-fatal
      }
    },
    [effectiveHandlers, message._id, onToggle]
  );

  return (
    <Wrapper depth={depth} css={responsive}>
      {depth > 0 && <Connector depth={depth} aria-hidden="true" />}
      <Card
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick();
          }
        }}
        aria-expanded={!!isOpen}
        aria-controls={`message-detail-${message?._id}`}
        aria-label={`Open message ${subject}`}
        style={{
          borderLeft: "1em solid #0adbc6",
          borderTop: "1px dashed black",
          borderBottom: "1px dashed black",
          borderRight: "1px dashed black",
        }}
      >
        <Avatar className="row-avatar" aria-hidden="true" bg={theme.avatarBgForType?.[type] ?? theme.colors.avatarBg}>
          {avatarLabel && typeof avatarLabel === "string" && avatarLabel.includes("http") ? (
            <img src={avatarLabel} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            avatarLabel
          )}
        </Avatar>

        <Content>
          <TopRow>
            <Subject className="row-subject" id={`msg-${message._id}`} title={subject}>
              {subject}
            </Subject>

            <MetaGroup>
              <Badge type={type}>{type}</Badge>
              <div aria-hidden="true" style={{ color: theme.colors.muted, fontSize: 12 }}>
                {createdAtText}
              </div>
            </MetaGroup>
          </TopRow>

          <BottomRow>
            <Snippet>{snippet}</Snippet>

            {opsRegion ? <div style={{ marginLeft: "auto", color: theme.colors.muted }}>{opsRegion}</div> : null}

            <ReplyPill aria-label={`${replyCount} replies`}>{replyCount} replies</ReplyPill>

            {status === "unread" && (
              <div
                title="Unread"
                style={{ width: 10, height: 10, borderRadius: 10, background: theme.colors.unread, marginLeft: 8, flexShrink: 0 }}
              />
            )}

            <ActionBar aria-label="message actions">
              <VerticalSeparator aria-hidden="true" />

              {canUpdate && (
                <ActionButton type="button" onClick={handleUpdate} title="Update message">
                  Update
                </ActionButton>
              )}

              {canReply && (
                <ActionButton type="button" onClick={handleReply} title="Reply to message">
                  Reply
                </ActionButton>
              )}

              {canDelete && (
                <ActionButton type="button" onClick={handleDelete} title="Delete message">
                  Delete
                </ActionButton>
              )}

              <ToggleIcon aria-hidden="true" style={{ fontSize: "2em" }}>
                {isOpen ? "▾" : "▸"}
              </ToggleIcon>
            </ActionBar>
          </BottomRow>
        </Content>
      </Card>
    </Wrapper>
  );
}

RowCard.propTypes = {
  message: PropTypes.shape({
    _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    avatar: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    fromUserName: PropTypes.string,
    subject: PropTypes.string,
    details: PropTypes.string,
    type: PropTypes.string,
    ops_region: PropTypes.string,
    status: PropTypes.string,
    createdAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    replies: PropTypes.array,
    _replyCount: PropTypes.number,
    replyTo: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  isOpen: PropTypes.bool,
  onToggle: PropTypes.func,
  depth: PropTypes.number,
  replies: PropTypes.array,
  handlers: PropTypes.object,
  permissions: PropTypes.object,
};

RowCard.defaultProps = {
  isOpen: false,
  onToggle: undefined,
  depth: 0,
  replies: [],
  handlers: {},
  permissions: {},
};
