// src/components/ConfirmRemoveModal.jsx
import React, { useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
import { createPortal } from "react-dom";
import "./ConfirmRemoveModal.css";

/**
 * ConfirmRemoveModal
 *
 * Accessible confirmation modal rendered into document.body.
 * - Focus trap and restore previous focus on close
 * - Escape to cancel, Enter to confirm
 * - Click backdrop to cancel
 * - Prevents background scroll while open
 */

export default function ConfirmRemoveModal({
  open,
  title = "Remove item?",
  description = "Are you sure you want to remove this item from your cart?",
  confirmLabel = "Remove",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isDestructive = true,
}) {
  const root = typeof document !== "undefined" ? document.body : null;
  const previouslyFocused = useRef(null);
  const dialogRef = useRef(null);
  const confirmBtnRef = useRef(null);

  // Prevent background scroll while modal is open
  useEffect(() => {
    if (!open || !root) return;
    const originalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = originalOverflow;
    };
  }, [open, root]);

  // Focus management and keyboard handling
  useEffect(() => {
    if (!open || !root) return;

    previouslyFocused.current = document.activeElement;

    // Move focus into dialog (prefer confirm button)
    const focusTimer = setTimeout(() => {
      if (confirmBtnRef.current) confirmBtnRef.current.focus();
      else if (dialogRef.current) dialogRef.current.focus();
    }, 0);

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        // Enter confirms when focus is inside the dialog
        if (dialogRef.current && dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          onConfirm();
        }
      } else if (e.key === "Tab") {
        // Focus trap
        const focusable = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      // restore previous focus
      try {
        if (previouslyFocused.current && previouslyFocused.current.focus) {
          previouslyFocused.current.focus();
        }
      } catch (err) {
        // ignore
      }
    };
  }, [open, root, onCancel, onConfirm]);

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel]
  );

  if (!open || !root) return null;

  return createPortal(
    <div
      className="crm-backdrop"
      role="presentation"
      onMouseDown={handleBackdropClick}
      aria-hidden="false"
    >
      <div
        className="crm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-title"
        aria-describedby="crm-desc"
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="crm-header">
          <h3 id="crm-title" className="crm-title">
            {title}
          </h3>
        </header>

        <div className="crm-body" id="crm-desc">
          <p className="crm-description">{description}</p>
        </div>

        <footer className="crm-footer">
          <button
            type="button"
            className="crm-btn crm-btn-cancel"
            onClick={onCancel}
            aria-label={cancelLabel}
          >
            {cancelLabel}
          </button>

          <button
            ref={confirmBtnRef}
            type="button"
            className={`crm-btn crm-btn-confirm ${isDestructive ? "destructive" : ""}`}
            onClick={onConfirm}
            aria-label={confirmLabel}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>,
    root
  );
}

ConfirmRemoveModal.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string,
  description: PropTypes.string,
  confirmLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  isDestructive: PropTypes.bool,
};
