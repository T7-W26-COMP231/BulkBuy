import { useState, useEffect } from "react";
import api from "../../api/api";
import CreateProductModal from "../../components/admin/CreateProductModal";
import CreateItemModal from "../../components/admin/CreateItemModal";

const REGIONS = ["Toronto", "Scarborough", "Mississauga", "Brampton", "Markham", "Vaughan", "Richmond Hill", "Oakville", "Burlington", "Pickering"];

const TABS = [
    { id: "window", label: "1. Window", icon: "calendar_today" },
    { id: "products", label: "2. Products", icon: "inventory_2" },
    { id: "items", label: "3. Items", icon: "category" },
    { id: "pricing", label: "4. Pricing Tiers", icon: "sell" },
    { id: "review", label: "5. Review", icon: "fact_check" },
];

function epochToDisplay(epoch) {
    if (!epoch) return "—";
    return new Date(epoch).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

export default function CreateSalesWindowForm({ onSuccess }) {
    const [activeTab, setActiveTab] = useState("window");
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});
    const [itemSearch, setItemSearch] = useState("");
    const [isCreatingNewWindow, setIsCreatingNewWindow] = useState(false);
    const [windowMode, setWindowMode] = useState("select");
    const [existingWindows, setExistingWindows] = useState([]);
    const [loadingWindows, setLoadingWindows] = useState(false);
    const [windowSearch, setWindowSearch] = useState("");
    const [selectedWindowData, setSelectedWindowData] = useState(null);

    const [region, setRegion] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [fromTime, setFromTime] = useState("00:00");
    const [toDate, setToDate] = useState("");
    const [toTime, setToTime] = useState("23:59");

    const [allProducts, setAllProducts] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [productSearch, setProductSearch] = useState("");
    const [showCreateProduct, setShowCreateProduct] = useState(false);

    const [allItems, setAllItems] = useState({});
    const [loadingItems, setLoadingItems] = useState({});
    const [selectedItems, setSelectedItems] = useState({});
    const [showCreateItem, setShowCreateItem] = useState(false);
    const [focusedProductId, setFocusedProductId] = useState(null);

    const [pricingTiers, setPricingTiers] = useState({});
    const [createdWindowId, setCreatedWindowId] = useState(null);

    const toEpoch = (date, time) => {
        if (!date) return null;
        return new Date(`${date}T${time || "00:00"}:00`).getTime();
    };

    const buildSalesWindowPayload = () => {
        const now = Date.now();

        const products = selectedProducts.map((product) => {
            const pid = String(product._id || product.productId);

            return {
                productId: pid,
                metadata: product.metadata || {},
                items: (selectedItems[pid] || []).map((itemId) => {
                    const iid = String(itemId);
                    const key = `${pid}_${iid}`;

                    const pricing_tiers = (pricingTiers[key] || [])
                        .map((t) => ({
                            minQty: Number(t.minQty),
                            unitPrice: Number(t.unitPrice),
                        }))
                        .filter(
                            (t) =>
                                Number.isFinite(t.minQty) &&
                                t.minQty > 0 &&
                                Number.isFinite(t.unitPrice) &&
                                t.unitPrice >= 0
                        );

                    return {
                        itemId: iid,
                        productId: pid,
                        pricing_snapshots: [],
                        qtySold: 0,
                        qtyAvailable: 0,
                        pricing_tiers,
                        metadata: {},
                        createdAt: now,
                        updatedAt: now,
                    };
                }),
            };
        });

        return {
            window: {
                fromEpoch: toEpoch(fromDate, fromTime),
                toEpoch: toEpoch(toDate, toTime),
            },
            products,
            ops_region: region,
            overflow_id: selectedWindowData?.overflow_id ?? null,
            isHead: selectedWindowData?.isHead ?? true,
            metadata: selectedWindowData?.metadata || {},
            updatedAt: now,
            ...(createdWindowId ? {} : { createdAt: now }),
        };
    };


    useEffect(() => {
        setLoadingWindows(true);
        api.get("/swnds", { params: { limit: 50 } })
            .then((r) => {
                const wins = r.data?.items || r.data?.data || r.data?.results || (Array.isArray(r.data) ? r.data : []);
                setExistingWindows(wins);
            })
            .catch(() => setExistingWindows([]))
            .finally(() => setLoadingWindows(false));
    }, []);

    useEffect(() => {
        if (activeTab !== "products") return;
        if (allProducts.length > 0) return;
        setLoadingProducts(true);
        api.get("/prdts", { params: { limit: 100 } })
            .then((r) => {
                const products = r.data?.items || r.data?.results || r.data?.data || (Array.isArray(r.data) ? r.data : []);
                setAllProducts(products);
            })
            .catch(() => setAllProducts([]))
            .finally(() => setLoadingProducts(false));
    }, [activeTab]);

    useEffect(() => {
        if (activeTab !== "items") return;
        selectedProducts.forEach((p) => {
            const pid = String(p._id || p.productId);
            if (allItems[pid]) return;
            setLoadingItems((prev) => ({ ...prev, [pid]: true }));
            api.get("/items", { params: { limit: 100 } })
                .then((r) => {
                    const items = r.data?.items || r.data?.data || r.data?.results || (Array.isArray(r.data) ? r.data : []);
                    setAllItems((prev) => ({ ...prev, [pid]: items }));
                })
                .catch(() => setAllItems((prev) => ({ ...prev, [pid]: [] })))
                .finally(() => setLoadingItems((prev) => ({ ...prev, [pid]: false })));
        });
    }, [activeTab, selectedProducts]);

    useEffect(() => {
        if (activeTab === "items" && !focusedProductId && selectedProducts.length > 0) {
            setFocusedProductId(String(selectedProducts[0]._id || selectedProducts[0].productId));
        }
    }, [activeTab, selectedProducts]);

    const epochToDateInput = (epoch) => {
        if (!epoch) return "";
        const d = new Date(epoch);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    };

    const epochToTimeInput = (epoch) => {
        if (!epoch) return "00:00";
        const d = new Date(epoch);
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
    };

    const handleSelectExistingWindow = (win) => {
        setSelectedWindowData(win);
        setCreatedWindowId(String(win._id || win.id));
        setRegion(win.ops_region || "");

        setFromDate(epochToDateInput(win.window?.fromEpoch));
        setFromTime(epochToTimeInput(win.window?.fromEpoch));
        setToDate(epochToDateInput(win.window?.toEpoch));
        setToTime(epochToTimeInput(win.window?.toEpoch));
    };

    const validateWindow = () => {
        const e = {};
        if (!region) e.region = "Region is required";
        if (!fromDate) e.fromDate = "Start date is required";
        if (!toDate) e.toDate = "End date is required";
        if (fromDate && toDate && toEpoch(fromDate, fromTime) >= toEpoch(toDate, toTime))
            e.toDate = "End must be after start";
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleCreateWindow = () => {
        if (!validateWindow()) return;

        setCreatedWindowId(null);
        setSelectedWindowData(null);
        setSelectedProducts([]);
        setSelectedItems({});
        setPricingTiers({});
        setFocusedProductId(null);

        setActiveTab("products");
    };

    const toggleProduct = (product) => {
        const pid = product._id || product.productId;
        setSelectedProducts((prev) => {
            const exists = prev.find((p) => (p._id || p.productId) === pid);
            if (exists) {
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
            const key = `${productId}_${itemId}`;
            if (!exists) {
                setPricingTiers((pt) => pt[key] ? pt : { ...pt, [key]: [{ minQty: 1, unitPrice: "" }] });
                const product = selectedProducts.find((p) => String(p._id || p.productId) === productId);
                const existingRefs = (product?.items || []).map((ref) => ({ itemId: String(ref.itemId?.$oid || ref.itemId) }));
                const alreadyLinked = existingRefs.some((r) => r.itemId === itemId);
                if (!alreadyLinked) {
                    api.patch(`/prdts/${productId}`, { items: [...existingRefs, { itemId }] })
                        .then(() => setSelectedProducts((prev) => prev.map((p) =>
                            String(p._id || p.productId) === productId
                                ? { ...p, items: [...(p.items || []), { itemId }] } : p
                        )))
                        .catch((err) => console.warn("Failed to link item to product:", err.message));
                }
            } else {
                setPricingTiers((pt) => { const n = { ...pt }; delete n[key]; return n; });
            }
            return { ...prev, [productId]: updated };
        });
    };

    const addTier = (key) => setPricingTiers((prev) => ({ ...prev, [key]: [...(prev[key] || []), { minQty: "", unitPrice: "" }] }));
    const removeTier = (key, idx) => setPricingTiers((prev) => ({ ...prev, [key]: (prev[key] || []).filter((_, i) => i !== idx) }));
    const updateTier = (key, idx, field, value) => setPricingTiers((prev) => {
        const tiers = [...(prev[key] || [])]; tiers[idx] = { ...tiers[idx], [field]: value }; return { ...prev, [key]: tiers };
    });

    const handleSaveItemsAndPricing = async () => {
        setSaving(true);
        setErrors({});

        try {
            const payload = buildSalesWindowPayload();

            if (windowMode === "create" || !createdWindowId) {
                const res = await api.post("/swnds", payload);

                const newId =
                    res.data?.data?._id ||
                    res.data?._id ||
                    res.data?.id ||
                    null;

                setCreatedWindowId(newId);
                setSelectedWindowData(res.data?.data || null);
            } else {
                await api.patch(`/swnds/${createdWindowId}`, payload);

                setSelectedWindowData((prev) => ({
                    ...(prev || {}),
                    ...payload,
                    _id: createdWindowId,
                    id: createdWindowId,
                }));
            }

            setActiveTab("review");
        } catch (err) {
            setErrors({
                submit: err?.response?.data?.message || "Failed to save",
            });
        } finally {
            setSaving(false);
        }
    };

    const filteredProducts = allProducts.filter((p) => !productSearch || (p.name || p.title || "").toLowerCase().includes(productSearch.toLowerCase()));
    const filteredWindows = existingWindows.filter((w) => !windowSearch || (w.ops_region || "").toLowerCase().includes(windowSearch.toLowerCase()) || String(w._id || "").toLowerCase().includes(windowSearch.toLowerCase()));
    const allSelectedItems = Object.entries(selectedItems).flatMap(([pid, itemIds]) => {
        const product = selectedProducts.find((p) => (p._id || p.productId) === pid);
        return itemIds.map((iid) => {
            const item = (allItems[pid] || []).find((it) => (it._id || it.itemId) === iid);
            return { pid, iid, productName: product?.name || product?.title || pid, itemName: item?.title || item?.name || iid };
        });
    });

    const canProceedToItems = selectedProducts.length > 0;
    const canProceedToPricing = Object.values(selectedItems).some((arr) => arr.length > 0);
    const focusedProduct = selectedProducts.find((p) => String(p._id || p.productId) === focusedProductId);
    const focusedItems = focusedProductId ? (allItems[focusedProductId] || []) : [];
    const focusedSelectedItems = focusedProductId ? (selectedItems[focusedProductId] || []) : [];

    return (
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "1.5rem 0" }}>

            {showCreateProduct && (
                <CreateProductModal onClose={() => setShowCreateProduct(false)}
                    onCreated={(product) => { setAllProducts((prev) => [product, ...prev]); setSelectedProducts((prev) => [product, ...prev]); }} />
            )}

            {showCreateItem && focusedProductId && (
                <CreateItemModal
                    productId={focusedProductId}
                    existingItemIds={(focusedProduct?.items || []).map((ref) => String(ref.itemId?.$oid || ref.itemId))}
                    onClose={() => setShowCreateItem(false)}
                    onCreated={(item) => {
                        setAllItems((prev) => ({ ...prev, [focusedProductId]: [...(prev[focusedProductId] || []), item] }));
                        setSelectedProducts((prev) => prev.map((p) =>
                            String(p._id || p.productId) === focusedProductId
                                ? { ...p, items: [...(p.items || []), { itemId: String(item._id) }] } : p
                        ));
                    }} />
            )}

            {/* Tab bar */}
            <div style={{ display: "flex", gap: 4, marginBottom: "1.5rem", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const isDone = (tab.id === "window" && createdWindowId) || (tab.id === "products" && selectedProducts.length > 0) || (tab.id === "items" && canProceedToPricing) || (tab.id === "pricing" && activeTab === "review");
                    return (
                        <button key={tab.id} type="button" onClick={() => { if (tab.id === "window" || createdWindowId) setActiveTab(tab.id); }}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", fontSize: 13, fontWeight: isActive ? 500 : 400, color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)", background: "transparent", border: "none", borderBottom: isActive ? "2px solid var(--color-text-primary)" : "2px solid transparent", marginBottom: -1, cursor: createdWindowId || tab.id === "window" ? "pointer" : "default", opacity: !createdWindowId && tab.id !== "window" ? 0.45 : 1, transition: "color 0.15s" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{isDone && !isActive ? "check_circle" : tab.icon}</span>
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* TAB 1: WINDOW */}
            {activeTab === "window" && (
                <div>
                    <div className="mb-6 flex gap-2">
                        <button type="button" onClick={() => setWindowMode("select")}
                            className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition ${windowMode === "select" ? "border-primary bg-primary/10 text-primary" : "border-neutral-light bg-white text-text-muted hover:bg-neutral-light"}`}>
                            Select existing window
                        </button>
                        <button type="button" onClick={() => setWindowMode("create")}
                            className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition ${windowMode === "create" ? "border-primary bg-primary/10 text-primary" : "border-neutral-light bg-white text-text-muted hover:bg-neutral-light"}`}>
                            Create new window
                        </button>
                    </div>

                    {windowMode === "select" && (
                        <div>
                            <p className="mb-4 text-sm text-text-muted">Select a sales window to add products and items to.</p>
                            <input type="text" placeholder="Search by region or ID…" value={windowSearch} onChange={(e) => setWindowSearch(e.target.value)}
                                className="mb-4 w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
                            {loadingWindows ? (
                                <p className="text-sm text-text-muted">Loading windows…</p>
                            ) : filteredWindows.length === 0 ? (
                                <p className="text-sm text-text-muted">No existing windows found. Switch to "Create new window".</p>
                            ) : (
                                <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
                                    {filteredWindows.map((win) => {
                                        const wid = String(win._id || win.id);
                                        const isSelected = createdWindowId === wid;
                                        const now = Date.now();
                                        const from = win.window?.fromEpoch;
                                        const to = win.window?.toEpoch;
                                        const status = !from || !to ? "unknown" : now < from ? "upcoming" : now > to ? "closed" : "open";
                                        const statusColor = status === "open" ? "text-green-600 bg-green-50 border-green-200" : status === "upcoming" ? "text-blue-600 bg-blue-50 border-blue-200" : "text-text-muted bg-neutral-light border-neutral-light";
                                        return (
                                            <div key={wid} onClick={() => handleSelectExistingWindow(win)}
                                                className={`flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-3 transition ${isSelected ? "border-primary/40 bg-primary/5" : "border-neutral-light bg-white hover:bg-neutral-light/40"}`}>
                                                <div className={`flex size-5 shrink-0 items-center justify-center rounded border ${isSelected ? "border-primary bg-primary" : "border-neutral-light bg-white"}`}>
                                                    {isSelected && <span className="material-symbols-outlined text-[13px] text-white">check</span>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-text-main">{win.ops_region || "No region"}</p>
                                                    <p className="text-xs font-mono text-text-muted truncate">{wid}</p>
                                                    <p className="text-xs text-text-muted">{epochToDisplay(from)} → {epochToDisplay(to)}</p>
                                                </div>
                                                <div className="flex flex-col items-end gap-1.5">
                                                    <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${statusColor}`}>{status}</span>
                                                    <span className="text-xs text-text-muted">{(win.products || []).length} products</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {createdWindowId && selectedWindowData && (
                                <div className="mt-4 flex justify-end">
                                    <button type="button" onClick={() => setActiveTab("products")}
                                        className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-text-main transition hover:opacity-90">
                                        Continue with this window →
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {windowMode === "create" && (
                        <div className="max-w-lg">
                            <p className="mb-6 text-sm text-text-muted">Define the sales window time range and operational region.</p>
                            <div className="flex flex-col gap-5">
                                <div>
                                    <label className="mb-2 block text-sm font-semibold text-text-main">Region</label>
                                    <select value={region} onChange={(e) => setRegion(e.target.value)}
                                        className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none transition focus:border-primary">
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
                                {errors.submit && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errors.submit}</p>}
                                <div className="flex justify-end">
                                    <button type="button" onClick={handleCreateWindow} disabled={saving}
                                        className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-text-main transition hover:opacity-90 disabled:opacity-60">
                                        Create window & continue
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: PRODUCTS */}
            {activeTab === "products" && (
                <div>
                    <div className="mb-4 flex items-center justify-between">
                        <p className="text-sm text-text-muted">Select products to include in this sales window.</p>
                        <button type="button" onClick={() => setShowCreateProduct(true)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-text-main transition hover:opacity-90">
                            <span className="material-symbols-outlined text-[16px]">add</span>New product
                        </button>
                    </div>
                    <input type="text" placeholder="Search products…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                        className="mb-4 w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none transition focus:border-primary" />
                    {loadingProducts ? <p className="text-sm text-text-muted">Loading products…</p>
                        : filteredProducts.length === 0 ? <p className="text-sm text-text-muted">No products found.</p>
                            : (
                                <div className="flex flex-col gap-2">
                                    {filteredProducts.map((product) => {
                                        const pid = product._id || product.productId;
                                        const isSelected = selectedProducts.some((p) => (p._id || p.productId) === pid);
                                        return (
                                            <div key={pid} onClick={() => toggleProduct(product)}
                                                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${isSelected ? "border-primary/40 bg-primary/5" : "border-neutral-light bg-white hover:bg-neutral-light/40"}`}>
                                                <div className={`flex size-5 shrink-0 items-center justify-center rounded border ${isSelected ? "border-primary bg-primary" : "border-neutral-light bg-white"}`}>
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
                        <button type="button" onClick={() => { setActiveTab("items"); setFocusedProductId(selectedProducts[0] ? String(selectedProducts[0]._id || selectedProducts[0].productId) : null); }}
                            disabled={!canProceedToItems}
                            className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-text-main transition hover:opacity-90 disabled:opacity-40">
                            Continue to items
                        </button>
                    </div>
                </div>
            )}

            {/* TAB 3: ITEMS */}
            {activeTab === "items" && (
                <div className="grid grid-cols-[220px_1fr] gap-6">
                    <div className="flex flex-col gap-2">
                        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-text-muted">Products</p>
                        {selectedProducts.map((p) => {
                            const pid = String(p._id || p.productId);
                            const isFocused = focusedProductId === pid;
                            const count = (selectedItems[pid] || []).length;
                            return (
                                <button key={pid} type="button" onClick={() => setFocusedProductId(pid)}
                                    className={`text-left rounded-xl border px-4 py-3 transition ${isFocused ? "border-primary/40 bg-primary/5" : "border-neutral-light bg-white hover:bg-neutral-light/40"}`}>
                                    <p className="text-sm font-semibold text-text-main truncate">{p.name || p.title}</p>
                                    <p className="mt-0.5 text-xs text-text-muted">{count} item{count !== 1 ? "s" : ""} selected</p>
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex flex-col gap-3">
                        {!focusedProductId ? <p className="text-sm text-text-muted">Select a product on the left.</p> : (
                            <>
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-text-main">{focusedProduct?.name || focusedProduct?.title}</p>
                                    <button type="button" onClick={() => setShowCreateItem(true)}
                                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-text-main transition hover:opacity-90">
                                        <span className="material-symbols-outlined text-[16px]">add</span>New item
                                    </button>
                                </div>
                                <input type="text" placeholder="Search items…" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)}
                                    className="w-full rounded-xl border border-neutral-light bg-white px-4 py-2.5 text-sm outline-none focus:border-primary" />
                                {loadingItems[focusedProductId] ? <p className="text-sm text-text-muted">Loading items…</p>
                                    : focusedItems.length === 0 ? <p className="text-sm text-text-muted">No items found. Create one above.</p>
                                        : (
                                            <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
                                                {focusedItems.filter((item) => !itemSearch || (item.title || item.name || "").toLowerCase().includes(itemSearch.toLowerCase()) || (item.sku || "").toLowerCase().includes(itemSearch.toLowerCase()))
                                                    .map((item) => {
                                                        const iid = item._id || item.itemId;
                                                        const isSelected = focusedSelectedItems.includes(iid);
                                                        return (
                                                            <div key={iid} onClick={() => toggleItem(focusedProductId, iid)}
                                                                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${isSelected ? "border-primary/40 bg-primary/5" : "border-neutral-light bg-white hover:bg-neutral-light/40"}`}>
                                                                <div className={`flex size-5 shrink-0 items-center justify-center rounded border ${isSelected ? "border-primary bg-primary" : "border-neutral-light bg-white"}`}>
                                                                    {isSelected && <span className="material-symbols-outlined text-[13px] text-white">check</span>}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <p className="text-sm font-semibold text-text-main">{item.title || item.name || iid}</p>
                                                                    {item.sku && <p className="text-xs text-text-muted">SKU: {item.sku}</p>}
                                                                </div>
                                                                {item.inventory?.stock !== undefined && <span className="text-xs text-text-muted">Stock: {item.inventory.stock}</span>}
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        )}
                            </>
                        )}
                        <div className="mt-4 flex items-center justify-between">
                            <button type="button" onClick={() => setActiveTab("products")}
                                className="rounded-xl border border-neutral-light px-5 py-3 text-sm font-semibold text-text-muted transition hover:bg-neutral-light">Back</button>
                            <button type="button" onClick={() => setActiveTab("pricing")} disabled={!canProceedToPricing}
                                className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-text-main transition hover:opacity-90 disabled:opacity-40">Continue to pricing</button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 4: PRICING TIERS */}
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
                                        <span className="material-symbols-outlined text-[16px]">add</span>Add Tier
                                    </button>
                                </div>
                                <div className="grid grid-cols-[1fr_1fr_80px] gap-4 border-b border-neutral-light bg-neutral-light/40 px-6 py-3 text-xs font-bold uppercase tracking-widest text-text-muted">
                                    <span>Min Quantity</span><span>Unit Price ($)</span><span className="text-center">Action</span>
                                </div>
                                <div className="divide-y divide-neutral-light">
                                    {tiers.map((tier, idx) => (
                                        <div key={idx} className={`grid grid-cols-[1fr_1fr_80px] items-end gap-4 px-6 py-5 ${idx === 0 ? "bg-primary/5" : "bg-white"}`}>
                                            <div>
                                                <label className="mb-2 block text-sm font-semibold text-text-muted">{idx === 0 ? "Base Tier (Min Qty)" : `Tier ${idx + 1} Min Qty`}</label>
                                                <input type="number" min="1" placeholder="e.g. 100" value={tier.minQty} onChange={(e) => updateTier(key, idx, "minQty", e.target.value)}
                                                    className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none transition focus:border-primary" />
                                            </div>
                                            <div>
                                                <label className="mb-2 block text-sm font-semibold text-text-muted">Unit Price ($)</label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">$</span>
                                                    <input type="number" min="0" step="0.01" placeholder="e.g. 2.50" value={tier.unitPrice} onChange={(e) => updateTier(key, idx, "unitPrice", e.target.value)}
                                                        className="w-full rounded-xl border border-neutral-light bg-white py-3 pl-8 pr-4 text-sm outline-none transition focus:border-primary" />
                                                </div>
                                            </div>
                                            <div className="flex justify-center">
                                                <button type="button" onClick={() => removeTier(key, idx)} disabled={tiers.length <= 1}
                                                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40">Remove</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t border-neutral-light px-6 py-4 text-xs text-text-muted">Changes will apply to all products using this pricing strategy.</div>
                            </div>
                        );
                    })}
                    {errors.submit && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errors.submit}</p>}
                    <div className="flex items-center justify-between">
                        <button type="button" onClick={() => setActiveTab("items")}
                            className="rounded-xl border border-neutral-light px-5 py-3 text-sm font-semibold text-text-muted transition hover:bg-neutral-light">Back</button>
                        <button type="button" onClick={handleSaveItemsAndPricing} disabled={saving}
                            className={`rounded-xl px-6 py-3 text-sm font-bold text-text-main transition ${saving ? "cursor-not-allowed bg-neutral-light opacity-60" : "bg-primary hover:opacity-90"}`}>
                            {saving ? "Saving…" : "Save & review"}
                        </button>
                    </div>
                </div>
            )}

            {/* TAB 5: REVIEW */}
            {activeTab === "review" && (
                <div>
                    <p className="mb-6 text-sm text-text-muted">
                        {selectedWindowData ? "Items added to existing window." : "Sales window created successfully."} Here's a summary.
                    </p>
                    <div className="mb-6 flex flex-col gap-3">
                        <div className="rounded-xl bg-neutral-light/60 px-4 py-3">
                            <p className="text-xs text-text-muted">Window ID</p>
                            <p className="mt-1 font-mono text-sm font-semibold">{createdWindowId}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {[{ label: "Region", value: region || selectedWindowData?.ops_region || "—" }, { label: "Products", value: selectedProducts.length }, { label: "Items", value: allSelectedItems.length }].map(({ label, value }) => (
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
                            className="rounded-xl border border-neutral-light px-5 py-3 text-sm font-semibold text-text-muted transition hover:bg-neutral-light">Edit pricing</button>
                        {onSuccess && (
                            <button type="button" onClick={() => onSuccess(createdWindowId)}
                                className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-text-main transition hover:opacity-90">Done</button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}