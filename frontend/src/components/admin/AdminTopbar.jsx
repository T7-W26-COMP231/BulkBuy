import { useState } from "react";
import NotificationBell from "../../pages/shared/NotificationBell";

const CITIES = ["Seattle", "New York", "San Francisco", "Chicago", "Toronto"];

export default function AdminTopbar({ title, onSearch, searchPlaceholder = "Search system metrics...", onMenuClick }) {
  const [city, setCity] = useState("Seattle");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="border-b border-neutral-light bg-white px-6 py-3 md:px-8">
      <div className="flex items-center gap-4">

        {/* ✅ ADD THIS THREE LINES */}
        <button type="button" onClick={onMenuClick}
          className="lg:hidden rounded-xl p-2 text-text-muted hover:bg-neutral-light">
          <span className="material-symbols-outlined">menu</span>
        </button>


        {/* ── Left: Search bar ──────────────────────────────────────── */}
        <div className="flex flex-1 max-w-sm items-center gap-2 rounded-2xl border border-neutral-light bg-neutral-light/50 px-4 py-2.5">
          <span className="material-symbols-outlined text-[20px] text-text-muted">search</span>
          <input
            type="text"
            placeholder={searchPlaceholder}
            onChange={onSearch ? (e) => onSearch(e.target.value) : undefined}
            className="flex-1 bg-transparent text-sm text-text-main placeholder:text-text-muted focus:outline-none"
          />
        </div>

        {/* rest unchanged */}
        {/* ── Right: City dropdown + bell + avatar ─────────────────── */}
        <div className="ml-auto flex items-center gap-2">

          {/* City dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-text-main transition hover:bg-neutral-light"
            >
              <span className="material-symbols-outlined text-[18px] text-primary">
                location_on
              </span>
              <span>{city}</span>
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
                <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-lg">
                  {CITIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setCity(c); setDropdownOpen(false); }}
                      className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition hover:bg-neutral-light ${c === city ? "font-bold text-primary" : "text-text-main"
                        }`}
                    >
                      {c === city
                        ? <span className="material-symbols-outlined text-[16px] text-primary">check</span>
                        : <span className="w-4" />
                      }
                      {c}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Bell */}
          <NotificationBell />

          {/* Avatar */}
          <button
            type="button"
            className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-light text-text-muted transition hover:ring-2 hover:ring-primary"
          >
            <span className="material-symbols-outlined text-[20px]">person</span>
          </button>

        </div>
      </div>
    </header>
  );
}