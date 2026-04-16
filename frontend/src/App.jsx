import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useAuth } from "./contexts/AuthContext";
import { useNotifications } from "./contexts/NotificationContext";
import { useOpsContext } from "./contexts/OpsContext";
import { io } from "socket.io-client";

import HomePage from "./pages/customer/HomePage";
import SupplierDashboard from "./pages/supplier/SupplierDashboard";
import SupplierProfilePage from "./pages/supplier/SupplierProfilePage";
import SupplierApprovedItemsPage from "./pages/supplier/SupplierApprovedItemsPage";
import SupplierRequestItemPage from "./pages/supplier/SupplierRequestItemPage";
import SupplierQuotesPage from "./pages/supplier/SupplierQuotesPage";
import SupplierOrdersPage from "./pages/supplier/SupplierOrdersPage";
import SupplierTierMonitoringPage from "./pages/supplier/SupplierTierMonitoringPage";
import SupplierReportsPage from "./pages/supplier/SupplierReportsPage";
import SupplierFulfillmentPage from "./pages/supplier/SupplierFulfillmentPage";

import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminProductCatalogPage from "./pages/admin/AdminProductCatalogPage";
import AdminBulkOrdersPage from "./pages/admin/AdminBulkOrdersPage";
import PricingBracketsPage from "./pages/admin/PricingBracketsPage";
import AdminQuotesReviewPage from "./pages/admin/AdminQuotesReviewPage";
import CreateSalesWindowForm from "./pages/admin/CreateSalesWindowForm";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminFulfillmentPage from "./pages/admin/AdminFulfillmentPage";
import AdminDeliveryRulesPage from "./pages/admin/AdminDeliveryRulesPage";
import AdminUserManagementPage from "./pages/admin/AdminUserManagementPage";
import ProductDetailsPage from "./pages/customer/ProductDetailsPage";
import ProductListPage from "./pages/customer/ProductListPage";
import CartPage from "./pages/shared/ShoppingCart";
import Shop from "./pages/customer/Marketplace";
import Item from "./pages/customer/Itemsdetails";

import OrdersPage from "./pages/customer/OrdersPage";
import ReviewModifyIntentPage from "./pages/customer/ReviewModifyIntentPage";
import OrderDetailsPage from "./pages/customer/OrderDetails";
import OrderTrackingPage from "./pages/customer/OrderTrackingPage";
import ProfilePage from "./pages/customer/ProfilePage";
import UserMessageCenter from './pages/shared/UserMessageCenter';

import MessageCenter from './pages/shared/UserMessageCenter';

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

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (user.role === "supplier") return <Navigate to="/supplier/dashboard" replace />;
  if (user.role !== "administrator") return <Navigate to="/" replace />;
  return children;
}

function RoleRedirect() {
  const { user, accessToken, initializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (initializing) return;
    if (!accessToken || !user) return;
    if (user.role === "supplier" && !location.pathname.startsWith("/supplier")) {
      navigate("/supplier/dashboard", { replace: true });
    }
    if (user.role === "administrator" && !location.pathname.startsWith("/admin")) {
      navigate("/admin", { replace: true });
    }
  }, [user, accessToken, initializing, location.pathname, navigate]);

  return null;
}

