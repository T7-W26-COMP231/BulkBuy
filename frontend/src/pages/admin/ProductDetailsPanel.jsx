import { useState } from "react";
import api from "../../api/api";

function formatStatus(status) {
    if (status === "active") return "In Stock";
    if (status === "low_stock") return "Low Stock";
    if (status === "inactive") return "Inactive";
    if (status === "draft") return "Draft";
    if (status === "suspended") return "Suspended";
    return "Unknown";
}

function getStatusClasses(status) {
    if (status === "active") return "bg-green-100 text-green-700";
    if (status === "low_stock") return "bg-yellow-100 text-yellow-700";
    if (status === "inactive") return "bg-gray-100 text-gray-600";
    if (status === "draft") return "bg-neutral-light text-text-muted";
    if (status === "suspended") return "bg-red-100 text-red-700";
    return "bg-neutral-light text-text-muted";
}

function formatPriceValue(value) {
    if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
    return `$${value.toFixed(2)}`;
}

function getItemBasePrice(item) {
    if (!item) return null;
    const sale = item.price?.[0]?.sale;
    if (typeof sale === "number") return sale;
    const list = item.price?.[0]?.list;
    if (typeof list === "number") return list;
    const salesPrice = item.salesPrices?.[0]?.price;
    if (typeof salesPrice === "number") return salesPrice;
    return null;
}

function getProductBasePrice(product) {
    if (!product) return null;
    const firstItemPrice = product.items?.[0]?.salesPrices?.[0]?.price;
    if (typeof firstItemPrice === "number") return firstItemPrice;
    const metadataSale = product.metadata?.price?.[0]?.sale;
    if (typeof metadataSale === "number") return metadataSale;
    const metadataList = product.metadata?.price?.[0]?.list;
    if (typeof metadataList === "number") return metadataList;
    return null;
}

