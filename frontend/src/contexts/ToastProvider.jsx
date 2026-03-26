// src/ToastProvider.jsx
/**
 * ToastProvider.jsx
 *
 * Polished Toast provider with strict duplicate prevention when
 * AllowedMultiple is false.  If a stack toast is added with
 * AllowedMultiple: false the provider will:
 *  - look for an existing stack toast that matches by:
 *      1) opts.toastName (if provided), OR
 *      2) React element type equality (for element content),
 *      3) fallback to id fragment match (rare).
 *  - if found, bring that toast to front and return its id instead of adding a duplicate.
 *
 * Other features:
 *  - IsToStack, IsToStick, toastName, AllowedMultiple, blurBg
 *  - Carousel + hamburger adjacent layout
 *  - Top-of-stack single HVC rendering
 *  - blurBg toggles html.utoast-blur while relevant toasts are visible
 *
 * Usage:
 *  showToast(<SignIn />, { IsToStack: true, toastName: "Sign In", AllowedMultiple: false })
 *  // second call will bring the existing SignIn toast to front instead of adding another
 */

import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import "./ToastProvider.css";

function uid(prefix = "t") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

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

const ToastContext = createContext(null);
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]); // non-stack
  const [stackToasts, setStackToasts] = useState([]); // stack (last item is topmost)

  const zRef = useRef(1000);
  const stackHiddenRef = useRef(false);
  const savedStackRef = useRef([]);
  const autoLoopRef = useRef(null);
  const carouselPausedRef = useRef(false);
  const carouselScrollRef = useRef(null);

  const normalizeOpts = (opts = {}) => {
    const merged = { ...DEFAULT_OPTS, ...(opts || {}) };
    merged.value = (merged.value || "TR").toUpperCase();
    merged.IsToStack = !!merged.IsToStack;
    merged.IsToStick = !!merged.IsToStick;
    merged.AllowedMultiple = merged.AllowedMultiple !== false; // default true
    merged.toastName = merged.toastName ? String(merged.toastName) : null;
    merged.blurBg = !!merged.blurBg;
    return merged;
  };

  /* Helper: find existing stack toast that should be considered the same */
  const findExistingStackToast = useCallback((normalizedOpts, content) => {
    // 1) prefer matching toastName when provided
    if (normalizedOpts.toastName) {
      const byName = stackToasts.find((t) => t.opts && t.opts.toastName === normalizedOpts.toastName);
      if (byName) return byName;
      // also check saved stack (hidden) to avoid duplicates when restoring
      const savedByName = (savedStackRef.current || []).find((t) => t.opts && t.opts.toastName === normalizedOpts.toastName);
      if (savedByName) return savedByName;
    }

    // 2) if content is a React element, match by element type (function/class/component)
    if (React.isValidElement(content)) {
      const contentType = content.type;
      const byType = stackToasts.find((t) => React.isValidElement(t.content) && t.content.type === contentType);
      if (byType) return byType;
      const savedByType = (savedStackRef.current || []).find((t) => React.isValidElement(t.content) && t.content.type === contentType);
      if (savedByType) return savedByType;
    }

    // 3) fallback: try to match by id fragment or label (rare)
    const fallback = stackToasts[stackToasts.length - 1] || null;
    return fallback;
  }, [stackToasts]);

  /* -------------------------
     Core API
     ------------------------- */
  // const addToast = useCallback((content, opts = {}) => {
  //   const normalized = normalizeOpts(opts);

  //   // Prevent duplicates for stack toasts when AllowedMultiple === false
  //   if (normalized.IsToStack && !normalized.AllowedMultiple) {
  //     const existing = findExistingStackToast(normalized, content);
  //     if (existing) {
  //       // bring existing to front and return its id
  //       bringToFront(existing.id);
  //       moveStackToastToTop(existing.id);
  //       return existing.id;
  //     }
  //   }

  //   const id = uid("toast");
  //   const createdAt = Date.now();
  //   const z = ++zRef.current;
  //   const toast = { id, content, opts: normalized, z, createdAt };

  //   if (normalized.IsToStack) {
  //     if (stackHiddenRef.current) {
  //       const saved = savedStackRef.current || [];
  //       // avoid re-adding duplicates from saved stack when AllowedMultiple === false
  //       const restored = saved
  //         .filter((s) => {
  //           if (!normalized.AllowedMultiple && normalized.toastName) {
  //             return s.opts.toastName !== normalized.toastName;
  //           }
  //           return true;
  //         })
  //         .map((s) => ({ ...s, z: ++zRef.current }));
  //       savedStackRef.current = [];
  //       stackHiddenRef.current = false;
  //       setStackToasts((prev) => [...restored, ...prev, toast]);
  //     } else {
  //       setStackToasts((prev) => [...prev, toast]);
  //     }
  //   } else {
  //     // non-stack: if stack visible, hide it so non-stack can overlay
  //     if (stackToasts.length > 0 && !stackHiddenRef.current) {
  //       savedStackRef.current = stackToasts.map((t) => ({ ...t }));
  //       stackHiddenRef.current = true;
  //       setStackToasts([]);
  //     }
  //     setToasts((prev) => [...prev, toast]);
  //   }

  //   // schedule timeout only if not sticky
  //   if (normalized.duration != null && !normalized.IsToStick) {
  //     setTimeout(() => dismissToast(id), normalized.duration);
  //   }

  //   return id;
  // }, [stackToasts, findExistingStackToast]);

  // Programmatic dismiss (always allowed)

  const addToast = useCallback((content, opts = {}) => {
  const normalized = normalizeOpts(opts);

  // Prevent duplicates for stack toasts when AllowedMultiple === false
  if (normalized.IsToStack && !normalized.AllowedMultiple) {
    const existing = findExistingStackToast(normalized, content);
    if (existing) {
      // bring existing to front and return its id
      bringToFront(existing.id);
      moveStackToastToTop(existing.id);

      // NEW: if the stack is currently hidden, restore it into view
      // even though we are not adding a new toast.
      if (stackHiddenRef.current) {
        try {
          const saved = savedStackRef.current || [];
          // Reassign fresh z values for restored items
          const restored = saved.map((s) => ({ ...s, z: ++zRef.current }));
          // Clear saved snapshot and mark stack visible
          savedStackRef.current = [];
          stackHiddenRef.current = false;
          // Prepend restored items so they appear in the stack, then ensure the existing toast is on top
          setStackToasts((prev) => [...restored, ...prev]);
          // Ensure the existing toast is moved to top after restore
          moveStackToastToTop(existing.id);
        } catch (err) {
          console.error("restore stack on duplicate addToast error:", err);
        }
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
      const saved = savedStackRef.current || [];
      // avoid re-adding duplicates from saved stack when AllowedMultiple === false
      const restored = saved
        .filter((s) => {
          if (!normalized.AllowedMultiple && normalized.toastName) {
            return s.opts.toastName !== normalized.toastName;
          }
          return true;
        })
        .map((s) => ({ ...s, z: ++zRef.current }));
      savedStackRef.current = [];
      stackHiddenRef.current = false;
      setStackToasts((prev) => [...restored, ...prev, toast]);
    } else {
      setStackToasts((prev) => [...prev, toast]);
    }
  } else {
    // non-stack: if stack visible, hide it so non-stack can overlay
    if (stackToasts.length > 0 && !stackHiddenRef.current) {
      savedStackRef.current = stackToasts.map((t) => ({ ...t }));
      stackHiddenRef.current = true;
      setStackToasts([]);
    }
    setToasts((prev) => [...prev, toast]);
  }

  // schedule timeout only if not sticky
  if (normalized.duration != null && !normalized.IsToStick) {
    setTimeout(() => dismissToast(id), normalized.duration);
  }

  return id;
}, [stackToasts, findExistingStackToast]);


  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    setStackToasts((prev) => prev.filter((t) => t.id !== id));
    savedStackRef.current = (savedStackRef.current || []).filter((t) => t.id !== id);
  }, []);

  const bringToFront = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, z: ++zRef.current } : t)));
    setStackToasts((prev) => prev.map((t) => (t.id === id ? { ...t, z: ++zRef.current } : t)));
  }, []);

  const updateToast = useCallback((id, patch = {}) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, opts: { ...t.opts, ...patch }, content: patch.content ?? t.content } : t))
    );
    setStackToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, opts: { ...t.opts, ...patch }, content: patch.content ?? t.content } : t))
    );
  }, []);

  const clearAll = useCallback(() => {
    // preserve sticky toasts; remove non-sticky
    setToasts((prev) => prev.filter((t) => t.opts && t.opts.IsToStick));
    setStackToasts((prev) => prev.filter((t) => t.opts && t.opts.IsToStick));
    savedStackRef.current = (savedStackRef.current || []).filter((t) => t.opts && t.opts.IsToStick);
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
      // when restoring, avoid duplicates if AllowedMultiple=false for incoming items
      const restored = savedStackRef.current
        .filter((s) => {
          if (s.opts && s.opts.IsToStack && s.opts.toastName && s.opts.AllowedMultiple === false) {
            // if current stack already has same toastName, skip restoring duplicate
            const exists = prev.some((p) => p.opts && p.opts.toastName === s.opts.toastName);
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

  const api = {
    showToast: addToast,
    dismissToast,
    bringToFront,
    updateToast,
    clearAll,
    hideStack,
    restoreStack,
  };

  /* -------------------------
     Stack helpers
     ------------------------- */
  const removeTopStackToast = useCallback(() => {
    setStackToasts((prev) => {
      if (!prev.length) return prev;
      const top = prev[prev.length - 1];
      if (top && top.opts && top.opts.IsToStick) return prev; // sticky cannot be removed by user
      return prev.slice(0, -1);
    });
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

  /* -------------------------
     Interaction helpers
     ------------------------- */
  const elementHasInteractive = (el) => {
    if (!el) return false;
    return !!el.querySelector("button, a, input, textarea, select, [role='button'], [contenteditable='true']");
  };

  /* -------------------------
     Outside click behavior
     ------------------------- */
  const handleOutsideClick = useCallback(
    (e) => {
      if (e.target.closest && (e.target.closest(".utoast-carousel") || e.target.closest(".utoast-carousel-track") || e.target.closest(".utoast-thumb") || e.target.closest(".utoast-hamburger") || e.target.closest(".utoast-pinned-tab"))) {
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
              if (topToast.opts && topToast.opts.IsToStick) return;
              const hasInteractive = elementHasInteractive(topCard);
              const hasDuration = topToast.opts.duration != null;
              if (!hasInteractive && !hasDuration) {
                removeTopStackToast();
                return;
              }
            }
          }
          return;
        }
      }

      const nonStackEls = Array.from(document.querySelectorAll(".utoast-root .utoast-item[data-utoast-id], .utoast-root .utoast-card[data-utoast-id]"))
        .filter((el) => {
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
          setToasts((prev) => prev.filter((t) => t.opts && t.opts.IsToStick));
        }
        return;
      }

      if (!stackHiddenRef.current && stackToasts.length > 0) {
        const topToast = stackToasts[stackToasts.length - 1];
        if (topToast.opts && topToast.opts.IsToStick) {
          savedStackRef.current = stackToasts.map((t) => ({ ...t }));
          stackHiddenRef.current = true;
          setStackToasts([]);
          return;
        }

        const topCard = document.querySelector(`.utoast-hvc-layer .utoast-card[data-utoast-id="${topToast.id}"]`);
        const topHasInteractive = elementHasInteractive(topCard);
        const topHasDuration = topToast.opts.duration != null;

        if (!topHasInteractive && !topHasDuration) {
          removeTopStackToast();
          return;
        }

        savedStackRef.current = stackToasts.map((t) => ({ ...t }));
        stackHiddenRef.current = true;
        setStackToasts([]);
        return;
      }

      const cornerContainers = document.querySelectorAll(".utoast-corner");
      cornerContainers.forEach((container) => {
        if (container.contains(e.target)) {
          const item = e.target.closest(".utoast-item");
          if (!item) {
            const id = container.querySelector("[data-utoast-id]")?.getAttribute("data-utoast-id");
            if (id) dismissToast(id);
          }
        }
      });
    },
    [dismissToast, stackToasts, removeTopStackToast]
  );

  useEffect(() => {
    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, [handleOutsideClick]);

  /* -------------------------
     Carousel auto-scroll & wheel
     ------------------------- */
  useEffect(() => {
    if (!carouselScrollRef.current) return;
    if (!stackToasts.length || stackHiddenRef.current) {
      carouselScrollRef.current.scrollLeft = 0;
      return;
    }
    if (carouselPausedRef.current) return;
    const thumbSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--utoast-thumbnail-size")) || 56;
    const gap = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--utoast-thumbnail-gap")) || 8;
    const step = thumbSize + gap;
    autoLoopRef.current = setInterval(() => {
      if (!carouselScrollRef.current) return;
      carouselScrollRef.current.scrollBy({ left: step, behavior: "smooth" });
    }, 1200);
    return () => clearInterval(autoLoopRef.current);
  }, [stackToasts.length]);

  const pauseCarousel = useCallback(() => {
    carouselPausedRef.current = true;
    clearInterval(autoLoopRef.current);
  }, []);

  const resumeCarousel = useCallback(() => {
    carouselPausedRef.current = false;
  }, []);

  useEffect(() => {
    const el = carouselScrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [carouselScrollRef.current]);

  /* -------------------------
     Thumbnail click handler
     ------------------------- */
  const handleThumbnailClick = useCallback((id) => {
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
        const idx = byId.findIndex((t) => t.id === id);
        if (idx !== -1) {
          const copy = byId.slice();
          const [item] = copy.splice(idx, 1);
          item.z = ++zRef.current;
          copy.push(item);
          return copy;
        }
        return byId;
      });
      return;
    }
    moveStackToastToTop(id);
    bringToFront(id);
  }, [moveStackToastToTop, bringToFront]);

  /* -------------------------
     Blur background handling
     ------------------------- */
  useEffect(() => {
    const updateBlur = () => {
      const anyNonStackBlur = toasts.some((t) => t.opts && t.opts.blurBg);
      const topStack = stackToasts.length ? stackToasts[stackToasts.length - 1] : null;
      const anyStackBlur = topStack && topStack.opts && topStack.opts.blurBg;
      const shouldBlur = anyNonStackBlur || !!anyStackBlur;
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("utoast-blur", shouldBlur);
      }
    };
    updateBlur();
  }, [toasts, stackToasts]);

  /* -------------------------
     Render helpers
     ------------------------- */
  // const renderContentWithControls = (toast) => {
  //   const { id } = toast;
  //   const toastControls = {
  //     dismiss: () => dismissToast(id),
  //     bringToFront: () => bringToFront(id),
  //     update: (patch) => updateToast(id, patch),
  //   };
  //   const content = toast.content;
  //   if (React.isValidElement(content)) {
  //     return React.cloneElement(content, { toastControls });
  //   }
  //   return <div>{content}</div>;
  // };

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

  if (!React.isValidElement(content)) {
    return <div>{content}</div>;
  }

  // If content is a DOM element (type is string), do NOT pass custom props to it.
  const isDomElement = typeof content.type === "string";

  if (isDomElement) {
    // Option A: just render the DOM element unchanged
    return content;

    // Option B (if you need toastControls available to children inside a DOM element):
    // return React.cloneElement(content, {}, React.cloneElement(content.props.children, { toastControls }));
    // (only use if you know where to inject controls)
  }

  // For custom React components, clone and inject toastControls
  return React.cloneElement(content, { toastControls });
};

  const computeOffsetStyle = (opts) => {
    const style = {};
    if (opts.mt) style.marginTop = `${opts.mt}px`;
    if (opts.mb) style.marginBottom = `${opts.mb}px`;
    if (opts.ml) style.marginLeft = `${opts.ml}px`;
    if (opts.mr) style.marginRight = `${opts.mr}px`;
    return style;
  };

  const animClass = (key) => {
    if (!key) return "";
    const k = key.toLowerCase();
    if (k === "fl") return "utoast-anim-fl";
    if (k === "fr") return "utoast-anim-fr";
    if (k === "ft") return "utoast-anim-ft";
    if (k === "fb") return "utoast-anim-fb";
    return "";
  };

  /* -------------------------
     Grouping and render
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

  const showPinnedTab = stackHiddenRef.current && savedStackRef.current.length > 0;
  const portalRoot = typeof document !== "undefined" ? document.body : null;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {portalRoot && createPortal(
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
                    style={{ zIndex: t.z, ...computeOffsetStyle(t.opts), pointerEvents: "auto" }}
                    data-utoast-id={t.id}
                    tabIndex={0}
                  >
                    {renderContentWithControls(t)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Carousel viewport (top center) */}
          <div className="utoast-carousel-viewport" onMouseEnter={pauseCarousel} onMouseLeave={resumeCarousel}>
            <div className="utoast-carousel">
              {/* Scrollable track (left) */}
              <div className="utoast-carousel-scroll" ref={carouselScrollRef} aria-hidden={stackToasts.length === 0}>
                <div className="utoast-carousel-track">
                  {stackToasts.length === 0 ? null : stackToasts.map((item, i) => {
                    const thumbLabel = item.opts.thumbnail ? null : (item.opts.toastName || item.id.slice(-4));
                    return (
                      <div
                        key={`${item.id}_${i}`}
                        className="utoast-thumb"
                        onClick={() => { pauseCarousel(); handleThumbnailClick(item.id); }}
                        title={item.opts.toastName || item.id}
                        data-utoast-id={item.id}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pauseCarousel(); handleThumbnailClick(item.id); } }}
                      >
                        {item.opts.thumbnail ? <img src={item.opts.thumbnail} alt={item.opts.toastName || ""} /> : <span>{thumbLabel}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hamburger (right) — adjacent to the carousel track */}
              {stackToasts.length > 0 && (
                <div
                  className="utoast-hamburger"
                  role="button"
                  aria-label="Hide toast stack"
                  tabIndex={0}
                  onClick={() => { pauseCarousel(); hideStack(); }}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pauseCarousel(); hideStack(); } }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div className="line" />
                    <div className="line" />
                    <div className="line" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* HVC stack layer: render only the topmost toast (last item) */}
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
                      style={{ zIndex: t.z, transform: "translateY(0) scale(1)", ...computeOffsetStyle(t.opts), pointerEvents: "auto" }}
                      data-utoast-id={t.id}
                      tabIndex={0}
                      onClick={(ev) => {
                        if (t.opts && t.opts.IsToStick) { ev.stopPropagation(); return; }
                        const el = ev.currentTarget;
                        const hasInteractive = elementHasInteractive(el);
                        const hasDuration = t.opts.duration != null;
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
          {showPinnedTab && (
            <div className="utoast-pinned-tab" onClick={() => restoreStack()} role="button" aria-label="Restore toast stack" tabIndex={0} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); restoreStack(); } }}>
              <span>TOAST STACK</span>
            </div>
          )}
        </div>,
        portalRoot
      )}
    </ToastContext.Provider>
  );
}
