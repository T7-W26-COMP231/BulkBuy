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

export default function Navbar({ detectedCity, onCityChange, locationLabel, onSearch }) {
  const [selected, setSelected] = useState("Toronto");
  const [open, setOpen] = useState(false);
  const cityRef = useRef(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const { user, signOut, signIn, signUp } = useAuth();
  const { showToast, clearAll } = useToast();

  useEffect(() => {
    if (detectedCity) setSelected(detectedCity);
  }, [detectedCity]);

  useEffect(() => {
    const handler = (e) => {
      if (cityRef.current && !cityRef.current.contains(e.target))
        setOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target))
        setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
          },
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
          },
        );
      } catch (tErr) {
        console.error("showToast error:", tErr);
      }
    }
  };

  // Toast wrapper that uses AuthProvider directly and forwards handlers into AuthTabs
  function ToastAuthWrapper({ toastcontrols }) {
    const { signIn: ctxSignIn, signUp: ctxSignUp } = useAuth();
    const { showToast: globalShow } = useToast();
    const [busy, setBusy] = useState(false);

    // Prefer context signIn/signUp (should be available because AuthProvider wraps ToastProvider)
    const signInHandler = ctxSignIn ?? signIn;
    const signUpHandler = ctxSignUp ?? signUp;

    const handleSignIn = async (payload) => {
      if (!signInHandler) {
        globalShow(
          <div style={{ padding: 12 }}>
            <strong>Auth unavailable</strong>
          </div>,
          { value: "TR", IsToStack: false },
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
        try {
          toastcontrols?.dismiss?.();
        } catch (e) {
          /* ignore */
        }
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
          { value: "TR", IsToStack: false, duration: 4000 },
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
          { value: "TR", IsToStack: false },
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
        try {
          toastcontrols?.dismiss?.();
        } catch (e) {
          /* ignore */
        }
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
          { value: "TR", IsToStack: false, duration: 4000 },
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
          backgroundColor: "blur",
          borderRight: "1px solid black",
          borderRadius: "5px"
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
    <header className="border-b border-neutral-light bg-white px-6 py-3 md:px-20 lg:px-40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2 text-text-main">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-text-main">
              <span className="material-symbols-outlined">layers</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight">BulkBuy</h2>
          </Link>

          <div className="relative hidden md:flex" ref={cityRef}>
            <button
              onClick={() => setOpen((o) => !o)}
              className="cursor-pointer flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-100 transition-colors"
            >
              <span className="material-symbols-outlined text-primary">
                location_on
              </span>
              <span className="text-sm font-semibold">{selected}</span>
              <span
                className="material-symbols-outlined text-xs transition-transform duration-200"
                style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                expand_more
              </span>
            </button>

            {open && (
              <div className="absolute top-full left-0 z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                <div className="py-1 max-h-64 overflow-y-auto">
                  {GTA_CITIES.map((city) => (
                    <button
                      key={city}
                      onClick={() => {
                        setSelected(city);
                        setOpen(false);
                        onCityChange?.(city);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2
                        ${selected === city ? "font-semibold text-primary bg-blue-50" : "text-gray-700"}`}
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
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-4 md:gap-6">
          <div className="hidden max-w-sm flex-1 sm:flex">
            <div className="flex h-10 w-full items-stretch rounded-lg bg-neutral-light px-3">
              <span className="material-symbols-outlined self-center text-text-muted">
                search
              </span>
              <input
                className="w-full border-none bg-transparent text-sm placeholder:text-text-muted focus:ring-0 focus:outline-none"
                placeholder="Search bulk deals..."
                type="text"
                onChange={(e) => {
                  if (typeof onSearch === "function") {
                    onSearch(e.target.value);
                  }
                }}
              />
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <Link
              to="/notifications"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-light transition-colors hover:bg-primary/20"
            >
              <span className="material-symbols-outlined">notifications</span>
            </Link>
            <Link to="/cart" className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-light transition-colors hover:bg-primary/20">
              <span className="material-symbols-outlined">shopping_cart</span>
            </Link>

            <div className="relative" ref={profileRef}>
              {user ? (
                <>
                  <button
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
                    <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100">
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
                              <div className="text-xs text-text-muted truncate">
                                {email}
                              </div>
                            )}
                            {user?.role && (
                              <div className="text-xs text-text-muted mt-1">
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
                          onClick={() => {
                            setProfileOpen(false);
                            handleSignOut();
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
                        >
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <button
                  onClick={openAuthToast}
                  className="inline-flex items-center gap-2 rounded-md px-3 py-1 hover:bg-gray-100 transition-colors"
                >
                  <span className="text-sm font-semibold">
                    Sign in / Register
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
