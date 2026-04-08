// src/components/Navbar.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useToast } from "../contexts/ToastProvider.jsx";
import AuthTabs from "./sign-in-up/AuthTabs.jsx";
import "./Navbar.css";

/**
 * Navbar.jsx
 *
 * - Complete, self-contained navbar component.
 * - Defensive: dropdowns, search, notifications, cart, and sign-in/register are interactive
 *   when the toast blur overlay is not active, and sit under the overlay when it is active.
 * - Watches html.utoast-blur class to sync header z-index deterministically.
 * - Uses stopPropagation and explicit type="button" to avoid accidental form submissions or global handlers.
 */

const GTA_CITIES = [
  "Toronto", "Scarborough", "Mississauga", "Brampton", "Markham", "Vaughan", "Richmond Hill",
  "Oakville", "Burlington", "Pickering", "Ajax", "Whitby", "Oshawa", "Milton", "Newmarket", "Aurora",
];

export default function Navbar({
  detectedCity,
  onCityChange,
  showLocation = true,
  label,
  onSearch,
}) {
  const [selected, setSelected] = useState(() => {
    return sessionStorage.getItem("detectedCity") || "Scarborough";
  });
  const [open, setOpen] = useState(false);
  const cityRef = useRef(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const [mobileOpen, setMobileOpen] = useState(false);

  const headerRef = useRef(null);

  const { user, accessToken, signOut } = useAuth();
  const { showToast, clearAll } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (detectedCity) {
      setSelected(detectedCity);
      sessionStorage.setItem("detectedCity", detectedCity);
    }
  }, [detectedCity]);

  // Outside click + Escape closes dropdowns
  useEffect(() => {
    const onDocClick = (e) => {
      if (cityRef.current && !cityRef.current.contains(e.target)) setOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Close profile menu when user signs out
  useEffect(() => {
    if (!user) setProfileOpen(false);
  }, [user]);

  // Deterministic header z-index sync with html.utoast-blur
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const getBase = () => {
      try {
        const raw = getComputedStyle(document.documentElement).getPropertyValue("--utoast-z-base");
        const parsed = parseInt(raw || "", 10);
        return Number.isFinite(parsed) ? parsed : 10000;
      } catch {
        return 10000;
      }
    };

    const apply = () => {
      const blurActive = document.documentElement.classList.contains("utoast-blur");
      const base = getBase();
      if (blurActive) {
        // header under overlay while blur active
        el.style.zIndex = String(base - 200);
      } else {
        // header above normal page content but below toasts
        el.style.zIndex = String(base - 120);
      }
    };

    apply();
    const mo = new MutationObserver(() => apply());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  const handleCitySelect = (city) => {
    setSelected(city);
    sessionStorage.setItem("detectedCity", city);
    setOpen(false);
    setMobileOpen(false);
    if (typeof onCityChange === "function") onCityChange(city);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      try { clearAll(); } catch { }
      showToast(() => <div style={{ padding: 12 }}><strong>Signed out</strong></div>, { value: "TR", IsToStack: false, duration: 2500, toastName: "Signed out", mt: '2em' });
      window.location.href = "/";
    } catch (err) {
      console.error("signOut error:", err);
      showToast(() => (
        <div style={{ padding: 12 }}>
          <strong>Sign out failed</strong>
          <div style={{ marginTop: 6 }}>{(err && err.message) ?? "Unknown error"}</div>
        </div>
      ), { value: "TR", IsToStack: false, duration: 4000, toastName: "Sign out failed", mt: '2em' });
    }
  };

  // Toast-auth wrapper used inside the toast
  function ToastAuthWrapper({ toastControls, navigate }) {
    const { signIn: ctxSignIn, signUp: ctxSignUp } = useAuth();
    const { showToast: globalShow } = useToast();
    const [busy, setBusy] = useState(false);

    const handleSignIn = async (payload) => {
      if (!ctxSignIn) return { ok: false, error: "Auth unavailable" };
      setBusy(true);
      try {
        const res = await ctxSignIn(payload);
        setBusy(false);
        try { toastControls?.dismiss?.(); } catch { }

        // added this for supplier

        if (res?.user?.role === "administrator") {
          try { clearAll(); } catch { }
          navigate("/admin");
          return { ok: true, user: res.user };
        }

        // added this for supplier

        if (res?.user?.role === "supplier") {
          try { clearAll(); } catch { }
          navigate("/supplier");
          return { ok: true, user: res.user };
        }

        return res;
      } catch (err) {
        setBusy(false);
        globalShow(() => (
          <div style={{ padding: 12 }}>
            <strong>Sign in error</strong>
            <div style={{ marginTop: 6 }}>{err?.message ?? "Unknown error"}</div>
          </div>
        ), { value: "TR", IsToStack: false, duration: 4000, mt: '2em' });
        return { ok: false, error: err?.message ?? "Sign in error" };
      }
    };

    const handleSignUp = async (payload) => {
      if (!ctxSignUp) return { ok: false, error: "Auth unavailable" };
      setBusy(true);
      try {
        const res = await ctxSignUp(payload);
        setBusy(false);
        try { toastControls?.dismiss?.(); } catch { }
        return res;
      } catch (err) {
        setBusy(false);
        globalShow(() => (
          <div style={{ padding: 12 }}>
            <strong>Registration error</strong>
            <div style={{ marginTop: 6 }}>{err?.message ?? "Unknown error"}</div>
          </div>
        ), { value: "TR", IsToStack: false, duration: 4000, mt: '2em' });
        return { ok: false, error: err?.message ?? "Registration error" };
      }
    };

    return (
      <div style={{ position: "relative", textAlign: "center", backgroundColor: "transparent", borderRadius: 10, minWidth: 320 }}>
        <AuthTabs defaultIsLogin={true} onSignIn={handleSignIn} onSignUp={handleSignUp} toastControls={toastControls} />
        {busy && (
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ padding: 12, background: "#fff", borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.08)" }}>Processing ...</div>
          </div>
        )}
      </div>
    );
  }

  const openAuthToast = () => {
    try {
      showToast(
        ({ toastControls }) => <ToastAuthWrapper toastControls={toastControls} navigate={navigate} />,
        { value: "HVC", IsToStack: true, toastName: "Auth", AllowedMultiple: false, IsToStick: true, blurBg: true, duration: null, animate: "TR" }
      );
    } catch (err) {
      console.error("openAuthToast showToast error:", err);
    }
  };

  const displayName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : null;
  const email = user?.emails?.[0]?.address ?? null;
  const avatarSrc = user?.avatar ?? "https://via.placeholder.com/40?text=U";

  return (
    <header ref={headerRef} className="border-b border-neutral-light bg-white px-6 py-3 md:px-20 lg:px-40" style={{ position: "relative", pointerEvents: "auto" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2 text-text-main" aria-label="Home">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-text-main">
              <span className="material-symbols-outlined">layers</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight">BulkBuy</h2>
          </Link>

          <div className="relative hidden md:flex" ref={cityRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
              className="cursor-pointer flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-100 transition-colors"
              aria-haspopup="true"
              aria-expanded={open}
              type="button"
            >
              <span className="material-symbols-outlined text-primary">location_on</span>
              <span className="text-sm font-semibold">{selected}</span>
              <span className="material-symbols-outlined text-xs transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
                expand_more
              </span>
            </button>

            {open && (
              <div className="absolute top-full left-0 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden" style={{ zIndex: 1400 }}>
                <div className="py-1 max-h-64 overflow-y-auto">
                  {GTA_CITIES.map((city) => (
                    <button
                      key={city}
                      onClick={(e) => { e.stopPropagation(); setSelected(city); setOpen(false); if (typeof onCityChange === "function") onCityChange(city); }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 ${selected === city ? "font-semibold text-primary bg-blue-50" : "text-gray-700"}`}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-base" style={{ visibility: selected === city ? "visible" : "hidden" }}>check</span>
                      {city}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="hidden flex-1 items-center justify-end gap-4 md:flex">
          <div className="max-w-sm flex-1">
            <div className="flex h-10 w-full items-stretch rounded-lg bg-neutral-light px-3">
              <span className="material-symbols-outlined self-center text-text-muted">
                search
              </span>
              <input
                className="w-full border-none bg-transparent text-sm placeholder:text-text-muted focus:outline-none focus:ring-0"
                placeholder="Search bulk deals..."
                type="text"
                onChange={(e) => { if (typeof onSearch === "function") onSearch(e.target.value); }}
                aria-label="Search"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Link to="/notifications" className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-light transition-colors hover:bg-primary/20" aria-label="Notifications">
              <span className="material-symbols-outlined">notifications</span>
            </Link>

            {
              window.location.pathname !== "/cart" &&
              <Link to={accessToken ? '/cart' : '/'} className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-light transition-colors hover:bg-primary/20" aria-label="Cart">
                <span className="material-symbols-outlined">shopping_cart</span>
              </Link>
            }

            <div className="relative" ref={profileRef}>
              {user ? (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setProfileOpen((s) => !s); }}
                    className="size-10 overflow-hidden rounded-full border-2 border-primary focus:outline-none"
                    aria-haspopup="true"
                    aria-expanded={profileOpen}
                    type="button"
                  >
                    <img className="h-full w-full object-cover" src={avatarSrc} alt={displayName ?? "User avatar"} />
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden" style={{ zIndex: 1400 }}>
                      <div className="px-4 py-3 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                          <img src={avatarSrc} alt="avatar" className="h-10 w-10 rounded-full object-cover" />
                          <div style={{ minWidth: 0 }}>
                            <div className="text-sm font-semibold">{displayName ?? "User"}</div>
                            {email && <div className="text-xs text-text-muted truncate">{email}</div>}
                            {user?.role && <div className="text-xs text-text-muted mt-1">{user.role}</div>}
                          </div>
                        </div>
                      </div>

                      <div className="py-1">
                        <Link to="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setProfileOpen(false)}>Profile</Link>
                        <Link to="/orders" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setProfileOpen(false)}>Orders</Link>
                        <Link to="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setProfileOpen(false)}>Settings</Link>
                      </div>

                      <div className="border-t border-gray-100">
                        <button onClick={() => { setProfileOpen(false); handleSignOut(); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50" type="button">Sign out</button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <button onClick={openAuthToast} className="inline-flex items-center gap-2 rounded-md px-3 py-1 hover:bg-gray-100 transition-colors" type="button">
                  <span className="text-sm font-semibold">Sign in / Register</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <Link
            to="/cart"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-light transition-colors hover:bg-primary/20"
          >
            <span className="material-symbols-outlined text-xl">
              shopping_cart
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen((s) => !s)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-light transition-colors hover:bg-primary/20"
            aria-label="Toggle menu"
          >
            <span className="material-symbols-outlined text-xl">
              {mobileOpen ? "close" : "menu"}
            </span>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3 md:hidden">
          <div className="flex h-10 w-full items-stretch rounded-lg bg-neutral-light px-3">
            <span className="material-symbols-outlined self-center text-text-muted">
              search
            </span>
            <input
              className="w-full border-none bg-transparent text-sm placeholder:text-text-muted focus:outline-none focus:ring-0"
              placeholder="Search bulk deals..."
              type="text"
              onChange={(e) => {
                if (typeof onSearch === "function") onSearch(e.target.value);
              }}
            />
          </div>
          {showLocation && (
            <div>
              <p className="mb-1 px-1 text-xs font-semibold text-text-muted">
                Location
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                {GTA_CITIES.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => handleCitySelect(city)}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${selected === city
                      ? "bg-blue-50 font-semibold text-primary"
                      : "text-gray-700"
                      }`}
                  >
                    <span
                      className="material-symbols-outlined text-base"
                      style={{
                        visibility: selected === city ? "visible" : "hidden",
                      }}
                    >
                      check
                    </span>
                    {city}
                  </button>
                ))}
              </div>
            </div>)}

          <div className="flex flex-col">
            <Link
              to="/notifications"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setMobileOpen(false)}
            >
              <span className="material-symbols-outlined text-base">
                notifications
              </span>
              Notifications
            </Link>

            <Link
              to="/profile"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setMobileOpen(false)}
            >
              <span className="material-symbols-outlined text-base">person</span>
              Profile
            </Link>

            <Link
              to="/orders"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setMobileOpen(false)}
            >
              <span className="material-symbols-outlined text-base">
                receipt_long
              </span>
              Orders
            </Link>

            <Link
              to="/settings"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setMobileOpen(false)}
            >
              <span className="material-symbols-outlined text-base">
                settings
              </span>
              Settings
            </Link>
          </div>

          <div className="border-t border-gray-100 pt-2">
            {user ? (
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <img
                    src={avatarSrc}
                    alt="avatar"
                    className="h-8 w-8 rounded-full border border-primary object-cover"
                  />
                  <div>
                    <div className="text-sm font-semibold">
                      {displayName || "User"}
                    </div>
                    {email && (
                      <div className="text-xs text-text-muted">{email}</div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    handleSignOut();
                  }}
                  className="rounded-md px-3 py-1 text-sm text-red-600 hover:bg-gray-50"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  openAuthToast();
                }}
                className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Sign in / Register
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}