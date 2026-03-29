// src/contexts/AuthContext.jsx
/**
 * AuthContext.jsx
 *
 * Real-API-ready authentication context (surgically enhanced).
 *
 * Changes from the original:
 *  - Adds optional lifecycle callbacks so other contexts (e.g., OpsContext)
 *    can react to auth lifecycle events without tight coupling.
 *    Props:
 *      - onInit(session)         -> called once after provider restores session on mount
 *      - onSignIn(session)       -> called after successful sign-in
 *      - onSignUp(session)       -> called after successful sign-up
 *      - onSignOut()             -> called after sign-out completes (local cleanup done)
 *      - onRefresh(session)      -> called after successful refreshSession
 *
 *  - These callbacks are invoked asynchronously and never block the auth flow.
 *  - This keeps AuthProvider self-contained while allowing OpsContext (or any
 *    other consumer) to fetch orders/products or clear state when auth changes.
 *
 * Usage (example):
 *  <AuthProvider
 *    apiBaseUrl="https://api.example.com"
 *    endpoints={...}
 *    onInit={(session) => { fetchInitialProducts(); }}
 *    onSignIn={(session) => { fetchOrdersForUser(session.user); }}
 *    onSignOut={() => { clearOrdersState(); }}
 *  >
 *    ...
 *  </AuthProvider>
 *
 * Notes:
 *  - The provider still persists session to localStorage under STORAGE_KEY.
 *  - Callbacks are optional and will be ignored if not provided.
 *  - Keep server-side auth enforcement in place; these callbacks are UX hooks only.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/* -------------------------
   Defaults and utilities
   ------------------------- */

export const STORAGE_KEY = "app_auth_session_v1";

const defaultConfig = {
  apiBaseUrl: `${import.meta.env.VITE_API_URL}`,
  endpoints: {
    login: "/api/auth/login",
    register: "/api/auth/register",
    refresh: "/api/auth/refresh",
    signout: "/api/auth/logout",
    updateProfile: "/api/auth/me"
  },
  fetchOptions: {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin"
  },
  normalizeResponse: (raw) => {
    if (!raw) return { ok: false, error: "Empty response" };
    const ok = raw.ok === undefined ? true : Boolean(raw.ok);
    const accessToken = raw.accessToken || raw.token || raw.access_token || null;
    const refreshToken = raw.refreshToken || raw.refresh_token || null;
    const user = raw.user || raw.data || null;
    const error = raw.error || raw.message || (ok ? null : "Unknown error");
    return { ok, accessToken, refreshToken, user, error };
  }
};

function safeParseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseJwt(token) {
  if (!token) return null;
  try {
    const base64 = token.split(".")[1];
    if (!base64) return null;
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/* -------------------------
   Context
   ------------------------- */

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/* -------------------------
   Provider
   ------------------------- */

export function AuthProvider({
  children,
  apiBaseUrl = defaultConfig.apiBaseUrl,
  endpoints = defaultConfig.endpoints,
  fetchOptions = defaultConfig.fetchOptions,
  normalizeResponse = defaultConfig.normalizeResponse,
  storageKey = STORAGE_KEY,
  /**
   * Optional lifecycle callbacks (all optional):
   *  - onInit(session)    : called once after restoring session on mount
   *  - onSignIn(session)  : called after successful sign-in
   *  - onSignUp(session)  : called after successful sign-up
   *  - onSignOut()        : called after sign-out completes (local cleanup done)
   *  - onRefresh(session) : called after successful refreshSession
   */
  onInit = null,
  onSignIn = null,
  onSignUp = null,
  onSignOut = null,
  onRefresh = null
}) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);

  const refreshTimerRef = useRef(null);
  const abortControllersRef = useRef(new Set());
  const accessTokenRef = useRef(null); // keep latest token for apiFetch

  /* Restore session from localStorage */
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
      const parsed = raw ? safeParseJSON(raw) : null;
      if (parsed && parsed.accessToken) {
        setAccessToken(parsed.accessToken);
        setRefreshToken(parsed.refreshToken || null);
        setUser(parsed.user || null);
        accessTokenRef.current = parsed.accessToken || null;
        // call onInit asynchronously so mount completes quickly
        if (typeof onInit === "function") {
          // pass the restored session object
          Promise.resolve().then(() => {
            try {
              onInit({ accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, user: parsed.user });
            } catch (e) {
              // swallow callback errors
              // eslint-disable-next-line no-console
              console.warn("AuthProvider.onInit callback error", e);
            }
          });
        }
      } else {
        accessTokenRef.current = null;
      }
    } catch (err) {
      console.warn("AuthProvider: failed to restore session", err);
      accessTokenRef.current = null;
    } finally {
      setInitializing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  /* Persist session */
  useEffect(() => {
    try {
      if (accessToken) {
        localStorage.setItem(storageKey, JSON.stringify({ accessToken, refreshToken, user }));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (err) {
      console.warn("AuthProvider: failed to persist session", err);
    }
    // keep ref in sync whenever token state changes
    accessTokenRef.current = accessToken || null;
  }, [accessToken, refreshToken, user, storageKey]);

  /* Schedule refresh when JWT exp present */
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (!accessToken || !refreshToken) return;

    const payload = parseJwt(accessToken);
    if (!payload || !payload.exp) return;

    const expiresAtMs = payload.exp * 1000;
    const now = Date.now();
    const msUntilExpiry = Math.max(0, expiresAtMs - now);

    // Refresh 30s before expiry, or at half the remaining time if very short
    const refreshIn = Math.max(1000, Math.min(msUntilExpiry - 30000, Math.floor(msUntilExpiry / 2)));

    if (msUntilExpiry <= 0) {
      // token expired — attempt immediate refresh
      (async () => {
        try {
          const session = await refreshSession();
          // notify listeners if refresh succeeded
          if (session && session.ok && typeof onRefresh === "function") {
            try {
              onRefresh(session);
            } catch (e) {
              // swallow callback errors
              // eslint-disable-next-line no-console
              console.warn("AuthProvider.onRefresh callback error", e);
            }
          }
        } catch {
          // ignore
        }
      })();
      return;
    }

    refreshTimerRef.current = setTimeout(() => {
      refreshSession()
        .then((session) => {
          if (session && session.ok && typeof onRefresh === "function") {
            try {
              onRefresh(session);
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn("AuthProvider.onRefresh callback error", e);
            }
          }
        })
        .catch(() => {
          // ignore
        });
    }, refreshIn);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, refreshToken]);

  /* Cleanup abort controllers on unmount */
  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach((c) => {
        try {
          c.abort();
        } catch { }
      });
      abortControllersRef.current.clear();
    };
  }, []);

  /* -------------------------
     Internal fetch helper
     ------------------------- */
  const apiFetch = useCallback(
    async (path, opts = {}) => {
      const url = path.startsWith("http") ? path : `${apiBaseUrl}${path}`;
      const controller = new AbortController();
      abortControllersRef.current.add(controller);

      // Merge headers and include Authorization if we have a token
      const mergedHeaders = { ...(fetchOptions.headers || {}), ...(opts.headers || {}) };
      const token = accessTokenRef.current;
      if (token) mergedHeaders.Authorization = `Bearer ${token}`;

      const merged = {
        method: opts.method || "GET",
        headers: mergedHeaders,
        signal: controller.signal,
        credentials: opts.credentials ?? fetchOptions.credentials
      };
      if (opts.body !== undefined) {
        merged.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
      }
      try {
        const res = await fetch(url, merged);
        const text = await res.text();
        const json = text ? safeParseJSON(text) : null;
        return { status: res.status, ok: res.ok, raw: json, text };
      } catch (err) {
        if (err && err.name === "AbortError") {
          return { status: 0, ok: false, error: "aborted" };
        }
        return { status: 0, ok: false, error: err.message || "Network error" };
      } finally {
        abortControllersRef.current.delete(controller);
      }
    },
    [apiBaseUrl, fetchOptions]
  );

  /* -------------------------
     signIn
     ------------------------- */
  const signIn = useCallback(
    async ({ email, password } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const payload = { email, password };
        const res = await apiFetch(endpoints.login, { method: "POST", body: payload });
        if (!res.ok) {
          const errMsg = (res.raw && (res.raw.error || res.raw.message)) || `HTTP ${res.status}`;
          setError(errMsg);
          setLoading(false);
          return { ok: false, error: errMsg, status: res.status };
        }
        const normalized = normalizeResponse(res.raw || {});
        if (!normalized.ok) {
          setError(normalized.error || "Sign in failed");
          setLoading(false);
          return { ok: false, error: normalized.error };
        }
        setAccessToken(normalized.accessToken || null);
        // update ref immediately so subsequent apiFetch calls include the header
        accessTokenRef.current = normalized.accessToken || null;
        setRefreshToken(normalized.refreshToken || null);
        setUser(() => normalized.user ?? null);
        setLoading(false);

        // dispatch event after ref/state are set
        try {
          window.dispatchEvent(new CustomEvent("auth:signedin", {
            detail: { user: normalized.user ?? null, accessToken: normalized.accessToken ?? null }
          }));
        } catch (e) { /* ignore if window not available */ }

        // notify listeners asynchronously
        if (typeof onSignIn === "function") {
          Promise.resolve().then(() => {
            try {
              onSignIn({ accessToken: normalized.accessToken, refreshToken: normalized.refreshToken, user: normalized.user });
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn("AuthProvider.onSignIn callback error", e);
            }
          });
        }

        return { ok: true, accessToken: normalized.accessToken, refreshToken: normalized.refreshToken, user: normalized.user };
      } catch (err) {
        const msg = err?.message || "Sign in error";
        setError(msg);
        setLoading(false);
        return { ok: false, error: msg };
      }
    },
    [apiFetch, endpoints.login, normalizeResponse, onSignIn]
  );

  /* -------------------------
     signUp
     ------------------------- */
  const signUp = useCallback(
    async ({ firstName, lastName, email, emails, password, role } = {}) => {
      setLoading(true);
      setError(null);
      try {
        // ✅ Build payload preserving emails array from AuthTabs
        const payload = { firstName, lastName, password };
        if (emails && emails.length > 0) {
          payload.emails = emails;  // ← AuthTabs sends emails array
        } else if (email) {
          payload.email = email;    // ← flat email fallback
        }
        if (role) payload.role = role;

        const res = await apiFetch(endpoints.register, { method: "POST", body: payload });
        if (!res.ok) {
          const errMsg = (res.raw && (res.raw.error || res.raw.message)) || `HTTP ${res.status}`;
          setError(errMsg);
          setLoading(false);
          return { ok: false, error: errMsg, status: res.status };
        }
        const normalized = normalizeResponse(res.raw || {});
        if (!normalized.ok) {
          setError(normalized.error || "Registration failed");
          setLoading(false);
          return { ok: false, error: normalized.error };
        }
        setAccessToken(normalized.accessToken || null);
        accessTokenRef.current = normalized.accessToken || null;
        setRefreshToken(normalized.refreshToken || null);
        setUser(normalized.user || null);
        setLoading(false);

        if (typeof onSignUp === "function") {
          Promise.resolve().then(() => {
            try {
              onSignUp({ accessToken: normalized.accessToken, refreshToken: normalized.refreshToken, user: normalized.user });
            } catch (e) {
              console.warn("AuthProvider.onSignUp callback error", e);
            }
          });
        }

        return { ok: true, accessToken: normalized.accessToken, refreshToken: normalized.refreshToken, user: normalized.user };
      } catch (err) {
        const msg = err?.message || "Registration error";
        setError(msg);
        setLoading(false);
        return { ok: false, error: msg };
      }
    },
    [apiFetch, endpoints.register, normalizeResponse, onSignUp]
  );

  /* -------------------------
     refreshSession
     ------------------------- */
  const refreshSession = useCallback(
    async (opts = {}) => {
      const rToken = opts.refreshToken || refreshToken;
      if (!rToken) return { ok: false, error: "No refresh token" };
      if (!endpoints.refresh) return { ok: false, error: "No refresh endpoint configured" };

      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(endpoints.refresh, { method: "POST", body: { refreshToken: rToken } });
        if (!res.ok) {
          const errMsg = (res.raw && (res.raw.error || res.raw.message)) || `HTTP ${res.status}`;
          setError(errMsg);
          setLoading(false);
          // clear session on failed refresh
          setAccessToken(null);
          setRefreshToken(null);
          setUser(null);
          accessTokenRef.current = null;
          return { ok: false, error: errMsg };
        }
        const normalized = normalizeResponse(res.raw || {});
        if (!normalized.ok) {
          setError(normalized.error || "Refresh failed");
          setLoading(false);
          setAccessToken(null);
          setRefreshToken(null);
          setUser(null);
          accessTokenRef.current = null;
          return { ok: false, error: normalized.error };
        }
        setAccessToken(normalized.accessToken || null);
        accessTokenRef.current = normalized.accessToken || null;
        setRefreshToken(normalized.refreshToken || rToken);
        if (normalized.user) setUser(normalized.user);
        setLoading(false);

        // notify listeners asynchronously
        if (typeof onRefresh === "function") {
          Promise.resolve().then(() => {
            try {
              onRefresh({ accessToken: normalized.accessToken, refreshToken: normalized.refreshToken, user: normalized.user });
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn("AuthProvider.onRefresh callback error", e);
            }
          });
        }

        return { ok: true, accessToken: normalized.accessToken, refreshToken: normalized.refreshToken, user: normalized.user };
      } catch (err) {
        const msg = err?.message || "Refresh error";
        setError(msg);
        setLoading(false);
        setAccessToken(null);
        setRefreshToken(null);
        setUser(null);
        accessTokenRef.current = null;
        return { ok: false, error: msg };
      }
    },
    [apiFetch, endpoints.refresh, normalizeResponse, refreshToken, onRefresh]
  );

  /* -------------------------
     signOut
     ------------------------- */
  const signOut = useCallback(
    async (opts = {}) => {
      setLoading(true);
      setError(null);
      try {
        // attempt server signout if endpoint exists
        if (endpoints.signout) {
          // send explicit Authorization header for signout
          const headers = { "Content-Type": "application/json", ...(fetchOptions.headers || {}) };
          const token = accessTokenRef.current || accessToken;
          if (token) headers.Authorization = `Bearer ${token}`;
          // Use apiFetch so abort handling and baseUrl are consistent
          await apiFetch(endpoints.signout, { method: "POST", body: { user, accessToken, refreshToken, ...opts }, headers });
        }
      } catch {
        // ignore signout errors
      } finally {
        // clear local session
        setUser(null);
        setAccessToken(null);
        accessTokenRef.current = null;
        setRefreshToken(null);
        setLoading(false);
        try {
          localStorage.removeItem(storageKey);
        } catch { }

        // after clearing tokens/user in signOut
        try {
          window.dispatchEvent(new CustomEvent("auth:signedout"));
        } catch (e) { }
        if (typeof onSignOut === "function") {
          Promise.resolve().then(() => { try { onSignOut(); } catch (cbErr) { } });
        }

        // notify listeners asynchronously after local cleanup
        if (typeof onSignOut === "function") {
          Promise.resolve().then(() => {
            try {
              onSignOut();
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn("AuthProvider.onSignOut callback error", e);
            }
          });
        }
      }
      return { ok: true };
    },
    [apiFetch, endpoints.signout, accessToken, refreshToken, storageKey, fetchOptions.headers, onSignOut, user]
  );

  /* -------------------------
     updateProfile
     ------------------------- */
  const updateProfile = useCallback(
    async (updates = {}) => {
      if (!accessToken && !endpoints.updateProfile) {
        // not authenticated and no endpoint — cannot update
        return { ok: false, error: "Not authenticated" };
      }
      setLoading(true);
      setError(null);
      try {
        if (endpoints.updateProfile) {
          const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
          const res = await apiFetch(endpoints.updateProfile, { method: "PUT", body: updates, headers });
          if (!res.ok) {
            const errMsg = (res.raw && (res.raw.error || res.raw.message)) || `HTTP ${res.status}`;
            setError(errMsg);
            setLoading(false);
            return { ok: false, error: errMsg };
          }
          const normalized = normalizeResponse(res.raw || {});
          if (!normalized.ok) {
            setError(normalized.error || "Update failed");
            setLoading(false);
            return { ok: false, error: normalized.error };
          }
          setUser((prev) => ({ ...(prev || {}), ...(normalized.user || updates) }));
          setLoading(false);
          return { ok: true, user: normalized.user || updates };
        } else {
          // local merge fallback
          setUser((prev) => ({ ...(prev || {}), ...updates }));
          setLoading(false);
          return { ok: true, user: { ...(user || {}), ...updates } };
        }
      } catch (err) {
        const msg = err?.message || "Update error";
        setError(msg);
        setLoading(false);
        return { ok: false, error: msg };
      }
    },
    [accessToken, apiFetch, endpoints.updateProfile, normalizeResponse, user]
  );

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      refreshToken,
      loading,
      initializing,
      error,
      signIn,
      signUp,
      signOut,
      refreshSession,
      updateProfile,
      clearError
    }),
    [user, accessToken, refreshToken, loading, initializing, error, signIn, signUp, signOut, refreshSession, updateProfile, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
