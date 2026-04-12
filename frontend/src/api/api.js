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

export default api;