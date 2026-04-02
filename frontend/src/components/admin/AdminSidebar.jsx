import { NavLink } from "react-router-dom";

const sidebarItems = [
  { label: "Dashboard", icon: "dashboard", to: "/admin" },
  { label: "Inventory", icon: "inventory_2", to: "/admin/inventory" },
  { label: "Bulk Orders", icon: "local_shipping", to: "/admin/bulk-orders" },
  { label: "Supplier Quotes", icon: "request_quote", to: "/admin/supplier-quotes" },
  { label: "Pricing Brackets", icon: "sell", to: "/admin/pricing-brackets" },
  { label: "Settings", icon: "settings", to: "/admin/settings" },
];

export default function AdminSidebar() {
  return (
    <aside className="hidden w-72 border-r border-neutral-light bg-white lg:flex lg:flex-col">
      <div className="border-b border-neutral-light px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-text-main">
            <span className="material-symbols-outlined">shopping_cart</span>
          </div>

          <div>
            <h2 className="text-xl font-bold text-text-main">BulkBuy</h2>
            <p className="text-sm text-text-muted">Wholesale Portal</p>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-4 px-5 py-6">
        {sidebarItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/admin"}
            className={({ isActive }) =>
              `flex items-center gap-4 rounded-2xl px-4 py-4 text-base font-semibold transition ${
                isActive
                  ? "bg-primary/15 text-text-main"
                  : "text-[#4B9CA2] hover:bg-neutral-light"
              }`
            }
          >
            <span className="material-symbols-outlined text-[24px]">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-neutral-light px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600">
            A
          </div>

          <div>
            <p className="text-sm font-semibold text-text-main">Alex Rivera</p>
            <p className="text-xs text-text-muted">Admin Account</p>
          </div>
        </div>
      </div>
    </aside>
  );
}