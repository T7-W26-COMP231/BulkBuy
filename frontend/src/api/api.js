import axios from 'axios';

const SESSION_KEY = 'app_auth_session_v1'; // must match AuthContext.jsx storageKey

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);

    if (!raw) {
      return config;
    }

    const session = JSON.parse(raw);

    const token =
      session?.accessToken ||
      session?.token ||
      session?.authToken ||
      null;

    console.log(
      "🔑 token from storage:",
      token ? `${token.substring(0, 20)}...` : "NULL"
    );

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.warn("⚠ Failed to restore auth token:", error);
  }

  return config;
});

// Response interceptor — handles global errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const message =
      status === 401 ? "Session expired. Please log in again." :
        status === 403 ? "You don't have permission to do that." :
          status === 404 ? "Resource not found." :
            status >= 500 ? "Server error. Please try again." :
              "Something went wrong.";

    // Fire a custom event so any React component can listen
    window.dispatchEvent(new CustomEvent("api:error", { detail: { status, message } }));
    return Promise.reject(error);
  }
);

export default api;


