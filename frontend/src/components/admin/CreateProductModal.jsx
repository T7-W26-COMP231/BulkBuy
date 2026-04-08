import { useState } from "react";
import api from "../../api/api";

const REGIONS = [
    "Toronto", "Scarborough", "Mississauga", "Brampton",
    "Markham", "Vaughan", "Richmond Hill", "Oakville", "Burlington", "Pickering"
];
const STATUS_OPTIONS = ["inactive", "active", "suspended", "on_sale"];
const WEIGHT_UNITS = ["kg", "g", "lb", "oz"];
const DIM_UNITS = ["cm", "in", "mm"];
const CURRENCIES = ["CAD", "USD"];

const INITIAL = {
    title: "",
    sku: "",
    shortDescription: "",
    description: "",
    ops_regions: [],
    status: "inactive",
    published: false,
    brand: { name: "" },
    tags: "",
    images: [],
    imageInput: "",
    inventory: { stock: 0, backorder: false },
    weight: { value: "", unit: "kg" },
    dimensions: { length: "", width: "", height: "", unit: "cm" },
    price: [{ list: "", sale: "", currency: "CAD", effectiveFrom: "", effectiveTo: "" }],
    shipping: { class: "", freightClass: "", shipsFrom: "" },
    taxClass: "",
};

