// src/components/MessageTree/MessageForm.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { MessageTreeContext } from "./MessageTree";
import theme from "./MessageTree.styles";

/* Layout */
const Form = styled.form`
  background: ${theme.colors.surface};
  padding: 16px;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
`;

/* Row */
const Row = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`;

/* Label */
const Label = styled.label`
  font-size: 13px;
  color: ${theme.colors.muted};
  min-width: 110px;
  flex: 0 0 110px;
`;

/* Input */
const Input = styled.input`
  flex: 1 1 auto;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid ${theme.colors.border};
  background: ${theme.colors.inputBg};
  color: ${theme.colors.onSurface};
  font-size: 14px;
  &:focus {
    outline: 2px solid ${theme.colors.focus};
  }
`;

/* Textarea */
const Textarea = styled.textarea`
  flex: 1 1 auto;
  min-height: 120px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid ${theme.colors.border};
  background: ${theme.colors.inputBg};
  color: ${theme.colors.onSurface};
  font-size: 14px;
  resize: vertical;
  &:focus {
    outline: 2px solid ${theme.colors.focus};
  }
`;

/* Select */
const Select = styled.select`
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid ${theme.colors.border};
  background: ${theme.colors.inputBg};
  color: ${theme.colors.onSurface};
  font-size: 14px;
`;

/* Helper text */
const Helper = styled.div`
  font-size: 12px;
  color: ${theme.colors.muted};
`;

/* Button row */
const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 6px;
`;

/* Button */
const Button = styled.button`
  background: ${(p) => (p.primary ? theme.colors.primary : theme.colors.surface)};
  color: ${(p) => (p.primary ? theme.colors.onPrimary : theme.colors.onSurface)};
  border: 1px solid ${(p) => (p.primary ? "transparent" : theme.colors.border)};
  padding: 8px 12px;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:focus {
    outline: 2px solid ${theme.colors.focus};
  }
`;

/* Attachment chips */
const AttachmentList = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const AttachmentChip = styled.div`
  background: ${theme.colors.pillBg};
  color: ${theme.colors.onPill};
  padding: 6px 8px;
  border-radius: 999px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

/* Error / Info */
const ErrorText = styled.div`
  color: ${theme.colors.error};
  font-size: 13px;
`;
const InfoText = styled.div`
  color: ${theme.colors.muted};
  font-size: 13px;
`;

/* Responsive helper */
const responsive = css`
  width: 100%;
