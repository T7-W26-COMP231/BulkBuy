import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useToast } from "../contexts/ToastProvider.jsx";
import AuthTabs from "./sign-in-up/AuthTabs.jsx";
import "./Navbar.css";

const GTA_CITIES = [
  "Toronto",
  "Scarborough",
  "Mississauga",
  "Brampton",
  "Markham",
  "Vaughan",
  "Richmond Hill",
  "Oakville",
  "Burlington",
  "Pickering",
  "Ajax",
  "Whitby",
  "Oshawa",
  "Milton",
  "Newmarket",
  "Aurora",
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

  const { user, signOut, signIn, signUp } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (detectedCity) {
      setSelected(detectedCity);
      sessionStorage.setItem("detectedCity", detectedCity);
    }
  }, [detectedCity]);

  useEffect(() => {
    const handler = (e) => {
      if (cityRef.current && !cityRef.current.contains(e.target)) {
        setOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
      await signOut?.();
      try {
        showToast(
          <div style={{ padding: 12 }}>
            <strong>Signed out</strong>
          </div>,
          {
            value: "TR",
            IsToStack: false,
            duration: 2500,
            toastName: "Signed out",
          }
        );
      } catch (tErr) {
        console.error("showToast error:", tErr);
      }
    } catch (err) {
      console.error("signOut error:", err);
      try {
        showToast(
          <div style={{ padding: 12 }}>
            <strong>Sign out failed</strong>
            <div style={{ marginTop: 6 }}>
              {err?.message || "Unknown error"}
            </div>
          </div>,
          {
            value: "TR",
            IsToStack: false,
            duration: 4000,
            toastName: "Sign out failed",
          }
        );
      } catch (tErr) {
        console.error("showToast error:", tErr);
      }
    }
  };

  function ToastAuthWrapper({ toastcontrols }) {
    const { signIn: ctxSignIn, signUp: ctxSignUp } = useAuth();
    const { showToast: globalShow } = useToast();
    const [busy, setBusy] = useState(false);

    const signInHandler = ctxSignIn ?? signIn;
    const signUpHandler = ctxSignUp ?? signUp;

    const handleSignIn = async (payload) => {
      if (!signInHandler) {
        globalShow(
          <div style={{ padding: 12 }}>
            <strong>Auth unavailable</strong>
          </div>,
          { value: "TR", IsToStack: false }
        );
        return { ok: false, error: "Auth unavailable" };
      }

      setBusy(true);
      try {
        const res =
          typeof payload === "function"
            ? await payload(signInHandler)
            : await signInHandler(payload);

        setBusy(false);
        toastcontrols?.dismiss?.();
        return res;
      } catch (err) {
        setBusy(false);
        console.error("handleSignIn error:", err);

        try {
          toastcontrols?.update?.({
            content: (
              <div style={{ padding: 12 }}>
                <strong>Sign in error</strong>
                <div style={{ marginTop: 6 }}>
                  {err?.message || "Unknown error"}
                </div>
              </div>
            ),
          });
        } catch (uErr) {
          console.error("toastcontrols.update error:", uErr);
        }

        globalShow(
          <div style={{ padding: 12 }}>
            <strong>Sign in error</strong>
            <div style={{ marginTop: 6 }}>
              {err?.message || "Unknown error"}
            </div>
          </div>,
          { value: "TR", IsToStack: false, duration: 4000 }
        );

        return { ok: false, error: err?.message || "Sign in error" };
      }
    };

    const handleSignUp = async (payload) => {
      if (!signUpHandler) {
        globalShow(
          <div style={{ padding: 12 }}>
            <strong>Auth unavailable</strong>
          </div>,
          { value: "TR", IsToStack: false }
        );
        return { ok: false, error: "Auth unavailable" };
      }

      setBusy(true);
      try {
        const res =
          typeof payload === "function"
            ? await payload(signUpHandler)
            : await signUpHandler(payload);

        setBusy(false);
        toastcontrols?.dismiss?.();
        return res;
      } catch (err) {
        setBusy(false);
        console.error("handleSignUp error:", err);

        try {
          toastcontrols?.update?.({
            content: (
              <div style={{ padding: 12 }}>
                <strong>Registration error</strong>
                <div style={{ marginTop: 6 }}>
                  {err?.message || "Unknown error"}
                </div>
              </div>
            ),
          });
        } catch (uErr) {
          console.error("toastcontrols.update error:", uErr);
        }

        globalShow(
          <div style={{ padding: 12 }}>
            <strong>Registration error</strong>
            <div style={{ marginTop: 6 }}>
              {err?.message || "Unknown error"}
            </div>
          </div>,
          { value: "TR", IsToStack: false, duration: 4000 }
        );

        return { ok: false, error: err?.message || "Registration error" };
      }
    };

    return (
      <div
        style={{
          minWidth: 420,
          position: "relative",
          textAlign: "center",
          borderRight: "1px solid black",
          borderRadius: "5px",
        }}
      >
        <AuthTabs
          defaultIsLogin={true}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
          toastcontrols={{ ...toastcontrols }}
        />
        {busy && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                padding: 12,
                background: "#fff",
                borderRadius: 8,
                boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
              }}
            >
              Processing…
            </div>
          </div>
        )}
      </div>
    );
  }

  const openAuthToast = () => {
    try {
      showToast(<ToastAuthWrapper />, {
        value: "HVC",
        IsToStack: true,
        toastName: "Auth",
        AllowedMultiple: false,
        IsToStick: true,
        blurBg: true,
        duration: null,
        animate: "TR",
      });
    } catch (err) {
      console.error("openAuthToast showToast error:", err);
    }
  };

  const displayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
    : null;
  const email = user?.emails?.[0]?.address ?? null;
  const avatarSrc = user?.avatar ?? "https://via.placeholder.com/40?text=U";

  return (
    <header className="border-b border-neutral-light bg-white px-4 py-3 md:px-10 lg:px-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-text-main">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-text-main">
              <span className="material-symbols-outlined">layers</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight">BulkBuy</h2>
          </Link>

          {showLocation && (
            <div className="relative hidden md:flex" ref={cityRef}>
              <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="city-trigger flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-gray-100"
                aria-haspopup="listbox"
                aria-expanded={open}
              >
                <span className="material-symbols-outlined text-primary">
                  location_on
                </span>
                <span className="text-sm font-semibold">{selected}</span>
                <span
                  className="material-symbols-outlined text-xs transition-transform duration-200"
                  style={{
                    transform: open ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  expand_more
                </span>
              </button>

              {open && (
                <div className="city-menu absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  <div className="max-h-64 overflow-y-auto py-1">
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
                            visibility:
                              selected === city ? "visible" : "hidden",
                          }}
                        >
                          check
                        </span>
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>)}
          {label && (
            <span className="hidden text-sm font-semibold text-text-muted md:flex">
              {label}
            </span>
          )}
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
                onChange={(e) => {
                  if (typeof onSearch === "function") onSearch(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/notifications"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-light transition-colors hover:bg-primary/20"
            >
              <span className="material-symbols-outlined">notifications</span>
            </Link>

            <Link
              to="/cart"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-light transition-colors hover:bg-primary/20"
            >
              <span className="material-symbols-outlined">shopping_cart</span>
            </Link>

            <div className="relative" ref={profileRef}>
              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => setProfileOpen((s) => !s)}
                    className="size-10 overflow-hidden rounded-full border-2 border-primary focus:outline-none"
                    aria-haspopup="true"
                    aria-expanded={profileOpen}
                  >
                    <img
                      className="h-full w-full object-cover"
                      src={avatarSrc}
                      alt={displayName || "User avatar"}
                    />
                  </button>

                  {profileOpen && (
                    <div className="profile-menu absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                      <div className="border-b border-gray-100 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={avatarSrc}
                            alt="avatar"
                            className="h-10 w-10 rounded-full object-cover"
                          />
                          <div>
                            <div className="text-sm font-semibold">
                              {displayName || "User"}
                            </div>
                            {email && (
                              <div className="truncate text-xs text-text-muted">
                                {email}
                              </div>
                            )}
                            {user?.role && (
                              <div className="mt-1 text-xs text-text-muted">
                                {user.role}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="py-1">
                        <Link
                          to="/profile"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setProfileOpen(false)}
                        >
                          Profile
                        </Link>
                        <Link
                          to="/orders"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setProfileOpen(false)}
                        >
                          Orders
                        </Link>
                        <Link
                          to="/settings"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => setProfileOpen(false)}
                        >
                          Settings
                        </Link>
                      </div>

                      <div className="border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            handleSignOut();
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
                        >
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={openAuthToast}
                  className="inline-flex items-center gap-2 rounded-md px-3 py-1 transition-colors hover:bg-gray-100"
                >
                  <span className="text-sm font-semibold">
                    Sign in / Register
                  </span>
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