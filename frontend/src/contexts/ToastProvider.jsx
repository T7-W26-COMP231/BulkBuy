// src/contexts/ToastProvider.jsx
/**
 * ToastProvider.jsx
 *
 * Robust toast provider with proper blur overlay behavior:
 * - When any visible toast requests blurBg, the provider toggles `html.utoast-blur`.
 * - While `utoast-blur` is present the blur overlay covers the page and blocks interactions.
 * - Toasts render above the overlay so they remain interactive.
 *
 * API: showToast(contentOrRenderer, opts) where contentOrRenderer can be:
 *  - a React element (composite or DOM) OR
 *  - a renderer function: ({ toastControls }) => ReactElement
 *
 * Exposes: showToast, dismissToast, bringToFront, updateToast, clearAll, hideStack, restoreStack
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ToastProvider.css";

const ToastContext = createContext(null);
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

let _nextId = 1;
const uid = (prefix = "t") => `${prefix}_${(_nextId++).toString(36)}`;

const DEFAULT_OPTS = {
  value: "TR",
  IsToStack: false,
  IsToStick: false,
  AllowedMultiple: true,
  toastName: null,
  thumbnail: null,
  blurBg: false,
  duration: 4000,
  animate: "FT",
  mt: 0,
  mb: 0,
  ml: 0,
  mr: 0,
};

function normalizeOpts(opts = {}) {
  const merged = { ...DEFAULT_OPTS, ...(opts || {}) };
  merged.value = (merged.value || "TR").toUpperCase();
  merged.IsToStack = !!merged.IsToStack;
  merged.IsToStick = !!merged.IsToStick;
  merged.AllowedMultiple = merged.AllowedMultiple !== false;
  merged.toastName = merged.toastName ? String(merged.toastName) : null;
  merged.blurBg = !!merged.blurBg;
  return merged;
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]); // corner toasts
  const [stackToasts, setStackToasts] = useState([]); // stacked toasts
  const zRef = useRef(1000);
  const savedStackRef = useRef([]);
  const stackHiddenRef = useRef(false);

  /* -------------------------
     Core helpers
     ------------------------- */
  const findExistingStackToast = useCallback(
    (normalizedOpts, content) => {
      if (normalizedOpts.toastName) {
        const byName = stackToasts.find((t) => t.opts?.toastName === normalizedOpts.toastName);
        if (byName) return byName;
        const savedByName = (savedStackRef.current || []).find((t) => t.opts?.toastName === normalizedOpts.toastName);
        if (savedByName) return savedByName;
      }
      if (React.isValidElement(content)) {
        const contentType = content.type;
        const byType = stackToasts.find((t) => React.isValidElement(t.content) && t.content.type === contentType);
        if (byType) return byType;
        const savedByType = (savedStackRef.current || []).find((t) => React.isValidElement(t.content) && t.content.type === contentType);
        if (savedByType) return savedByType;
      }
      return stackToasts.length ? stackToasts[stackToasts.length - 1] : null;
    },
    [stackToasts]
  );

  const computeOffsetStyle = (opts = {}) => {
    const style = {};
    if (opts.mt) style.marginTop = `${opts.mt}px`;
    if (opts.mb) style.marginBottom = `${opts.mb}px`;
    if (opts.ml) style.marginLeft = `${opts.ml}px`;
    if (opts.mr) style.marginRight = `${opts.mr}px`;
    return style;
  };

  const animClass = (key) => {
    if (!key) return "";
    const k = String(key).toLowerCase();
    if (k === "fl") return "utoast-anim-fl";
    if (k === "fr") return "utoast-anim-fr";
    if (k === "ft") return "utoast-anim-ft";
    if (k === "fb") return "utoast-anim-fb";
    return "";
  };

  /* -------------------------
     API
     ------------------------- */
  const bringToFront = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, z: ++zRef.current } : t)));
    setStackToasts((prev) => prev.map((t) => (t.id === id ? { ...t, z: ++zRef.current } : t)));
  }, []);

  const moveStackToastToTop = useCallback((id) => {
    setStackToasts((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const copy = prev.slice();
      const [item] = copy.splice(idx, 1);
      item.z = ++zRef.current;
      copy.push(item);
      return copy;
    });
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    setStackToasts((prev) => prev.filter((t) => t.id !== id));
    savedStackRef.current = (savedStackRef.current || []).filter((t) => t.id !== id);
  }, []);

  const updateToast = useCallback((id, patch = {}) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, opts: { ...t.opts, ...patch }, content: patch.content ?? t.content } : t)));
    setStackToasts((prev) => prev.map((t) => (t.id === id ? { ...t, opts: { ...t.opts, ...patch }, content: patch.content ?? t.content } : t)));
  }, []);

  const clearAll = useCallback(() => {
    setToasts((prev) => prev.filter((t) => t.opts?.IsToStick));
    setStackToasts((prev) => prev.filter((t) => t.opts?.IsToStick));
    savedStackRef.current = (savedStackRef.current || []).filter((t) => t.opts?.IsToStick);
    stackHiddenRef.current = false;
  }, []);

  const hideStack = useCallback(() => {
    setStackToasts((prev) => {
      if (!prev.length) return prev;
      savedStackRef.current = prev.map((t) => ({ ...t }));
      stackHiddenRef.current = true;
      return [];
    });
  }, []);

  const restoreStack = useCallback(() => {
    setStackToasts((prev) => {
      if (!savedStackRef.current.length) return prev;
      const restored = savedStackRef.current
        .filter((s) => {
          if (s.opts?.IsToStack && s.opts?.toastName && s.opts?.AllowedMultiple === false) {
            const exists = prev.some((p) => p.opts?.toastName === s.opts?.toastName);
            return !exists;
          }
          return true;
        })
        .map((s) => ({ ...s, z: ++zRef.current }));
      savedStackRef.current = [];
      stackHiddenRef.current = false;
      return [...prev, ...restored];
    });
  }, []);

  const removeTopStackToast = useCallback(() => {
    setStackToasts((prev) => {
      if (!prev.length) return prev;
      const top = prev[prev.length - 1];
      if (top?.opts?.IsToStick) return prev;
      return prev.slice(0, -1);
    });
  }, []);

  /* -------------------------
     addToast (duplicate prevention for stack)
     ------------------------- */
  const addToast = useCallback(
    (content, opts = {}) => {
      const normalized = normalizeOpts(opts);

      if (normalized.IsToStack && !normalized.AllowedMultiple) {
        const existing = findExistingStackToast(normalized, content);
        if (existing) {
          bringToFront(existing.id);
          moveStackToastToTop(existing.id);
          if (stackHiddenRef.current) {
            const restored = (savedStackRef.current || []).map((s) => ({ ...s, z: ++zRef.current }));
            savedStackRef.current = [];
            stackHiddenRef.current = false;
            setStackToasts((prev) => [...restored, ...prev]);
            moveStackToastToTop(existing.id);
          }
          return existing.id;
        }
      }

      const id = uid("toast");
      const createdAt = Date.now();
      const z = ++zRef.current;
      const toast = { id, content, opts: normalized, z, createdAt };

      if (normalized.IsToStack) {
        if (stackHiddenRef.current) {
          const restored = (savedStackRef.current || []).map((s) => ({ ...s, z: ++zRef.current }));
          savedStackRef.current = [];
          stackHiddenRef.current = false;
          setStackToasts((prev) => [...restored, ...prev, toast]);
        } else {
          setStackToasts((prev) => [...prev, toast]);
        }
      } else {
        if (stackToasts.length > 0 && !stackHiddenRef.current) {
          savedStackRef.current = stackToasts.map((t) => ({ ...t }));
          stackHiddenRef.current = true;
          setStackToasts([]);
        }
        setToasts((prev) => [...prev, toast]);
      }

      if (normalized.duration != null && !normalized.IsToStick) {
        setTimeout(() => dismissToast(id), normalized.duration);
      }

      return id;
    },
    [stackToasts, findExistingStackToast, bringToFront, moveStackToastToTop]
  );

  /* -------------------------
     Outside click behavior
     ------------------------- */
  const elementHasInteractive = (el) => {
    if (!el) return false;
    return !!el.querySelector("button, a, input, textarea, select, [role='button'], [contenteditable='true']");
  };

  const handleOutsideClick = useCallback(
    (e) => {
      if (e.target.closest && (e.target.closest(".utoast-carousel") || e.target.closest(".utoast-hamburger") || e.target.closest(".utoast-thumb"))) {
        return;
      }

      const stackCardEls = Array.from(document.querySelectorAll(".utoast-hvc-layer .utoast-card"));
      if (stackCardEls.length) {
        const clickedInsideStack = stackCardEls.some((el) => el.contains(e.target));
        if (clickedInsideStack) {
          const topCard = stackCardEls[stackCardEls.length - 1];
          if (topCard && topCard.contains(e.target)) {
            const topId = topCard.getAttribute("data-utoast-id");
            const topToast = stackToasts[stackToasts.length - 1];
            if (topToast && topToast.id === topId) {
              if (topToast.opts?.IsToStick) return;
              const hasInteractive = elementHasInteractive(topCard);
              const hasDuration = topToast.opts?.duration != null;
              if (!hasInteractive && !hasDuration) {
                removeTopStackToast();
                return;
              }
            }
          }
          return;
        }
      }

      const nonStackEls = Array.from(document.querySelectorAll(".utoast-root .utoast-item[data-utoast-id], .utoast-root .utoast-card[data-utoast-id]")).filter((el) => {
        const id = el.getAttribute("data-utoast-id");
        if (!id) return false;
        const isStack = stackToasts.some((t) => t.id === id);
        return !isStack;
      });

      if (nonStackEls.length > 0) {
        const clickedInsideNonStack = nonStackEls.some((el) => el.contains(e.target));
        if (!clickedInsideNonStack) {
          if (stackToasts.length > 0) {
            savedStackRef.current = stackToasts.map((t) => ({ ...t }));
            stackHiddenRef.current = true;
            setStackToasts([]);
          }
          setToasts((prev) => prev.filter((t) => t.opts?.IsToStick));
        }
        return;
      }

      if (!stackHiddenRef.current && stackToasts.length > 0) {
        const topToast = stackToasts[stackToasts.length - 1];
        if (topToast?.opts?.IsToStick) {
          savedStackRef.current = stackToasts.map((t) => ({ ...t }));
          stackHiddenRef.current = true;
          setStackToasts([]);
          return;
        }
        const topCard = document.querySelector(`.utoast-hvc-layer .utoast-card[data-utoast-id="${topToast.id}"]`);
        const topHasInteractive = elementHasInteractive(topCard);
        const topHasDuration = topToast.opts?.duration != null;
        if (!topHasInteractive && !topHasDuration) {
          removeTopStackToast();
          return;
        }
        savedStackRef.current = stackToasts.map((t) => ({ ...t }));
        stackHiddenRef.current = true;
        setStackToasts([]);
        return;
      }
    },
    [stackToasts, removeTopStackToast]
  );

  useEffect(() => {
    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, [handleOutsideClick]);

  /* -------------------------
     Blur overlay toggle
     ------------------------- */
  useEffect(() => {
    const updateBlur = () => {
      const anyNonStackBlur = toasts.some((t) => t.opts?.blurBg);
      const topStack = stackToasts.length ? stackToasts[stackToasts.length - 1] : null;
      const anyStackBlur = topStack && topStack.opts && topStack.opts.blurBg;
      const shouldBlur = !!anyNonStackBlur || !!anyStackBlur;

      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("utoast-blur", shouldBlur);
      }
    };

    updateBlur();
  }, [toasts, stackToasts]);

  /* -------------------------
     Render helpers
     ------------------------- */
  const renderContentWithControls = (toast) => {
    const { id } = toast;
    const toastControls = {
      dismiss: () => dismissToast(id),
      bringToFront: () => bringToFront(id),
      update: (patch) => updateToast(id, patch),
    };

    const content = toast.content;
    if (typeof content === "function") {
      try {
        return content({ toastControls });
      } catch (err) {
        console.error("Toast renderer error:", err);
        return <div style={{ padding: 12 }}>Toast render error</div>;
      }
    }

    if (React.isValidElement(content)) {
      if (typeof content.type === "string") {
        return content;
      }
      return React.cloneElement(content, { toastControls });
    }

    return <div>{content}</div>;
  };

  /* -------------------------
     Derived groups and portal render
     ------------------------- */
  const allToasts = [...toasts, ...stackToasts];
  const sortedAll = [...allToasts].sort((a, b) => (a.z - b.z) || (a.createdAt - b.createdAt));
  const cornerGroups = {
    TR: sortedAll.filter((t) => !t.opts.IsToStack && t.opts.value === "TR"),
    TL: sortedAll.filter((t) => !t.opts.IsToStack && t.opts.value === "TL"),
    BR: sortedAll.filter((t) => !t.opts.IsToStack && t.opts.value === "BR"),
    BL: sortedAll.filter((t) => !t.opts.IsToStack && t.opts.value === "BL"),
  };

  const singleHvc = sortedAll.filter((t) => t.opts.value === "HVC" && !t.opts.IsToStack);
  const showPinnedTab = stackHiddenRef.current && (savedStackRef.current || []).length > 0;
  const portalRoot = typeof document !== "undefined" ? document.body : null;

  const api = useMemo(
    () => ({
      showToast: addToast,
      dismissToast,
      bringToFront,
      updateToast,
      clearAll,
      hideStack,
      restoreStack,
    }),
    [addToast, dismissToast, bringToFront, updateToast, clearAll, hideStack, restoreStack]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {portalRoot &&
        createPortal(
          <div className="utoast-root" aria-hidden={false}>
            {/* Corner containers */}
            <div className="utoast-corner tr" aria-live="polite" role="status">
              {cornerGroups.TR.map((t) => (
                <div
                  key={t.id}
                  className={`utoast-item glow ${animClass(t.opts.animate)} utoast-anim-enter`}
                  data-utoast-id={t.id}
                  style={{ zIndex: t.z, ...computeOffsetStyle(t.opts) }}
                  tabIndex={0}
                >
                  {renderContentWithControls(t)}
                </div>
              ))}
            </div>

            <div className="utoast-corner tl" aria-live="polite" role="status">
              {cornerGroups.TL.map((t) => (
                <div
                  key={t.id}
                  className={`utoast-item glow ${animClass(t.opts.animate)} utoast-anim-enter`}
                  data-utoast-id={t.id}
                  style={{ zIndex: t.z, ...computeOffsetStyle(t.opts) }}
                  tabIndex={0}
                >
                  {renderContentWithControls(t)}
                </div>
              ))}
            </div>

            <div className="utoast-corner br" aria-live="polite" role="status">
              {cornerGroups.BR.map((t) => (
                <div
                  key={t.id}
                  className={`utoast-item glow ${animClass(t.opts.animate)} utoast-anim-enter`}
                  data-utoast-id={t.id}
                  style={{ zIndex: t.z, ...computeOffsetStyle(t.opts) }}
                  tabIndex={0}
                >
                  {renderContentWithControls(t)}
                </div>
              ))}
            </div>

            <div className="utoast-corner bl" aria-live="polite" role="status">
              {cornerGroups.BL.map((t) => (
                <div
                  key={t.id}
                  className={`utoast-item glow ${animClass(t.opts.animate)} utoast-anim-enter`}
                  data-utoast-id={t.id}
                  style={{ zIndex: t.z, ...computeOffsetStyle(t.opts) }}
                  tabIndex={0}
                >
                  {renderContentWithControls(t)}
                </div>
              ))}
            </div>

            {/* Single HVC toasts (non-stack) */}
            {singleHvc.length > 0 && (
              <div className="utoast-hvc-layer" role="dialog" aria-modal="false">
                <div className="utoast-hvc-stack">
                  {singleHvc.map((t) => (
                    <div
                      key={t.id}
                      className={`utoast-card utoast-item glow ${animClass(t.opts.animate)} utoast-anim-enter`}
                      style={{ zIndex: t.z + 1000, ...computeOffsetStyle(t.opts), pointerEvents: "auto" }}
                      data-utoast-id={t.id}
                      tabIndex={0}
                    >
                      {renderContentWithControls(t)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Carousel / thumbnails / hamburger */}
            <div className="utoast-carousel-viewport" aria-hidden={stackToasts.length === 0}>
              <div className="utoast-carousel">
                <div className="utoast-carousel-scroll" aria-hidden={stackToasts.length === 0}>
                  <div className="utoast-carousel-track">
                    {stackToasts.map((item, i) => {
                      const thumbLabel = item.opts.thumbnail ? null : (item.opts.toastName || item.id.slice(-4));
                      return (
                        <div
                          key={`${item.id}_${i}`}
                          className="utoast-thumb"
                          onClick={() => {
                            if (stackHiddenRef.current && savedStackRef.current.length > 0) {
                              const restored = savedStackRef.current.map((s) => ({ ...s, z: ++zRef.current }));
                              savedStackRef.current = [];
                              stackHiddenRef.current = false;
                              setStackToasts((prev) => {
                                const merged = [...prev, ...restored];
                                const byId = [];
                                const seen = new Set();
                                for (const t of merged) {
                                  if (!seen.has(t.id)) {
                                    seen.add(t.id);
                                    byId.push(t);
                                  }
                                }
                                const idx = byId.findIndex((t) => t.id === item.id);
                                if (idx !== -1) {
                                  const copy = byId.slice();
                                  const [it] = copy.splice(idx, 1);
                                  it.z = ++zRef.current;
                                  copy.push(it);
                                  return copy;
                                }
                                return byId;
                              });
                              return;
                            }
                            moveStackToastToTop(item.id);
                            bringToFront(item.id);
                          }}
                          title={item.opts.toastName || item.id}
                          data-utoast-id={item.id}
                          role="button"
                          tabIndex={0}
                        >
                          {item.opts.thumbnail ? <img src={item.opts.thumbnail} alt={item.opts.toastName || ""} /> : <span>{thumbLabel}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {stackToasts.length > 0 && (
                  <div className="utoast-hamburger" role="button" aria-label="Hide toast stack" tabIndex={0} onClick={() => hideStack()}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div className="line" />
                      <div className="line" />
                      <div className="line" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* HVC stack layer: topmost toast */}
            {!stackHiddenRef.current && stackToasts.length > 0 && (
              <div className="utoast-hvc-layer" role="dialog" aria-modal="false">
                <div className="utoast-hvc-stack">
                  {(() => {
                    const top = stackToasts[stackToasts.length - 1];
                    if (!top) return null;
                    const t = top;
                    return (
                      <div
                        key={t.id}
                        className={`utoast-card utoast-item glow`}
                        style={{ zIndex: t.z + 1000, transform: "translateY(0) scale(1)", ...computeOffsetStyle(t.opts), pointerEvents: "auto" }}
                        data-utoast-id={t.id}
                        tabIndex={0}
                        onClick={(ev) => {
                          if (t.opts?.IsToStick) {
                            ev.stopPropagation();
                            return;
                          }
                          const el = ev.currentTarget;
                          const hasInteractive = elementHasInteractive(el);
                          const hasDuration = t.opts?.duration != null;
                          if (!hasInteractive && !hasDuration) {
                            ev.stopPropagation();
                            removeTopStackToast();
                          }
                        }}
                      >
                        {renderContentWithControls(t)}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* pinned tab when hidden */}
            {stackHiddenRef.current && (savedStackRef.current || []).length > 0 && (
              <div className="utoast-pinned-tab" onClick={() => restoreStack()} role="button" aria-label="Restore toast stack" tabIndex={0}>
                <span>TOAST STACK</span>
              </div>
            )}
          </div>,
          portalRoot
        )}
    </ToastContext.Provider>
  );
}
