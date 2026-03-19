import { Link } from "react-router-dom";

export default function Navbar() {
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

          <div className="hidden cursor-pointer items-center gap-2 md:flex">
            <span className="material-symbols-outlined text-primary">
              location_on
            </span>
            <span className="text-sm font-semibold">Toronto</span>
            <span className="material-symbols-outlined text-xs">
              expand_more
            </span>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-4 md:gap-6">
          <div className="hidden max-w-sm flex-1 sm:flex">
            <div className="flex h-10 w-full items-stretch rounded-lg bg-neutral-light px-3">
              <span className="material-symbols-outlined self-center text-text-muted">
                search
              </span>
              <input
                className="w-full border-none bg-transparent text-sm placeholder:text-text-muted focus:ring-0 focus:outline-none"
                placeholder="Search bulk deals..."
                type="text"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Link
              to="/notifications"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-light transition-colors hover:bg-primary/20"
            >
              <span className="material-symbols-outlined">notifications</span>
            </Link>

            <Link
              to="/cart"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-light transition-colors hover:bg-primary/20"
            >
              <span className="material-symbols-outlined">shopping_cart</span>
            </Link>

            <Link
              to="/profile"
              className="size-10 overflow-hidden rounded-full border-2 border-primary"
            >
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