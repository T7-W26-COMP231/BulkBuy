// src/components/AuthTabs.jsx
/**
 * AuthTabs.jsx
 *
 * Clean, runnable Sign In / Sign Up component adapted from the PDF.
 * - Accepts `toastcontrols` (lowercase) injected by the toast provider when rendered inside a stack toast.
 * - Does NOT forward `toastcontrols` (or any unknown props) to DOM elements.
 * - Uses `onSignIn` and `onSignUp` callbacks (may return a Promise).
 * - Falls back to the global `useToast()` API for progress/result toasts when `toastcontrols` is not available.
 * - Expects ./AuthTabs.css to exist for styling.
 *
 * Props:
 *   - defaultIsLogin (boolean) default true
 *   - onSignIn(payload) optional callback
 *   - onSignUp(payload) optional callback
 *   - toastcontrols (object) optional — provider-injected (lowercase)
 *   - className, style
 *
 * Drop this file at src/components/AuthTabs.jsx
 */

import React, { useEffect, useRef, useState } from "react";
import { useToast } from "../../contexts/ToastProvider.jsx"; // adjust path if needed

import { useAuth } from "../../contexts/AuthContext.jsx";
import { useOpsContext } from "../../contexts/OpsContext.jsx";

// after successful login API returns { accessToken, refreshToken, user }
import { initSocket, identifyUserAfterLogin } from "../../comms-js/socket";

import "./AuthTabs.css";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const trim = (s) => (typeof s === "string" ? s.trim() : s);

function passwordStrength(pw) {
  const reasons = [];
  let score = 0;
  if (!pw || pw.length < 8) reasons.push("At least 8 characters");
  else score++;
  if (/[A-Z]/.test(pw)) score++;
  else reasons.push("Include an uppercase letter");
  if (/[a-z]/.test(pw)) score++;
  else reasons.push("Include a lowercase letter");
  if (/[0-9]/.test(pw)) score++;
  else reasons.push("Include a number");
  return { score: Math.min(score, 4), reasons };
}

