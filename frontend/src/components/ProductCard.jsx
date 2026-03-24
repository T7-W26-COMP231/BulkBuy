import { Link } from "react-router-dom";

export default function ProductCard({
  id,
  title,
  category,
  price,
  image,
  size = "large",
}) {
  const isSmall = size === "small";

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm transition hover:shadow-lg">
      <div
        className={`flex items-center justify-center bg-neutral-light text-text-muted ${isSmall ? "h-48" : "h-64"
          }`}
      >
        {image ? (
          <img
            src={image}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xl">Image</span>
        )}
      </div>

      <div className={`flex flex-1 flex-col justify-between ${isSmall ? "gap-3 p-4" : "gap-4 p-6"}`}>
        <div>
          <h3 className={`${isSmall ? "text-lg" : "text-xl"} font-bold`}>
            {title}
          </h3>
          <p className="text-sm text-text-muted">{category}</p>
        </div>

        <span
          className={`${isSmall ? "text-xl" : "text-2xl"} font-bold text-primary`}
        >
          ${price}
        </span>

        <Link
          to={`/items/${id}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-3 block rounded-xl bg-primary py-3 text-center font-bold text-text-main shadow-md transition-all hover:bg-primary/90"
        >
          View Details
        </Link>
      </div>
    </div>
  );
}