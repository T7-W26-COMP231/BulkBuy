import { useState } from "react";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

// ── Placeholder block ────────────────────────────────────────
function Block({ className = "", label = "" }) {
    return (
        <div
            className={`flex items-center justify-center rounded-2xl border-2 border-dashed border-neutral-light bg-neutral-light/40 text-xs font-semibold uppercase tracking-widest text-text-muted ${className}`}
        >
            {label}
        </div>
    );
}

export default function ItemDetail() {
    const [activeTab, setActiveTab] = useState("description");
    const [quantity, setQuantity] = useState(1);

    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light font-display text-text-main">
            <Navbar locationLabel=" " />

            <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-10">

                {/* ── TOP: Image + Details ──────────────────────────── */}
                <div className="flex flex-col gap-10 md:flex-row">

                    {/* LEFT: Image gallery */}
                    <div className="flex flex-col gap-3 md:w-1/2">

                        {/* Main image */}
                        <Block className="h-80 md:h-96" label="Main Product Image" />

                        {/* Thumbnails */}
                        <div className="flex gap-2">
                            {[...Array(4)].map((_, i) => (
                                <Block key={i} className="h-20 w-20 flex-shrink-0 !rounded-xl" label={`Img ${i + 1}`} />
                            ))}
                            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-neutral-light bg-neutral-light/40 text-xs font-semibold text-text-muted">
                                +N More
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Details */}
                    <div className="flex flex-col gap-5 md:w-1/2">

                        {/* Status badge */}
                        <div className="w-fit rounded-full border-2 border-dashed border-primary/40 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
                            Status Badge
                        </div>

                        {/* Title */}
                        <Block className="h-12 w-3/4 !rounded-xl" label="Item Title" />

                        {/* Brand / seller */}
                        <Block className="h-6 w-48 !rounded-lg" label="Brand / Seller Name" />

                        {/* Price row */}
                        <div className="flex items-baseline gap-3">
                            <Block className="h-10 w-32 !rounded-xl" label="Sale Price" />
                            <Block className="h-7 w-24 !rounded-xl" label="List Price" />
                            <Block className="h-5 w-28 !rounded-lg" label="Per Unit Base" />
                        </div>

                        {/* Bulk pricing tiers card */}
                        <div className="rounded-2xl border border-neutral-light bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                                <span className="material-symbols-outlined text-base text-primary">label</span>
                                Bulk Pricing Tiers
                            </div>
                            <div className="flex flex-col gap-2">
                                {["Tier 1 (10–49 units)", "Tier 2 (50+ units)"].map((label, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-center justify-between rounded-xl px-4 py-2 text-sm ${i === 0 ? "bg-primary/10 font-bold text-primary" : "text-text-main"
                                            }`}
                                    >
                                        <span className="flex items-center gap-2">
                                            {label}
                                            {i === 0 && (
                                                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">
                                                    LOWEST
                                                </span>
                                            )}
                                        </span>
                                        <Block className="h-5 w-24 !rounded-lg" label="$X.XX / unit" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Community progress */}
                        <div>
                            <div className="mb-1 flex items-center justify-between text-sm">
                                <span className="text-text-muted">Current commitment level</span>
                                <span className="font-extrabold text-primary">XXX / XXX units</span>
                            </div>
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-light">
                                <div className="h-full w-2/3 rounded-full bg-primary" />
                            </div>
                            <p className="mt-1 text-xs text-primary">↗ X more units to unlock next tier pricing!</p>
                        </div>

                        {/* Quantity selector */}
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3 rounded-xl border border-neutral-light px-4 py-2">
                                <button
                                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                                    className="text-xl font-bold text-text-muted hover:text-text-main"
                                >−</button>
                                <span className="w-8 text-center font-bold">{quantity}</span>
                                <button
                                    onClick={() => setQuantity((q) => q + 1)}
                                    className="text-xl font-bold text-text-muted hover:text-text-main"
                                >+</button>
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
                            {[
                                { icon: "local_shipping", label: "Free Local Delivery" },
                                { icon: "schedule", label: "Closing in X days" },
                                { icon: "recycling", label: "Zero-waste packaging" },
                                { icon: "group", label: "XX buyers joined" },
                            ].map(({ icon, label }) => (
                                <div key={label} className="flex items-center gap-1">
                                    <span className="material-symbols-outlined text-base text-primary">{icon}</span>
                                    {label}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── TABS ─────────────────────────────────────────── */}
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
                                {tab === "reviews" ? "Reviews (0)" : tab}
                            </button>
                        ))}
                    </div>

                    <div className="mt-6">

                        {/* Description tab */}
                        {activeTab === "description" && (
                            <div className="flex flex-col gap-3">
                                <Block className="h-4 w-full !rounded-lg" label="Description line 1" />
                                <Block className="h-4 w-5/6 !rounded-lg" label="Description line 2" />
                                <Block className="h-4 w-4/6 !rounded-lg" label="Description line 3" />
                                <div className="mt-2 flex flex-col gap-2">
                                    {["Tag 1", "Tag 2", "Tag 3"].map((tag) => (
                                        <div key={tag} className="flex items-center gap-2 text-sm text-text-muted">
                                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                            {tag}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Specifications tab */}
                        {activeTab === "specifications" && (
                            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                                {["SKU", "Brand", "Weight", "Dimensions", "Ships From", "Shipping Class", "Tax Class", "Stock", "Backorder", "Region"].map((label) => (
                                    <div key={label} className="flex items-center justify-between rounded-xl border border-neutral-light bg-white px-4 py-3">
                                        <span className="font-semibold text-text-muted">{label}</span>
                                        <Block className="h-5 w-24 !rounded-lg" label="Value" />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Reviews tab */}
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
