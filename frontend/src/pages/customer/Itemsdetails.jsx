// at the top of ItemDetail.jsx, add this import
import { createIntent, buildIntentPayload } from "../../api/intentApi";
import { useAuth } from "../../contexts/AuthContext.jsx"; // already imported via Navbar probably

import { useEffect, useState } from "react";
//import { io } from "socket.io-client";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

const PRODUCTS_API = `${import.meta.env.VITE_API_URL}/api/prdts`;
const ITEMS_API = `${import.meta.env.VITE_API_URL}/api/items`;

export default function ItemDetail() {
    // add this with your other state
    const [addingToIntent, setAddingToIntent] = useState(false);
    const { user } = useAuth(); // get user for userId

    const { id } = useParams();
    const navigate = useNavigate();
    const [productData, setProductData] = useState(null);
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [productItems, setProductItems] = useState([]); // ✅ ADD HERE
    const [error, setError] = useState("");
    const [selectedImage, setSelectedImage] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const [activeTab, setActiveTab] = useState("description");
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        async function loadItem() {
            try {
                setLoading(true);
                const token = localStorage.getItem("token");
                const headers = {
                    "Content-Type": "application/json",
                    ...(token && { Authorization: `Bearer ${token}` }),
                };



                // ── 1. Try product API first ──────────────────────────────
                const prodRes = await fetch(`${PRODUCTS_API}/${id}`, { headers });

                const prodData = await prodRes.json();
                const product = prodData.data ?? prodData;
                console.log(prodData)
                console.log(prodRes)
                console.log(product)
                if (prodRes.ok && product?._id) {
                    const itemIds = (product.items ?? [])
                        .map((i) => i.itemId?.$oid || i.itemId?.toString?.() || i.itemId)
                        .filter(Boolean);

                    const itemsRes = await Promise.all(
                        itemIds.map((itemId) =>
                            fetch(`${ITEMS_API}/${itemId}`, { headers }).then((r) => r.json())
                        )
                    );

                    const items = itemsRes
                        .map((res) => res.data ?? res)
                        .filter((res) => res?._id);

                    if (items.length === 0) {
                        setError("No items found in this product bundle.");
                        return;
                    }

                    // ✅ Preserve product.items order (no sorting)
                    const sortedItems = (product.items ?? [])
                        .map(pi => {
                            const piId = pi.itemId?.$oid || pi.itemId?.toString?.() || String(pi.itemId);
                            return items.find(item => {
                                const itemId = item._id?.$oid || item._id?.toString?.() || String(item._id);
                                return itemId === piId;
                            });
                        })
                        .filter(Boolean);



                    // ✅ mainItem is now defined
                    const mainItem = sortedItems[0];
                    const mainItemIdStr = mainItem._id?.$oid || mainItem._id?.toString?.() || String(mainItem._id);


                    // ✅ Match salesPrice by item ID
                    const productItemData = product.items?.find(pi => {
                        const piId = pi.itemId?.$oid || pi.itemId?.toString?.() || String(pi.itemId);
                        return piId === mainItemIdStr;
                    });

                    const salesPrice = productItemData?.salesPrices?.find(
                        sp => sp.currency === "USD"
                    )?.price ?? null;

                    const effectiveBase = salesPrice ?? mainItem.price?.[0]?.list ?? 0;
                    const itemTiers = mainItem.pricingTiers ?? [];


                    const estimatedSavings = (() => {
                        const base = mainItem.price?.[0]?.list ?? 0;
                        const sale = mainItem.price?.[0]?.sale ?? null;
                        const tiers = mainItem.pricingTiers ?? [];
                        if (sale !== null && sale < base) return Number((base - sale).toFixed(2));
                        if (tiers.length > 0) {
                            const best = Math.min(...tiers.map(t => t.price));
                            return base > best ? Number((base - best).toFixed(2)) : 0;
                        }
                        return 0;
                    })();

                    console.log("🛒 productItems:", sortedItems.map(it => ({
                        id: it._id,
                        title: it.title,
                        price: it.price?.[0]?.list,
                    })));

                    setProductData(product);
                    setProductItems(sortedItems);

                    setItem({
                        ...mainItem,
                        price: salesPrice !== null
                            ? [{ list: salesPrice, sale: null, currency: "USD" }]
                            : mainItem.price,
                        estimatedSavings: Number(mainItem.estimatedSavings ?? 0),
                        _isProduct: true,
                        _bundleItems: sortedItems.slice(1),
                    });

                    return;
                }

                // ── 2. Fallback: try plain item API ───────────────────────
                const itemRes = await fetch(`${ITEMS_API}/${id}`, { headers });
                const itemData = await itemRes.json();
                const plainItem = itemData.data ?? itemData;

                if (itemRes.ok && plainItem?._id) {
                    setItem({ ...plainItem, _isProduct: false, _bundleItems: [] });
                    return;
                }


                setError("Item not found.");

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


    // ── Derived values (unchanged) ─────────────────────────────────────────────
    const isProduct = item._isProduct === true;
    const bundleItems = item._bundleItems ?? [];

    const listPrice = item.price?.[0]?.list ?? 0;
    const salePrice = item.price?.[0]?.sale ?? null;

    const backendUnitPrice = item.currentUnitPrice ?? salePrice ?? listPrice;
    const backendSavings = Number(item.estimatedSavings ?? 0);
    const activeTier = item.activeTier ?? null;
    const nextTier = item.nextTier ?? null;
    const nextThresholdQty = item.nextThresholdQty ?? null;
    const aggregatedDemand = Number(item.aggregatedDemand ?? 0);
    const progressPercent = Number(item.progressPercent ?? 0);

    const displayPrice = backendUnitPrice;

    console.log(displayPrice);

    const hasSale = salePrice !== null && salePrice < listPrice;
    const currency = item.pricingCurrency ?? item.price?.[0]?.currency ?? "USD";
    const stock = item.inventory?.stock ?? 0;
    const images = item.images?.length > 0 ? item.images : [item.metadata?.imageUrl].filter(Boolean);
    const tiers = item.pricingTiers ?? [];

    // Tabs — add "items" tab when viewing a product
    const tabs = isProduct
        ? ["items", "description", "reviews"]
        : ["description", "specifications", "reviews"];


    const handleAddToIntent = async () => {
        if (!user) {
            alert("Please sign in to add items to your intent.");
            return;
        }
        setAddingToIntent(true);
        try {
            const payload = buildIntentPayload({
                userId: user._id,
                productId: productData?._id ?? null,
                itemId: item._id,
                quantity,
                atInstantPrice: displayPrice,
                discountedPercentage: backendSavings > 0
                    ? Math.round((backendSavings / listPrice) * 100)
                    : 0,
                discountBracket: { initial: listPrice, final: displayPrice },
                ops_region: item.ops_region ?? null,
            });
            await createIntent(payload);
            navigate("/cart");
        } catch (err) {
            console.error("Add to intent error:", err);
            alert("Could not add to intent. Please try again.");
        } finally {
            setAddingToIntent(false);
        }
    };

    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light font-display text-text-main">
            <Navbar locationLabel=" " />

            <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-10">

                {/* Top section: Image + Details — UNCHANGED */}
                <div className="flex flex-col gap-10 md:flex-row">

                    {/* LEFT: Image gallery */}
                    <div className="flex flex-col gap-3 md:w-1/2">
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
                        {images.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto">
                                {images.slice(0, 4).map((img, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedImage(i)}
                                        className={`h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 transition ${selectedImage === i ? "border-primary" : "border-neutral-light"}`}
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
                        <div className="w-fit rounded-full bg-primary/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
                            Active Group Buy
                        </div>

                        <h1 className="text-3xl font-extrabold leading-tight tracking-tight">
                            {item.title}
                        </h1>

                        <p className="flex items-center gap-1 text-sm text-text-muted">
                            <span className="material-symbols-outlined text-base text-primary">verified</span>
                            {item.brand?.name || item.seller?.name || "BulkBuy Supplier"}
                        </p>

                        <div className="flex items-baseline gap-3">
                            <span className="text-4xl font-extrabold text-text-main">
                                ${displayPrice.toFixed(2)}
                            </span>
                            {backendSavings > 0 && (
                                <div className="ml-2 rounded-lg bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                                    💰 You save ${backendSavings.toFixed(2)}
                                </div>
                            )}
                            {hasSale && (
                                <span className="text-base text-text-muted line-through opacity-80">
                                    ${listPrice.toFixed(2)
                                    }

                                </span>
                            )
                            }
                            {!!item.weight?.value && item.weight.value > 0 && (
                                <span className="text-sm font-medium text-primary/80">
                                    (${(displayPrice / item.weight.value).toFixed(2)} / unit base)
                                </span>
                            )}
                        </div>
                        {/* 🔍 DEBUG PANEL
                        <div className="mt-6 rounded-xl bg-black p-4 text-xs text-green-400">
                            <pre>
                                {JSON.stringify({
                                    item,
                                    displayPrice,
                                    listPrice,
                                    salePrice,
                                    hasSale,
                                    currency,
                                    stock,
                                    images,
                                    tiers,
                                    activeTier,
                                    quantity,
                                }, null, 2)}
                            </pre>
                        </div> */}

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
                                                className={`flex items-center justify-between rounded-xl px-4 py-2 text-sm ${isActive ? "bg-primary/10 font-bold text-primary" : "text-text-main"}`}
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

                        <div>
                            <div className="mb-1 flex items-center justify-between text-sm">
                                <span className="text-text-muted">Current commitment level</span>
                                <span className="font-extrabold text-primary">
                                    {aggregatedDemand}
                                    {nextThresholdQty ? ` / ${nextThresholdQty}` : ""} units
                                </span>
                            </div>
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-light">
                                <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                                />
                            </div>
                            {nextTier ? (
                                <p className="mt-1 text-xs text-primary">
                                    ↗ Add more units to unlock ${nextTier.price.toFixed(2)} pricing at {nextTier.minQty} units!
                                </p>
                            ) : activeTier ? (
                                <p className="mt-1 text-xs text-primary">
                                    ✅ Best available bulk pricing unlocked.
                                </p>
                            ) : null}
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3 rounded-xl border border-neutral-light px-4 py-2">
                                <button onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                                    className="text-xl font-bold text-text-muted hover:text-text-main">−</button>
                                <span className="w-8 text-center font-bold">{quantity}</span>
                                <button onClick={() => setQuantity((q) => q + 1)}
                                    className="text-xl font-bold text-text-muted hover:text-text-main">+</button>
                            </div>
                            <span className="text-sm text-text-muted">
                                Total selected: 1 box ({quantity} units)
                            </span>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleAddToIntent}
                                disabled={addingToIntent}
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-text-main shadow-md transition hover:bg-primary/90 disabled:opacity-60"
                            >
                                <span className="material-symbols-outlined text-base">add_shopping_cart</span>
                                {addingToIntent ? "Adding..." : "Add to Intent"}
                            </button>
                            <button className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-light bg-white transition hover:bg-neutral-light">
                                <span className="material-symbols-outlined text-base text-red-400">favorite</span>
                            </button>
                        </div>

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

                {/* Tabs — same layout, "items" tab added for products */}
                <div className="mt-12">
                    <div className="flex border-b border-neutral-light">
                        {tabs.map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-3 text-sm font-semibold capitalize transition ${activeTab === tab
                                    ? "border-b-2 border-primary text-primary"
                                    : "text-text-muted hover:text-text-main"
                                    }`}
                            >
                                {tab === "reviews"
                                    ? `Reviews (${item.reviews?.length ?? 0})`
                                    : tab === "items"
                                        ? `Items in Bundle (${bundleItems.length})`
                                        : tab}
                            </button>
                        ))}
                    </div>

                    <div className="mt-6">

                        {/* ── Items tab (products only) ── */}
                        {/* ── Items tab (products only) ── */}
                        {activeTab === "items" && (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {bundleItems.map((bundleItem, i) => (
                                    <div
                                        key={bundleItem._id || i}
                                        onClick={() => navigate(`/items/${bundleItem._id}`)}
                                        className="flex cursor-pointer gap-4 rounded-2xl border border-neutral-light bg-white p-4 shadow-sm transition hover:shadow-md"
                                    >
                                        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-neutral-light">
                                            <img
                                                src={bundleItem.images?.[0] || bundleItem.metadata?.imageUrl || ""}
                                                alt={bundleItem.title || "Item Image"}
                                                className="h-full w-full object-cover"
                                                onError={(e) => { e.target.style.display = "none"; }}
                                            />
                                        </div>
                                        <div className="flex flex-col justify-center gap-1">
                                            <h3 className="text-sm font-bold line-clamp-2">{bundleItem.title}</h3>
                                            {bundleItem.shortDescription && (
                                                <p className="text-xs text-text-muted line-clamp-1">{bundleItem.shortDescription}</p>
                                            )}
                                            <span className="text-sm font-extrabold text-primary">
                                                ${bundleItem.salesPrice?.toFixed(2)
                                                    ?? bundleItem.price?.[0]?.list?.toFixed(2)
                                                    ?? "—"}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {/* ✅ 🔥 PUT IT RIGHT HERE 🔥 */}
                        {productItems.length > 1 && (
                            <div className="mt-10">
                                <h2 className="mb-4 text-xl font-bold">Other Options</h2>

                                <div className="flex gap-4 overflow-x-auto">
                                    {productItems.map((it) => (

                                        <div

                                            key={it._id}
                                            onClick={() => {
                                                setItem({
                                                    ...it,
                                                    _isProduct: false,
                                                    _bundleItems: [],
                                                });
                                                setSelectedImage(0);
                                                setQuantity(1);
                                                setActiveTab("description");
                                            }}
                                            className={`min-w-[180px] cursor-pointer rounded-xl border p-3 transition
                        ${item._id === it._id ? "border-primary shadow-md" : "border-neutral-light"}
                    `}
                                        >
                                            <img
                                                src={it.images?.[0] || it.metadata?.imageUrl}
                                                className="h-28 w-full rounded-lg object-cover"
                                            />

                                            <p className="mt-2 text-sm font-semibold">
                                                {it.title}
                                            </p>

                                            <p className="text-xs text-gray-500">
                                                ${(it.price?.[0]?.sale ?? it.price?.[0]?.list ?? 0).toFixed(2)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        )
                        }

                        {/* ── Description tab — UNCHANGED ── */}
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

                        {/* ── Specifications tab — UNCHANGED ── */}
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

                        {/* ── Reviews tab — UNCHANGED ── */}
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