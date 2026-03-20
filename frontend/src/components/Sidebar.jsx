import { NavLink } from "react-router-dom";
import SavingsSummaryCard from "./SavingsSummaryCard";

const navItems = [
  { to: "/marketplace", icon: "grid_view", label: "Marketplace" },
  { to: "/orders", icon: "receipt_long", label: "My Orders" },
  { to: "/savings", icon: "trending_up", label: "Savings Vault" },
  { to: "/community", icon: "group", label: "Community" },
  { to: "/profile", icon: "settings", label: "Settings" },
];

export default function Sidebar() {
  return (
    <aside className="flex w-full flex-col gap-6 md:w-64">
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
                isActive
                  ? "bg-primary/10 font-semibold text-text-main"
                  : "text-text-muted hover:bg-neutral-light"
              }`
            }
          >
            <span
              className={`material-symbols-outlined ${
                item.to === "/marketplace" ? "text-primary" : ""
              }`}
            >
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <SavingsSummaryCard
        saved={412.5}
        goal={600}
        city="Toronto"
        monthLabel="this month"
      />
    </aside>
  );
}