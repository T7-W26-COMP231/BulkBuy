import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastProvider.jsx";
import AuthTabs from "../sign-in-up/AuthTabs.jsx";

const sidebarItems = [
  { label: "Dashboard", icon: "dashboard", to: "/admin" },
  { label: "User Management", icon: "group", to: "/admin/users" },
  { label: "Product Catalog", icon: "inventory_2", to: "/admin/product-catalog" },
  { label: "FulFillment", icon: "local_shipping", to: "/admin/monitor-quotes" },
  { label: "Delivery Rules", icon: "rule_settings", to: "/admin/delivery-rules" },
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
        return {
          ok: false,
          error: "Access denied. Administrator credentials required.",
        };
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

export default function AdminSidebar({
  isMobileOpen = false,
  onClose = () => {},
}) {
  const { user, signOut } = useAuth();
  const { showToast, clearAll } = useToast();
  const navigate = useNavigate();

  const displayName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
    : null;

  const email = user?.emails?.[0]?.address ?? null;
  const initials = displayName ? displayName.charAt(0).toUpperCase() : "A";

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
      onClose();
      navigate("/", { replace: true });
    } catch (err) {
      console.error("signOut error:", err);
    }
  };

  const handleNavClick = () => {
    onClose();
  };

  return (
    <>
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-[#062f2a] text-white
          transform transition-transform duration-300 ease-in-out
          ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
          lg:static lg:z-auto lg:flex lg:translate-x-0 lg:flex-col
        `}
      >
        <div className="flex items-center justify-between px-6 py-8 lg:block">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-text-main shadow-sm">
              <span className="material-symbols-outlined">shopping_cart</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">BulkBuy</h2>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">
                Admin Portal
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/70 hover:bg-white/5 lg:hidden"
            aria-label="Close sidebar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-2 px-5 py-4">
          {sidebarItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `flex items-center gap-4 rounded-2xl px-4 py-4 text-base font-semibold transition-all duration-200 ${
                  isActive
                    ? "bg-primary text-text-main shadow-sm"
                    : "text-white/85 hover:bg-white/5"
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

        <div className="px-5 pb-5">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-text-main transition hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[20px]">
              download
            </span>
            Export Report
          </button>
        </div>

        <div className="px-4 py-5">
          {user ? (
           <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-4">
  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-[#062f2a]">
    {initials}
  </div>

  <div className="min-w-0 flex-1">
    <p className="truncate text-sm font-semibold text-white">
      {displayName || "Admin User"}
    </p>
    <p className="text-sm text-white/70">Admin Account</p>
  </div>
</div>
          ) : (
            <button
              type="button"
              onClick={openAuthToast}
              className="flex w-full items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/10"
            >
              <span className="material-symbols-outlined text-[24px]">
                login
              </span>
              <span>Sign in / Register</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}