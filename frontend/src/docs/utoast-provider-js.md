### Overview

**utoast-provider-js** is a lightweight React provider for rendering arbitrary React nodes as transient overlays (toasts). It displays supplied components at configurable placements with optional animations, margins, and stack semantics.  

> "utoast-provider-js is a universal React JS provider that renders any React node as a transient overlay (toast) without managing the node's internal state." 

This document summarizes the provider’s data model, public API, runtime behavior, UI patterns, and integration guidance so you can implement, test, or consume the provider consistently.

---

### Data Model

**Toast object**
- **id** — unique string identifier.
- **content** — the React node to render (the provider clones and injects controls).
- **opts** — options object (placement, animation, duration, margins, etc.).
- **z** — numeric z-index used for ordering.
- **createdAt** — timestamp.

**Options accepted by `showToast`**
- **value** — placement string (case-insensitive): `TR`, `TL`, `BR`, `BL`, `HVC`.
- **IsToStack** — `boolean`. `true` makes the toast part of the HVC stack (deck).
- **duration** — milliseconds or `null` for persistent.
- **thumbnail** — optional URL used by the HVC carousel.
- **animate** — animation key (examples: `FL`, `FR`, `FT`, `FB`; provider supports up to ~10 keys).
- **mt / mb / ml / mr** — numeric pixel offsets to nudge placement.

**Meaning of margin keys**
- **mt** pushes the element down from its computed top edge.
- **mb** pushes the element up from its computed bottom edge.
- **ml** pushes the element right from its computed left edge.
- **mr** pushes the element left from its computed right edge.

---

### Public API and toastControls

**Context API (exposed by provider)**
- **`showToast(content, opts) -> id`**  
  Add a toast. If `IsToStack` is `true` and the stack is hidden, the provider restores the stack before adding the new toast.
- **`dismissToast(id)`**  
  Remove a toast by id.
- **`bringToFront(id)`**  
  Raise a toast’s z so it becomes topmost.
- **`updateToast(id, patch)`**  
  Merge `patch` into the toast object (change thumbnail, duration, content, etc.).
- **`clearAll()`**  
  Remove all toasts.
- **`hideStack()`**  
  Snapshot stack items, move them behind the app (low z), and remove the carousel.
- **`restoreStack()`**  
  Restore saved stack items to HVC and bring the last saved item to front.

**Controls injected into rendered components**
When you pass a React element to `showToast`, the provider clones it and injects a `toastControls` prop with:
- **`toastControls.dismiss()`** — remove this toast.
- **`toastControls.bringToFront()`** — raise this toast to top.
- **`toastControls.update(patch)`** — update this toast’s opts or content.

This lets embedded components manage their own lifecycle (for example, a sign-in form can call `toastControls.dismiss()` after success).

---

### UI Patterns and Behavior

**Transparent container and visual treatment**
- Provider DOM is transparent; only the supplied component is visually emphasized.
- Each toast is wrapped with a subtle glowing border and shadow so the component stands out without imposing a background.

**Corner toasts**
- `TR`, `TL`, `BR`, `BL` are rendered in fixed corner containers stacked vertically.
- Corner containers use `aria-live="polite"` and `role="status"` for accessibility.

**Centered stack and carousel (HVC)**
- `HVC` toasts render centered and stack like cards.
- When multiple HVC toasts exist, the provider shows a top carousel occupying ~80% viewport width.
- **Carousel features**
  - Seamless auto-loop horizontally.
  - Pause on hover and on thumbnail click.
  - Thumbnail click calls `bringToFront(id)` and pauses the loop.
  - Toggle control hides the entire stack layer by calling `hideStack()`.
  - Carousel disappears automatically when the stack becomes empty.
- When the stack is hidden a right-side pinned tab appears; clicking it calls `restoreStack()`.

**Outside click behavior**
- Clicking outside a visible toast peels/dismisses the front layer:
  - For corner toasts, outside click dismisses that toast.
  - For HVC stack, clicking outside the top card dismisses the topmost card (or peels the stack layer depending on configuration).
- The provider does **not** manage the internal state of the embedded component; it only removes the wrapper and unmounts the node.

