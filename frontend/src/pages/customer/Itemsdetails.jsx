import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

const API_URL = "http://localhost:5000/api/items";

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
                const token = localStorage.getItem("token");
                const res = await fetch(`${API_URL}/${id}`, {
                    headers: {
                        "Content-Type": "application/json",
                        ...(token && { Authorization: `Bearer ${token}` }),
                    },
                });
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.message || "Failed to fetch item");
                setItem(data.data);
                console.log(data)
            } catch (err) {
                console.error(err);
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
                <Navbar />
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
                <Navbar />
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
            <Navbar locationLabel="" />

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

