export default function CreateProductModal({ onClose, onCreated }) {
    const [form, setForm] = useState(INITIAL);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [section, setSection] = useState("basic");

    const set = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
    };

    const setNested = (parent, field, value) =>
        setForm((prev) => ({ ...prev, [parent]: { ...prev[parent], [field]: value } }));

    const setPrice = (field, value) =>
        setForm((prev) => ({ ...prev, price: [{ ...prev.price[0], [field]: value }] }));

    const setShipping = (field, value) =>
        setForm((prev) => ({ ...prev, shipping: { ...prev.shipping, [field]: value } }));

    const toggleRegion = (region) => {
        setForm((prev) => {
            const exists = prev.ops_regions.includes(region);
            return {
                ...prev,
                ops_regions: exists
                    ? prev.ops_regions.filter((r) => r !== region)
                    : [...prev.ops_regions, region],
            };
        });
    };

    const addImage = () => {
        if (!form.imageInput.trim()) return;
        set("images", [...form.images, form.imageInput.trim()]);
        set("imageInput", "");
    };

    const validate = () => {
        const e = {};
        if (!form.title.trim()) e.title = "Title is required";
        if (!form.sku.trim()) e.sku = "SKU is required";
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        setSaving(true);
        try {
            const tags = form.tags
                ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
                : [];

            const price = form.price[0].list
                ? [{
                    list: Number(form.price[0].list),
                    sale: form.price[0].sale ? Number(form.price[0].sale) : null,
                    currency: form.price[0].currency,
                    effectiveFrom: form.price[0].effectiveFrom ? new Date(form.price[0].effectiveFrom) : null,
                    effectiveTo: form.price[0].effectiveTo ? new Date(form.price[0].effectiveTo) : null,
                }]
                : [];

            const weight = {
                value: form.weight.value ? Number(form.weight.value) : 0,
                unit: form.weight.unit,
            };

            const dimensions = {
                length: Number(form.dimensions.length) || 0,
                width: Number(form.dimensions.width) || 0,
                height: Number(form.dimensions.height) || 0,
                unit: form.dimensions.unit,
            };

            const payload = {
                name: form.title.trim(),

                descriptions: [
                    {
                        locale: "en",
                        title: form.title.trim(),
                        body: form.description.trim(),
                    },
                ],

                salesWindow: {
                    fromEpoch: null,
                    toEpoch: null,
                },

                ops_region: form.ops_regions[0] || null,

                metadata: {
                    sku: form.sku.trim(),
                    shortDescription: form.shortDescription.trim(),
                    brand: form.brand.name.trim(),
                    tags,
                    images: form.images,
                    published: form.published,
                    inventory: {
                        stock: Number(form.inventory.stock) || 0,
                        reserved: 0,
                        backorder: form.inventory.backorder,
                        warehouses: [],
                    },
                    price,
                    weight,
                    dimensions,
                    shipping: {
                        class: form.shipping.class.trim(),
                        freightClass: form.shipping.freightClass.trim(),
                        shipsFrom: form.shipping.shipsFrom.trim(),
                    },
                    taxClass: form.taxClass.trim(),
                },

                status: form.status,
                reviews: [],
                items: [],
            };

            const r = await api.post("/prdts", payload);
            const created = r.data?.data || r.data;

            const pid = String(created._id);
            onCreated({ ...created, _id: pid });

            onClose();
        } catch (err) {
            setErrors({ submit: err?.response?.data?.message || "Failed to create product" });
        } finally {
            setSaving(false);
        }
    };

    const SECTIONS = [
        { id: "basic", label: "Basic info" },
        { id: "inventory", label: "Inventory & price" },
        { id: "shipping", label: "Shipping" },
    ];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl border border-neutral-light overflow-hidden">
                <div className="flex items-center justify-between border-b border-neutral-light px-6 py-4">
                    <div>
                        <h2 className="text-lg font-bold text-text-main">Create product</h2>
                        <p className="text-xs text-text-muted mt-0.5">
                            Add a new product to the catalog
                        </p>
                    </div>
                    <button type="button" onClick={onClose}
                        className="flex size-8 items-center justify-center rounded-lg hover:bg-neutral-light transition text-text-muted">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <div className="flex border-b border-neutral-light">
                    {SECTIONS.map((s) => (
                        <button key={s.id} type="button" onClick={() => setSection(s.id)}
                            className={`px-5 py-2.5 text-sm transition border-b-2 -mb-px font-medium ${section === s.id
                                ? "border-primary text-text-main"
                                : "border-transparent text-text-muted hover:text-text-main"}`}>
                            {s.label}
                        </button>
                    ))}
                </div>

                <div className="flex flex-col gap-4 px-6 py-5 max-h-[60vh] overflow-y-auto">

                    {section === "basic" && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-2 block text-sm font-semibold text-text-main">
                                        Title <span className="text-red-500">*</span>
                                    </label>
                                    <input type="text" placeholder="e.g. Dell Laptop 15"
                                        value={form.title} onChange={(e) => set("title", e.target.value)}
                                        className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-primary ${errors.title ? "border-red-400 bg-red-50" : "border-neutral-light"}`} />
                                    {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-semibold text-text-main">
                                        SKU <span className="text-red-500">*</span>
                                    </label>
                                    <input type="text" placeholder="e.g. DELL-001-003"
                                        value={form.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())}
                                        className={`w-full rounded-xl border px-4 py-3 text-sm font-mono outline-none focus:border-primary ${errors.sku ? "border-red-400 bg-red-50" : "border-neutral-light"}`} />
                                    {errors.sku && <p className="mt-1 text-xs text-red-500">{errors.sku}</p>}
                                </div>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-text-main">Short description</label>
                                <input type="text" placeholder="One-line summary"
                                    value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)}
                                    className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-text-main">Description</label>
                                <textarea rows={3} placeholder="Full item description…"
                                    value={form.description} onChange={(e) => set("description", e.target.value)}
                                    className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary resize-none" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-2 block text-sm font-semibold text-text-main">Status</label>
                                    <select value={form.status} onChange={(e) => set("status", e.target.value)}
                                        className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary">
                                        {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-semibold text-text-main">Brand name</label>
                                    <input type="text" placeholder="e.g. Dell"
                                        value={form.brand.name} onChange={(e) => setNested("brand", "name", e.target.value)}
                                        className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
                                </div>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-text-main">Tags</label>
                                <input type="text" placeholder="electronics, laptop"
                                    value={form.tags} onChange={(e) => set("tags", e.target.value)}
                                    className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
                                <p className="mt-1 text-xs text-text-muted">Comma-separated</p>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-text-main">Regions</label>
                                <div className="flex flex-wrap gap-2">
                                    {REGIONS.map((r) => (
                                        <button key={r} type="button" onClick={() => toggleRegion(r)}
                                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${form.ops_regions.includes(r)
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-neutral-light bg-white text-text-muted hover:bg-neutral-light"}`}>
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-text-main">Images</label>
                                <div className="flex gap-2">
                                    <input type="text" placeholder="https://example.com/image.jpg"
                                        value={form.imageInput}
                                        onChange={(e) => set("imageInput", e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addImage(); } }}
                                        className="flex-1 rounded-xl border border-neutral-light bg-white px-4 py-2.5 text-sm outline-none focus:border-primary" />
                                    <button type="button" onClick={addImage}
                                        className="rounded-xl border border-neutral-light px-4 py-2.5 text-sm font-semibold text-text-muted hover:bg-neutral-light transition">
                                        Add
                                    </button>
                                </div>
                                <p className="mt-1 text-xs text-text-muted">Press Enter or click Add for each URL</p>
                                {form.images.length > 0 && (
                                    <div className="mt-2 flex flex-col gap-1">
                                        {form.images.map((url, i) => (
                                            <div key={i} className="flex items-center gap-2 rounded-lg border border-neutral-light px-3 py-2">
                                                <span className="flex-1 truncate text-xs text-text-muted">{url}</span>
                                                <button type="button"
                                                    onClick={() => set("images", form.images.filter((_, idx) => idx !== i))}
                                                    className="text-xs text-red-500 hover:text-red-700">remove</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                <button type="button" onClick={() => set("published", !form.published)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form.published ? "bg-primary" : "bg-neutral-light"}`}>
                                    <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${form.published ? "translate-x-5" : "translate-x-0"}`} />
                                </button>
                                <span className="text-sm font-semibold text-text-main">Published</span>
                                <span className="text-xs text-text-muted">Visible to customers</span>
                            </div>
                        </>
                    )}

                    {section === "inventory" && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-2 block text-sm font-semibold text-text-main">Stock quantity</label>
                                    <input type="number" min="0" placeholder="0"
                                        value={form.inventory.stock}
                                        onChange={(e) => setNested("inventory", "stock", e.target.value)}
                                        className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
                                </div>
                                <div className="flex flex-col justify-end pb-1">
                                    <div className="flex items-center gap-3">
                                        <button type="button"
                                            onClick={() => setNested("inventory", "backorder", !form.inventory.backorder)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form.inventory.backorder ? "bg-primary" : "bg-neutral-light"}`}>
                                            <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${form.inventory.backorder ? "translate-x-5" : "translate-x-0"}`} />
                                        </button>
                                        <span className="text-sm font-semibold text-text-main">Allow backorder</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <p className="mb-3 text-sm font-semibold text-text-main">Price</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="mb-2 block text-xs font-semibold text-text-muted">List price</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">$</span>
                                            <input type="number" min="0" step="0.01" placeholder="0.00"
                                                value={form.price[0].list} onChange={(e) => setPrice("list", e.target.value)}
                                                className="w-full rounded-xl border border-neutral-light bg-white py-3 pl-8 pr-4 text-sm outline-none focus:border-primary" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-xs font-semibold text-text-muted">Sale price</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">$</span>
                                            <input type="number" min="0" step="0.01" placeholder="Optional"
                                                value={form.price[0].sale} onChange={(e) => setPrice("sale", e.target.value)}
                                                className="w-full rounded-xl border border-neutral-light bg-white py-3 pl-8 pr-4 text-sm outline-none focus:border-primary" />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="mb-2 block text-xs font-semibold text-text-muted">Currency</label>
                                        <select value={form.price[0].currency} onChange={(e) => setPrice("currency", e.target.value)}
                                            className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary">
                                            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-xs font-semibold text-text-muted">Effective from</label>
                                        <input type="date" value={form.price[0].effectiveFrom}
                                            onChange={(e) => setPrice("effectiveFrom", e.target.value)}
                                            className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-xs font-semibold text-text-muted">Effective to</label>
                                        <input type="date" value={form.price[0].effectiveTo}
                                            onChange={(e) => setPrice("effectiveTo", e.target.value)}
                                            className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-text-main">Tax class</label>
                                <input type="text" placeholder="e.g. standard, exempt"
                                    value={form.taxClass} onChange={(e) => set("taxClass", e.target.value)}
                                    className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
                            </div>
                        </>
                    )}

                    {section === "shipping" && (
                        <>
                            <div>
                                <p className="mb-3 text-sm font-semibold text-text-main">Weight</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="mb-2 block text-xs font-semibold text-text-muted">Value</label>
                                        <input type="number" min="0" step="0.01" placeholder="0"
                                            value={form.weight.value} onChange={(e) => setNested("weight", "value", e.target.value)}
                                            className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-xs font-semibold text-text-muted">Unit</label>
                                        <select value={form.weight.unit} onChange={(e) => setNested("weight", "unit", e.target.value)}
                                            className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary">
                                            {WEIGHT_UNITS.map((u) => <option key={u}>{u}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <p className="mb-3 text-sm font-semibold text-text-main">Dimensions</p>
                                <div className="grid grid-cols-4 gap-3">
                                    {["length", "width", "height"].map((dim) => (
                                        <div key={dim}>
                                            <label className="mb-2 block text-xs font-semibold text-text-muted capitalize">{dim}</label>
                                            <input type="number" min="0" step="0.1" placeholder="0"
                                                value={form.dimensions[dim]}
                                                onChange={(e) => setNested("dimensions", dim, e.target.value)}
                                                className="w-full rounded-xl border border-neutral-light bg-white px-3 py-3 text-sm outline-none focus:border-primary" />
                                        </div>
                                    ))}
                                    <div>
                                        <label className="mb-2 block text-xs font-semibold text-text-muted">Unit</label>
                                        <select value={form.dimensions.unit} onChange={(e) => setNested("dimensions", "unit", e.target.value)}
                                            className="w-full rounded-xl border border-neutral-light bg-white px-3 py-3 text-sm outline-none focus:border-primary">
                                            {DIM_UNITS.map((u) => <option key={u}>{u}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <p className="mb-3 text-sm font-semibold text-text-main">Shipping details</p>
                                <div className="flex flex-col gap-3">
                                    <div>
                                        <label className="mb-2 block text-xs font-semibold text-text-muted">Shipping class</label>
                                        <input type="text" placeholder="e.g. standard, express"
                                            value={form.shipping.class} onChange={(e) => setShipping("class", e.target.value)}
                                            className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-xs font-semibold text-text-muted">Freight class</label>
                                        <input type="text" placeholder="e.g. 50, 70, 100"
                                            value={form.shipping.freightClass} onChange={(e) => setShipping("freightClass", e.target.value)}
                                            className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-xs font-semibold text-text-muted">Ships from</label>
                                        <input type="text" placeholder="e.g. Toronto, ON"
                                            value={form.shipping.shipsFrom} onChange={(e) => setShipping("shipsFrom", e.target.value)}
                                            className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary" />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {errors.submit && (
                        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errors.submit}</p>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-neutral-light px-6 py-4">
                    <div className="flex gap-2">
                        {SECTIONS.map((s) => (
                            <button key={s.id} type="button" onClick={() => setSection(s.id)}
                                className={`size-2 rounded-full transition ${section === s.id ? "bg-text-main" : "bg-neutral-light"}`} />
                        ))}
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose}
                            className="rounded-xl border border-neutral-light px-5 py-2.5 text-sm font-semibold text-text-muted hover:bg-neutral-light transition">
                            Cancel
                        </button>
                        <button type="button" onClick={handleSubmit} disabled={saving}
                            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-text-main hover:opacity-90 disabled:opacity-50 transition">
                            {saving ? "Creating…" : "Create Product"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}