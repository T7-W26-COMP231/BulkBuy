// src/components/MessageTree/MessageDetail.jsx
import React, { useContext, useState, useEffect, useCallback, useMemo } from "react";
import PropTypes from "prop-types";
import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { MessageTreeContext } from "./MessageTree";
import ReplyCard from "./ReplyCard";
import theme from "./MessageTree.styles";
import Swal from "sweetalert2";

/* Container */
const Container = styled.div`
  margin: 8px 0 16px 0;
  padding: 12px;
  border-radius: 8px;
  background: ${theme.colors.detailBg};
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
`;

/* Header row */
const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
`;

/* Subject */
const Subject = styled.h3`
  margin: 0;
  font-size: 16px;
  color: ${theme.colors.onSurface};
  font-weight: 700;
`;

/* Meta block */
const Meta = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  color: ${theme.colors.muted};
  font-size: 13px;
`;

/* Body */
const Body = styled.div`
  color: ${theme.colors.onSurface};
  font-size: 14px;
  line-height: 1.4;
  white-space: pre-wrap;
`;

/* Attachments list */
const Attachments = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const AttachmentItem = styled.li`
  background: ${theme.colors.surface};
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  color: ${theme.colors.onSurface};
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
`;

/* Action row */
const ActionRow = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
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
  background: ${(p) => (p.primary ? theme.colors.primary : theme.colors.surface)};
  color: ${(p) => (p.primary ? theme.colors.onPrimary : theme.colors.onSurface)};
  border: 1px solid ${(p) => (p.primary ? "transparent" : theme.colors.border)};
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:focus {
    outline: 2px solid ${theme.colors.focus};
    outline-offset: 2px;
  }
`;

/* Replies container (indented) */
const RepliesContainer = styled.div`
  margin-left: ${(p) => p.indent}px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

/* Small helper text */
const Small = styled.div`
  color: ${theme.colors.muted};
  font-size: 13px;
`;

/* Responsive tweaks (class selectors) */
const responsive = css`
  @media (max-width: 640px) {
    .md-subject {
      font-size: 15px;
    }
    .md-body {
      font-size: 14px;
    }
    .md-action-button {
      padding: 7px 9px;
      font-size: 13px;
    }
  }
`;

/**
 * MessageDetail
 *
 * Expanded view for a message or reply.
 * - Shows subject, meta, body, attachments
 * - Actions: load/toggle replies, show inline reply form (delegated to handlers.openReplyForm or toggleReplyForm)
 * - Renders replies (ReplyCard) when loaded
 * - Renders children below replies (useful for inline reply form injected by parent)
 *
 * Non-disruptive: keeps existing behavior but ensures replies are enriched with
 * inherited permissions so children can immediately show action buttons.
 */