export default function AuthTabs(props) {
  // Explicitly pick props we accept; do NOT spread `props` onto DOM nodes.
  const {
    defaultIsLogin = true,
    onSignIn = null,
    onSignUp = null,
    toastcontrols = null, // provider-injected lowercase prop
    className = "",
    style = {},
  } = props;

  const {
    showToast: globalShowToast,
    dismissToast: globalDismissToast,
    clearAll: globalClearAllToasts,
  } = useToast();

  const [isLogin, setIsLogin] = useState(Boolean(defaultIsLogin));

  // Sign-in state
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [siErrors, setSiErrors] = useState({});

  // Sign-up state
  const [suFirstName, setSuFirstName] = useState("");
  const [suLastName, setSuLastName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [suErrors, setSuErrors] = useState({});

  const [busy, setBusy] = useState(false);
  const emailInputRef = useRef(null);

  const { user, accessToken } = useAuth();
  const { ops_region, setOps_region, socket, setSocket, backendUrl } = useOpsContext();

  useEffect(() => {
    const t = setTimeout(() => {
      if (emailInputRef.current) emailInputRef.current.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [isLogin]);

  /* Validation helpers */
  const validateSignIn = () => {
    const errors = {};
    const email = trim(siEmail);
    const pw = siPassword || "";
    if (!email) errors.email = "Email is required";
    else if (!emailRegex.test(email)) errors.email = "Invalid email address";
    if (!pw) errors.password = "Password is required";
    setSiErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateSignUp = () => {
    const errors = {};
    const first = trim(suFirstName);
    const email = trim(suEmail);
    const pw = suPassword || "";
    const confirm = suConfirm || "";

    if (!first) errors.firstName = "First name is required";

    if (!email) errors.email = "Email is required";
    else if (!emailRegex.test(email)) errors.email = "Invalid email address";

    if (!pw) errors.password = "Password is required";
    else {
      const { score, reasons } = passwordStrength(pw);
      if (score < 3) errors.password = `Weak password: ${reasons.join(", ")}`;
    }

    if (!confirm) errors.confirm = "Please confirm your password";
    else if (pw !== confirm) errors.confirm = "Passwords do not match";

    setSuErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /* Toast helpers (robust) */
  const showProcessing = (title = "Processing…") => {
    // Try to update current toast via provider-injected controls
    if (toastcontrols && typeof toastcontrols.update === "function") {
      try {
        toastcontrols.update({
          content: (
            <div
              style={{
                padding: 12,
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  border: "4px solid rgba(0,0,0,0.12)",
                  borderTopColor: "#2563eb",
                  animation: "utoast-spin 800ms linear infinite",
                  boxSizing: "border-box",
                }}
              />
              <div>
                <strong>{title}</strong>
                <div style={{ marginTop: 6, fontSize: 13, color: "#444" }}>
                  Please wait…
                </div>
              </div>
            </div>
          ),
          duration: null,
          IsToStick: true,
        });
        return { usedUpdate: true, id: null };
      } catch {
        // fall through to global fallback
      }
    }

    // Fallback: create a global sticky toast and return its id
    if (typeof globalShowToast === "function") {
      const id = globalShowToast(
        <div
          style={{
            padding: 12,
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              border: "4px solid rgba(0,0,0,0.12)",
              borderTopColor: "#2563eb",
              animation: "utoast-spin 800ms linear infinite",
              boxSizing: "border-box",
            }}
          />
          <div>
            <strong>{title}</strong>
            <div style={{ marginTop: 6, fontSize: 13, color: "#444" }}>
              Please wait…
            </div>
          </div>
        </div>,
        {
          value: "HVC",
          IsToStack: false,
          IsToStick: true,
          duration: null,
          toastName: title,
        },
      );
      return { usedUpdate: false, id: id || null };
    }

    return { usedUpdate: false, id: null };
  };

  const dismissProcessing = (info) => {
    if (!info) return;
    if (info.usedUpdate) {
      if (toastcontrols && typeof toastcontrols.dismiss === "function") {
        try {
          toastcontrols.dismiss();
          return;
        } catch {
          // ignore
        }
      }
      return;
    }
    if (info.id && typeof globalDismissToast === "function") {
      try {
        globalDismissToast(info.id);
      } catch {
        // ignore
      }
    }
  };

  const showResult = (ok, title, message) => {
    const content = (
      <div style={{ padding: 12 }}>
        <strong>{title}</strong>
        {message && <div style={{ marginTop: 6 }}>{message}</div>}
      </div>
    );

    if (toastcontrols && typeof toastcontrols.update === "function") {
      try {
        toastcontrols.update({
          content,
          duration: ok ? 3500 : 5000,
          IsToStick: false,
        });
        return;
      } catch {
        // fallback
      }
    }

    if (typeof globalShowToast === "function") {
      globalShowToast(content, {
        value: "TR",
        IsToStack: false,
        duration: ok ? 3500 : 5000,
        toastName: title,
      });
    }
  };

  /* Submit handlers */
  const handleSignIn = async (e) => {
    e && e.preventDefault();
    if (!validateSignIn()) return;

    const payload = {
      email: trim(siEmail).toLowerCase(),
      password: siPassword,
    };
    setBusy(true);
    const proc = showProcessing("Signing in");

    try {
      const maybe = onSignIn && onSignIn(payload);
      const res = maybe && typeof maybe.then === "function" ? await maybe : maybe;

      dismissProcessing(proc);
      setBusy(false);

      if (res && res.ok) {
        showResult(true, `Welcome, ${res.user?.firstName || "User"}!`);
        setTimeout(() => {
          if (
            globalClearAllToasts &&
            typeof globalClearAllToasts === "function"
          )
            globalClearAllToasts();
        }, 3000);

        try {
          // socket.io
          // console.log("Socket Initialization s-in---> | ", ops_region, backendUrl); //--------------------------
          // if (socket) socket.close(); // close anonymouse socket connection to reinnitialise.
          // setSocket(initSocket(res.accessToken || null, { user: res.user, region: ops_region, url : backendUrl, getAuth: () => useAuth()}));
            
          console.log("Socket Initialization s-up---> | ", res.user.userId, backendUrl); //--------------------------
          identifyUserAfterLogin({token : res.accessToken, userId : res.user._id}, { user: user, region: ops_region, url : backendUrl, getAuth: () => useAuth()});
        } catch (error) {
          console.log("Socket Initializtion error ---> | ", error);
        }
      } else {
        showResult(
          false,
          "Sign in failed",
          (res && res.error) || "Invalid credentials",
        );
      }
    } catch (err) {
      dismissProcessing(proc);
      setBusy(false);
      showResult(false, "Sign in error", err?.message || "Unknown error");
    } finally {
      setSiPassword("");
    }
  };

  const handleSignUp = async (e) => {
    e && e.preventDefault();
    if (!validateSignUp()) return;

    const payload = {
      firstName: trim(suFirstName),
      lastName: trim(suLastName) || "",
      emails: [
        {
          address: trim(suEmail).toLowerCase(),
          verified: false,
          primary: true,
          verifiedAt: null,
        },
      ],
      password: suPassword,
      role: "customer",
    };

    setBusy(true);
    const proc = showProcessing("Creating account");

    try {
      const maybe = onSignUp && onSignUp(payload);
      const res = maybe && typeof maybe.then === "function" ? await maybe : maybe;

      dismissProcessing(proc);
      setBusy(false);

      if (res && res.ok) {
        showResult(
          true,
          "Account created",
          `Welcome, ${res.user?.firstName || "new user"}!`,
        );
        setTimeout(() => {
          if (
            globalClearAllToasts &&
            typeof globalClearAllToasts === "function"
          )
            globalClearAllToasts();
        }, 3000);

        try {
          console.log("Socket Initialization s-up---> | ", res.user.userId,  backendUrl); //--------------------------
          // socket.io
          // initSocket(res.accessToken || null, { user: user, region: ops_region, url : backendUrl});
          identifyUserAfterLogin({token : res.accessToken, userId : res.user._id }, { user: user, region: ops_region, url : backendUrl, getAuth: () => useAuth()});
        } catch (error) {
          console.log("Socket Initializtion error ---> | ", error);
        }

      } else {
        showResult(
          false,
          "Registration failed",
          (res && res.error) || "Registration error",
        );
      }
    } catch (err) {
      dismissProcessing(proc);
      setBusy(false);
      showResult(false, "Registration error", err?.message || "Unknown error");
    } finally {
      setSuPassword("");
      setSuConfirm("");
    }
  };
  const labelStyle = { display: 'block', textAlign: 'left', width: '100%', paddingLeft: '5px' };
  /* Render (note: we never spread `props` onto DOM elements) */
  return (
    <div
      className={`auth-tabs-folder ${className}`}
      style={{ width: 520, maxWidth: "calc(100% - 24px)", ...style, border : '1em solid #0fb3a6' }}
    >
      <div className="folder-flap" aria-hidden="true">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "100%",
            justifyContent: "flex-start",
          }}
        >
          <div
            style={{
              fontSize: 14,
              width: "fit-content",
              color: "#6b6b6b",
              fontWeight: 700,
            }}>
            {" "}
            [ Account ]{" "}
          </div>
          <div style={{ flex: 1 }} />
          <div
            className="markers"
            role="tablist"
            aria-label="Authentication tabs"
          >
            <button
              id="tab-signin"
              type="button"
              role="tab"
              aria-selected={isLogin}
              onClick={() => {
                setIsLogin(true);
                setSiErrors({});
              }}
              className={`auth-tab ${isLogin ? "active" : ""}`}
              style={{ ["--marker-color"]: "#0adbc6" }}
            >
              <span className="auth-tab-label">Sign In</span>
            </button>

            <button
              id="tab-signup"
              type="button"
              role="tab"
              aria-selected={!isLogin}
              onClick={() => {
                setIsLogin(false);
                setSuErrors({});
              }}
              className={`auth-tab ${!isLogin ? "active" : ""}`}
              style={{ ["--marker-color"]: "#0adbc6" }}
            >
              <span className="auth-tab-label">Sign Up</span>
            </button>
          </div>
        </div>
      </div>

      <div
        className="folder-body"
        role="tabpanel"
        aria-labelledby={isLogin ? "tab-signin" : "tab-signup"}
      >
        {isLogin ? (
          <form onSubmit={handleSignIn} aria-labelledby="tab-signin" noValidate>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label htmlFor="si-email" style={labelStyle}>Email</label>
                <input
                  id="si-email"
                  ref={emailInputRef}
                  value={siEmail}
                  onChange={(e) => setSiEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="alice@example.com"
                  disabled={busy}/>
                {siErrors.email && (
                  <div className="field-error" role="alert">
                    {siErrors.email}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="si-password" style={labelStyle}>Password</label>
                <input
                  id="si-password"
                  value={siPassword}
                  onChange={(e) => setSiPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  disabled={busy}/>
                {siErrors.password && (
                  <div className="field-error" role="alert">
                    {siErrors.password}
                  </div>
                )}
              </div>

              <div className="actions">
                <button
                  type="button"
                  onClick={() => {
                    setSiEmail("aisha.khan@bulkbuy.org");
                    setSiPassword("AdminPass!2026");
                  }}
                  className="btn"
                  disabled={busy}
                >
                  Fill demo
                </button>

                <button type="submit" className="btn primary" disabled={busy}>
                  Sign In
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignUp} aria-labelledby="tab-signup" noValidate>
            <div style={{ display: "grid", gap: 12 }}>
              <div className="two-col" role="group" aria-label="Name fields">
                <div>
                  <label htmlFor="su-first" className="required" style={labelStyle}>
                    First name
                  </label>
                  <input
                    id="su-first"
                    value={suFirstName}
                    onChange={(e) => setSuFirstName(e.target.value)}
                    placeholder="Alice"
                    aria-required="true"
                    required
                    type="text"
                    disabled={busy}
                  />
                  {suErrors.firstName && (
                    <div className="field-error" role="alert">
                      {suErrors.firstName}
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="su-last" style={labelStyle} >Last name (optional)</label>
                  <input
                    id="su-last"
                    value={suLastName}
                    onChange={(e) => setSuLastName(e.target.value)}
                    placeholder="Example"
                    type="text"
                    disabled={busy}
                  />
                  {suErrors.lastName && (
                    <div className="field-error" role="alert">
                      {suErrors.lastName}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="su-email" className="required" style={labelStyle}>Email</label>
                <input
                  id="su-email"
                  value={suEmail}
                  onChange={(e) => setSuEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  disabled={busy}
                />
                {suErrors.email && (
                  <div className="field-error" role="alert">
                    {suErrors.email}
                  </div>
                )}
              </div>

              <div
                className="two-col"
                role="group"
                aria-label="Password fields"
              >
                <div>
                  <label htmlFor="su-password" className="required" style={labelStyle}>Password</label>
                  <input
                    id="su-password"
                    value={suPassword}
                    onChange={(e) => setSuPassword(e.target.value)}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Create a strong password"
                    required
                    disabled={busy}
                  />
                  {suErrors.password && (
                    <div className="field-error" role="alert">
                      {suErrors.password}
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="su-confirm" className="required" style={labelStyle}>Confirm password</label>
                  <input
                    id="su-confirm"
                    value={suConfirm}
                    onChange={(e) => setSuConfirm(e.target.value)}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat your password"
                    required
                    disabled={busy}
                  />
                  {suErrors.confirm && (
                    <div className="field-error" role="alert">
                      {suErrors.confirm}
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div className="hint">
                  Password must be at least 8 characters and include uppercase,
                  lowercase, and a number.
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSuFirstName("Alice");
                      setSuLastName("Example");
                      setSuEmail("alice@example.com");
                      setSuPassword("Password123!");
                      setSuConfirm("Password123!");
                    }}
                    className="btn"
                    disabled={busy}
                  >
                    Fill demo
                  </button>

                  <button type="submit" className="btn primary" disabled={busy}>
                    Create account
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