export default function ProductDetailsPanel({
    selectedProduct,
    selectedItem,
    selectedItemDetails,
    detailsView,
    itemLoading,
    onClose,
    onSelectItem,
    onProductUpdated,
    onItemUpdated,
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [isEditingItem, setIsEditingItem] = useState(false);

    const [draftProduct, setDraftProduct] = useState({
        name: "", brand: "", category: "", description: "",
        status: "active", ops_region: "", tags: "", images: [],
        salesWindowFrom: "", salesWindowTo: "",
        discountType: "flat", discountMinQty: "", discountPrice: "",
    });
    const [draftItem, setDraftItem] = useState({
        title: "",
        shortDescription: "",
        description: "",
        salePrice: "",
        listPrice: "",
        currency: "CAD",
        effectiveFrom: "",
        effectiveTo: "",
        status: "active",
        published: true,
        pricingTiers: [],
        brandName: "",
        sellerName: "",
        ops_region: "",
        shippingClass: "",
        freightClass: "",
        shipsFrom: "",
        weightValue: "",
        weightUnit: "kg",
        dimLength: "",
        dimWidth: "",
        dimHeight: "",
        dimUnit: "cm",
        taxClass: "",
        tags: [],
        images: [],
        backorder: false,
    });

    // ── Product editing ──────────────────────────────────────
    const handleStartEditing = () => {
        const d = selectedProduct;
        setDraftProduct({
            name: d.name ?? "",
            brand: d.metadata?.brand ?? "",
            category: d.metadata?.category ?? "",
            description: d.descriptions?.[0]?.body ?? "",
            status: d.status ?? "active",
            ops_region: d.ops_region ?? "",
            tags: Array.isArray(d.metadata?.tags) ? d.metadata.tags.join(", ") : "",
            images: Array.isArray(d.metadata?.images) ? [...d.metadata.images] : [],
            salesWindowFrom: d.salesWindow?.fromEpoch
                ? new Date(d.salesWindow.fromEpoch).toISOString().split("T")[0] : "",
            salesWindowTo: d.salesWindow?.toEpoch
                ? new Date(d.salesWindow.toEpoch).toISOString().split("T")[0] : "",
            discountType: d.discountScheme?.type ?? "flat",
            discountMinQty: d.discountScheme?.bulkDiscount?.minQty ?? "",
            discountPrice: d.discountScheme?.bulkDiscount?.price ?? "",
        });
        setIsEditing(true);
    };

    const handleCancelEditing = () => setIsEditing(false);

    const handleSaveEditing = async () => {
        try {
            const payload = {
                name: draftProduct.name,
                status: draftProduct.status,
                ops_region: draftProduct.ops_region,
                descriptions: [{
                    ...(selectedProduct.descriptions?.[0] ?? { locale: "en" }),
                    locale: "en",
                    title: draftProduct.name,
                    body: draftProduct.description,
                }],
                metadata: {
                    ...selectedProduct.metadata,
                    brand: draftProduct.brand,
                    category: draftProduct.category || "Uncategorized",
                    tags: draftProduct.tags.split(",").map((t) => t.trim()).filter(Boolean),
                    images: draftProduct.images.filter(Boolean),
                },
                salesWindow: {
                    fromEpoch: draftProduct.salesWindowFrom
                        ? new Date(draftProduct.salesWindowFrom).getTime() : null,
                    toEpoch: draftProduct.salesWindowTo
                        ? new Date(draftProduct.salesWindowTo).getTime() : null,
                },
                discountScheme: draftProduct.discountMinQty && draftProduct.discountPrice
                    ? {
                        type: draftProduct.discountType,
                        bulkDiscount: {
                            minQty: Number(draftProduct.discountMinQty),
                            price: parseFloat(draftProduct.discountPrice),
                        },
                    }
                    : selectedProduct.discountScheme ?? {},
            };
            const response = await api.patch(`/prdts/${selectedProduct._id}`, payload);
            onProductUpdated(response.data?.data ?? null, payload);
            setIsEditing(false);
        } catch (err) {
            alert(err.response?.data?.message || "Failed to save product changes.");
        }
    };

    // ── Item editing ─────────────────────────────────────────
    const handleSaveEditingItem = async () => {
        try {
            const payload = {
                title: draftItem.title,
                shortDescription: draftItem.shortDescription,
                description: draftItem.description,
                status: draftItem.status,
                published: draftItem.published,
                taxClass: draftItem.taxClass,
                tags: draftItem.tags,
                images: draftItem.images.filter(Boolean),
                ops_region: draftItem.ops_region,
                brand: {
                    ...selectedItemDetails.brand,
                    name: draftItem.brandName,
                },
                seller: {
                    ...selectedItemDetails.seller,
                    name: draftItem.sellerName,
                },
                price: [{
                    ...(selectedItemDetails.price?.[0] ?? {}),
                    sale: parseFloat(draftItem.salePrice) || null,
                    list: parseFloat(draftItem.listPrice) || 0,
                    currency: draftItem.currency,
                    effectiveFrom: draftItem.effectiveFrom
                        ? new Date(draftItem.effectiveFrom).getTime()
                        : null,
                    effectiveTo: draftItem.effectiveTo
                        ? new Date(draftItem.effectiveTo).getTime()
                        : null,
                }],
                pricingTiers: draftItem.pricingTiers
                    .filter((t) => t.minQty !== "" && t.price !== "")
                    .map((t) => ({
                        minQty: Number(t.minQty),
                        price: parseFloat(t.price),
                        currency: t.currency ?? "CAD",
                    })),
                shipping: {
                    class: draftItem.shippingClass,
                    freightClass: draftItem.freightClass,
                    shipsFrom: draftItem.shipsFrom,
                },
                weight: {
                    value: parseFloat(draftItem.weightValue) || 0,
                    unit: draftItem.weightUnit,
                },
                dimensions: {
                    length: parseFloat(draftItem.dimLength) || 0,
                    width: parseFloat(draftItem.dimWidth) || 0,
                    height: parseFloat(draftItem.dimHeight) || 0,
                    unit: draftItem.dimUnit,
                },
                inventory: {
                    ...selectedItemDetails.inventory,
                    backorder: draftItem.backorder,
                },
            };
            const response = await api.patch(`/items/${selectedItemDetails._id}`, payload);
            onItemUpdated(response.data?.data ?? { ...selectedItemDetails, ...payload });
            setIsEditingItem(false);
        } catch (err) {
            alert(err.response?.data?.message || "Failed to save item changes.");
        }
    };
    const handleStartEditingItem = () => {
        if (!selectedItemDetails) return;
        const d = selectedItemDetails;
        setDraftItem({
            title: d.title ?? "",
            shortDescription: d.shortDescription ?? "",
            description: d.description ?? "",
            salePrice: d.price?.[0]?.sale ?? "",
            listPrice: d.price?.[0]?.list ?? "",
            currency: d.price?.[0]?.currency ?? "CAD",
            effectiveFrom: d.price?.[0]?.effectiveFrom
                ? new Date(d.price[0].effectiveFrom).toISOString().split("T")[0]
                : "",
            effectiveTo: d.price?.[0]?.effectiveTo
                ? new Date(d.price[0].effectiveTo).toISOString().split("T")[0]
                : "",
            status: d.status ?? "active",
            published: d.published ?? true,
            pricingTiers: (d.pricingTiers ?? []).map((t) => ({
                minQty: t.minQty, price: t.price, currency: t.currency ?? "CAD",
            })),
            brandName: d.brand?.name ?? "",
            sellerName: d.seller?.name ?? "",
            ops_region: d.ops_region ?? "",
            shippingClass: d.shipping?.class ?? "",
            freightClass: d.shipping?.freightClass ?? "",
            shipsFrom: d.shipping?.shipsFrom ?? "",
            weightValue: d.weight?.value ?? "",
            weightUnit: d.weight?.unit ?? "kg",
            dimLength: d.dimensions?.length ?? "",
            dimWidth: d.dimensions?.width ?? "",
            dimHeight: d.dimensions?.height ?? "",
            dimUnit: d.dimensions?.unit ?? "cm",
            taxClass: d.taxClass ?? "",
            tags: Array.isArray(d.tags) ? [...d.tags] : [],
            images: Array.isArray(d.images) ? [...d.images] : [],
            backorder: d.inventory?.backorder ?? false,
        });
        setIsEditingItem(true);
    };

    // keep only the first handleSaveEditingItem, delete the second one
    const handleCancelEditingItem = () => setIsEditingItem(false);

    // ── Derived display values ────────────────────────────────
    const activeItem = selectedItemDetails || selectedItem;
    const activeDetails = detailsView === "item" && activeItem
        ? {
            title: activeItem.title ?? activeItem.name ?? "Item",
            subtitle: `SKU: ${activeItem.sku ?? activeItem.itemId ?? "N/A"}`,
            price: getItemBasePrice(activeItem),
            description: activeItem.shortDescription ?? activeItem.description ?? "No item description available.",
            category: selectedProduct?.metadata?.category ?? "Associated Item",
            image: activeItem.image ?? activeItem.images?.[0] ?? selectedProduct?.image ?? selectedProduct?.metadata?.images?.[0] ?? null,
            badge: "Item Details",
        }
        : {
            title: selectedProduct?.name ?? "Product",
            subtitle: `Brand: ${selectedProduct?.metadata?.brand ?? "N/A"}`,
            price: getProductBasePrice(selectedProduct),
            description: selectedProduct?.descriptions?.[0]?.body ?? "No description available.",
            category: selectedProduct?.metadata?.category ?? "Product",
            image: selectedProduct?.image ?? selectedProduct?.metadata?.images?.[0] ?? null,
            badge: "Product Details",
        };

    const tierRows = Array.isArray(selectedItemDetails?.pricingTiers)
        ? selectedItemDetails.pricingTiers : [];

    return (
        <aside className="min-w-0 xl:w-[38%]">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-6">

                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-text-main">Product Details</h2>
                        <button type="button" onClick={onClose}
                            className="text-text-muted transition hover:text-text-main" aria-label="Close">
                            <span className="material-symbols-outlined text-[22px]">close</span>
                        </button>
                    </div>

                    {/* Image + detail card */}
                    <div className="overflow-hidden rounded-2xl border border-neutral-light">
                        <div className="relative h-56 w-full bg-[#EEF2F6]">
                            {activeDetails.image && (
                                <img src={activeDetails.image} alt={activeDetails.title}
                                    className="h-full w-full object-cover" />
                            )}
                            <span className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-500 shadow-sm">
                                {activeDetails.category}
                            </span>
                        </div>

                        <div className="p-5">

                            {/* ── Product edit form ── */}
                            {isEditing ? (
                                <div className="space-y-4">

                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-text-main">Product Name</label>
                                        <input type="text" value={draftProduct.name}
                                            onChange={(e) => setDraftProduct((p) => ({ ...p, name: e.target.value }))}
                                            className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        {[["Brand", "brand"], ["Category", "category"]].map(([label, key]) => (
                                            <div key={key}>
                                                <label className="mb-1 block text-sm font-semibold text-text-main">{label}</label>
                                                <input type="text" value={draftProduct[key]}
                                                    onChange={(e) => setDraftProduct((p) => ({ ...p, [key]: e.target.value }))}
                                                    className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary" />
                                            </div>
                                        ))}
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-text-main">Description</label>
                                        <textarea rows={3} value={draftProduct.description}
                                            onChange={(e) => setDraftProduct((p) => ({ ...p, description: e.target.value }))}
                                            className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="mb-1 block text-sm font-semibold text-text-main">Status</label>
                                            <select value={draftProduct.status}
                                                onChange={(e) => setDraftProduct((p) => ({ ...p, status: e.target.value }))}
                                                className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary">
                                                <option value="active">Active</option>
                                                <option value="inactive">Inactive</option>
                                                <option value="suspended">Suspended</option>
                                                <option value="on_sale">On Sale</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-semibold text-text-main">Ops Region</label>
                                            <input type="text" value={draftProduct.ops_region}
                                                onChange={(e) => setDraftProduct((p) => ({ ...p, ops_region: e.target.value }))}
                                                className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-text-main">Tags (comma separated)</label>
                                        <input type="text" value={draftProduct.tags}
                                            onChange={(e) => setDraftProduct((p) => ({ ...p, tags: e.target.value }))}
                                            className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>

                                    {/* Images */}
                                    <div className="rounded-xl border border-neutral-light p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Images</p>
                                            <button type="button"
                                                onClick={() => setDraftProduct((p) => ({ ...p, images: [...p.images, ""] }))}
                                                className="text-xs font-semibold text-primary hover:underline">
                                                + Add URL
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {draftProduct.images.length === 0 && (
                                                <p className="text-xs text-text-muted">No images.</p>
                                            )}
                                            {draftProduct.images.map((url, idx) => (
                                                <div key={idx} className="flex items-center gap-2">
                                                    {url && (
                                                        <img src={url} alt=""
                                                            className="h-8 w-8 flex-shrink-0 rounded-lg object-cover border border-neutral-light"
                                                            onError={(e) => { e.target.style.display = "none"; }} />
                                                    )}
                                                    <input type="text" placeholder="https://..." value={url}
                                                        onChange={(e) => setDraftProduct((p) => {
                                                            const imgs = [...p.images];
                                                            imgs[idx] = e.target.value;
                                                            return { ...p, images: imgs };
                                                        })}
                                                        className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary" />
                                                    <button type="button"
                                                        onClick={() => setDraftProduct((p) => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))}
                                                        className="rounded-lg border border-red-200 px-2 py-2 text-red-500 hover:bg-red-50 flex-shrink-0">
                                                        <span className="material-symbols-outlined text-[16px]">delete</span>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Sales Window */}
                                    <div className="rounded-xl border border-neutral-light p-4">
                                        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">Sales Window</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[["From", "salesWindowFrom"], ["To", "salesWindowTo"]].map(([label, key]) => (
                                                <div key={key}>
                                                    <label className="mb-1 block text-sm font-semibold text-text-main">{label}</label>
                                                    <input type="date" value={draftProduct[key]}
                                                        onChange={(e) => setDraftProduct((p) => ({ ...p, [key]: e.target.value }))}
                                                        className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Bulk Discount */}
                                    <div className="rounded-xl border border-neutral-light p-4">
                                        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">Bulk Discount</p>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="mb-1 block text-sm font-semibold text-text-main">Type</label>
                                                <select value={draftProduct.discountType}
                                                    onChange={(e) => setDraftProduct((p) => ({ ...p, discountType: e.target.value }))}
                                                    className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary">
                                                    <option value="flat">Flat</option>
                                                    <option value="percent">Percent</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-sm font-semibold text-text-main">Min Qty</label>
                                                <input type="number" min="1" value={draftProduct.discountMinQty}
                                                    onChange={(e) => setDraftProduct((p) => ({ ...p, discountMinQty: e.target.value }))}
                                                    className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary" />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-sm font-semibold text-text-main">Price</label>
                                                <input type="number" min="0" step="0.01" value={draftProduct.discountPrice}
                                                    onChange={(e) => setDraftProduct((p) => ({ ...p, discountPrice: e.target.value }))}
                                                    className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary" />
                                            </div>
                                        </div>
                                    </div>

                                </div>
                                /* ── Item edit form ── */
                            ) : isEditingItem ? (
                                <div className="space-y-4">

                                    {/* Core text */}
                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-text-main">Title</label>
                                        <input type="text" value={draftItem.title}
                                            onChange={(e) => setDraftItem((p) => ({ ...p, title: e.target.value }))}
                                            className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-text-main">Short Description</label>
                                        <input type="text" value={draftItem.shortDescription}
                                            onChange={(e) => setDraftItem((p) => ({ ...p, shortDescription: e.target.value }))}
                                            className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-text-main">Description</label>
                                        <textarea rows={3} value={draftItem.description}
                                            onChange={(e) => setDraftItem((p) => ({ ...p, description: e.target.value }))}
                                            className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>

                                    {/* Pricing */}
                                    <div className="rounded-xl border border-neutral-light p-4">
                                        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">Pricing</p>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[["Sale Price", "salePrice"], ["List Price", "listPrice"]].map(([label, key]) => (
                                                <div key={key}>
                                                    <label className="mb-1 block text-sm font-semibold text-text-main">{label}</label>
                                                    <input type="number" min="0" step="0.01" value={draftItem[key]}
                                                        onChange={(e) => setDraftItem((p) => ({ ...p, [key]: e.target.value }))}
                                                        className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary" />
                                                </div>
                                            ))}
                                            <div>
                                                <label className="mb-1 block text-sm font-semibold text-text-main">Currency</label>
                                                <input type="text" value={draftItem.currency}
                                                    onChange={(e) => setDraftItem((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
                                                    className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary" />
                                            </div>
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-3">
                                            {[["Effective From", "effectiveFrom"], ["Effective To", "effectiveTo"]].map(([label, key]) => (
                                                <div key={key}>
                                                    <label className="mb-1 block text-sm font-semibold text-text-main">{label}</label>
                                                    <input type="date" value={draftItem[key]}
                                                        onChange={(e) => setDraftItem((p) => ({ ...p, [key]: e.target.value }))}
                                                        className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Pricing Tiers */}
                                    <div className="rounded-xl border border-neutral-light p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Pricing Tiers</p>
                                            <button type="button"
                                                onClick={() => setDraftItem((p) => ({
                                                    ...p, pricingTiers: [...p.pricingTiers, { minQty: "", price: "", currency: draftItem.currency }],
                                                }))}
                                                className="text-xs font-semibold text-primary hover:underline">
                                                + Add tier
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {draftItem.pricingTiers.length === 0 && (
                                                <p className="text-xs text-text-muted">No tiers. Click + Add tier above.</p>
                                            )}
                                            {draftItem.pricingTiers.map((tier, idx) => (
                                                <div key={idx} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                                                    <input type="number" min="1" placeholder="Min qty" value={tier.minQty}
                                                        onChange={(e) => setDraftItem((p) => {
                                                            const tiers = [...p.pricingTiers];
                                                            tiers[idx] = { ...tiers[idx], minQty: e.target.value };
                                                            return { ...p, pricingTiers: tiers };
                                                        })}
                                                        className="rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary" />
                                                    <input type="number" min="0" step="0.01" placeholder="Price" value={tier.price}
                                                        onChange={(e) => setDraftItem((p) => {
                                                            const tiers = [...p.pricingTiers];
                                                            tiers[idx] = { ...tiers[idx], price: e.target.value };
                                                            return { ...p, pricingTiers: tiers };
                                                        })}
                                                        className="rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary" />
                                                    <button type="button"
                                                        onClick={() => setDraftItem((p) => ({
                                                            ...p, pricingTiers: p.pricingTiers.filter((_, i) => i !== idx),
                                                        }))}
                                                        className="rounded-lg border border-red-200 px-2 py-2 text-red-500 hover:bg-red-50">
                                                        <span className="material-symbols-outlined text-[16px]">delete</span>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Status, Published, Backorder */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="mb-1 block text-sm font-semibold text-text-main">Status</label>
                                            <select value={draftItem.status}
                                                onChange={(e) => setDraftItem((p) => ({ ...p, status: e.target.value }))}
                                                className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary">
                                                <option value="active">Active</option>
                                                <option value="draft">Draft</option>
                                                <option value="suspended">Suspended</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-semibold text-text-main">Published</label>
                                            <select value={draftItem.published ? "true" : "false"}
                                                onChange={(e) => setDraftItem((p) => ({ ...p, published: e.target.value === "true" }))}
                                                className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary">
                                                <option value="true">Yes</option>
                                                <option value="false">No</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-semibold text-text-main">Backorder</label>
                                            <select value={draftItem.backorder ? "true" : "false"}
                                                onChange={(e) => setDraftItem((p) => ({ ...p, backorder: e.target.value === "true" }))}
                                                className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary">
                                                <option value="false">No</option>
                                                <option value="true">Yes</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Brand & Seller */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="mb-1 block text-sm font-semibold text-text-main">Brand Name</label>
                                            <input type="text" value={draftItem.brandName}
                                                onChange={(e) => setDraftItem((p) => ({ ...p, brandName: e.target.value }))}
                                                className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary" />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-semibold text-text-main">Seller Name</label>
                                            <input type="text" value={draftItem.sellerName}
                                                onChange={(e) => setDraftItem((p) => ({ ...p, sellerName: e.target.value }))}
                                                className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary" />
                                        </div>
                                    </div>

                                    {/* Ops Region */}
                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-text-main">Ops Region</label>
                                        <input type="text" value={draftItem.ops_region}
                                            onChange={(e) => setDraftItem((p) => ({ ...p, ops_region: e.target.value }))}
                                            className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>

                                    {/* Tags */}
                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-text-main">Tags (comma separated)</label>
                                        <input type="text" value={draftItem.tags.join(", ")}
                                            onChange={(e) => setDraftItem((p) => ({
                                                ...p, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                                            }))}
                                            className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>

                                    {/* Images */}
                                    <div className="rounded-xl border border-neutral-light p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Images</p>
                                            <button type="button"
                                                onClick={() => setDraftItem((p) => ({ ...p, images: [...p.images, ""] }))}
                                                className="text-xs font-semibold text-primary hover:underline">
                                                + Add URL
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {draftItem.images.length === 0 && (
                                                <p className="text-xs text-text-muted">No images. Click + Add URL above.</p>
                                            )}
                                            {draftItem.images.map((url, idx) => (
                                                <div key={idx} className="flex items-center gap-2">
                                                    {url && (
                                                        <img src={url} alt=""
                                                            className="h-8 w-8 flex-shrink-0 rounded-lg object-cover border border-neutral-light"
                                                            onError={(e) => { e.target.style.display = "none"; }} />
                                                    )}
                                                    <input type="text" placeholder="https://..." value={url}
                                                        onChange={(e) => setDraftItem((p) => {
                                                            const imgs = [...p.images];
                                                            imgs[idx] = e.target.value;
                                                            return { ...p, images: imgs };
                                                        })}
                                                        className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary" />
                                                    <button type="button"
                                                        onClick={() => setDraftItem((p) => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))}
                                                        className="rounded-lg border border-red-200 px-2 py-2 text-red-500 hover:bg-red-50 flex-shrink-0">
                                                        <span className="material-symbols-outlined text-[16px]">delete</span>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Shipping */}
                                    <div className="rounded-xl border border-neutral-light p-4">
                                        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">Shipping</p>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[["Class", "shippingClass"], ["Freight Class", "freightClass"], ["Ships From", "shipsFrom"]].map(([label, key]) => (
                                                <div key={key}>
                                                    <label className="mb-1 block text-sm font-semibold text-text-main">{label}</label>
                                                    <input type="text" value={draftItem[key]}
                                                        onChange={(e) => setDraftItem((p) => ({ ...p, [key]: e.target.value }))}
                                                        className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Weight & Dimensions */}
                                    <div className="rounded-xl border border-neutral-light p-4">
                                        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">Weight & Dimensions</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="mb-1 block text-sm font-semibold text-text-main">Weight</label>
                                                <div className="flex gap-2">
                                                    <input type="number" min="0" step="0.1" value={draftItem.weightValue}
                                                        onChange={(e) => setDraftItem((p) => ({ ...p, weightValue: e.target.value }))}
                                                        className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary" />
                                                    <select value={draftItem.weightUnit}
                                                        onChange={(e) => setDraftItem((p) => ({ ...p, weightUnit: e.target.value }))}
                                                        className="rounded-xl border border-neutral-light bg-background-light px-2 py-2 text-sm outline-none focus:border-primary">
                                                        <option value="kg">kg</option>
                                                        <option value="lb">lb</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-sm font-semibold text-text-main">Dim Unit</label>
                                                <select value={draftItem.dimUnit}
                                                    onChange={(e) => setDraftItem((p) => ({ ...p, dimUnit: e.target.value }))}
                                                    className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary">
                                                    <option value="cm">cm</option>
                                                    <option value="in">in</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="mt-3 grid grid-cols-3 gap-3">
                                            {[["L", "dimLength"], ["W", "dimWidth"], ["H", "dimHeight"]].map(([label, key]) => (
                                                <div key={key}>
                                                    <label className="mb-1 block text-sm font-semibold text-text-main">{label}</label>
                                                    <input type="number" min="0" step="0.1" value={draftItem[key]}
                                                        onChange={(e) => setDraftItem((p) => ({ ...p, [key]: e.target.value }))}
                                                        className="w-full rounded-xl border border-neutral-light bg-background-light px-3 py-2 text-sm outline-none focus:border-primary" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Tax */}
                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-text-main">Tax Class</label>
                                        <input type="text" value={draftItem.taxClass}
                                            onChange={(e) => setDraftItem((p) => ({ ...p, taxClass: e.target.value }))}
                                            className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>

                                </div>

                                /* ── Read-only view ── */
                            ) : (
                                <>
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="mb-2">
                                                <span className="rounded-full bg-[#EEF2F6] px-3 py-1 text-xs font-semibold text-text-muted">
                                                    {activeDetails.badge}
                                                </span>
                                            </div>
                                            <h3 className="text-2xl font-bold text-text-main">{activeDetails.title}</h3>
                                            <p className="mt-1 text-sm text-text-muted">{activeDetails.subtitle}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-text-muted">Base Price</p>
                                            <p className="mt-1 text-2xl font-bold text-text-main">
                                                {itemLoading && detailsView === "item" ? "Loading..." : formatPriceValue(activeDetails.price)}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="mt-4 text-sm leading-7 text-text-muted">
                                        {itemLoading && detailsView === "item" ? "Loading item details..." : activeDetails.description}
                                    </p>
                                    {detailsView === "item" && selectedItemDetails?.inventory && (
                                        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-background-light p-4">
                                            {[["Stock", "stock"], ["Reserved", "reserved"]].map(([label, key]) => (
                                                <div key={key}>
                                                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">{label}</p>
                                                    <p className="mt-1 text-sm font-semibold text-text-main">
                                                        {selectedItemDetails.inventory[key] ?? 0}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Associated Items */}
                    <div>
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-text-muted">Associated Items</h3>
                            <span className="text-xs text-text-muted">
                                {selectedProduct.items?.length ?? 0} item{(selectedProduct.items?.length ?? 0) === 1 ? "" : "s"}
                            </span>
                        </div>
                        <div className="space-y-3">
                            {selectedProduct.items?.map((item) => {
                                const isActive = selectedItem?.itemId === item.itemId;
                                return (
                                    <button key={item.itemId} type="button"
                                        onClick={() => { setIsEditing(false); setIsEditingItem(false); onSelectItem(item); }}
                                        className={`w-full rounded-2xl border px-4 py-4 text-left transition ${isActive ? "border-primary bg-[#F3FBF8]" : "border-neutral-light bg-white hover:bg-background-light"}`}>
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="font-semibold text-text-main">{item.name ?? item.itemId}</p>
                                                <p className="mt-1 text-xs text-text-muted">ID: {item.itemId}</p>
                                                <p className="mt-2 text-sm text-text-muted">
                                                    {formatPriceValue(isActive && selectedItemDetails
                                                        ? getItemBasePrice(selectedItemDetails)
                                                        : getItemBasePrice(item)
                                                    )} / {item.unitLabel ?? "unit"}
                                                </p>
                                            </div>
                                            <span className={`inline-flex rounded-md px-3 py-1 text-xs font-medium ${getStatusClasses(item.status ?? "active")}`}>
                                                {formatStatus(item.status ?? "active")}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Volume Pricing Tiers */}
                    <div>
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-text-muted">Volume Pricing Tiers</h3>
                            <span className="material-symbols-outlined text-[18px] text-text-muted">info</span>
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-neutral-light">
                            <table className="min-w-full">
                                <thead className="bg-background-light">
                                    <tr className="text-left text-sm font-semibold text-text-main">
                                        <th className="px-4 py-4">Min. Quantity</th>
                                        <th className="px-4 py-4">Price per Unit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tierRows.length ? (
                                        tierRows.map((tier, index, arr) => {
                                            const nextTier = arr[index + 1];
                                            const rangeLabel = nextTier
                                                ? `${tier.minQty} - ${nextTier.minQty - 1} units`
                                                : `${tier.minQty}+ units`;
                                            return (
                                                <tr key={`${selectedItemDetails?._id ?? "item"}-${tier.minQty}`}
                                                    className={index !== arr.length - 1 ? "border-b border-neutral-light" : ""}>
                                                    <td className="px-4 py-4 text-sm text-text-main">{rangeLabel}</td>
                                                    <td className="px-4 py-4 text-sm font-semibold text-emerald-500">
                                                        {formatPriceValue(tier.price)}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={2} className="px-4 py-8 text-center text-sm text-text-muted">
                                                No pricing tiers available for this item.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-2 gap-3">
                        {isEditing ? (
                            <>
                                <button type="button" onClick={handleCancelEditing}
                                    className="rounded-2xl border border-neutral-light bg-white px-4 py-3 text-sm font-semibold text-text-main transition hover:bg-background-light">
                                    Cancel
                                </button>
                                <button type="button" onClick={handleSaveEditing}
                                    className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-text-main transition hover:opacity-90">
                                    Save Changes
                                </button>
                            </>
                        ) : isEditingItem ? (
                            <>
                                <button type="button" onClick={handleCancelEditingItem}
                                    className="rounded-2xl border border-neutral-light bg-white px-4 py-3 text-sm font-semibold text-text-main transition hover:bg-background-light">
                                    Cancel
                                </button>
                                <button type="button" onClick={handleSaveEditingItem}
                                    className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-text-main transition hover:opacity-90">
                                    Save Item
                                </button>
                            </>
                        ) : (
                            <>
                                <button type="button"
                                    onClick={detailsView === "item" ? handleStartEditingItem : handleStartEditing}
                                    disabled={detailsView === "item" && !selectedItemDetails}
                                    className="rounded-2xl border border-neutral-light bg-white px-4 py-3 text-sm font-semibold text-text-main transition hover:bg-background-light disabled:opacity-50">
                                    {detailsView === "item" ? "Edit Item" : "Edit Product"}
                                </button>
                                <button type="button"
                                    className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-text-main transition hover:opacity-90">
                                    Export Specs
                                </button>
                            </>
                        )}
                    </div>

                </div>
            </div>
        </aside>
    );
}