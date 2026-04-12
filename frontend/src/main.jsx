// src/main.jsx or src/index.jsx
import React, { useRef } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/global.css";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { OpsContextProvider } from "./contexts/OpsContext.jsx";
import ToastProvider from "./contexts/ToastProvider.jsx";
import { NotificationProvider } from "./contexts/NotificationContext.jsx";
import { SavingsProvider } from "./contexts/SavingsContext"; // ← add

function Root() {
  const savingsRef = useRef(null);

  return (
    <AuthProvider
      onInit={() => savingsRef.current?.loadSavings()}
      onSignIn={() => savingsRef.current?.loadSavings()}
      onSignOut={() => savingsRef.current?.clearSavings()}
    >
      <OpsContextProvider apiBase={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/opscs`}>
        <ToastProvider>
          <BrowserRouter>
            <NotificationProvider>
              <SavingsProvider ref={savingsRef}>
                <App />
              </SavingsProvider>
            </NotificationProvider>
          </BrowserRouter>
        </ToastProvider>
      </OpsContextProvider>
    </AuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);