import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";

const GTA_CITIES = [
  "Toronto", "Scarborough", "Mississauga", "Brampton", "Markham", "Vaughan",
  "Richmond Hill", "Oakville", "Burlington", "Pickering", "Ajax",
  "Whitby", "Oshawa", "Milton", "Newmarket", "Aurora",
];

export default function Navbar({ detectedCity, onCityChange, locationLabel }) {
  const [selected, setSelected] = useState("Toronto");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (detectedCity) setSelected(detectedCity);
  }, [detectedCity]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="border-b border-neutral-light bg-white px-6 py-3 md:px-20 lg:px-40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2 text-text-main">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-text-main">
              <span className="material-symbols-outlined">layers</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight">BulkBuy</h2>
          </Link>

          {/*  Static label OR city dropdown */}
          {locationLabel ? (
            <div className="hidden md:flex items-center gap-2">
              {/* <span className="material-symbols-outlined text-primary">location_on</span> */}
              <span className="text-sm font-semibold">{locationLabel}</span>
            </div>
          ) : (
            <div className="relative hidden md:flex" ref={ref}>
              <button
                onClick={() => setOpen((o) => !o)}
                className="cursor-pointer flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-100 transition-colors"
              >
                <span className="material-symbols-outlined text-primary">location_on</span>
                <span className="text-sm font-semibold">{selected}</span>
                <span
                  className="material-symbols-outlined text-xs transition-transform duration-200"
                  style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  expand_more
                </span>
              </button>

              {open && (
                <div className="absolute top-full left-0 z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                  <div className="py-1 max-h-64 overflow-y-auto">
                    {GTA_CITIES.map((city) => (
                      <button
                        key={city}
                        onClick={() => { setSelected(city); setOpen(false); onCityChange?.(city); }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2
                          ${selected === city ? "font-semibold text-primary bg-blue-50" : "text-gray-700"}`}
                      >
                        <span
                          className="material-symbols-outlined text-base"
                          style={{ visibility: selected === city ? "visible" : "hidden" }}
                        >
                          check
                        </span>
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-1 items-center justify-end gap-4 md:gap-6">
          <div className="hidden max-w-sm flex-1 sm:flex">
            <div className="flex h-10 w-full items-stretch rounded-lg bg-neutral-light px-3">
              <span className="material-symbols-outlined self-center text-text-muted">search</span>
              <input
                className="w-full border-none bg-transparent text-sm placeholder:text-text-muted focus:ring-0 focus:outline-none"
                placeholder="Search bulk deals..."
                type="text"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Link to="/notifications" className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-light transition-colors hover:bg-primary/20">
              <span className="material-symbols-outlined">notifications</span>
            </Link>
            <Link to="/cart" className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-light transition-colors hover:bg-primary/20">
              <span className="material-symbols-outlined">shopping_cart</span>
            </Link>
            <Link to="/profile" className="size-10 overflow-hidden rounded-full border-2 border-primary">
              <img
                className="h-full w-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuB_b7YtfguGbEdMe3FDNfGBLbeNIwwgf8hsF5TohaBw-2Ogx-t4KlEF8ljlb3rY2ltEAL4tY9rWPr2OjxTPeuqloBDRGZ2vwcZ7y0p46ykQ9JOq_CseQgYkUDjBvsD16pXRzJ-mpoLMds_LDBfYAiJBmRll5uIH2MT4cR5liOAz0T_RyISCG3rvYxdec8asUoW8zTT7zA7chdYHdmUJPSrtHT5IrES1MiCzQns8wDHmcs4ENY7Rs_qYOFvqSx_nlYCA7ZTNn-9aUvU"
                alt="User avatar"
              />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}