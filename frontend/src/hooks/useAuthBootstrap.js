import { useEffect } from "react";

const AUTH_URL = "http://localhost:5000/api/auth/login";

export function useAuthBootstrap() {
  useEffect(() => {
    async function bootstrap() {
      try {
        // Always clear old token and fetch a fresh one
        localStorage.removeItem("token");

        const res = await fetch(AUTH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "admin@bulkbuy.example.com",
            password: "AdminPass!234",
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Auto-login failed");

        const token = data.token ?? data.accessToken ?? data.data?.token;

        if (token) {
          localStorage.setItem("token", token);
          console.log("✅ Auth bootstrap: fresh token stored");
        } else {
          console.warn("⚠️ No token found in response", data);
        }
      } catch (err) {
        console.error("❌ Auth bootstrap failed:", err.message);
      }
    }

    bootstrap();
  }, []);
}