import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import NotificationBell from "../../pages/shared/NotificationBell";

export default function SupplierTopbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  const supplierLocation =
    user?.city ||
    user?.location ||
    user?.region ||
    user?.ops_region ||
    "Supplier Region";

  return (
    <header className="bg-background-light px-6 py-4 md:px-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative w-full max-w-xl">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
            search
          </span>
          <input
            type="text"
            placeholder="Search orders, quotes, or items..."
            className="w-full rounded-full border border-neutral-light bg-white py-3 pl-12 pr-4 text-sm text-text-main outline-none transition placeholder:text-text-muted focus:border-primary"
          />
        </div>

        <div className="ml-auto flex items-center justify-end gap-4">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-neutral-light bg-white px-4 py-2 text-sm font-semibold text-text-main transition hover:bg-neutral-light"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">
              location_on
            </span>
            {supplierLocation}
            <span className="material-symbols-outlined text-[18px] text-text-muted">
              expand_more
            </span>
          </button>

          <NotificationBell />

          <button
            type="button"
            onClick={handleSignOut}
            title="Logout"
            className="flex size-10 items-center justify-center rounded-full border border-neutral-light bg-white text-[#EF4444] transition hover:bg-red-50"
          >
            <span className="material-symbols-outlined text-[18px]">
              logout
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}