`;

/* Default options */
const DEFAULT_TYPE_OPTIONS = [
  { value: "notification", label: "Notification" },
  { value: "issue_wall", label: "Issue Wall" },
  { value: "email", label: "Email" },
  { value: "order", label: "Order" },
  { value: "review", label: "Review" },
];

const DEFAULT_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "read", label: "Read" },
  { value: "unread", label: "Unread" },
];

const INTENDED_FOR_OPTIONS = [
  { value: "user", label: "User(s)" },
  { value: "region", label: "Region" },
  { value: "role", label: "Role" },
  { value: "all", label: "All" },
];

export default function MessageForm({
  initial = null,
  onSubmit = null,
  onCancel = null,
  allowedTargets = { users: true, ops_region: true, all: true },
  settingsProp = {},
  mode = "create", // "create" | "reply" | "edit"
}) {
  const { permissions = {}, handlers = {}, canPerform = null } = useContext(MessageTreeContext);

  const {
    showType = true,
    typeOptions = DEFAULT_TYPE_OPTIONS,
    showStatus = true,
    statusOptions = DEFAULT_STATUS_OPTIONS,
    showOpsRegion = true,
    showRecipients = true,
  } = settingsProp || {};

  const canCreate = Boolean(permissions.canCreate);
  const canUpdate = Boolean(permissions.canUpdate);
  const isEdit = mode === "edit" || Boolean(initial && (initial._id || initial.id));
  const isReplyMode = mode === "reply";

  const initialSubject = useMemo(() => {
    if (initial && typeof initial.subject === "string" && initial.subject.trim().length > 0) {
      return isReplyMode && !/^Re:/i.test(initial.subject) ? `Re: ${initial.subject}` : initial.subject;
    }
    return isReplyMode && initial?.rootSubject ? `Re: ${initial.rootSubject}` : "";
  }, [initial, isReplyMode]);

  const [subject, setSubject] = useState(initial?.subject ?? initialSubject ?? "");
  const [details, setDetails] = useState(initial?.details ?? "");
  const [type, setType] = useState(initial?.type ?? (typeOptions[0]?.value ?? "notification"));
  const [opsRegion, setOpsRegion] = useState(initial?.ops_region ?? "");
  const [status, setStatus] = useState(initial?.status ?? (statusOptions[0]?.value ?? "submitted"));
  const [recipientsAll, setRecipientsAll] = useState(Boolean(initial?.recipients?.all));
  const [recipientsUsers, setRecipientsUsers] = useState(
    Array.isArray(initial?.recipients?.users) ? initial.recipients.users.join(", ") : ""
  );

  // **Store File objects** for attachments so the workhorse can upload them
  const [attachments, setAttachments] = useState(Array.isArray(initial?.attachments) ? initial.attachments : []);
  const [intendedFor, setIntendedFor] = useState(initial?.intendedFor ?? null);
  const [roleTarget, setRoleTarget] = useState(initial?.role ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  /* Email-specific fields (shown when type === 'email') */
  const [emailTo, setEmailTo] = useState(Array.isArray(initial?.emailTo) ? initial.emailTo.join(", ") : initial?.emailTo || "");
  const [emailCc, setEmailCc] = useState(Array.isArray(initial?.emailCc) ? initial.emailCc.join(", ") : initial?.emailCc || "");
  const [emailBcc, setEmailBcc] = useState(Array.isArray(initial?.emailBcc) ? initial.emailBcc.join(", ") : initial?.emailBcc || "");
  const [emailTemplate, setEmailTemplate] = useState(initial?.emailTemplate || "");
  const [sendImmediate, setSendImmediate] = useState(Boolean(initial?.sendImmediate));

  const blockedTypes = useMemo(() => new Set(["system"]), []);

  const errors = useMemo(() => {
    const e = {};
    if (!subject || subject.trim().length < 2) e.subject = "Subject is required (min 2 chars).";
    if (!details || details.trim().length < 3) e.details = "Details are required (min 3 chars).";

    if (
      showRecipients &&
      (intendedFor === "user" || (!intendedFor && !recipientsAll)) &&
      allowedTargets.users &&
      !recipientsAll &&
      recipientsUsers.trim().length === 0 &&
      !allowedTargets.all &&
      type !== "email"
    ) {
      e.recipients = "Provide at least one recipient or select system-wide.";
    }

    if (intendedFor === "region" && (!opsRegion || opsRegion.trim().length === 0)) {
      e.opsRegion = "Ops region is required when targeting a region.";
    }

    if (intendedFor === "role" && (!roleTarget || roleTarget.trim().length === 0)) {
      e.role = "Role is required when targeting a role.";
    }

    if (type === "email") {
      const toList = (emailTo || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (toList.length === 0 && (!recipientsAll && (!recipientsUsers || recipientsUsers.trim().length === 0))) {
        e.emailTo = "Provide at least one email recipient or select recipients above.";
      }
    }

    return e;
  }, [
    subject,
    details,
    recipientsAll,
    recipientsUsers,
    allowedTargets,
    showRecipients,
    intendedFor,
    opsRegion,
    roleTarget,
    type,
    emailTo,
  ]);

  useEffect(() => {
    setError(null);
    setInfo(null);
  }, [subject, details, recipientsAll, recipientsUsers, type, opsRegion, status, intendedFor, roleTarget, emailTo, emailCc, emailBcc, emailTemplate, sendImmediate]);

  useEffect(() => {
    if (initial && typeof initial.subject === "string") {
      setSubject(initial.subject);
    }
    if (initial && typeof initial.details === "string") {
      setDetails(initial.details);
    }
    if (initial && initial.intendedFor) {
      setIntendedFor(initial.intendedFor);
    }
    if (initial && initial.role) {
      setRoleTarget(initial.role);
    }
    // If initial.attachments are persisted ids (strings), keep them as-is so update can pass them through.
    if (initial && Array.isArray(initial.attachments)) {
      setAttachments(initial.attachments.slice());
    }
  }, [initial]);

  // When type changes, default intendedFor behavior
  useEffect(() => {
    if (type === "notification") {
      if (!intendedFor) {
        if (recipientsAll) setIntendedFor("all");
        else if (recipientsUsers && recipientsUsers.trim().length > 0) setIntendedFor("user");
        else if (opsRegion) setIntendedFor("region");
        else if (roleTarget) setIntendedFor("role");
        else setIntendedFor("user");
      }
    } else {
      if (recipientsAll) setIntendedFor("all");
      else if (recipientsUsers && recipientsUsers.trim().length > 0) setIntendedFor("user");
      else if (opsRegion) setIntendedFor("region");
      else if (roleTarget) setIntendedFor("role");
      else setIntendedFor("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, recipientsAll, recipientsUsers, opsRegion, roleTarget]);

  /* Attach real File objects */
  const handleAddAttachment = (evt) => {
    const files = evt.target.files;
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setAttachments((prev) => [...prev, ...arr]);
    evt.target.value = "";
  };

  const handleRemoveAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const buildRecipients = () => {
    const obj = { all: Boolean(recipientsAll), users: [] };
    if (!recipientsAll && recipientsUsers) {
      const ids = recipientsUsers.split(",").map((s) => s.trim()).filter(Boolean);
      obj.users = ids;
    }
    return obj;
  };

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);
    setInfo(null);

    if (Object.keys(errors).length > 0) {
      setError("Please fix validation errors before submitting.");
      return;
    }

    if (!canCreate && !isEdit && !isReplyMode) {
      setError("You do not have permission to create messages.");
      return;
    }

    if (isEdit && !canUpdate) {
      setError("You do not have permission to update messages.");
      return;
    }

    if (isReplyMode && initial) {
      const parentType = initial?.type;
      if (parentType && blockedTypes.has(String(parentType).toLowerCase())) {
        setError("Replies are not allowed for this message type.");
        return;
      }
    }

    const payload = {
      subject: subject.trim(),
      details: details.trim(),
      type,
      ops_region: opsRegion.trim(),
      status,
      recipients: buildRecipients(),
      // pass File objects (or persisted ids) to the workhorse; it will handle uploads
      attachments: attachments.slice(),
      intendedFor: intendedFor || determineDefaultIntendedFor({ recipientsAll, recipientsUsers, opsRegion, roleTarget }),
      role: roleTarget && roleTarget.trim().length > 0 ? roleTarget.trim() : undefined,
    };

    if (type === "email") {
      const toList = (emailTo || "").split(",").map((s) => s.trim()).filter(Boolean);
      const ccList = (emailCc || "").split(",").map((s) => s.trim()).filter(Boolean);
      const bccList = (emailBcc || "").split(",").map((s) => s.trim()).filter(Boolean);
      payload.email = {
        to: toList.length ? toList : (payload.recipients && payload.recipients.users ? payload.recipients.users : []),
        cc: ccList,
        bcc: bccList,
        template: emailTemplate || undefined,
        sendImmediate: Boolean(sendImmediate),
      };
    }

    if (isReplyMode) {
      const replyToId = initial?.replyTo ?? initial?._id ?? initial?.id;
      if (replyToId) payload.replyTo = replyToId;
    }

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      let createdOrUpdated = null;

      if (isEdit) {
        if (typeof handlers.update === "function") {
          createdOrUpdated = await handlers.update(initial._id ?? initial.id, payload);
        } else if (typeof onSubmit === "function") {
          createdOrUpdated = await onSubmit({ ...payload, _id: initial._id ?? initial.id });
        }
      } else {
        if (isReplyMode && initial && typeof canPerform === "function") {
          const allowed = canPerform(initial?.imsg ?? initial, "reply");
          if (!allowed) {
            setError("You are not allowed to reply to this message.");
            throw new Error("REPLY_NOT_ALLOWED");
          }
        }

        if (typeof handlers.create === "function") {
          createdOrUpdated = await handlers.create(payload);
        } else if (typeof onSubmit === "function") {
          createdOrUpdated = await onSubmit(payload);
        }
      }

      // If the workhorse returned postActions, surface a concise info message
      const postActions = createdOrUpdated?.metadata?.postActions;
      if (postActions) {
        const parts = [];
        if (postActions.s3) {
          if (postActions.s3.uploaded) parts.push(`attachments uploaded (${postActions.s3.uploaded.length})`);
          else if (postActions.s3.error) parts.push("attachment upload error");
        }
        if (postActions.websocket) parts.push(`websocket: ${String(postActions.websocket)}`);
        if (postActions.email) parts.push(`email: ${String(postActions.email)}`);
        if (parts.length > 0) setInfo(parts.join(" · "));
      } else {
        // generic success hint
        setInfo(isEdit ? "Saved" : isReplyMode ? "Reply sent" : "Message sent");
      }

      if (typeof onSubmit === "function" && !createdOrUpdated) {
        await onSubmit(createdOrUpdated || payload);
      }

      if (onCancel) onCancel();

      return createdOrUpdated;
    } catch (err) {
      const msg = (err && (err.message || (err.toString && err.toString()))) || "Failed to save message. Try again.";
      if (String(msg).includes("REPLY_BLOCKED") || String(msg).toLowerCase().includes("replies are not allowed")) {
        setError("Replies are not allowed for this message type.");
      } else if (String(msg).toLowerCase().includes("update_blocked") || String(msg).toLowerCase().includes("updates are not allowed")) {
        setError("Updates are not allowed for this message type.");
      } else {
        setError(msg);
      }
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
  };

  if (!canCreate && !isEdit && !isReplyMode) {
    return (
      <Form css={responsive} aria-label="Create message">
        <Helper>You do not have permission to create messages.</Helper>
      </Form>
    );
  }

  const parentTypeKnown = isReplyMode && initial && typeof initial.type === "string";
  const replyBlockedByParentType = parentTypeKnown && blockedTypes.has(String(initial.type).toLowerCase());

  return (
    <Form onSubmit={submit} css={responsive} aria-label={isEdit ? "Edit message" : isReplyMode ? "Reply" : "Create message"}>
      <Row>
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short subject" aria-invalid={!!errors.subject} />
      </Row>
      {errors.subject && <ErrorText>{errors.subject}</ErrorText>}

      <Row>
        <Label htmlFor="details">Details</Label>
        <Textarea id="details" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Write the message details here..." aria-invalid={!!errors.details} />
      </Row>
      {errors.details && <ErrorText>{errors.details}</ErrorText>}

      <Row>
        {showType && (
          <>
            <Label htmlFor="type">Type</Label>
            <Select id="type" value={type} onChange={(e) => setType(e.target.value)}>
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </>
        )}

        {showStatus && (
          <>
            <Label htmlFor="status" style={{ minWidth: 90 }}>
              Status
            </Label>
            <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </>
        )}
      </Row>

      {showOpsRegion && (
        <Row>
          <Label htmlFor="ops_region">Ops Region</Label>
          <Input id="ops_region" value={opsRegion} onChange={(e) => setOpsRegion(e.target.value)} placeholder="e.g., Toronto Central" />
        </Row>
      )}

      {showRecipients && (
        <Row>
          <Label>Recipients</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 auto" }}>
            {allowedTargets.all && (
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={recipientsAll} onChange={(e) => setRecipientsAll(e.target.checked)} />
                <span style={{ color: theme.colors.onSurface, fontWeight: 600 }}>System wide</span>
              </label>
            )}

            {allowedTargets.ops_region && <Helper><strong>Ops region</strong> will be used to target region-level recipients.</Helper>}

            {allowedTargets.users && (
              <div>
                <Helper>Comma-separated user ids (mock):</Helper>
                <Input value={recipientsUsers} onChange={(e) => setRecipientsUsers(e.target.value)} placeholder="userId1, userId2, userId3" disabled={recipientsAll} aria-invalid={!!errors.recipients} />
                {errors.recipients && <ErrorText>{errors.recipients}</ErrorText>}
              </div>
            )}
          </div>
        </Row>
      )}

      {type === "notification" && (
        <Row>
          <Label htmlFor="intendedFor">Target</Label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 auto" }}>
            <Select id="intendedFor" value={intendedFor || "user"} onChange={(e) => setIntendedFor(e.target.value)}>
              {INTENDED_FOR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            {intendedFor === "role" && <Input value={roleTarget} onChange={(e) => setRoleTarget(e.target.value)} placeholder="Role name (e.g., admin)" aria-invalid={!!errors.role} />}
            {intendedFor === "region" && <Input value={opsRegion} onChange={(e) => setOpsRegion(e.target.value)} placeholder="Region name (e.g., Toronto Central)" aria-invalid={!!errors.opsRegion} />}
          </div>
        </Row>
      )}

      {type === "email" && (
        <>
          <Row>
            <Label htmlFor="email_to">To</Label>
            <Input id="email_to" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="recipient@example.com, another@example.com" aria-invalid={!!errors.emailTo} />
          </Row>
          {errors.emailTo && <ErrorText>{errors.emailTo}</ErrorText>}

          <Row>
            <Label htmlFor="email_cc">CC</Label>
            <Input id="email_cc" value={emailCc} onChange={(e) => setEmailCc(e.target.value)} placeholder="cc@example.com" />
          </Row>

          <Row>
            <Label htmlFor="email_bcc">BCC</Label>
            <Input id="email_bcc" value={emailBcc} onChange={(e) => setEmailBcc(e.target.value)} placeholder="bcc@example.com" />
          </Row>

          <Row>
            <Label htmlFor="email_template">Template</Label>
            <Input id="email_template" value={emailTemplate} onChange={(e) => setEmailTemplate(e.target.value)} placeholder="Template name or id (optional)" />
          </Row>

          <Row>
            <Label>Send</Label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={sendImmediate} onChange={(e) => setSendImmediate(e.target.checked)} />
                <span style={{ color: theme.colors.onSurface }}>Send immediately</span>
              </label>
              <Helper>Emails will be queued unless "Send immediately" is checked.</Helper>
            </div>
          </Row>
        </>
      )}

      <Row>
        <Label>Attachments</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 auto" }}>
          <input type="file" multiple onChange={handleAddAttachment} />
          <AttachmentList>
            {attachments.map((a, idx) => {
              const name = typeof a === "string" ? a : a?.name || `file-${idx}`;
              return (
                <AttachmentChip key={idx}>
                  {name}
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(idx)}
                    style={{
                      marginLeft: 8,
                      background: "transparent",
                      border: "none",
                      color: theme.colors.onPill,
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                    aria-label={`Remove attachment ${name}`}
                  >
                    ×
                  </button>
                </AttachmentChip>
              );
            })}
          </AttachmentList>
        </div>
      </Row>

      {replyBlockedByParentType && <Helper style={{ color: theme.colors.muted }}>Replies are disabled for this message type and cannot be submitted.</Helper>}

      {error && <ErrorText role="alert">{error}</ErrorText>}
      {info && <InfoText role="status">{info}</InfoText>}

      <ButtonRow>
        <Button type="button" onClick={handleCancel} disabled={submitting}>
          Cancel
        </Button>

        <Button
          type="submit"
          primary
          disabled={submitting || Object.keys(errors).length > 0 || (isReplyMode && replyBlockedByParentType)}
          aria-disabled={submitting || Object.keys(errors).length > 0 || (isReplyMode && replyBlockedByParentType)}
        >
          {submitting ? (isEdit ? "Saving..." : "Sending...") : isEdit ? "Save" : isReplyMode ? "Reply" : "Send"}
        </Button>
      </ButtonRow>
    </Form>
  );
}

/* -------------------------
 * Helpers exported for tests / reuse
 * ------------------------- */
function determineDefaultIntendedFor({ recipientsAll, recipientsUsers, opsRegion, roleTarget } = {}) {
  if (recipientsAll) return "all";
  if (recipientsUsers && recipientsUsers.trim().length > 0) return "user";
  if (opsRegion && opsRegion.trim().length > 0) return "region";
  if (roleTarget && roleTarget.trim().length > 0) return "role";
  return "all";
}

/* -------------------------
 * PropTypes / Defaults
 * ------------------------- */
MessageForm.propTypes = {
  initial: PropTypes.object,
  onSubmit: PropTypes.func,
  onCancel: PropTypes.func,
  allowedTargets: PropTypes.shape({
    users: PropTypes.bool,
    ops_region: PropTypes.bool,
    all: PropTypes.bool,
  }),
  settingsProp: PropTypes.shape({
    showType: PropTypes.bool,
    typeOptions: PropTypes.array,
    showStatus: PropTypes.bool,
    statusOptions: PropTypes.array,
    showOpsRegion: PropTypes.bool,
    showRecipients: PropTypes.bool,
  }),
  mode: PropTypes.oneOf(["create", "reply", "edit"]),
};

MessageForm.defaultProps = {
  initial: null,
  onSubmit: null,
  onCancel: null,
  allowedTargets: { users: true, ops_region: true, all: true },
  settingsProp: {
    showType: true,
    typeOptions: DEFAULT_TYPE_OPTIONS,
    showStatus: true,
    statusOptions: DEFAULT_STATUS_OPTIONS,
    showOpsRegion: true,
    showRecipients: true,
  },
  mode: "create",
};
