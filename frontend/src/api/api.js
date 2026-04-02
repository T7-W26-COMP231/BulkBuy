import axios from 'axios';

const SESSION_KEY = 'app_auth_session_v1'; // must match AuthContext.jsx storageKey

const api = axios.create({
    baseURL: `${import.meta.env.VITE_API_URL}/api`,
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
    try {
        // AuthContext stores { accessToken, refreshToken, user } as JSON
        const raw = localStorage.getItem(SESSION_KEY);
        const session = raw ? JSON.parse(raw) : null;
        const token = session?.accessToken || null;
        console.log("🔑 token from storage:", token ? token.substring(0, 20) + "..." : "NULL"); // 👈 add this
        if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch (e) {
        // malformed storage — just skip the header
    }
    return config;
});

export default api;