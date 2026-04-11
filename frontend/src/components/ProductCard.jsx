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
  estimatedSavings = null,
  tags = [],
  salePrice = null,
  listPrice = null,
  pricePrefix = "",
}) {
  const isSmall = size === "small";

  const tierLabel = minTierQty ? "TIER 1" : null;
  const progress = estimatedSavings
    ? Math.min(100, Math.max(15, estimatedSavings * 4))
    : null;
  const isHighProgress = progress != null && progress >= 80;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm transition hover:shadow-lg">

      {/* Image */}
      <div className={`relative flex items-center justify-center bg-neutral-light text-text-muted ${isSmall ? "h-48" : "h-48"}`}>
        {image ? (
          <img src={image} alt={title} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xl text-neutral-300">Image</span>
        )}

        {tierLabel && isHighProgress && (
          <span className="absolute left-2 top-2 rounded bg-teal-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow">
            {tierLabel} ACTIVE
          </span>
        )}

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

      {/* Body */}
      <div className="flex flex-col gap-2 p-4">

        <h3 className="text-sm font-bold leading-snug line-clamp-2 text-neutral-900">
          {title}
        </h3>

        <p className="text-xs text-text-muted line-clamp-1">{category}</p>

        {/* Price row */}
        <div className="flex items-baseline gap-1 flex-wrap">
          {listPrice && salePrice && (
            <span className="text-xs text-text-muted line-through mr-1">
              ${listPrice.toFixed(2)}
            </span>
          )}
          <span className="text-xl font-extrabold text-neutral-900">
            {pricePrefix ? `${pricePrefix} ` : ""}
            ${typeof price === "number" ? price.toFixed(2) : price}
          </span>
          <span className="text-xs text-text-muted">/unit</span>

          {salePrice && (
            <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
              Sale
            </span>
          )}

          {/* Inline tier status — matches mockup */}
          {tierLabel && progress != null && (
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-neutral-400 whitespace-nowrap">
              {isHighProgress
                ? `${tierLabel} FULL`
                : progress >= 50
                  ? `ALMOST ${tierLabel}`
                  : `${Math.round(progress)}% TO ${tierLabel}`}
            </span>
          )}
        </div>

        {/* Progress bar — clean strip, no labels */}
        {progress != null && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-teal-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
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