---

### Animations and Placement

**Animation keys**
- Provider maps animation keys to entry/exit transforms and opacity. Example mappings:
  - **`FL`** — Flash from Left: `translateX(-20px)` → `translateX(0)` + fade.
  - **`FR`** — Flash from Right: `translateX(20px)` → `translateX(0)` + fade.
  - **`FT`** — Flash from Top: `translateY(-20px)` → `translateY(0)` + fade.
  - **`FB`** — Flash from Bottom: `translateY(20px)` → `translateY(0)` + fade.
- Animations are applied on mount and can be paused or overridden by CSS.

**Placement calculation**
- Base placement from `value`:
  - `TR` → `top: 0; right: 0;`
  - `TL` → `top: 0; left: 0;`
  - `BR` → `bottom: 0; right: 0;`
  - `BL` → `bottom: 0; left: 0;`
  - `HVC` → `left: 50%; top: 50%; transform: translate(-50%, -50%);`
- After base placement, apply `mt`, `mb`, `ml`, `mr` offsets.

---

### Lifecycle, Stacking, and Edge Cases

**Z ordering**
- Provider uses a monotonic `zRef` counter to assign `z` values. `bringToFront` increments `zRef` and updates the toast.

**Hide and restore stack semantics**
- **`hideStack()`**
  - Snapshot all `IsToStack` toast ids and their opts.
  - Set their `z` to a low value (e.g., `-1000`) so they are behind the app.
  - Remove carousel DOM and set `stackHidden = true`.
- **`restoreStack()`**
  - Reassign saved toasts to `HVC` placement and fresh `z` values.
  - Bring the last saved toast to front.
  - Clear saved snapshots and set `stackHidden = false`.
- Only two actions restore a hidden stack:
  - Clicking the right-side pinned tab.
  - Creating a new stackable toast via `showToast` (provider restores first, then adds).

**Concurrency and race conditions**
- `showToast` checks `stackHidden` and calls `restoreStack` synchronously before adding a new stackable toast.
- `hideStack` is a no-op if no stackable toasts exist.

**Edge cases**
- Missing thumbnails: carousel shows an id placeholder.
- Many toasts: provider should virtualize or limit carousel thumbnails if necessary.
- Embedded components that rely on focus must manage focus themselves; provider does not steal focus.

---

### Integration and Usage Examples

**Suggested file layout**
- `src/ToastProvider.jsx` — provider and internal components.
- `src/App.jsx` — demo app that imports provider and uses `useToast`.
- `src/main.jsx` — app entry that renders `App`.

**Minimal usage**
```jsx
import ToastProvider, { useToast } from "./ToastProvider.jsx";

function Demo() {
  const { showToast } = useToast();
  function openSignIn() {
    showToast(<SignInComponent />, { value: "HVC", IsToStack: true, animate: "FT" });
  }
  return <button onClick={openSignIn}>Open Sign In</button>;
}
```

**How embedded components control their toast**
```jsx
function SignIn({ toastControls }) {
  function onSubmit() {
    // handle form then dismiss
    toastControls.dismiss();
  }
  return <form onSubmit={onSubmit}> ... </form>;
}
```

**Full option example**
- Corner toast:
  ```js
  showToast(<div>Top Right</div>, { value: "TR", IsToStack: false, duration: 5000, animate: "FL", mt: 8, mr: 12 });
  ```
- Centered stack item:
  ```js
  showToast(<SignIn />, { value: "HVC", IsToStack: true, thumbnail: "/avatar.png", animate: "FT" });
  ```

---

### Testing Checklist

- **show / dismiss / update** operations work as expected.
- **hideStack / restoreStack** roundtrip preserves opts and ordering.
- Creating a new stackable toast restores a hidden stack before adding.
- Carousel auto-loop, pause on hover, and thumbnail click bring toast forward.
- Outside click dismiss behavior for corner and center toasts.
- Keyboard accessibility for carousel, toggle, and pinned tab.
- Behavior under many toasts (virtualization or thumbnail limits).
- Focus behavior for embedded components (provider must not steal focus).

---

