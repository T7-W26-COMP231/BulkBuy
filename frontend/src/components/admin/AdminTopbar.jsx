import { useState } from "react";
import { useNavigate } from "react-router-dom";
import NotificationBell from "../../pages/shared/NotificationBell";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useToast } from "../../contexts/ToastProvider.jsx";

const REGIONS = [
  "Admin Region",
  "North America",
  "Ontario",
  "Quebec",
  "British Columbia",
  "Alberta",
];

export default function AdminTopbar({
  title,
  onSearch,
  searchPlaceholder = "Search system metrics...",
  onMenuClick,
}) {
  const [region, setRegion] = useState("Admin Region");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const { signOut } = useAuth();
  const { clearAll } = useToast();
  const navigate = useNavigate();

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
    <header className="bg-white px-6 py-4 md:px-8">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-xl p-2 text-text-muted hover:bg-neutral-light lg:hidden"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>

        <div className="flex max-w-xl flex-1 items-center gap-2 rounded-2xl border border-neutral-light bg-neutral-light/50 px-4 py-3">
          <span className="material-symbols-outlined text-[20px] text-text-muted">
            search
          </span>
          <input
            type="text"
            placeholder={searchPlaceholder}
            onChange={onSearch ? (e) => onSearch(e.target.value) : undefined}
            className="flex-1 bg-transparent text-sm text-text-main placeholder:text-text-muted focus:outline-none"
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex items-center gap-2 rounded-2xl border border-neutral-light bg-white px-4 py-3 text-sm font-semibold text-text-main transition hover:bg-neutral-light"
            >
              <span className="material-symbols-outlined text-[18px] text-primary">
                location_on
              </span>
              <span>{region}</span>
              <span className="material-symbols-outlined text-[18px] text-text-muted">
                keyboard_arrow_down
              </span>
            </button>

            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-lg">
                  {REGIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setRegion(r);
                        setDropdownOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition hover:bg-neutral-light ${
                        r === region
                          ? "font-bold text-primary"
                          : "text-text-main"
                      }`}
                    >
                      {r === region ? (
                        <span className="material-symbols-outlined text-[16px] text-primary">
                          check
                        </span>
                      ) : (
                        <span className="w-4" />
                      )}
                      {r}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <NotificationBell />

          <button
            type="button"
            onClick={handleSignOut}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-red-400 transition hover:bg-red-50 hover:text-red-500"
            title="Logout"
          >
            <span className="material-symbols-outlined text-[20px]">
              logout
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}