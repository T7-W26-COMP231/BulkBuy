import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const sidebarItems = [
  { label: "Dashboard", icon: "dashboard", to: "/supplier" },
  { label: "Profile", icon: "person", to: "/supplier/profile" },
  { label: "Approved Items", icon: "verified", to: "/supplier/approved-items" },
  { label: "Quotes", icon: "description", to: "/supplier/quotes" },
  { label: "Order Requests", icon: "shopping_cart", to: "/supplier/order-requests" },
  { label: "Tier Progress", icon: "bar_chart", to: "/supplier/tier-progress" },
  { label: "Reports", icon: "download", to: "/supplier/reports" },
];

export default function SupplierSidebar() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const supplierName =
    user?.companyName ||
    user?.company ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    "Supplier Account";

  const supplierInitial =
    user?.firstName?.charAt(0)?.toUpperCase() ||
    supplierName?.charAt(0)?.toUpperCase() ||
    "S";

  const navContent = (
    <>
      {/* Logo */}
      <div className="px-2 pb-6 pt-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-text-main">
            <span className="material-symbols-outlined text-[20px]">shopping_cart</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">BulkBuy</h2>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
              Supplier Portal
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 px-1">
        {sidebarItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/supplier"}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${isActive
                ? "bg-primary text-text-main shadow-sm"
                : "text-white/75 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-6 rounded-2xl bg-white/10 p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-[#062f29]">
            {supplierInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{supplierName}</p>
            <p className="truncate text-xs text-white/60">Supplier Account</p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl bg-[#062f29] text-white shadow-lg md:hidden"
      >
        <span className="material-symbols-outlined text-[22px]">menu</span>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col bg-[#062f29] px-3 py-4 text-white transition-transform duration-300 md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-4 text-white/60 hover:text-white"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        {navContent}
      </aside>

      {/* Desktop sidebar — always visible */}
      <aside className="hidden w-[220px] shrink-0 flex-col bg-[#062f29] px-3 py-4 text-white md:flex">
        {navContent}
      </aside>
    </>
  );
}