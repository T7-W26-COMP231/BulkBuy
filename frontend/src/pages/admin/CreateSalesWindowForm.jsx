// src/components/admin/CreateSalesWindowForm.jsx
import { useState, useEffect, useCallback } from "react";
import api from "../../api/api";

const REGIONS = ["Toronto", "Scarborough", "Mississauga", "Brampton", "Markham", "Vaughan", "Richmond Hill", "Oakville", "Burlington", "Pickering"];

const TABS = [
    { id: "window", label: "1. Window", icon: "calendar_today" },
    { id: "products", label: "2. Products", icon: "inventory_2" },
    { id: "items", label: "3. Items", icon: "category" },
    { id: "pricing", label: "4. Pricing Tiers", icon: "sell" },
    { id: "review", label: "5. Review", icon: "fact_check" },
];

export default function CreateSalesWindowForm({ onSuccess }) {

    const [activeTab, setActiveTab] = useState("window");
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});

    // Step 1: Window
    const [region, setRegion] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [fromTime, setFromTime] = useState("00:00");
    const [toDate, setToDate] = useState("");
    const [toTime, setToTime] = useState("23:59");

    // Step 2: Products
    const [allProducts, setAllProducts] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [selectedProducts, setSelectedProducts] = useState([]); // [{ productId, name, items: [] }]
    const [productSearch, setProductSearch] = useState("");

    // Step 3: Items
    const [allItems, setAllItems] = useState({}); // { productId: [items] }
    const [loadingItems, setLoadingItems] = useState({});
    const [selectedItems, setSelectedItems] = useState({}); // { productId: [itemId] }

    // Step 4: Pricing tiers per item
    // { productId_itemId: [{ minQty, unitPrice }] }
    const [pricingTiers, setPricingTiers] = useState({});

    // Created window id (after step 1 submit)
    const [createdWindowId, setCreatedWindowId] = useState(null);

    const toEpoch = (date, time) => {
        if (!date) return null;
        return new Date(`${date}T${time || "00:00"}:00`).getTime();
    };

    // Load products when entering step 2
    useEffect(() => {
        if (activeTab !== "products") return;
        if (allProducts.length > 0) return;

        setLoadingProducts(true);
        api.get("/prdts", { params: { limit: 100 } })
            .then((r) => {
                console.log("📦 products response:", r.data);
                const products =
                    r.data?.items ||
                    r.data?.results ||
                    r.data?.data ||
                    (Array.isArray(r.data) ? r.data : []);
                setAllProducts(products);
            })
            .catch((e) => {
                console.error("❌ products error:", e?.response?.status, e?.response?.data);
                setAllProducts([]);
            })
            .finally(() => setLoadingProducts(false));
    }, [activeTab]);

    // Load items for selected products when entering step 3
    useEffect(() => {
        if (activeTab !== "items") return;

        selectedProducts.forEach((p) => {
            const pid = String(p._id || p.productId);
            if (allItems[pid]) return;

            const embedded = p.items || [];
            if (embedded.length === 0) {
                setAllItems((prev) => ({ ...prev, [pid]: [] }));
                return;
            }

            setLoadingItems((prev) => ({ ...prev, [pid]: true }));

            Promise.all(
                embedded.map((it, idx) => {
                    const iid = String(it.itemId?.$oid || it.itemId || `unknown-${idx}`);
                    return api.get(`/items/${iid}`)
                        .then((r) => {
                            const item = r.data?.data || r.data;
                            return { ...item, _id: iid, itemId: iid };
                        })
                        .catch(() => ({ _id: iid, itemId: iid, title: `Item ${iid}` }));
                })
            )
                .then((results) => setAllItems((prev) => ({ ...prev, [pid]: results })))
                .finally(() => setLoadingItems((prev) => ({ ...prev, [pid]: false })));
        });
    }, [activeTab, selectedProducts]);

    const toggleProduct = (product) => {
        const pid = product._id || product.productId;
        setSelectedProducts((prev) => {
            const exists = prev.find((p) => (p._id || p.productId) === pid);
            if (exists) {
                // remove product and its items/pricing
                setSelectedItems((si) => { const n = { ...si }; delete n[pid]; return n; });
                setPricingTiers((pt) => {
                    const n = { ...pt };
                    Object.keys(n).forEach((k) => { if (k.startsWith(pid)) delete n[k]; });
                    return n;
                });
                return prev.filter((p) => (p._id || p.productId) !== pid);
            }
            return [...prev, product];
        });
    };

    const toggleItem = (productId, itemId) => {
        setSelectedItems((prev) => {
            const current = prev[productId] || [];
            const exists = current.includes(itemId);
            const updated = exists ? current.filter((i) => i !== itemId) : [...current, itemId];
            if (!exists) {
                // init pricing tier for this item
                const key = `${productId}_${itemId}`;
                setPricingTiers((pt) => pt[key] ? pt : { ...pt, [key]: [{ minQty: 1, unitPrice: "" }] });
            } else {
                const key = `${productId}_${itemId}`;
                setPricingTiers((pt) => { const n = { ...pt }; delete n[key]; return n; });
            }
            return { ...prev, [productId]: updated };
        });
    };

    const addTier = (key) => {
        setPricingTiers((prev) => ({
            ...prev,
            [key]: [...(prev[key] || []), { minQty: "", unitPrice: "" }],
        }));
    };

    const removeTier = (key, idx) => {
        setPricingTiers((prev) => ({
            ...prev,
            [key]: (prev[key] || []).filter((_, i) => i !== idx),
        }));
    };

    const updateTier = (key, idx, field, value) => {
        setPricingTiers((prev) => {
            const tiers = [...(prev[key] || [])];
            tiers[idx] = { ...tiers[idx], [field]: value };
            return { ...prev, [key]: tiers };
        });
    };

    const validateWindow = () => {
        const e = {};
        if (!region) e.region = "Region is required";
        if (!fromDate) e.fromDate = "Start date is required";
        if (!toDate) e.toDate = "End date is required";
        if (fromDate && toDate && toEpoch(fromDate, fromTime) >= toEpoch(toDate, toTime)) {
            e.toDate = "End must be after start";
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleCreateWindow = () => {
        if (!validateWindow()) return;
        setCreatedWindowId("pending");
        setActiveTab("products");
    };

    const handleSaveItemsAndPricing = async () => {
        setSaving(true);
        setErrors({});
        try {
            // 1️⃣ create the window now
            const windowPayload = {
                ops_region: region,
                window: {
                    fromEpoch: toEpoch(fromDate, fromTime),
                    toEpoch: toEpoch(toDate, toTime),
                },
            };
            const windowRes = await api.post("/swnds", windowPayload);
            const windowId = windowRes.data?._id || windowRes.data?.id;
            setCreatedWindowId(windowId);

            // 2️⃣ save items + pricing tiers
            for (const product of selectedProducts) {
                const pid = product._id || product.productId;
                const items = selectedItems[pid] || [];
                for (const itemId of items) {
                    const key = `${pid}_${itemId}`;
                    const tiers = (pricingTiers[key] || [])
                        .map((t) => ({ minQty: Number(t.minQty), unitPrice: Number(t.unitPrice) }))
                        .filter((t) => t.minQty > 0 && t.unitPrice >= 0);

                    await api.post(
                        `/swnds/${windowId}/products/${pid}/items/${itemId}`,
                        { pricing_tiers: tiers }
                    );
                }
            }

            setActiveTab("review");
        } catch (err) {
            setErrors({ submit: err?.response?.data?.message || "Failed to save" });
        } finally {
            setSaving(false);
        }
    };

    const filteredProducts = allProducts.filter((p) =>
        !productSearch || (p.name || p.title || "").toLowerCase().includes(productSearch.toLowerCase())
    );

    const allSelectedItems = Object.entries(selectedItems).flatMap(([pid, itemIds]) => {
        const product = selectedProducts.find((p) => (p._id || p.productId) === pid);
        return itemIds.map((iid) => {
            const item = (allItems[pid] || []).find((it) => (it._id || it.itemId) === iid);
            return { pid, iid, productName: product?.name || product?.title || pid, itemName: item?.title || item?.name || iid };
        });
    });

    const canProceedToItems = selectedProducts.length > 0;
    const canProceedToPricing = Object.values(selectedItems).some((arr) => arr.length > 0);

    return (
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "1.5rem 0" }}>
            {/* Tab bar */}
            <div style={{ display: "flex", gap: 4, marginBottom: "1.5rem", borderBottom: "0.5px solid var(--color-border-tertiary)", paddingBottom: 0 }}>
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const isDone =
                        (tab.id === "window" && createdWindowId) ||
                        (tab.id === "products" && selectedProducts.length > 0) ||
                        (tab.id === "items" && canProceedToPricing) ||
                        (tab.id === "pricing" && activeTab === "review");

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                                if (tab.id === "window" || createdWindowId) setActiveTab(tab.id);
                            }}
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "10px 16px",
                                fontSize: 13, fontWeight: isActive ? 500 : 400,
                                color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                                background: "transparent", border: "none",
                                borderBottom: isActive ? "2px solid var(--color-text-primary)" : "2px solid transparent",
                                marginBottom: -1, cursor: createdWindowId || tab.id === "window" ? "pointer" : "default",
                                opacity: !createdWindowId && tab.id !== "window" ? 0.45 : 1,
                                transition: "color 0.15s",
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{isDone && !isActive ? "check_circle" : tab.icon}</span>
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab 1: Window */}
            {activeTab === "window" && (
                <div className="max-w-lg">
                    <p className="mb-6 text-sm text-text-muted">
                        Define the sales window time range and operational region.
                    </p>
                    <div className="flex flex-col gap-5">
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-text-main">Region</label>
                            <select value={region} onChange={(e) => setRegion(e.target.value)}
                                className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary">
                                <option value="">Select region…</option>
                                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                            {errors.region && <p className="mt-1 text-xs text-red-500">{errors.region}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="mb-2 block text-sm font-semibold text-text-main">Start date</label>
                                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                                    className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none transition focus:border-primary" />
                                {errors.fromDate && <p className="mt-1 text-xs text-red-500">{errors.fromDate}</p>}
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-semibold text-text-main">Start time</label>
                                <input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)}
                                    className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none transition focus:border-primary" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="mb-2 block text-sm font-semibold text-text-main">End date</label>
                                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                                    className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none transition focus:border-primary" />
                                {errors.toDate && <p className="mt-1 text-xs text-red-500">{errors.toDate}</p>}
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-semibold text-text-main">End time</label>
                                <input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)}
                                    className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none transition focus:border-primary" />
                            </div>
                        </div>

                        {fromDate && toDate && (
                            <div className="rounded-xl bg-neutral-light/60 px-4 py-3 text-sm">
                                <span className="text-text-muted">Duration: </span>
                                <span className="font-semibold">{Math.round((toEpoch(toDate, toTime) - toEpoch(fromDate, fromTime)) / 86400000)} days</span>
                            </div>
                        )}

                        {errors.submit && (
                            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errors.submit}</p>
                        )}

                        <div className="flex justify-end">
                            <button type="button" onClick={handleCreateWindow} disabled={saving}
                                className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-text-main transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
                                {saving ? "Creating…" : createdWindowId ? "Window created ✓" : "Create window & continue"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 2: Products */}
            {activeTab === "products" && (
                <div>
                    <p className="mb-4 text-sm text-text-muted">Select products to include in this sales window.</p>
                    <input type="text" placeholder="Search products…" value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="mb-4 w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none transition focus:border-primary" />

                    {loadingProducts ? (
                        <p className="text-sm text-text-muted">Loading products…</p>
                    ) : filteredProducts.length === 0 ? (
                        <p className="text-sm text-text-muted">No products found.</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {filteredProducts.map((product) => {
                                const pid = product._id || product.productId;
                                const isSelected = selectedProducts.some((p) => (p._id || p.productId) === pid);
                                return (
                                    <div key={pid} onClick={() => toggleProduct(product)}
                                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${isSelected ? "border-primary/40 bg-primary/5" : "border-neutral-light bg-white hover:bg-neutral-light/40"
                                            }`}>
                                        <div className={`flex size-5 shrink-0 items-center justify-center rounded border ${isSelected ? "border-primary bg-primary" : "border-neutral-light bg-white"
                                            }`}>
                                            {isSelected && <span className="material-symbols-outlined text-[13px] text-white">check</span>}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-text-main">{product.name || product.title}</p>
                                            {product.ops_region && <p className="text-xs text-text-muted">{product.ops_region}</p>}
                                        </div>
                                        <span className="text-xs text-text-muted">{(product.items || []).length} items</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="mt-6 flex items-center justify-between">
                        <span className="text-sm text-text-muted">{selectedProducts.length} product(s) selected</span>
                        <button type="button" onClick={() => setActiveTab("items")} disabled={!canProceedToItems}
                            className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-text-main transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                            Continue to items
                        </button>
                    </div>
                </div>
            )}

            {/* Tab 3: Items */}
            {activeTab === "items" && (
                <div>
                    <p className="mb-4 text-sm text-text-muted">Select items for each product. You'll set pricing tiers next.</p>
                    {selectedProducts.map((product) => {
                        const pid = product._id || product.productId;
                        const items = allItems[pid] || [];
                        const selectedForProduct = selectedItems[pid] || [];
                        return (
                            <div key={pid} className="mb-6">
                                <div className="mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[18px] text-text-muted">inventory_2</span>
                                    <p className="text-sm font-semibold text-text-main">{product.name || product.title}</p>
                                    <span className="ml-auto text-xs text-text-muted">{selectedForProduct.length} selected</span>
                                </div>
                                {loadingItems[pid] ? (
                                    <p className="pl-6 text-sm text-text-muted">Loading items…</p>
                                ) : items.length === 0 ? (
                                    <p className="pl-6 text-sm text-text-muted">No items found.</p>
                                ) : (
                                    <div className="flex flex-col gap-2 pl-6">
                                        {items.map((item) => {
                                            const iid = item._id || item.itemId;
                                            const isSelected = selectedForProduct.includes(iid);
                                            return (
                                                <div key={iid} onClick={() => toggleItem(pid, iid)}
                                                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${isSelected ? "border-primary/40 bg-primary/5" : "border-neutral-light bg-white hover:bg-neutral-light/40"
                                                        }`}>
                                                    <div className={`flex size-5 shrink-0 items-center justify-center rounded border ${isSelected ? "border-primary bg-primary" : "border-neutral-light bg-white"
                                                        }`}>
                                                        {isSelected && <span className="material-symbols-outlined text-[13px] text-white">check</span>}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-semibold">{item.title || item.name || iid}</p>
                                                        {item.sku && <p className="text-xs text-text-muted">SKU: {item.sku}</p>}
                                                    </div>
                                                    {item.inventory?.stock !== undefined && (
                                                        <span className="text-xs text-text-muted">Stock: {item.inventory.stock}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <div className="flex items-center justify-between">
                        <button type="button" onClick={() => setActiveTab("products")}
                            className="rounded-xl border border-neutral-light px-5 py-3 text-sm font-semibold text-text-muted transition hover:bg-neutral-light">
                            Back
                        </button>
                        <button type="button" onClick={() => setActiveTab("pricing")} disabled={!canProceedToPricing}
                            className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-text-main transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                            Continue to pricing
                        </button>
                    </div>
                </div>
            )}

            {/* Tab 4: Pricing tiers — matches mockup exactly */}
            {activeTab === "pricing" && (
                <div>
                    <p className="mb-6 text-sm text-text-muted">Set pricing tiers for each selected item.</p>
                    {allSelectedItems.map(({ pid, iid, productName, itemName }) => {
                        const key = `${pid}_${iid}`;
                        const tiers = pricingTiers[key] || [];
                        return (
                            <div key={key} className="mb-6 overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
                                <div className="flex items-center justify-between border-b border-neutral-light px-6 py-4">
                                    <div>
                                        <p className="text-sm font-semibold text-text-main">{itemName}</p>
                                        <p className="text-xs text-text-muted">{productName}</p>
                                    </div>
                                    <button type="button" onClick={() => addTier(key)}
                                        className="inline-flex items-center gap-1 rounded-xl border border-neutral-light bg-white px-4 py-2 text-sm font-semibold transition hover:bg-neutral-light">
                                        <span className="material-symbols-outlined text-[16px]">add</span>
                                        Add Tier
                                    </button>
                                </div>

                                <div className="grid grid-cols-[1fr_1fr_80px] gap-4 border-b border-neutral-light bg-neutral-light/40 px-6 py-3 text-xs font-bold uppercase tracking-widest text-text-muted">
                                    <span>Min Quantity</span>
                                    <span>Unit Price ($)</span>
                                    <span className="text-center">Action</span>
                                </div>

                                <div className="divide-y divide-neutral-light">
                                    {tiers.map((tier, idx) => (
                                        <div key={idx} className={`grid grid-cols-[1fr_1fr_80px] items-end gap-4 px-6 py-5 ${idx === 0 ? "bg-primary/5" : "bg-white"}`}>
                                            <div>
                                                <label className="mb-2 block text-sm font-semibold text-text-muted">
                                                    {idx === 0 ? "Base Tier (Min Qty)" : `Tier ${idx + 1} Min Qty`}
                                                </label>
                                                <input type="number" min="1" placeholder="e.g. 100"
                                                    value={tier.minQty} onChange={(e) => updateTier(key, idx, "minQty", e.target.value)}
                                                    className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none transition focus:border-primary" />
                                            </div>
                                            <div>
                                                <label className="mb-2 block text-sm font-semibold text-text-muted">Unit Price ($)</label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">$</span>
                                                    <input type="number" min="0" step="0.01" placeholder="e.g. 2.50"
                                                        value={tier.unitPrice} onChange={(e) => updateTier(key, idx, "unitPrice", e.target.value)}
                                                        className="w-full rounded-xl border border-neutral-light bg-white py-3 pl-8 pr-4 text-sm outline-none transition focus:border-primary" />
                                                </div>
                                            </div>
                                            <div className="flex justify-center">
                                                <button type="button" onClick={() => removeTier(key, idx)} disabled={tiers.length <= 1}
                                                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="border-t border-neutral-light px-6 py-4 text-xs text-text-muted">
                                    Changes will apply to all products using this pricing strategy.
                                </div>
                            </div>
                        );
                    })}

                    {errors.submit && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errors.submit}</p>}

                    <div className="flex items-center justify-between">
                        <button type="button" onClick={() => setActiveTab("items")}
                            className="rounded-xl border border-neutral-light px-5 py-3 text-sm font-semibold text-text-muted transition hover:bg-neutral-light">
                            Back
                        </button>
                        <button type="button" onClick={handleSaveItemsAndPricing} disabled={saving}
                            className={`rounded-xl px-6 py-3 text-sm font-bold text-text-main transition ${saving ? "cursor-not-allowed bg-neutral-light opacity-60" : "bg-primary hover:opacity-90"}`}>
                            {saving ? "Saving…" : "Save & review"}
                        </button>
                    </div>
                </div>
            )}

            {/* Tab 5: Review */}
            {activeTab === "review" && (
                <div>
                    <p className="mb-6 text-sm text-text-muted">Sales window created successfully. Here's a summary.</p>
                    <div className="mb-6 flex flex-col gap-3">
                        <div className="rounded-xl bg-neutral-light/60 px-4 py-3">
                            <p className="text-xs text-text-muted">Window ID</p>
                            <p className="mt-1 font-mono text-sm font-semibold">{createdWindowId}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: "Region", value: region },
                                { label: "Products", value: selectedProducts.length },
                                { label: "Items", value: allSelectedItems.length },
                            ].map(({ label, value }) => (
                                <div key={label} className="rounded-xl bg-neutral-light/60 px-4 py-3">
                                    <p className="text-xs text-text-muted">{label}</p>
                                    <p className="mt-1 text-2xl font-bold text-text-main">{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-neutral-light bg-white">
                        <div className="border-b border-neutral-light px-6 py-4">
                            <p className="text-sm font-semibold text-text-main">Items & pricing</p>
                        </div>
                        <div className="divide-y divide-neutral-light">
                            {allSelectedItems.map(({ pid, iid, productName, itemName }) => {
                                const key = `${pid}_${iid}`;
                                const tiers = pricingTiers[key] || [];
                                return (
                                    <div key={key} className="px-6 py-4">
                                        <p className="text-sm font-semibold text-text-main">{itemName}</p>
                                        <p className="mb-3 text-xs text-text-muted">{productName}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {tiers.map((t, i) => (
                                                <span key={i} className="rounded-lg bg-neutral-light px-3 py-1.5 text-xs font-semibold text-text-main">
                                                    {t.minQty}+ units · ${Number(t.unitPrice).toFixed(2)}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <button type="button" onClick={() => setActiveTab("pricing")}
                            className="rounded-xl border border-neutral-light px-5 py-3 text-sm font-semibold text-text-muted transition hover:bg-neutral-light">
                            Edit pricing
                        </button>
                        {onSuccess && (
                            <button type="button" onClick={() => onSuccess(createdWindowId)}
                                className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-text-main transition hover:opacity-90">
                                Done
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}