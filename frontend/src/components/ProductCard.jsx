import { Link } from "react-router-dom";

export default function ProductCard({
  id,
  title,
  category,
  price,
  image,
  size = "large",
  minTierPrice = null,
  minTierQty = null,
  estimatedSavings = 0,
  tags = [],
  salePrice = null,
  listPrice = null,
}) {
  const isSmall = size === "small";

  // Derive tier label + progress from props available
  const tierLabel = minTierPrice ? "TIER 1" : null;
  const progress = minTierPrice && price
    ? Math.min(100, Math.round(((price - minTierPrice) / price) * 100 + 30))
    : null;
  const isHighProgress = progress != null && progress >= 80;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm transition hover:shadow-lg">

      {/* ── Image ── */}
      <div className={`relative flex items-center justify-center bg-neutral-light text-text-muted ${isSmall ? "h-48" : "h-64"}`}>
        {image ? (
          <img src={image} alt={title} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xl">Image</span>
        )}

        {/* Tier badge top-left */}
        {tierLabel && (
          <span className="absolute left-2 top-2 rounded bg-teal-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow">
            {tierLabel} ACTIVE
          </span>
        )}

        {/* Heart top-right */}
        <button
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow hover:scale-110 transition-transform"
          aria-label="Wishlist"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-neutral-400">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      {/* ── Body ── */}
      <div className={`flex flex-col ${isSmall ? "gap-2 p-4" : "gap-3 p-4"}`}>

        {/* Title */}
        <h3 className="text-sm font-bold leading-snug line-clamp-2 text-neutral-900">
          {title}
        </h3>

        {/* Description */}
        <p className="text-xs text-text-muted line-clamp-1">{category}</p>

        {/* Price row */}
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-extrabold text-neutral-900">
            ${typeof price === "number" ? price.toFixed(2) : price}
          </span>
          <span className="text-xs text-text-muted">/unit</span>

          {tierLabel && (
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-neutral-400">
              {tierLabel}
            </span>
          )}
        </div>

        {/* Progress bar + label */}
        {progress != null && (
          <div className="flex flex-col gap-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full rounded-full bg-teal-400 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-teal-600">
              {progress}% to {tierLabel}
            </p>
          </div>
        )}

        {/* CTA */}
        <Link
          to={`/items/${id}`}
          onClick={(e) => e.stopPropagation()}
          className={`mt-1 block rounded-xl py-2.5 text-center text-sm font-bold transition-all
            ${isHighProgress
              ? "bg-neutral-900 text-white hover:bg-neutral-700"
              : "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
            }`}
        >
          {isHighProgress ? "Join Group Buy" : "View Group"}
        </Link>
      </div>
    </div>
  );
}