export default function MessageDetail({
  message,
  depth = 0,
  onLoadReplies = null,
  showActions = true,
  allowedButtons = { replies: true, reply: true, update: true, delete: true },
  onToggleReplyForm = null,
  children = null,
  settingsProp = {},
}) {
  const { permissions = {}, maxReplyDepth = 3, handlers = {}, canPerform = null } = useContext(MessageTreeContext);

  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replies, setReplies] = useState(Array.isArray(message?.replies) ? message.replies : []);
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showingReplies, setShowingReplies] = useState(false);

  // compute local action permissions (used to enrich children)
  const canReply = Boolean(permissions.canReply) && Boolean(allowedButtons.reply) && depth < maxReplyDepth;
  const canUpdate = Boolean(permissions.canUpdate) && Boolean(allowedButtons.update);
  const canDelete = Boolean(permissions.canDelete) && Boolean(allowedButtons.delete);
  const canViewReplies = Boolean(allowedButtons.replies) && (Boolean(permissions.canRead) || Boolean(permissions.canReply));

  const createdAtText = useMemo(() => {
    try {
      const d = message?.createdAt ? new Date(message.createdAt) : null;
      return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : "";
    } catch {
      return "";
    }
  }, [message]);

  const loadReplies = useCallback(
    async (force = false) => {
      if (repliesLoaded && !force) return replies;
      setLoadingReplies(true);
      try {
        const loaded = onLoadReplies
          ? await onLoadReplies(message?._id)
          : typeof handlers.loadReplies === "function"
          ? await handlers.loadReplies(message?._id)
          : [];

        const arr = Array.isArray(loaded) ? loaded : Array.isArray(message?.replies) ? message.replies : [];
        // attach inherited permissions so children can immediately use them
        const inherited = { canReply, canUpdate, canDelete };
        const enriched = arr.map((r) => {
          if (!r) return r;
          if (!r._inheritedPermissions) r._inheritedPermissions = inherited;
          return r;
        });
        setReplies(enriched);
        setRepliesLoaded(true);
        return enriched;
      } catch (err) {
        setReplies([]);
        setRepliesLoaded(true);
        return [];
      } finally {
        setLoadingReplies(false);
      }
    },
    [message, onLoadReplies, handlers, repliesLoaded, replies, canReply, canUpdate, canDelete]
  );

  const handleReply = useCallback(async () => {
    if (!canReply) return;

    // Prefer a context helper that opens the thread root and shows the inline reply form there.
    if (typeof handlers.openReplyForm === "function") {
      handlers.openReplyForm(message?._id);
      return;
    }

    // Prefer toggleReplyForm if provided
    if (typeof handlers.toggleReplyForm === "function") {
      handlers.toggleReplyForm(message?._id);
      return;
    }

    // Fallback to parent-provided toggle (MessageTree may inject the inline form)
    if (typeof onToggleReplyForm === "function") {
      onToggleReplyForm(message?._id);
      return;
    }

    // Last-resort quick prompt reply (non-disruptive)
    if (typeof handlers.create !== "function") return;
    const body = window.prompt("Write your reply:");
    if (!body) return;

    const payload = {
      subject: `Re: ${message?.subject ?? ""}`,
      details: body,
      replyTo: message?._id,
      type: message?.type ?? "notification",
      recipients: { all: false, users: [] },
      ops_region: message?.ops_region ?? "",
      status: "submitted",
    };

    // optimistic local add with inherited permissions
    const tempId = `temp-${Date.now()}`;
    const tempReply = {
      ...payload,
      _id: tempId,
      createdAt: new Date().toISOString(),
      replies: [],
      _inheritedPermissions: { canReply, canUpdate, canDelete },
    };
    setReplies((r) => [tempReply, ...r]);
    setRepliesLoaded(true);
    setShowingReplies(true);

    try {
      const created = await handlers.create(payload);
      setReplies((r) => r.map((x) => (String(x._id) === String(tempId) ? created : x)));
      await loadReplies(true).catch(() => {});
    } catch (err) {
      setReplies((r) => r.filter((x) => String(x._id) !== String(tempId)));
      window.alert("Failed to create reply.");
    }
  }, [canReply, handlers, message, onToggleReplyForm, loadReplies, canUpdate, canDelete]);

  const handleUpdate = useCallback(async () => {
    if (!canUpdate || typeof handlers.update !== "function") return;

    const { value: newDetails } = await Swal.fire({
      title: "Edit message details:",
      input: "textarea",
      inputValue: message?.details ?? "",
      showCancelButton: true,
      confirmButtonText: "Save Changes",
      cancelButtonText: "Nevermind",
      inputAttributes: { rows: "6" },
      width: "600px",
      confirmButtonColor: "#184119",
      cancelButtonColor: "#b88c89",
    });

    if (newDetails === undefined) return;
    setIsUpdating(true);
    try {
      const patch = { details: newDetails };
      await handlers.update(message?._id, patch);
    } catch (err) {
      window.alert("Failed to update message.");
    } finally {
      setIsUpdating(false);
    }
  }, [canUpdate, handlers, message]);

  const handleDelete = useCallback(async () => {
    if (!canDelete || typeof handlers.remove !== "function") return;
    const ok = window.confirm("Delete this message? This will mark it as deleted.");
    if (!ok) return;
    setIsDeleting(true);
    try {
      await handlers.remove(message?._id);
    } catch (err) {
      window.alert("Failed to delete message.");
    } finally {
      setIsDeleting(false);
    }
  }, [canDelete, handlers, message]);

  const renderAttachments = useCallback(() => {
    const atts = Array.isArray(message?.attachments) ? message.attachments : [];
    if (!atts || atts.length === 0) return null;
    return (
      <Attachments aria-label="Attachments">
        {atts.map((a) => (
          <AttachmentItem key={String(a?._id ?? a)}>{a?.filename ?? a?.name ?? String(a)}</AttachmentItem>
        ))}
      </Attachments>
    );
  }, [message]);

  useEffect(() => {
    if (Array.isArray(message?.replies) && message.replies.length > 0) {
      // attach inherited permissions to any static replies present on the message
      const inherited = { canReply, canUpdate, canDelete };
      const enriched = message.replies.map((r) => {
        if (!r) return r;
        if (!r._inheritedPermissions) r._inheritedPermissions = inherited;
        return r;
      });
      setReplies(enriched);
      setRepliesLoaded(true);
    }
  }, [message, canReply, canUpdate, canDelete]);

  const msgDetailStyle = {
    borderLeft: "0.25em solid grey",
    borderRadius: "0px 5px 10px 10px",
    borderTop: "0",
  };

  const replyProps = {
    depth,
    onLoadReplies,
    showActions,
    allowedButtons,
    onToggleReplyForm,
    children,
    settingsProp,
  };

  return (
    <Container id={`message-detail-${message?._id}`} css={responsive} role="region" aria-live="polite" style={msgDetailStyle}>
      <Header>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Subject className="md-subject">{message?.subject ?? "(no subject)"}</Subject>
          <Meta>
            <Small>{message?.type ? String(message.type).replace("_", " ") : "message"}</Small>
            <Small aria-hidden="true">·</Small>
            <Small>{createdAtText}</Small>
            {message?.ops_region ? (
              <>
                <Small aria-hidden="true">·</Small>
                <Small>{message.ops_region}</Small>
              </>
            ) : null}
            {message?.status ? (
              <>
                <Small aria-hidden="true">·</Small>
                <Small>{message.status}</Small>
              </>
            ) : null}
          </Meta>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {message?.metadata && Object.keys(message.metadata).length > 0 && <Small title="Metadata">meta</Small>}
        </div>
      </Header>

      <Body className="md-body">{message?.details ?? <em>No details provided.</em>}</Body>

      {renderAttachments()}

      {showActions && (
        <ActionRow aria-label="Message actions">
          {Array.isArray(replies) && replies.length > 0 && canViewReplies && (
            <>
              <ActionButton
                className="md-action-button"
                onClick={async () => {
                  if (showingReplies) {
                    setShowingReplies(false);
                    return;
                  }
                  await loadReplies().then(() => {
                    setRepliesLoaded(true);
                    setShowingReplies(true);
                  });
                }}
                disabled={loadingReplies}
                aria-pressed={repliesLoaded}
              >
                {showingReplies ? "Hide Replies" : loadingReplies ? "Loading replies..." : repliesLoaded ? `Replies (${replies.length})` : `Replies`}
              </ActionButton>

              <VerticalSeparator aria-hidden="true" />
            </>
          )}

          {canReply && (
            <ActionButton className="md-action-button" primary onClick={handleReply}>
              {children ? "Cancel Reply" : "Reply"}
            </ActionButton>
          )}

          {canUpdate && (
            <ActionButton className="md-action-button" onClick={handleUpdate} disabled={isUpdating}>
              {isUpdating ? "Updating..." : "Update"}
            </ActionButton>
          )}

          {canDelete && (
            <ActionButton className="md-action-button" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </ActionButton>
          )}
        </ActionRow>
      )}

      {showingReplies && repliesLoaded && Array.isArray(replies) && replies.length > 0 && (
        <>
          <hr style={{ border: "1px solid rgba(0,0,0,0.06)" }} />
          <span>[ Replies ]</span>
          <RepliesContainer indent={(depth + 1) * 16}>
            {replies.map((r) => {
              const childSettings = r && r._inheritedPermissions ? r._inheritedPermissions : { canReply, canUpdate, canDelete };
              return (
                <ReplyCard
                  key={r._id}
                  {...replyProps}
                  reply={r}
                  depth={depth + 1}
                  parentId={message?._id}
                  rootSubject={message?.subject}
                  settingsProp={childSettings}
                />
              );
            })}
          </RepliesContainer>
        </>
      )}

      {/* children are rendered below replies (useful for inline reply form injected by parent) */}
      {children}
    </Container>
  );
}

MessageDetail.propTypes = {
  message: PropTypes.shape({
    _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    subject: PropTypes.string,
    details: PropTypes.string,
    attachments: PropTypes.array,
    replies: PropTypes.array,
    createdAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    type: PropTypes.string,
    ops_region: PropTypes.string,
    status: PropTypes.string,
    metadata: PropTypes.object,
  }).isRequired,
  depth: PropTypes.number,
  onLoadReplies: PropTypes.func,
  showActions: PropTypes.bool,
  allowedButtons: PropTypes.shape({
    replies: PropTypes.bool,
    reply: PropTypes.bool,
    update: PropTypes.bool,
    delete: PropTypes.bool,
  }),
  onToggleReplyForm: PropTypes.func,
  children: PropTypes.node,
  settingsProp: PropTypes.object,
};

MessageDetail.defaultProps = {
  depth: 0,
  onLoadReplies: null,
  showActions: true,
  allowedButtons: { replies: true, reply: true, update: true, delete: true },
  onToggleReplyForm: null,
  children: null,
  settingsProp: {},
};
