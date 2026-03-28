// src/contexts/AuthContext.jsx
/**
 * AuthContext.jsx
 *
 * Real-API-ready authentication context.
 *
 * - Uses the real endpoints (configurable) to sign in and register users.
 * - Persists session to localStorage: { accessToken, refreshToken, user }.
 * - Schedules token refresh when JWT `exp` is present.
 * - Exposes: useAuth(), AuthProvider, and methods: signIn, signUp, signOut, refreshSession, updateProfile, clearError.
 *
 * Configuration:
 *   <AuthProvider
 *     apiBaseUrl="http://localhost:5000"
 *     endpoints={{ login: "/api/auth/login", register: "/api/auth/register", refresh: "/api/auth/refresh" }}
 *   >
 *
 * Notes:
 * - This file assumes the API returns JSON and follows the payload shapes you provided:
 *     SignIn:  { accessToken, refreshToken?, user, ... }
 *     SignUp:  { accessToken?, refreshToken?, user, ... }
 * - If your API uses different field names, pass a custom `normalizeResponse` function to the provider.
 * - Replace or extend `fetchOptions` (e.g., to include credentials) as needed.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/* -------------------------
   Defaults and utilities
   ------------------------- */

const STORAGE_KEY = "app_auth_session_v1";

const defaultConfig = {
  apiBaseUrl: `${import.meta.env.VITE_API_URL}`,
  endpoints: {
    login: "/api/auth/login",
    register: "/api/auth/register",
    refresh: "/api/auth/refresh", // optional; provider will tolerate absence
    signout: "/api/auth/logout", // optional
    updateProfile: "/api/auth/me", // optional
  },
  // default fetch options (can be overridden by provider consumer)
  fetchOptions: {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin", // change to 'include' if your API uses cookies
  },
  // normalize API response into { ok, accessToken, refreshToken, user, error }
  normalizeResponse: (raw) => {
    if (!raw) return { ok: false, error: "Empty response" };
    // If API returns { ok: true, accessToken, user } or { accessToken, user }
    const ok = raw.ok === undefined ? true : Boolean(raw.ok);
    const accessToken = raw.accessToken || raw.token || raw.access_token || null;
    const refreshToken = raw.refreshToken || raw.refresh_token || null;
    const user = raw.user || raw.data || null;
    const error = raw.error || raw.message || (ok ? null : "Unknown error");
    return { ok, accessToken, refreshToken, user, error };
  },
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
      const raw = localStorage.getItem(storageKey);
      const parsed = safeParseJSON(raw);
      if (parsed && parsed.accessToken) {
        setAccessToken(parsed.accessToken);
        setRefreshToken(parsed.refreshToken || null);
        setUser(parsed.user || null);
        accessTokenRef.current = parsed.accessToken || null;
      } else {
        accessTokenRef.current = null;
      }
    } catch (err) {
      console.warn("AuthProvider: failed to restore session", err);
      accessTokenRef.current = null;
    } finally {
      setInitializing(false);
    }
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
          await refreshSession();
        } catch {
          // ignore
        }
      })();
      return;
    }

    refreshTimerRef.current = setTimeout(() => {
      refreshSession().catch(() => {
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
        credentials: opts.credentials ?? fetchOptions.credentials,
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
        if (err.name === "AbortError") {
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
        setUser(normalized.user || null);
        setLoading(false);
        return { ok: true, accessToken: normalized.accessToken, refreshToken: normalized.refreshToken, user: normalized.user };
      } catch (err) {
        const msg = err?.message || "Sign in error";
        setError(msg);
        setLoading(false);
        return { ok: false, error: msg };
      }
    },
    [apiFetch, endpoints.login, normalizeResponse]
  );

  /* -------------------------
     signUp
     ------------------------- */
  const signUp = useCallback(
    async ({ firstName, lastName, email, password } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const payload = { firstName, lastName, email, password };
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
        // update ref immediately so subsequent apiFetch calls include the header
        accessTokenRef.current = normalized.accessToken || null;
        setRefreshToken(normalized.refreshToken || null);
        setUser(normalized.user || null);
        setLoading(false);
        return { ok: true, accessToken: normalized.accessToken, refreshToken: normalized.refreshToken, user: normalized.user };
      } catch (err) {
        const msg = err?.message || "Registration error";
        setError(msg);
        setLoading(false);
        return { ok: false, error: msg };
      }
    },
    [apiFetch, endpoints.register, normalizeResponse]
  );

  /* -------------------------
     refreshSession
     - Attempts to refresh using configured refresh endpoint (if present).
     - If no refresh endpoint is configured, returns { ok: false }.
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
    [apiFetch, endpoints.refresh, normalizeResponse, refreshToken]
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
      }
      return { ok: true };
    },
    [apiFetch, endpoints.signout, accessToken, refreshToken, storageKey, fetchOptions.headers]
  );

  /* -------------------------
     updateProfile
     - If updateProfile endpoint is configured, calls it with Authorization header.
     - Otherwise merges updates locally.
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
      clearError,
    }),
    [user, accessToken, refreshToken, loading, initializing, error, signIn, signUp, signOut, refreshSession, updateProfile, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
