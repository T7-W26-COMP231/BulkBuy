import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastProvider.jsx";
import AuthTabs from "../sign-in-up/AuthTabs.jsx";

const sidebarItems = [
  { label: "Dashboard", icon: "dashboard", to: "/admin" },
  { label: "Product Catalog", icon: "inventory_2", to: "/admin/product-catalog" },
  { label: "Bulk Orders", icon: "local_shipping", to: "/admin/bulk-orders" },
  { label: "Supplier Quotes", icon: "request_quote", to: "/admin/supplier-quotes" },
  { label: "Pricing Brackets", icon: "sell", to: "/admin/pricing-brackets" },
  { label: "Sales Window", icon: "sell", to: "/admin/sales-window" },
  { label: "Settings", icon: "settings", to: "/admin/settings" },
];

function ToastAuthWrapper({ toastControls }) {
  const { signIn, signOut } = useAuth();

  const handleSignIn = async (payload) => {
    try {
      const res = await signIn(payload);
      if (res?.user?.role !== "administrator") {
        await signOut();
        return { ok: false, error: "Access denied. Administrator credentials required." };
      }
      toastControls?.dismiss?.();
      return { ok: true, user: res.user };
    } catch (err) {
      return { ok: false, error: err?.message ?? "Sign in error" };
    }
  };

  return (
    <div style={{ minWidth: 320 }}>
      <AuthTabs
        defaultIsLogin={true}
        onSignIn={handleSignIn}
        onSignUp={null}
        toastControls={toastControls}
      />
    </div>
  );
}

export default function AdminSidebar() {
  const { user, signOut } = useAuth();
  const { showToast, clearAll } = useToast();
  const navigate = useNavigate();

  const displayName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : null;
  const email = user?.emails?.[0]?.address ?? null;
  const initials = displayName ? displayName.charAt(0).toUpperCase() : "?";

  const openAuthToast = () => {
    showToast(
      ({ toastControls }) => <ToastAuthWrapper toastControls={toastControls} />,
      {
        value: "HVC",
        IsToStack: true,
        toastName: "Auth",
        AllowedMultiple: false,
        IsToStick: true,
        blurBg: true,
        duration: null,
        animate: "TR",
      }
    );
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      clearAll();
      navigate("/", { replace: true });
    } catch (err) {
      console.error("signOut error:", err);
    }
  };

  return (
    <aside className="hidden w-72 border-r border-neutral-light bg-white lg:flex lg:flex-col">
      <div className="border-b border-neutral-light px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-text-main shadow-sm">
            <span className="material-symbols-outlined">shopping_cart</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main">BulkBuy Admin</h2>
            <p className="text-xs font-medium tracking-wide text-text-muted">
              Navigation Console
            </p>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-5 py-6">
        {sidebarItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/admin"}
            className={({ isActive }) =>
              `flex items-center gap-4 rounded-2xl px-4 py-4 text-base font-semibold transition-all duration-200 ${
                isActive
                  ? "bg-primary text-text-main shadow-sm"
                  : "text-text-muted hover:bg-neutral-light hover:translate-x-1"
              }`
            }
          >
            <span className="material-symbols-outlined text-[24px]">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-5 pb-5">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-text-main transition hover:opacity-90"
        >
          <span className="material-symbols-outlined text-[20px]">download</span>
          Export Report
        </button>
      </div>

      <div className="border-t border-neutral-light px-6 py-5">
        {user ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-main">
                  {displayName || "User"}
                </p>
                <p className="inline-flex rounded-full bg-neutral-light px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                  {user.role ?? "Account"}
                </p>
                {email && <p className="truncate text-xs text-text-muted">{email}</p>}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openAuthToast}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-text-muted transition hover:bg-neutral-light"
          >
            <span className="material-symbols-outlined text-[24px]">login</span>
            <span>Sign in / Register</span>
          </button>
        )}
      </div>
    </aside>
  );
}