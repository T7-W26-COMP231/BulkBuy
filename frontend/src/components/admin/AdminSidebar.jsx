import { NavLink } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx"; // adjust path if needed
import { useToast } from "../../contexts/ToastProvider.jsx"; // adjust path if needed
import AuthTabs from "../sign-in-up/AuthTabs.jsx"; // adjust path if needed

const sidebarItems = [
  { label: "Dashboard", icon: "dashboard", to: "/admin" },
  { label: "Inventory", icon: "inventory_2", to: "/admin/inventory" },
  { label: "Bulk Orders", icon: "local_shipping", to: "/admin/bulk-orders" },
  { label: "Supplier Quotes", icon: "request_quote", to: "/admin/supplier-quotes" },
  { label: "Pricing Brackets", icon: "sell", to: "/admin/pricing-brackets" },
  { label: "Settings", icon: "settings", to: "/admin/settings" },
];

function ToastAuthWrapper({ toastControls }) {
  const { signIn, signOut } = useAuth(); // 👈 add signOut here

  const handleSignIn = async (payload) => {
    try {
      const res = await signIn(payload);

      if (res?.user?.role !== "administrator") {
        await signOut(); // 👈 now it's defined
        return { ok: false, error: "Access denied. Administrator credentials required." };
      }

      toastControls?.dismiss?.();
      return { ok: true, user: res.user };
    } catch (err) {
      return { ok: false, error: err?.message ?? "Sign in error" };
    }
  };

  const handleSignUp = async (payload) => {
    try {
      const res = await signUp(payload);
      toastControls?.dismiss?.();
      return res;
    } catch (err) {
      return { ok: false, error: err?.message ?? "Registration error" };
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

  const displayName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : null;
  const email = user?.emails?.[0]?.address ?? null;
  const initials = displayName ? displayName.charAt(0).toUpperCase() : "?";

  const openAuthToast = () => {
    showToast(
      ({ toastControls }) => <ToastAuthWrapper toastControls={toastControls} />,
      { value: "HVC", IsToStack: true, toastName: "Auth", AllowedMultiple: false, IsToStick: true, blurBg: true, duration: null, animate: "TR" }
    );
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      clearAll();
    } catch (err) {
      console.error("signOut error:", err);
    }
  };

  return (
    <aside className="hidden w-72 border-r border-neutral-light bg-white lg:flex lg:flex-col">
      <div className="border-b border-neutral-light px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-text-main">
            <span className="material-symbols-outlined">shopping_cart</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main">BulkBuy</h2>
            <p className="text-sm text-text-muted">Admin Portal</p>
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
              `flex items-center gap-4 rounded-2xl px-4 py-4 text-base font-semibold transition ${isActive ? "bg-primary/15 text-text-main" : "text-[#4B9CA2] hover:bg-neutral-light"
              }`
            }
          >
            <span className="material-symbols-outlined text-[24px]">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom user section */}
      <div className="border-t border-neutral-light px-6 py-5">
        {user ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-main truncate">{displayName || "User"}</p>
                <p className="text-xs text-text-muted truncate">{user.role ?? "Account"}</p>
                {email && <p className="text-xs text-text-muted truncate">{email}</p>}
              </div>
            </div>

            {/* Sign out button */}
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              className="shrink-0 flex items-center justify-center rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
        ) : (
          // No user — show sign in button
          <button
            type="button"
            onClick={openAuthToast}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-[#4B9CA2] hover:bg-neutral-light transition"
          >
            <span className="material-symbols-outlined text-[24px]">login</span>
            <span>Sign in / Register</span>
          </button>
        )}
      </div>
    </aside>
  );
}