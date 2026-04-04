import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "./contexts/AuthContext";
import { useNotifications } from "./contexts/NotificationContext";

import { io } from "socket.io-client";
import HomePage from "./pages/customer/HomePage";
import SupplierDashboard from "./pages/supplier/SupplierDashboard";
import SupplierProfilePage from "./pages/supplier/SupplierProfilePage";
import SupplierApprovedItemsPage from "./pages/supplier/SupplierApprovedItemsPage";
import SupplierQuotesPage from "./pages/supplier/SupplierQuotesPage";
import SupplierOrdersPage from "./pages/supplier/SupplierOrdersPage";
import SupplierDemandStatusPage from "./pages/supplier/SupplierDemandStatusPage";
import SupplierReportsPage from "./pages/supplier/SupplierReportsPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ProductDetailsPage from "./pages/customer/ProductDetailsPage";
import ProductListPage from "./pages/customer/ProductListPage";
import CartPage from "./pages/customer/CartPage";
import Shop from "./pages/customer/Marketplace";
import Item from "./pages/customer/Itemsdetails";
import ReviewModifyIntentPage from "./pages/customer/ReviewModifyIntentPage";
import PricingBracketsPage from "./pages/admin/PricingBracketsPage"
import AdminInventoryPage from "./pages/admin/AdminInventoryPage";
import AdminBulkOrdersPage from "./pages/admin/AdminBulkOrdersPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminQuotesReviewPage from "./pages/admin/AdminQuotesReviewPage"
import OrdersPage from "./pages/customer/OrdersPage";
import OrderDetailsPage from "./pages/customer/OrderDetails";
import CreateSalesWindowForm from "./pages/admin/CreateSalesWindowForm";
import AuthTabs from "./components/sign-in-up/AuthTabs";



function PlaceholderPage({ title }) {
  return (
    <div className="min-h-screen bg-background-light px-6 py-10 md:px-20 lg:px-40">
      <div className="rounded-2xl border border-neutral-light bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-text-main">{title}</h1>
        <p className="mt-3 text-text-muted">
          This page is connected through routing and can be built out later.
        </p>
      </div>
    </div>
  );
}
function RoleRedirect() {
  const { user, accessToken, initializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // wait until auth is fully restored from localStorage
    if (initializing) return;
    if (!accessToken || !user) return;

    if (user.role === "supplier" && !location.pathname.startsWith("/supplier")) {
      navigate("/supplier/dashboard", { replace: true });
    }

    if (user.role === "administrator" && !location.pathname.startsWith("/admin")) {
      navigate("/admin", { replace: true });
    }
  }, [user, accessToken, initializing, location.pathname]);

  return null;
}
export default function App() {
  const { addNotification } = useNotifications();

  const { user, signIn, signUp } = useAuth();

  useEffect(() => {
    const socket = io(`${import.meta.env.VITE_API_URL}`);

    //const socket = io("http://localhost:5000")

    socket.on("connect", () => {
      console.log("🟢 Connected to server:", socket.id);

      if (user?._id) {
        socket.emit("register", user._id);
        console.log("📝 Registered socket for user:", user._id);
      }
    });

    socket.on("order_created", (data) => {
      addNotification(`New order created`, "info");
      alert("🛒 New order created!");
    });
    // new — fires when supplier submits a quote

    socket.on("quote_submitted", (data) => {
      if (user?.role === "administrator") {
        addNotification(
          `New quote submitted for ${data?.productName || "a product"} — review pending.`,
          "info"
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  return (
    <>
      <RoleRedirect />
      <Routes>
        {/* Customer routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/marketplace" element={<Shop />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/items/:id" element={<Item />} />
        <Route path="/product/:id" element={<ProductDetailsPage />} />
        <Route path="/products" element={<ProductListPage />} />
        <Route path="/review-modify-intent" element={<ReviewModifyIntentPage />} />

        {/* Supplier routes */}
        <Route path="/supplier" element={<Navigate to="/supplier/dashboard" replace />} />
        <Route path="/supplier/dashboard" element={<SupplierDashboard />} />
        <Route path="/supplier/profile" element={<SupplierProfilePage />} />
        <Route path="/supplier/approved-items" element={<SupplierApprovedItemsPage />} />
        <Route path="/supplier/quotes" element={<SupplierQuotesPage />} />
        <Route path="/supplier/orders" element={<SupplierOrdersPage />} />
        <Route path="/supplier/demand-status" element={<SupplierDemandStatusPage />} />
        <Route path="/supplier/reports" element={<SupplierReportsPage />} />

        {/* Admin routes */}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/inventory" element={<AdminInventoryPage />} />
        <Route path="/admin/bulk-orders" element={<AdminBulkOrdersPage />} />
        <Route path="/admin/pricing-brackets" element={<PricingBracketsPage />} />

        <Route path="/admin/supplier-quotes" element={<AdminQuotesReviewPage />} />

        <Route path="/admin/sales-window" element={<CreateSalesWindowForm />} />
        <Route path="/admin/settings" element={<AdminSettingsPage />} />

        {/* General placeholder routes */}
        <Route path="/about" element={<PlaceholderPage title="About Us" />} />
        <Route path="/careers" element={<PlaceholderPage title="Careers" />} />
        <Route path="/partner-login" element={<PlaceholderPage title="Partner Login" />} />
        <Route path="/how-it-works" element={<PlaceholderPage title="How It Works" />} />
        <Route path="/help-center" element={<PlaceholderPage title="Help Center" />} />
        <Route path="/safety" element={<PlaceholderPage title="Safety" />} />
        <Route path="/privacy-policy" element={<PlaceholderPage title="Privacy Policy" />} />
        <Route path="/terms-of-service" element={<PlaceholderPage title="Terms of Service" />} />
        <Route path="/notifications" element={<PlaceholderPage title="Notifications" />} />
        <Route path="/profile" element={<PlaceholderPage title="Profile" />} />

        {/* <Route
          path="/login"
          element={
            <AuthTabs
              onSignIn={async (payload) => {
                const res = await signIn(payload);

                if (res?.ok) {
                  const role = res.user?.role;

                  if (role === "supplier") {
                    window.location.href = "/supplier/dashboard";
                  } else if (role === "admin") {
                    window.location.href = "/admin";
                  } else {
                    window.location.href = "/";
                  }
                }

                return res;
              }}
              onSignUp={signUp}
            />
          }
        /> */}
        <Route path="/community" element={<PlaceholderPage title="Community" />} />
        <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
        <Route path="/savings" element={<PlaceholderPage title="Savings Vault" />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/order-details" element={<OrderDetailsPage />} />
      </Routes>
    </>
  );
}
