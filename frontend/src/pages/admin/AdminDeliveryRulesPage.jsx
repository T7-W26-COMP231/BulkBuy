import { useState } from "react";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";

const SUPPLIER_OPTIONS = [
    { label: "All Suppliers", value: "" },
    { label: "Supplier 1700000000000003", value: "1700000000000003" },
    { label: "Supplier 660000000000000000000002", value: "660000000000000000000002" },
    { label: "Supplier 660000000000000000000003", value: "660000000000000000000003" },
];

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
    ruleName: "Default Delivery Compliance Rule",
    supplierId: "",
    region: "",
    warningDays: 5,
    nonCompliantDays: 7,
    isActive: true,
    notes: "",
};

export default function AdminDeliveryRulesPage() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [form, setForm] = useState(DEFAULT_FORM);
    const [errors, setErrors] = useState({});
    const [submitMessage, setSubmitMessage] = useState("");

    function updateField(field, value) {
        setForm((prev) => ({
            ...prev,
            [field]: value,
        }));

        setErrors((prev) => ({
            ...prev,
            [field]: "",
        }));

        setSubmitMessage("");
    }

    function validateForm() {
        const nextErrors = {};

        if (!form.ruleName.trim()) {
            nextErrors.ruleName = "Rule name is required.";
        }

        if (form.warningDays === "" || Number(form.warningDays) < 0) {
            nextErrors.warningDays = "Warning days must be 0 or greater.";
        }

        if (form.nonCompliantDays === "" || Number(form.nonCompliantDays) < 0) {
            nextErrors.nonCompliantDays = "Non-compliant days must be 0 or greater.";
        }

        if (
            Number(form.nonCompliantDays) <= Number(form.warningDays)
        ) {
            nextErrors.nonCompliantDays =
                "Non-compliant days must be greater than warning days.";
        }

        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    }

    function handleSubmit(e) {
        e.preventDefault();

        if (!validateForm()) return;

        // #258 is the form UI task.
        // #259 will connect this to backend save/retrieve.
        console.log("Delivery rule form submitted:", form);

        setSubmitMessage("Delivery rule configuration is ready to be saved.");
    }

    function handleReset() {
        setForm(DEFAULT_FORM);
        setErrors({});
        setSubmitMessage("");
    }

    return (
        <div className="flex h-screen overflow-hidden bg-neutral-light/30">
            <AdminSidebar
                isMobileOpen={mobileOpen}
                onClose={() => setMobileOpen(false)}
            />

            <div className="flex flex-1 flex-col overflow-hidden">
                <AdminTopbar
                    title="Delivery Rules"
                    searchPlaceholder="Search delivery rules..."
                    onMenuClick={() => setMobileOpen(true)}
                />

                <main className="flex-1 overflow-y-auto p-6">
                    <div className="flex flex-col gap-6">
                        <section className="overflow-hidden rounded-3xl bg-[#0d3028] px-8 py-8 text-white shadow-lg">
                            <span className="mb-3 inline-flex items-center rounded-full border border-[#a8f0c6]/30 bg-[#a8f0c6]/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#a8f0c6]">
                                Policy Configuration
                            </span>
                            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                                Delivery Rules Configuration
                            </h1>
                            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70 md:text-base">
                                Configure warning and non-compliance thresholds for approved quote
                                deliveries so administrators can monitor supplier performance
                                consistently.
                            </p>
                        </section>

                        <form
                            onSubmit={handleSubmit}
                            className="rounded-2xl border border-neutral-light bg-white shadow-sm"
                        >
                            <div className="border-b border-neutral-light px-6 py-4">
                                <h2 className="text-base font-bold text-text-main">
                                    Rule Details
                                </h2>
                                <p className="mt-1 text-sm text-text-muted">
                                    Set threshold values that determine when a delivery enters
                                    warning or non-compliant status.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 gap-6 px-6 py-6 md:grid-cols-2">
                                <div className="flex flex-col gap-2 md:col-span-2">
                                    <label className="text-sm font-semibold text-text-main">
                                        Rule Name
                                    </label>
                                    <input
                                        type="text"
                                        value={form.ruleName}
                                        onChange={(e) => updateField("ruleName", e.target.value)}
                                        className="rounded-xl border border-neutral-light px-4 py-3 text-sm outline-none focus:border-primary"
                                        placeholder="Enter rule name"
                                    />
                                    {errors.ruleName && (
                                        <span className="text-xs font-medium text-red-600">
                                            {errors.ruleName}
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-text-main">
                                        Supplier Scope
                                    </label>
                                    <select
                                        value={form.supplierId}
                                        onChange={(e) => updateField("supplierId", e.target.value)}
                                        className="rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm outline-none focus:border-primary"
                                    >
                                        {SUPPLIER_OPTIONS.map((option) => (
                                            <option key={option.value || "all-suppliers"} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="text-xs text-text-muted">
                                        Leave as “All Suppliers” to apply this rule globally.
                                    </span>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-text-main">
                                        Delivery Region
                                    </label>
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
                                    <label className="text-sm font-semibold text-text-main">
                                        Warning Threshold (Days)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.warningDays}
                                        onChange={(e) => updateField("warningDays", e.target.value)}
                                        className="rounded-xl border border-neutral-light px-4 py-3 text-sm outline-none focus:border-primary"
                                    />
                                    {errors.warningDays && (
                                        <span className="text-xs font-medium text-red-600">
                                            {errors.warningDays}
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-text-main">
                                        Non-Compliant Threshold (Days)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.nonCompliantDays}
                                        onChange={(e) =>
                                            updateField("nonCompliantDays", e.target.value)
                                        }
                                        className="rounded-xl border border-neutral-light px-4 py-3 text-sm outline-none focus:border-primary"
                                    />
                                    {errors.nonCompliantDays && (
                                        <span className="text-xs font-medium text-red-600">
                                            {errors.nonCompliantDays}
                                        </span>
                                    )}
                                </div>

                                <div className="md:col-span-2 rounded-2xl border border-neutral-light bg-neutral-light/30 p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <h3 className="text-sm font-bold text-text-main">
                                                Rule Preview
                                            </h3>
                                            <p className="mt-1 text-sm text-text-muted">
                                                Orders older than{" "}
                                                <span className="font-semibold text-text-main">
                                                    {form.warningDays}
                                                </span>{" "}
                                                days will show a warning. Orders older than{" "}
                                                <span className="font-semibold text-text-main">
                                                    {form.nonCompliantDays}
                                                </span>{" "}
                                                days will be considered non-compliant.
                                            </p>
                                        </div>

                                        <label className="flex items-center gap-3 rounded-xl border border-neutral-light bg-white px-4 py-2">
                                            <span className="text-sm font-semibold text-text-main">
                                                Active
                                            </span>
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
                                    <label className="text-sm font-semibold text-text-main">
                                        Notes
                                    </label>
                                    <textarea
                                        rows={4}
                                        value={form.notes}
                                        onChange={(e) => updateField("notes", e.target.value)}
                                        className="rounded-xl border border-neutral-light px-4 py-3 text-sm outline-none focus:border-primary"
                                        placeholder="Add optional notes about this delivery rule..."
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col items-start justify-between gap-4 border-t border-neutral-light px-6 py-4 md:flex-row md:items-center">
                                <div>
                                    {submitMessage ? (
                                        <p className="text-sm font-medium text-emerald-700">
                                            {submitMessage}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-text-muted">
                                            This form is ready for API integration in task #259.
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        className="rounded-xl border border-neutral-light px-5 py-2.5 text-sm font-semibold text-text-muted transition hover:bg-neutral-light"
                                    >
                                        Reset
                                    </button>
                                    <button
                                        type="submit"
                                        className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-text-main transition hover:opacity-90"
                                    >
                                        Save Rule
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