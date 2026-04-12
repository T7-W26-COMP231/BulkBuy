import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const sidebarItems = [
  { label: "Dashboard", icon: "dashboard", to: "/supplier" },
  { label: "Profile", icon: "person", to: "/supplier/profile" },
  { label: "Approved Items", icon: "verified", to: "/supplier/approved-items" },
  { label: "Quotes", icon: "description", to: "/supplier/quotes" },
  { label: "Order Requests", icon: "shopping_cart", to: "/supplier/order-requests" },
  { label: "Tier Progess", icon: "bar_chart", to: "/supplier/tier-progress" },
  { label: "Reports", icon: "download", to: "/supplier/reports" },
];

export default function SupplierSidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };
  const supplierName =
    user?.companyName ||
    user?.company ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    "Supplier Account";

  const supplierInitial =
    user?.emails?.[0]?.address?.charAt(0)?.toUpperCase() ||
    supplierName?.charAt(0)?.toUpperCase() ||
    "S";

  return (
    <aside className="hidden w-64 shrink-0 bg-[#062f29] px-3 py-4 text-white lg:flex lg:flex-col">
      <div className="px-3 pb-6 pt-2">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-text-main">
            <span className="material-symbols-outlined text-[22px]">
              shopping_cart
            </span>
          </div>

          <div>
            <h2 className="text-xl font-bold text-white">BulkBuy</h2>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
              Supplier Portal
            </p>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-2 px-1">
        {sidebarItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/supplier"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${isActive
                ? "bg-primary text-text-main shadow-sm"
                : "text-white/75 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* ✅ Task #78 - Supplier company name */}
      <div className="mt-6 rounded-2xl bg-white/10 p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-white text-sm font-bold text-[#062f29]">
            {supplierInitial}
          </div>

          <div className="min-w-0 flex-1">  {/* 👈 added flex-1 */}
            <p className="truncate text-sm font-semibold text-white">
              {supplierName}
            </p>
            <p className="truncate text-xs text-white/60">
              Supplier Account
            </p>
          </div>

          {/* 👇 add this button */}
          <button
            type="button"
            onClick={handleSignOut}
            title="Sign out"
            className="shrink-0 flex items-center justify-center rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-red-400 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>

        </div>
      </div>
    </aside>
  );
}