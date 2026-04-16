import { useEffect, useState } from "react";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import { getSuppliers } from "../../api/UserApi";
import {
    getDeliveryRules,
    createDeliveryRule,
    updateDeliveryRule,
    deleteDeliveryRule,
} from "../../api/DeliveryRuleApi";

// ✅ these are fine outside — they're just data, not hooks
const REGION_OPTIONS = [
    { label: "All Regions", value: "" },
    { label: "Toronto", value: "ON-TOR" },
    { label: "Mississauga", value: "ON-MIS" },
    { label: "Brampton", value: "ON-BRA" },
    { label: "Vaughan", value: "ON-VAU" },
    { label: "Markham", value: "ON-MAR" },
    { label: "Richmond Hill", value: "ON-RHL" },
    { label: "Oakville", value: "ON-OAK" },
    { label: "Ontario", value: "north-america:ca-on" },
];

const DEFAULT_FORM = {
    ruleName: "",
    supplierId: "",
    supplierName: "",
    region: "",
    warningAfterDays: 5,
    maxDeliveryDays: 7,
    isActive: true,
    notes: "",
};

export default function AdminDeliveryRulesPage() {
    // ✅ ALL hooks and state go in here
    const [mobileOpen, setMobileOpen] = useState(false);
    const [supplierOptions, setSupplierOptions] = useState([
        { label: "All Suppliers", value: "" }
    ]);

    const [rules, setRules] = useState([]);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState("");

    const [editingRuleId, setEditingRuleId] = useState(null);
    const [form, setForm] = useState(DEFAULT_FORM);
    const [errors, setErrors] = useState({});
    const [submitLoading, setSubmitLoading] = useState(false);
    const [submitMessage, setSubmitMessage] = useState("");
    const [submitError, setSubmitError] = useState("");

    // ✅ useEffect also goes inside
    useEffect(() => {
        fetchRules();
        fetchSuppliers();
    }, []);

    // ✅ functions also inside
    async function fetchSuppliers() {
        try {
            const result = await getSuppliers();
            const users = result?.items || result?.data || result?.users || [];
            setSupplierOptions([
                { label: "All Suppliers", value: "" },
                ...users.map((u) => ({
                    value: u.userId || u._id,
                    label: `${u.firstName} ${u.lastName}`,
                    name: `${u.firstName} ${u.lastName}`,
                }))
            ]);
        } catch (err) {
            console.error("Failed to load suppliers:", err);
        }
    }
    async function fetchRules() {
        try {
            setListLoading(true);
            setListError("");
            const result = await getDeliveryRules();
            setRules(result?.items || []);
        } catch (err) {
            setListError(err?.response?.data?.message || "Failed to load rules.");
        } finally {
            setListLoading(false);
        }
    }

    function updateField(field, value) {
        setForm((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => ({ ...prev, [field]: "" }));
        setSubmitMessage("");
        setSubmitError("");
    }

    function validateForm() {
        const nextErrors = {};
        if (!form.ruleName.trim()) {
            nextErrors.ruleName = "Rule name is required.";
        }
        const w = Number(form.warningAfterDays);
        const m = Number(form.maxDeliveryDays);
        if (!Number.isFinite(w) || w < 1) {
            nextErrors.warningAfterDays = "Warning days must be at least 1.";
        }
        if (!Number.isFinite(m) || m < 1) {
            nextErrors.maxDeliveryDays = "Non-compliant days must be at least 1.";
        }
        if (Number.isFinite(w) && Number.isFinite(m) && m <= w) {
            nextErrors.maxDeliveryDays = "Non-compliant days must be greater than warning days.";
        }
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    }

    function handleEdit(rule) {
        setEditingRuleId(rule.ruleId);
        setForm({
            ruleName: rule.ruleName,
            supplierId: rule.supplierId || "",
            supplierName: rule.supplierName || "",
            region: rule.deliveryRegion || "",
            warningAfterDays: rule.warningAfterDays,
            maxDeliveryDays: rule.maxDeliveryDays,
            isActive: rule.isActive,
            notes: rule.notes || "",
        });
        setErrors({});
        setSubmitMessage("");
        setSubmitError("");
        document.getElementById("rule-form")?.scrollIntoView({ behavior: "smooth" });
    }

    function handleReset() {
        setEditingRuleId(null);
        setForm(DEFAULT_FORM);
        setErrors({});
        setSubmitMessage("");
        setSubmitError("");
    }

    async function handleDelete(ruleId) {
        if (!window.confirm("Delete this rule?")) return;
        try {
            await deleteDeliveryRule(ruleId);
            await fetchRules();
        } catch (err) {
            setListError(err?.response?.data?.message || "Failed to delete rule.");
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!validateForm()) return;

        const payload = {
            ruleName: form.ruleName.trim(),
            supplierId: form.supplierId,
            supplierName: form.supplierName.trim(),
            deliveryRegion: form.region,
            warningAfterDays: Number(form.warningAfterDays),
            maxDeliveryDays: Number(form.maxDeliveryDays),
            isActive: form.isActive,
            notes: form.notes.trim(),
        };

        try {
            setSubmitLoading(true);
            setSubmitError("");
            if (editingRuleId) {
                await updateDeliveryRule(editingRuleId, payload);
                setSubmitMessage("Rule updated successfully.");
            } else {
                await createDeliveryRule(payload);
                setSubmitMessage("Rule created successfully.");
            }
            await fetchRules();
            setEditingRuleId(null);
            setForm(DEFAULT_FORM);
        } catch (err) {
            setSubmitError(err?.response?.data?.message || "Failed to save rule.");
        } finally {
            setSubmitLoading(false);
        }
    }

    return (
        <div className="flex h-screen overflow-hidden bg-neutral-light/30">
            <AdminSidebar isMobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

            <div className="flex flex-1 flex-col overflow-hidden">
                <AdminTopbar
                    title="Delivery Rules"
                    searchPlaceholder="Search delivery rules..."
                    onMenuClick={() => setMobileOpen(true)}
                />

                <main className="flex-1 overflow-y-auto p-6">
                    <div className="flex flex-col gap-6">

                        {/* Header */}
                        <section className="overflow-hidden rounded-3xl bg-[#0d3028] px-8 py-8 text-white shadow-lg">
                            <span className="mb-3 inline-flex items-center rounded-full border border-[#a8f0c6]/30 bg-[#a8f0c6]/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#a8f0c6]">
                                Policy Configuration
                            </span>
                            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                                Delivery Rules Configuration
                            </h1>
                            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70 md:text-base">
                                Configure warning and non-compliance thresholds for approved quote
                                deliveries so administrators can monitor supplier performance consistently.
                            </p>
                        </section>

                        {/* Rules List */}
                        <section className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
                            <div className="border-b border-neutral-light px-6 py-4">
                                <h2 className="text-base font-bold text-text-main">Active Rules</h2>
                                <p className="mt-1 text-sm text-text-muted">
                                    Click Edit to modify an existing rule, or fill the form below to create a new one.
                                </p>
                            </div>

                            {listError && (
                                <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">
                                    {listError}
                                </div>
                            )}

                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[700px] text-left">
                                    <thead className="border-b border-neutral-light bg-neutral-light/40">
                                        <tr>
                                            {["Rule Name", "Supplier", "Region", "Warning", "Non-Compliant", "Status", "Actions"].map((h) => (
                                                <th key={h} className="px-6 py-4 text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-light">
                                        {listLoading ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-10 text-center text-sm text-text-muted">
                                                    Loading rules...
                                                </td>
                                            </tr>
                                        ) : rules.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-10 text-center text-sm text-text-muted">
                                                    No rules yet. Create one below.
                                                </td>
                                            </tr>
                                        ) : (
                                            rules.map((rule) => (
                                                <tr key={rule.ruleId} className="transition hover:bg-neutral-light/30">
                                                    <td className="px-6 py-4 text-sm font-semibold text-text-main">
                                                        {rule.ruleName}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-text-muted">
                                                        {rule.supplierName || "All Suppliers"}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-text-muted">
                                                        {rule.deliveryRegion || "All Regions"}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-text-main">
                                                        {rule.warningAfterDays}d
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-text-main">
                                                        {rule.maxDeliveryDays}d
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${rule.isActive ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-text-muted"}`}>
                                                            {rule.isActive ? "Active" : "Inactive"}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleEdit(rule)}
                                                                className="rounded-lg border border-neutral-light px-3 py-1.5 text-xs font-semibold text-text-main transition hover:bg-neutral-light"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDelete(rule.ruleId)}
                                                                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {/* Form */}
                        <form
                            id="rule-form"
                            onSubmit={handleSubmit}
                            className="rounded-2xl border border-neutral-light bg-white shadow-sm"
                        >
                            <div className="border-b border-neutral-light px-6 py-4">
                                <h2 className="text-base font-bold text-text-main">
                                    {editingRuleId ? "Edit Rule" : "Create New Rule"}
                                </h2>
                                <p className="mt-1 text-sm text-text-muted">
                                    {editingRuleId
                                        ? "You are editing an existing rule. Save to apply changes."
                                        : "Set threshold values that determine when a delivery enters warning or non-compliant status."}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 gap-6 px-6 py-6 md:grid-cols-2">

                                <div className="flex flex-col gap-2 md:col-span-2">
                                    <label className="text-sm font-semibold text-text-main">Rule Name</label>
                                    <input
                                        type="text"
                                        value={form.ruleName}
                                        onChange={(e) => updateField("ruleName", e.target.value)}
                                        className="rounded-xl border border-neutral-light px-4 py-3 text-sm outline-none focus:border-primary"
                                        placeholder="e.g. Toronto Supplier Rule"
                                    />
                                    {errors.ruleName && (
                                        <span className="text-xs font-medium text-red-600">{errors.ruleName}</span>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-text-main">Supplier Scope</label>
                                    <select
                                        value={form.supplierId}
                                        onChange={(e) => {
                                            const opt = supplierOptions.find(o => o.value === e.target.value);
                                            updateField("supplierId", e.target.value);
                                            updateField("supplierName", opt?.name || "");
                                        }}
                                        className="rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary"
                                    >
                                        {supplierOptions.map((option) => (
                                            <option key={option.value || "all-suppliers"} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                    {/* ADD THIS */}
                                    {form.supplierId && (
                                        <div className="rounded-lg border border-neutral-light bg-neutral-light/40 px-3 py-2 text-xs text-text-muted">
                                            Supplier ID: <span className="font-mono font-semibold text-text-main">{form.supplierId}</span>
                                        </div>
                                    )}
                                    <span className="text-xs text-text-muted">
                                        Leave as "All Suppliers" to apply this rule globally.
                                    </span>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-text-main">Delivery Region</label>
                                    <select
                                        value={form.region}
                                        onChange={(e) => updateField("region", e.target.value)}
                                        className="rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary"
                                    >
                                        {REGION_OPTIONS.map((option) => (
                                            <option key={option.value || "all-regions"} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="text-xs text-text-muted">
                                        Optionally target a specific delivery region.
                                    </span>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-text-main">Warning Threshold (Days)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={form.warningAfterDays}
                                        onChange={(e) => updateField("warningAfterDays", e.target.value)}
                                        className="rounded-xl border border-neutral-light px-4 py-3 text-sm outline-none focus:border-primary"
                                    />
                                    {errors.warningAfterDays && (
                                        <span className="text-xs font-medium text-red-600">{errors.warningAfterDays}</span>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-text-main">Non-Compliant Threshold (Days)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={form.maxDeliveryDays}
                                        onChange={(e) => updateField("maxDeliveryDays", e.target.value)}
                                        className="rounded-xl border border-neutral-light px-4 py-3 text-sm outline-none focus:border-primary"
                                    />
                                    {errors.maxDeliveryDays && (
                                        <span className="text-xs font-medium text-red-600">{errors.maxDeliveryDays}</span>
                                    )}
                                </div>

                                <div className="md:col-span-2 rounded-2xl border border-neutral-light bg-neutral-light/30 p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <h3 className="text-sm font-bold text-text-main">Rule Preview</h3>
                                            <p className="mt-1 text-sm text-text-muted">
                                                Orders older than{" "}
                                                <span className="font-semibold text-text-main">{form.warningAfterDays}</span>{" "}
                                                days will show a warning. Orders older than{" "}
                                                <span className="font-semibold text-text-main">{form.maxDeliveryDays}</span>{" "}
                                                days will be considered non-compliant.
                                            </p>
                                        </div>
                                        <label className="flex items-center gap-3 rounded-xl border border-neutral-light bg-white px-4 py-2">
                                            <span className="text-sm font-semibold text-text-main">Active</span>
                                            <input
                                                type="checkbox"
                                                checked={form.isActive}
                                                onChange={(e) => updateField("isActive", e.target.checked)}
                                                className="h-4 w-4 accent-primary"
                                            />
                                        </label>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 md:col-span-2">
                                    <label className="text-sm font-semibold text-text-main">Notes</label>
                                    <textarea
                                        rows={3}
                                        value={form.notes}
                                        onChange={(e) => updateField("notes", e.target.value)}
                                        className="rounded-xl border border-neutral-light px-4 py-3 text-sm outline-none focus:border-primary"
                                        placeholder="Add optional notes about this delivery rule..."
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col items-start justify-between gap-4 border-t border-neutral-light px-6 py-4 md:flex-row md:items-center">
                                <div>
                                    {submitMessage && (
                                        <p className="text-sm font-medium text-emerald-700">{submitMessage}</p>
                                    )}
                                    {submitError && (
                                        <p className="text-sm font-medium text-red-600">{submitError}</p>
                                    )}
                                    {!submitMessage && !submitError && (
                                        <p className="text-sm text-text-muted">
                                            {editingRuleId ? "Editing an existing rule." : "Creating a new rule."}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        className="rounded-xl border border-neutral-light px-5 py-2.5 text-sm font-semibold text-text-muted transition hover:bg-neutral-light"
                                    >
                                        {editingRuleId ? "Cancel Edit" : "Reset"}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submitLoading}
                                        className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-text-main transition hover:opacity-90 disabled:opacity-50"
                                    >
                                        {submitLoading ? "Saving..." : editingRuleId ? "Update Rule" : "Save Rule"}
                                    </button>
                                </div>
                            </div>
                        </form>

                    </div>
                </main>
            </div>
        </div>
    );
}