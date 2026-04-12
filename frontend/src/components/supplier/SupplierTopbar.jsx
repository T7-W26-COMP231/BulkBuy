import { useAuth } from "../../contexts/AuthContext";
import NotificationBell from "../../pages/shared/NotificationBell";
export default function SupplierTopbar() {
  const { user } = useAuth();

  const supplierName =
    user?.companyName ||
    user?.company ||
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    "Supplier Account";

  const supplierInitial =
    user?.emails?.[0]?.address?.charAt(0)?.toUpperCase() ||
    supplierName?.charAt(0)?.toUpperCase() ||
    "S";
  //const avatarSrc = user?.avatar ?? null;

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

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-neutral-light bg-white px-4 py-2 text-sm font-semibold text-text-main transition hover:bg-neutral-light"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">
              location_on
            </span>
            Seattle
            <span className="material-symbols-outlined text-[18px] text-text-muted">
              expand_more
            </span>
          </button>
          <NotificationBell />

          {/* 👇 updated avatar */}
          <button
            type="button"
            className="overflow-hidden rounded-full border border-neutral-light bg-white"
          >
            {/* avatarSrc ? (
    <img
      src={avatarSrc}
      alt={supplierName}
      className="size-10 object-cover"
    />
  ) : ( */}
            <div className="flex size-10 items-center justify-center bg-orange-100 text-sm font-bold text-orange-600">
              {supplierInitial}
            </div>
            {/* ) */}
          </button>
        </div>
      </div>
    </header>
  );
}