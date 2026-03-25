import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

const API_URL = "http://localhost:5000/api/items";
const PRODUCT_API_URL = "http://localhost:5000/api/prdts";

export default function ItemDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedImage, setSelectedImage] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const [activeTab, setActiveTab] = useState("description");

 useEffect(() => {
    async function loadItem() {
        try {
            setLoading(true);

            // 🔹 Get token (for protected item API)
            const token = localStorage.getItem("token");

            // ============================================================
            // 🔹 1. FETCH ITEM
            // ============================================================
            const itemRes = await fetch(`${API_URL}/${id}`, {
                headers: {
                    "Content-Type": "application/json",
                    ...(token && { Authorization: `Bearer ${token}` }),
                },
            });

            const itemData = await itemRes.json();

            if (!itemRes.ok || !itemData.success) {
                throw new Error(itemData.message || "Failed to fetch item");
            }

            // ============================================================
// 🔹 2. FETCH PRODUCTS (for savings) — FIXED PAGINATION
// ============================================================
const productRes = await fetch(
    `http://localhost:5000/api/prdts?limit=100`,
    {
        headers: {
            "Content-Type": "application/json",
        },
    }
);

const productData = await productRes.json();

// ============================================================
// 🔹 3. SAFE PRODUCTS LIST (handles items OR data)
// ============================================================
const productsList =
    productData.items ||
    productData.data?.items ||
    productData.data ||
    [];

// 🔥 DEBUG (keep this for testing)
console.log("TOTAL PRODUCTS:", productsList.length);

// ============================================================
// 🔹 4. MATCH PRODUCT WITH ITEM (FINAL SAFE VERSION)
// ============================================================
const relatedProduct =
    productRes.ok && productData.success
        ? productsList.find((p) =>
              p.items?.some(
                  (i) => String(i.itemId) === String(itemData.data._id)
              )
          )
        : null;

// 🔥 DEBUG
console.log("MATCHED PRODUCT:", relatedProduct);

// 🔥 FORCE TEST (temporary)
console.log("MATCH TEST RESULT:", relatedProduct);

// 🔥 DEBUG (VERY IMPORTANT)
console.log("CURRENT ITEM ID:", itemData.data._id);
console.log(
    "ALL PRODUCT ITEM IDS:",
    productsList.map((p) => p.items?.map((i) => i.itemId))
);
console.log("MATCHED PRODUCT:", relatedProduct);

            // ============================================================
            // 🔹 DEBUG (keep for testing)
            // ============================================================
            console.log("ITEM:", itemData.data);
            console.log("PRODUCT:", relatedProduct);

            // ============================================================
            // 🔹 4. MERGE ITEM + SAVINGS
            // ============================================================
            setItem({
                ...itemData.data,
                estimatedSavings: Number(
                    relatedProduct?.estimatedSavings ?? 0
                ),
            });

        } catch (err) {
            console.error("LOAD ITEM ERROR:", err);
            setError("Could not load item details.");
        } finally {
            setLoading(false);
        }
    }

    loadItem();
}, [id]);

    if (loading) {
        return (
            <div className="relative flex min-h-screen w-full flex-col bg-background-light font-display text-text-main">
                <Navbar locationLabel=" " />
                <main className="flex flex-1 items-center justify-center">
                    <p className="text-text-muted">Loading item...</p>
                </main>
                <Footer />
            </div>
        );
    }

    if (error || !item) {
        return (
            <div className="relative flex min-h-screen w-full flex-col bg-background-light font-display text-text-main">
                <Navbar locationLabel=" " />
                <main className="flex flex-1 items-center justify-center">
                    <p className="text-red-500">{error || "Item not found."}</p>
                </main>
                <Footer />
            </div>
        );
    }

    const listPrice = item.price?.[0]?.list ?? 0;
    const salePrice = item.price?.[0]?.sale ?? null;
    const displayPrice = salePrice ?? listPrice;
    const hasSale = salePrice !== null && salePrice < listPrice;
    const currency = item.price?.[0]?.currency ?? "USD";
    const stock = item.inventory?.stock ?? 0;
    const images = item.images?.length > 0 ? item.images : [item.metadata?.imageUrl].filter(Boolean);
    const tiers = item.pricingTiers ?? [];

    // Active tier based on quantity
    const activeTier = [...tiers].reverse().find((t) => quantity >= t.minQty);

    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light font-display text-text-main">
            <Navbar locationLabel=" " />

            <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-10">

                {/* Top section: Image + Details */}
                <div className="flex flex-col gap-10 md:flex-row">

                    {/* LEFT: Image gallery */}
                    <div className="flex flex-col gap-3 md:w-1/2">
                        {/* Main image */}
                        <div className="flex h-80 items-center justify-center overflow-hidden rounded-2xl bg-neutral-light md:h-96">
                            <img
                                src={
                                    typeof images[selectedImage] === "string"
                                        ? images[selectedImage]
                                        : images[selectedImage]?.url
                                }
                                alt={item.title}
                                className="h-full w-full object-cover"
                            />
                        </div>

                        {/* Thumbnails */}
                        {images.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto">
                                {images.slice(0, 4).map((img, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedImage(i)}
                                        className={`h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 transition ${selectedImage === i ? "border-primary" : "border-neutral-light"
                                            }`}
                                    >
                                        <img src={img} alt={`${item.title} ${i + 1}`} className="h-full w-full object-cover" />
                                    </button>
                                ))}
                                {images.length > 4 && (
                                    <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl border-2 border-neutral-light bg-neutral-light text-sm font-semibold text-text-muted">
                                        +{images.length - 4} More
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Item details */}
                    <div className="flex flex-col gap-5 md:w-1/2">

                        {/* Active group buy badge */}
                        <div className="w-fit rounded-full bg-primary/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
                            Active Group Buy
                        </div>

                        {/* Title */}
                        <h1 className="text-3xl font-extrabold leading-tight tracking-tight">
                            {item.title}
                        </h1>

                        {/* Seller / brand */}
                        <p className="flex items-center gap-1 text-sm text-text-muted">
                            <span className="material-symbols-outlined text-base text-primary">verified</span>
                            {item.brand?.name || item.seller?.name || "BulkBuy Supplier"}
                        </p>

                        {/* Price summary */}
                        <div className="flex items-baseline gap-3">
    <span className="text-4xl font-extrabold text-text-main">
        ${displayPrice.toFixed(2)}
    </span>

    {/* 💰 ESTIMATED SAVINGS */}
    {Number(item.estimatedSavings) > 0 && (
        <div className="ml-2 rounded-lg bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
            💰 You save ${item.estimatedSavings}
        </div>
    )}

                            

                            {hasSale && (
                              <span className="text-base text-text-muted line-through opacity-80">
                                ${listPrice.toFixed(2)}
                              </span>
                            )}

                            {!!item.weight?.value && item.weight.value > 0 && (
                              <span className="text-sm font-medium text-primary/80">
                                (${(displayPrice / item.weight.value).toFixed(2)} / unit base)
                              </span>
                            )}
                        </div>

                        {/* Bulk Pricing Tiers */}
                        {tiers.length > 0 && (
                            <div className="rounded-2xl border border-neutral-light bg-white p-4 shadow-sm">
                                <div className="mb-3 flex items-center gap-2 font-bold">
                                    <span className="material-symbols-outlined text-base text-primary">label</span>
                                    Bulk Pricing Tiers
                                </div>
                                <div className="flex flex-col gap-2">
                                    {tiers.map((tier, i) => {
                                        const isActive = activeTier?.minQty === tier.minQty;
                                        const nextTier = tiers[i + 1];
                                        const label = nextTier
                                            ? `Tier ${i + 1} (${tier.minQty}–${nextTier.minQty - 1} units)`
                                            : `Tier ${i + 1} (${tier.minQty}+ units)`;
                                        return (
                                            <div
                                                key={i}
                                                className={`flex items-center justify-between rounded-xl px-4 py-2 text-sm ${isActive
                                                    ? "bg-primary/10 font-bold text-primary"
                                                    : "text-text-main"
                                                    }`}
                                            >
                                                <span className="flex items-center gap-2">
                                                    {label}
                                                    {isActive && (
                                                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">
                                                            LOWEST
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="font-bold">${tier.price.toFixed(2)} / unit</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Community Progress (mock — replace with real group buy data) */}
                        <div>
                            <div className="mb-1 flex items-center justify-between text-sm">
                                <span className="text-text-muted">Current commitment level</span>
                                <span className="font-extrabold text-primary">
                                    {stock} / {stock + 200} units
                                </span>
                            </div>
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-light">
                                <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${Math.min((stock / (stock + 200)) * 100, 100)}%` }}
                                />
                            </div>
                            {tiers[tiers.length - 1] && (
                                <p className="mt-1 text-xs text-primary">
                                    ↗ Add more units to unlock Tier {tiers.length} (${tiers[tiers.length - 1].price.toFixed(2)}) pricing!
                                </p>
                            )}
                        </div>

                        {/* Quantity selector */}
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3 rounded-xl border border-neutral-light px-4 py-2">
                                <button
                                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                                    className="text-xl font-bold text-text-muted hover:text-text-main"
                                >
                                    −
                                </button>
                                <span className="w-8 text-center font-bold">{quantity}</span>
                                <button
                                    onClick={() => setQuantity((q) => q + 1)}
                                    className="text-xl font-bold text-text-muted hover:text-text-main"
                                >
                                    +
                                </button>
                            </div>
                            <span className="text-sm text-text-muted">
                                Total selected: 1 box ({quantity} units)
                            </span>
                        </div>

                        {/* CTA buttons */}
                        <div className="flex gap-3">
                            <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-text-main shadow-md transition hover:bg-primary/90">
                                <span className="material-symbols-outlined text-base">add_shopping_cart</span>
                                Add to Intent
                            </button>
                            <button className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-light bg-white transition hover:bg-neutral-light">
                                <span className="material-symbols-outlined text-base text-red-400">favorite</span>
                            </button>
                        </div>

                        {/* Perks row */}
                        <div className="grid grid-cols-2 gap-2 text-xs text-text-muted">
                            <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-base text-primary">local_shipping</span>
                                Free Local Delivery
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-base text-primary">schedule</span>
                                Closing in 3 days
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-base text-primary">recycling</span>
                                Zero-waste packaging
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-base text-primary">group</span>
                                42 buyers joined
                            </div>
                        </div>


                    </div>

                </div>

                {/* Tabs: Description / Specifications / Reviews */}
                <div className="mt-12">
                    <div className="flex border-b border-neutral-light">
                        {["description", "specifications", "reviews"].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-3 text-sm font-semibold capitalize transition ${activeTab === tab
                                    ? "border-b-2 border-primary text-primary"
                                    : "text-text-muted hover:text-text-main"
                                    }`}
                            >
                                {tab === "reviews" ? `Reviews (${item.reviews?.length ?? 0})` : tab}
                            </button>
                        ))}
                    </div>

                    <div className="mt-6">
                        {activeTab === "description" && (
                            <div className="flex flex-col gap-4 text-sm leading-relaxed text-text-main">
                                <p>{item.description}</p>
                                {item.shortDescription && (
                                    <p className="text-text-muted">{item.shortDescription}</p>
                                )}
                                {item.tags?.length > 0 && (
                                    <ul className="flex flex-col gap-1">
                                        {item.tags.map((tag) => (
                                            <li key={tag} className="flex items-center gap-2">
                                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                                {tag}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        {activeTab === "specifications" && (
                            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                                {[
                                    { label: "SKU", value: item.sku },
                                    { label: "Brand", value: item.brand?.name },
                                    { label: "Weight", value: item.weight ? `${item.weight.value} ${item.weight.unit}` : "—" },
                                    {
                                        label: "Dimensions",
                                        value: item.dimensions
                                            ? `${item.dimensions.length} × ${item.dimensions.width} × ${item.dimensions.height} ${item.dimensions.unit}`
                                            : "—",
                                    },
                                    { label: "Ships From", value: item.shipping?.shipsFrom ?? "—" },
                                    { label: "Shipping Class", value: item.shipping?.class ?? "—" },
                                    { label: "Tax Class", value: item.taxClass ?? "—" },
                                    { label: "Stock", value: `${stock} units` },
                                    { label: "Backorder", value: item.inventory?.backorder ? "Available" : "Not available" },
                                    { label: "Region", value: item.ops_region ?? "—" },
                                ].map(({ label, value }) => (
                                    <div key={label} className="flex justify-between rounded-xl border border-neutral-light bg-white px-4 py-3">
                                        <span className="font-semibold text-text-muted">{label}</span>
                                        <span className="font-bold">{value ?? "—"}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === "reviews" && (
                            <div className="flex flex-col items-center gap-3 py-10 text-center text-text-muted">
                                <span className="material-symbols-outlined text-4xl">rate_review</span>
                                <p className="text-sm">No reviews yet. Be the first to review this item.</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}

