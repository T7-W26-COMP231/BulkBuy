// src/main.jsx or src/index.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/global.css";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { OpsContextProvider } from "./contexts/OpsContex.jsx";
import ToastProvider from "./contexts/ToastProvider.jsx";
import { NotificationProvider } from "./contexts/NotificationContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <OpsContextProvider apiBase="http://localhost:5000/api/opscs">
        <ToastProvider>
          <BrowserRouter>
            <NotificationProvider>
              <App />
            </NotificationProvider>
          </BrowserRouter>
        </ToastProvider>
      </OpsContextProvider>
    </AuthProvider>
  </React.StrictMode>
);