export default function App() {
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const { setSocket } = useOpsContext() ?? {};
  const socketRef = useRef(null);

  useEffect(() => {
    // Create a dedicated socket for notifications (forceNew = isolated from comms-js socket)
    const socket = io(`${import.meta.env.VITE_API_URL}`, {
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;
    setSocket?.(socket);

    socket.on("connect", () => {
      console.log("🟢 App socket connected:", socket.id);
      if (user?._id) {
        socket.emit("identifyUser", {
          userId: user._id,
          role: user.role,
          ops_region: user.ops_region || null,
        });
        console.log("📝 identifyUser emitted on connect, role:", user.role);
      }
    });

    // Also identify immediately if already connected
    if (socket.connected && user?._id) {
      socket.emit("identifyUser", {
        userId: user._id,
        role: user.role,
        ops_region: user.ops_region || null,
      });
      console.log("📝 identifyUser emitted immediately, role:", user.role);
    }

    socket.on("ui:update", (msg) => {
      console.log("📨 ui:update received:", msg?.action);
      if (msg?.action === "order:status-updated") {
        console.log("🔔 calling addNotification");
        addNotification(
          `Order #${String(msg.payload?.orderId || "").slice(-6)} updated: ${msg.payload?.fromStatus} → ${msg.payload?.toStatus}`,
          "info"
        );
      }
    });

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
      setSocket?.(null);
      socketRef.current = null;
    };
  }, [user?._id]); // only re-run when user id changes

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
        <Route path="/order-details/:orderId" element={<OrderDetailsPage />} />
        <Route path="/order-tracking/:orderId" element={<OrderTrackingPage />} />

        {/* Supplier routes */}
        <Route path="/supplier" element={<Navigate to="/supplier/dashboard" replace />} />
        <Route path="/supplier/dashboard" element={<SupplierDashboard />} />
        <Route path="/supplier/profile" element={<SupplierProfilePage />} />
        <Route path="/supplier/approved-items" element={<SupplierApprovedItemsPage />} />
        <Route path="/supplier/approved-items/request" element={<SupplierRequestItemPage />} />
        <Route path="/supplier/quotes" element={<SupplierQuotesPage />} />
        <Route path="/supplier/quotes/create" element={<SupplierQuotesPage />} />
        <Route path="/supplier/order-requests" element={<SupplierOrdersPage />} />
        <Route path="/supplier/reports" element={<SupplierReportsPage />} />
        <Route path="/supplier/order-requests/:id/fulfillment" element={<SupplierFulfillmentPage />} />
        <Route path="/supplier/tier-progress" element={<SupplierTierMonitoringPage />} />

        {/* Admin routes */}
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/product-catalog" element={<AdminRoute><AdminProductCatalogPage /></AdminRoute>} />
        <Route path="/admin/inventory" element={<Navigate to="/admin/product-catalog" replace />} />
        <Route path="/admin/bulk-orders" element={<AdminRoute><AdminBulkOrdersPage /></AdminRoute>} />
        <Route path="/admin/pricing-brackets" element={<AdminRoute><PricingBracketsPage /></AdminRoute>} />
        <Route path="/admin/supplier-quotes" element={<AdminRoute><AdminQuotesReviewPage /></AdminRoute>} />
        <Route path="/admin/sales-window" element={<AdminRoute><CreateSalesWindowForm /></AdminRoute>} />
        <Route path="/admin/settings" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />
        <Route path="/admin/monitor-quotes" element={<AdminRoute><AdminFulfillmentPage /></AdminRoute>} />
        <Route path="/admin/delivery-rules" element={<AdminRoute><AdminDeliveryRulesPage /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminUserManagementPage />} />

        {/* General placeholder routes */}
        <Route path="/about" element={<PlaceholderPage title="About Us" />} />
        <Route path="/careers" element={<PlaceholderPage title="Careers" />} />
        <Route path="/partner-login" element={<PlaceholderPage title="Partner Login" />} />
        <Route path="/how-it-works" element={<PlaceholderPage title="How It Works" />} />
        <Route path="/help-center" element={<PlaceholderPage title="Help Center" />} />
        <Route path="/safety" element={<PlaceholderPage title="Safety" />} />
        <Route path="/privacy-policy" element={<PlaceholderPage title="Privacy Policy" />} />
        <Route path="/terms-of-service" element={<PlaceholderPage title="Terms of Service" />} />
        <Route path="/notifications" element={<MessageCenter />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/community" element={<PlaceholderPage title="Community" />} />
        <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
        <Route path="/savings" element={<PlaceholderPage title="Savings Vault" />} />
      </Routes>
    </>
  );
}