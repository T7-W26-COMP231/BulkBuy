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

  const supplierName =
    user?.companyName ||
    user?.company ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    "Supplier Account";

  const supplierInitial =
    user?.firstName?.charAt(0)?.toUpperCase() ||
    supplierName?.charAt(0)?.toUpperCase() ||
    "S";

  return (
    <aside className="flex w-[76px] shrink-0 flex-col bg-[#062f29] px-2 py-4 text-white 2xl:w-64">
      {/* Logo */}
      <div className="px-3 pb-6 pt-2">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-text-main">
            <span className="material-symbols-outlined text-[22px]">
              shopping_cart
            </span>
          </div>

          <div className="hidden 2xl:block">
            <h2 className="text-xl font-bold text-white">BulkBuy</h2>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
              Supplier Portal
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-2 px-1">
        {sidebarItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/supplier"}
            className={({ isActive }) =>
              `flex items-center justify-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition 2xl:justify-start ${
                isActive
                  ? "bg-primary text-text-main shadow-sm"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">
              {item.icon}
            </span>

            <span className="hidden 2xl:inline">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Supplier footer */}
      <div className="mt-6 rounded-2xl bg-white/10 p-3">
        <div className="flex items-center justify-center gap-3 2xl:justify-start">
          <div className="flex size-10 items-center justify-center rounded-full bg-white text-sm font-bold text-[#062f29]">
            {supplierInitial}
          </div>

          <div className="hidden min-w-0 flex-1 2xl:block">
            <p className="truncate text-sm font-semibold text-white">
              {supplierName}
            </p>
            <p className="truncate text-xs text-white/60">
              Supplier Account
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}