import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import HomePage from "./pages/customer/HomePage";
import OrdersPage from "./pages/customer/OrdersPage";
import SupplierDashboard from "./pages/supplier/SupplierDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ProductDetailsPage from "./pages/customer/ProductDetailsPage";
import ProductListPage from "./pages/customer/ProductListPage";
import CartPage from "./pages/customer/CartPage";
import Shop from "./pages/customer/Marketplace";
import Item from "./pages/customer/Itemsdetails";


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

export default function App() {

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/marketplace" element={<Shop />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/supplier" element={<SupplierDashboard />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/items/:id" element={<Item />} />

      <Route path="/product/:id" element={<ProductDetailsPage />} />
      <Route path="/products" element={<ProductListPage />} />
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
      <Route path="/login" element={<PlaceholderPage title="Login" />} />
      <Route path="/community" element={<PlaceholderPage title="Community" />} />
      <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
      <Route path="/savings" element={<PlaceholderPage title="Savings Vault" />} />
    </Routes>
  );
}
