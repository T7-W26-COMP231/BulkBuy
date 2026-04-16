import { useEffect, useMemo, useState } from "react";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import { getApprovedQuotes } from "../../api/supplyApi";
import { getDeliveryRules } from "../../api/DeliveryRuleApi";
import { getThresholdChangeEvents } from "../../api/orderApi";
// ADD this import alongside existing imports
import { getSuppliers } from "../../api/UserApi";

const STATUS_STYLES = {
    delivered: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    delayed: "bg-red-100 text-red-700",
    dispatched: "bg-blue-100 text-blue-700",
    confirmed: "bg-green-100 text-green-700",
    accepted: "bg-green-100 text-green-700",
};

const COMPLIANCE_STYLES = {
    compliant: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    non_compliant: "bg-red-100 text-red-700",
};
const REGION_LABELS = {
    "north-america:ca-on": "Ontario",
    "north-america:ca-qc": "Quebec",
    "north-america:ca-bc": "British Columbia",
    "north-america:ca-ab": "Alberta",
};

const STATUS_DOT = {
    delivered: "bg-emerald-500",
    pending: "bg-amber-400",
    delayed: "bg-red-500",
    dispatched: "bg-blue-500",
    confirmed: "bg-green-500",
    accepted: "bg-green-500",
};

const REGION_OPTIONS = [
    { label: "All Regions", value: "" },
    { label: "Ontario", value: "north-america:ca-on" },
    { label: "Quebec", value: "north-america:ca-qc" },
    { label: "British Columbia", value: "north-america:ca-bc" },
    { label: "Alberta", value: "north-america:ca-ab" },
];

// WITH
function getComplianceStatus(confirmationAge, warningAfterDays = 5, maxDeliveryDays = 7) {
    if (confirmationAge == null) return "compliant";
    if (confirmationAge > maxDeliveryDays) return "non_compliant";
    if (confirmationAge > warningAfterDays) return "warning";
    return "compliant";
}

function getComplianceLabel(status) {
    switch (status) {
        case "non_compliant":
            return "Non-Compliant";
        case "warning":
            return "Warning";
        default:
            return "Compliant";
    }
}


const STATUS_OPTIONS = [
    { label: "All Status", value: "" },
    { label: "Delivered", value: "delivered" },
    { label: "Pending", value: "pending" },
    { label: "Delayed", value: "delayed" },
    { label: "Dispatched", value: "dispatched" },
    { label: "Confirmed", value: "confirmed" },
    { label: "Accepted", value: "accepted" },
];

const ITEMS_PER_PAGE = 5;

function normalizeQuote(row) {
    return {
        id: row._id || row.id || `${row.supplyId || ""}-${row.itemId || ""}`,
        orderId:
            row.orderId ||
            row.orderRef ||
            row.referenceNumber ||
            row.supplyId ||
            row.quoteId ||
            row._id ||
            "N/A",
        product:
            row.productName ||
            row.product ||
            row.itemName ||
            row?.meta?.productName ||
            "Unknown Product",
        supplier:
            row.supplierName ||
            row.supplier ||
            row?.supplierId?.companyName ||
            row?.supplierId?.name ||
            "Unknown Supplier",
        supplierId:
            row.supplierId?._id ||
            row.supplierId ||
            "",
        region:
            row.ops_region || "",
        regionLabel:
            REGION_LABELS[row.ops_region] || row.ops_region || "N/A",
        status:
            row.deliveryStatus ||
            row.status ||
            "pending",
        confirmationAge:
            typeof row.confirmationAge === "number"
                ? row.confirmationAge
                : null,
        isOverdue:
            typeof row.isOverdue === "boolean"
                ? row.isOverdue
                : typeof row.confirmationAge === "number"
                    ? row.confirmationAge > 5
                    : false,
    };
}

export default function AdminFulfillmentPage() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [deliveryRules, setDeliveryRules] = useState([]);

    const [supplierFilter, setSupplierFilter] = useState("");
    const [regionFilter, setRegionFilter] = useState("");
    const [appliedRegion, setAppliedRegion] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    const [appliedSupplier, setAppliedSupplier] = useState("");

    const [appliedStatus, setAppliedStatus] = useState("");

    const [currentPage, setCurrentPage] = useState(1);

    const [rows, setRows] = useState([]);
    const [totalResults, setTotalResults] = useState(0);
    const [thresholdEvents, setThresholdEvents] = useState([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [supplierOptions, setSupplierOptions] = useState([
        { label: "All Suppliers", value: "" },
    ]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        fetchApprovedQuotes();
        fetchThresholdEvents();

        const interval = setInterval(() => {
            fetchApprovedQuotes();
            fetchThresholdEvents();
        }, 10000); // live refresh every 10 seconds

        return () => clearInterval(interval);
    }, [currentPage, appliedSupplier, appliedRegion, appliedStatus]);

    useEffect(() => {
        getDeliveryRules()
            .then(result => setDeliveryRules(result?.items || []))
            .catch(() => { });
    }, []);

    useEffect(() => {
        getSuppliers()
            .then(result => {
                const users = result?.items || [];
                setSupplierOptions([
                    { label: "All Suppliers", value: "" },
                    ...users.map(u => ({
                        value: u.userId || u._id,
                        label: `${u.firstName} ${u.lastName}`,
                    }))
                ]);
            })
            .catch(() => { });
    }, []);

    async function fetchApprovedQuotes() {
        try {
            setLoading(true);
            setError("");

            const params = {
                page: currentPage,
                limit: ITEMS_PER_PAGE,
                status: appliedStatus || undefined,
                supplierId: appliedSupplier || undefined,
                ops_region: appliedRegion || undefined,
                ageDays: 5,
            };

            const result = await getApprovedQuotes(params);

            const rawRows =
                result?.data ||
                result?.rows ||
                result?.quotes ||
                result?.items ||
                [];

            const normalizedRows = rawRows.map(normalizeQuote);

            setRows(normalizedRows);

            setTotalResults(
                result?.total ||
                result?.pagination?.total ||
                normalizedRows.length
            );


        } catch (err) {
            console.error("Failed to fetch approved quotes:", err);
            setError(
                err?.response?.data?.message ||
                err?.message ||
                "Failed to load approved quotes."
            );
            setRows([]);
            setTotalResults(0);
        } finally {
            setLoading(false);
        }
    }

    async function fetchThresholdEvents() {
        try {
            setEventsLoading(true);

            const result = await getThresholdChangeEvents({
                ops_region: appliedRegion || undefined,
                page: 1,
                limit: 5,
            });

            const events =
                result?.items ||
                result?.data ||
                result?.rows ||
                [];

            setThresholdEvents(events);
        } catch (err) {
            console.error("Failed to load threshold events:", err);
            setThresholdEvents([]);
        } finally {
            setEventsLoading(false);
        }
    }

    function findMatchingRule(supplierId, region) {
        const active = deliveryRules.filter(r => r.isActive);
        return (
            active.find(r => r.supplierId === supplierId && r.deliveryRegion === region) ||
            active.find(r => r.supplierId === supplierId && !r.deliveryRegion) ||
            active.find(r => !r.supplierId && r.deliveryRegion === region) ||
            active.find(r => !r.supplierId && !r.deliveryRegion) ||
            { warningAfterDays: 5, maxDeliveryDays: 7 }
        );
    }

    const totalPages = Math.max(1, Math.ceil(totalResults / ITEMS_PER_PAGE));

    const thresholdSummary = useMemo(() => {
        const total = rows.length;

        const warningCount = rows.filter((row) => {
            const rule = findMatchingRule(row.supplierId, row.region);
            return (
                getComplianceStatus(
                    row.confirmationAge,
                    rule.warningAfterDays,
                    rule.maxDeliveryDays
                ) === "warning"
            );
        }).length;

        const breachCount = rows.filter((row) => {
            const rule = findMatchingRule(row.supplierId, row.region);
            return (
                getComplianceStatus(
                    row.confirmationAge,
                    rule.warningAfterDays,
                    rule.maxDeliveryDays
                ) === "non_compliant"
            );
        }).length;

        const demandPercent =
            total === 0 ? 0 : Math.min(100, Math.round(((warningCount + breachCount) / total) * 100));

        return {
            total,
            warningCount,
            breachCount,
            demandPercent,
            activeTier:
                breachCount > 0
                    ? "Critical Tier"
                    : warningCount > 0
                        ? "Elevated Tier"
                        : "Normal Tier",
        };
    }, [rows, deliveryRules]);

    const hasActionRequired = useMemo(() => {
        return rows.some((row) => {
            const rule = findMatchingRule(row.supplierId, row.region);
            return row.confirmationAge != null && row.confirmationAge > rule.warningAfterDays;
        });
    }, [rows, deliveryRules]);

    const handleApply = () => {
        setCurrentPage(1);
        setAppliedSupplier(supplierFilter);

        setAppliedRegion(regionFilter);
        setAppliedStatus(statusFilter);
    };

    const handleClear = () => {
        setSupplierFilter("");
        setRegionFilter("");
        setStatusFilter("");
        setAppliedSupplier("");
        setAppliedRegion("");
        setAppliedStatus("");
        setCurrentPage(1);
    };

    return (
        <div className="flex h-screen overflow-hidden bg-neutral-light/30">
            <AdminSidebar
                isMobileOpen={mobileOpen}
                onClose={() => setMobileOpen(false)}
            />

            <div className="flex flex-1 flex-col overflow-hidden">
                <AdminTopbar
                    title="Fulfillment"
                    searchPlaceholder="Search orders, suppliers, or locations..."
                    onMenuClick={() => setMobileOpen(true)}
                />

                <main className="flex-1 overflow-y-auto p-6">
                    <div className="flex flex-col gap-6">
                        <section className="overflow-hidden rounded-3xl bg-[#0d3028] px-8 py-8 text-white shadow-lg">
                            <span className="mb-3 inline-flex items-center rounded-full border border-[#a8f0c6]/30 bg-[#a8f0c6]/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#a8f0c6]">
                                Operational Insight
                            </span>
                            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                                Fulfillment &amp; Delivery Monitoring
                            </h1>
                            <p className="mt-3 max-w-xl text-sm leading-7 text-white/60 md:text-base">
                                Monitor threshold warnings, breached pricing tiers, and automated platform rule triggers across supplier regions in real-time.
                            </p>
                        </section>

                        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl border border-neutral-light bg-white p-5 shadow-sm">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
                                    Current Demand Level
                                </p>
                                <p className="mt-3 text-3xl font-bold text-text-main">
                                    {thresholdSummary.demandPercent}%
                                </p>
                                <p className="mt-2 text-sm text-text-muted">
                                    Based on warning and breached thresholds in current filtered results.
                                </p>
                            </div>

                            <div className="rounded-2xl border border-neutral-light bg-white p-5 shadow-sm">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
                                    Active Pricing Tier
                                </p>
                                <p className="mt-3 text-2xl font-bold text-text-main">
                                    {thresholdSummary.activeTier}
                                </p>
                                <p className="mt-2 text-sm text-text-muted">
                                    Automatically derived from current threshold conditions.
                                </p>
                            </div>

                            <div className="rounded-2xl border border-neutral-light bg-white p-5 shadow-sm">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
                                    Threshold Warnings
                                </p>
                                <p className="mt-3 text-3xl font-bold text-amber-600">
                                    {thresholdSummary.warningCount}
                                </p>
                                <p className="mt-2 text-sm text-text-muted">
                                    Demand approaching configured threshold limits.
                                </p>
                            </div>

                            <div className="rounded-2xl border border-neutral-light bg-white p-5 shadow-sm">
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
                                    Threshold Breaches
                                </p>
                                <p className="mt-3 text-3xl font-bold text-red-600">
                                    {thresholdSummary.breachCount}
                                </p>
                                <p className="mt-2 text-sm text-text-muted">
                                    Platform rules triggered by exceeded threshold conditions.
                                </p>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-neutral-light bg-white p-5 shadow-sm">
                            <div className="flex flex-wrap items-end gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                        Supplier
                                    </label>
                                    <select
                                        value={supplierFilter}
                                        onChange={(e) => setSupplierFilter(e.target.value)}
                                        className="rounded-xl border border-neutral-light bg-white px-4 py-2.5 text-sm text-text-main outline-none focus:border-primary"
                                    >
                                        {supplierOptions.map((o) => (
                                            <option key={o.value || "all"} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                        Region
                                    </label>
                                    <select
                                        value={regionFilter}
                                        onChange={(e) => setRegionFilter(e.target.value)}
                                        className="rounded-xl border border-neutral-light bg-white px-4 py-2.5 text-sm text-text-main outline-none focus:border-primary"
                                    >
                                        {REGION_OPTIONS.map((o) => (
                                            <option key={o.value || "all-region"} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                        Status
                                    </label>
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        className="rounded-xl border border-neutral-light bg-white px-4 py-2.5 text-sm text-text-main outline-none focus:border-primary"
                                    >
                                        {STATUS_OPTIONS.map((o) => (
                                            <option key={o.value || "all-status"} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleClear}
                                        className="rounded-xl border border-neutral-light px-5 py-2.5 text-sm font-semibold text-text-muted transition hover:bg-neutral-light"
                                    >
                                        Clear Filters
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleApply}
                                        className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-text-main transition hover:opacity-90"
                                    >
                                        Apply Filters
                                    </button>
                                </div>
                            </div>
                        </section>

                        <section className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
                            <div className="flex items-center justify-between border-b border-neutral-light px-6 py-4">
                                <h2 className="text-base font-bold text-text-main">
                                    Shipment Tracking
                                </h2>

                                <div className="flex items-center gap-4">
                                    {hasActionRequired && (
                                        <span className="flex items-center gap-1.5 text-xs text-text-muted">
                                            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                                            Action Required (&gt; 5 days)
                                        </span>
                                    )}
                                </div>
                            </div>

                            {error && (
                                <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">
                                    {error}
                                </div>
                            )}
                            {!loading && rows.length > 0 && (() => {
                                const violations = rows.filter(row => {
                                    const rule = findMatchingRule(row.supplierId, row.region);
                                    return getComplianceStatus(row.confirmationAge, rule.warningAfterDays, rule.maxDeliveryDays) === "non_compliant";
                                });
                                const warnings = rows.filter(row => {
                                    const rule = findMatchingRule(row.supplierId, row.region);
                                    return getComplianceStatus(row.confirmationAge, rule.warningAfterDays, rule.maxDeliveryDays) === "warning";
                                });
                                if (violations.length === 0 && warnings.length === 0) return null;
                                return (
                                    <div className="border-b border-neutral-light px-6 py-3 flex flex-wrap items-center gap-3">
                                        {violations.length > 0 && (
                                            <span className="inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-200 px-4 py-1.5 text-xs font-bold text-red-700">
                                                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                                                {violations.length} Non-Compliant {violations.length === 1 ? "Shipment" : "Shipments"}
                                            </span>
                                        )}
                                        {warnings.length > 0 && (
                                            <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-4 py-1.5 text-xs font-bold text-amber-700">
                                                <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                                                {warnings.length} {warnings.length === 1 ? "Shipment" : "Shipments"} Approaching Deadline
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[800px] text-left">
                                    <thead className="border-b border-neutral-light bg-neutral-light/40">
                                        <tr>
                                            {[
                                                "Order ID",
                                                "Item",
                                                "Supplier",
                                                "Region",
                                                "Status",
                                                "Confirmation Age",
                                                "Compliance",
                                            ].map((h) => (
                                                <th
                                                    key={h}
                                                    className="px-6 py-4 text-xs font-bold uppercase tracking-[0.14em] text-text-muted"
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-neutral-light">
                                        {loading ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-12 text-center text-sm text-text-muted">
                                                    Loading approved quotes...
                                                </td>
                                            </tr>
                                        ) : rows.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-12 text-center text-sm text-text-muted">
                                                    No shipments found.
                                                </td>
                                            </tr>
                                        ) : (
                                            rows.map((row) => {
                                                const rule = findMatchingRule(row.supplierId, row.region);
                                                const isOverdue = row.confirmationAge != null && row.confirmationAge > rule.warningAfterDays;
                                                const complianceStatus = getComplianceStatus(row.confirmationAge, rule.warningAfterDays, rule.maxDeliveryDays);

                                                return (
                                                    <tr
                                                        key={row.id}
                                                        className={`transition hover:bg-neutral-light/30 ${isOverdue ? "bg-amber-50" : ""
                                                            }`}
                                                    >
                                                        <td className="px-6 py-5 font-mono text-xs font-semibold text-text-muted">
                                                            #{row.orderId}
                                                        </td>

                                                        <td className="px-6 py-5 text-sm text-text-main">
                                                            {row.product}
                                                        </td>

                                                        <td className="px-6 py-5 text-sm font-semibold text-[#0f6e56]">
                                                            {row.supplier}
                                                        </td>

                                                        <td className="px-6 py-5 text-sm text-text-muted">
                                                            {row.regionLabel}
                                                        </td>

                                                        <td className="px-6 py-5">
                                                            <span
                                                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold capitalize ${STATUS_STYLES[row.status] ?? "bg-slate-100 text-slate-700"
                                                                    }`}
                                                            >
                                                                <span
                                                                    className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[row.status] ?? "bg-slate-400"
                                                                        }`}
                                                                />
                                                                {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                                                            </span>
                                                        </td>

                                                        <td
                                                            className={`px-6 py-5 text-sm font-semibold ${isOverdue ? "text-amber-600" : "text-text-main"
                                                                }`}
                                                        >
                                                            {row.confirmationAge != null
                                                                ? `${row.confirmationAge} day${row.confirmationAge !== 1 ? "s" : ""}`
                                                                : "N/A"}
                                                        </td>

                                                        <td className="px-6 py-5">
                                                            <span
                                                                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${COMPLIANCE_STYLES[complianceStatus]
                                                                    }`}
                                                            >
                                                                {getComplianceLabel(complianceStatus)}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex items-center justify-between border-t border-neutral-light px-6 py-4">
                                <p className="text-sm text-text-muted">
                                    Showing {totalResults === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                                    {Math.min(currentPage * ITEMS_PER_PAGE, totalResults)} of {totalResults} shipments
                                </p>

                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="rounded-lg border border-neutral-light px-3 py-1.5 text-sm font-semibold text-text-main transition hover:bg-neutral-light disabled:opacity-40"
                                    >
                                        Previous
                                    </button>

                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                        <button
                                            key={page}
                                            type="button"
                                            onClick={() => setCurrentPage(page)}
                                            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${page === currentPage
                                                ? "bg-primary text-text-main"
                                                : "border border-neutral-light text-text-main hover:bg-neutral-light"
                                                }`}
                                        >
                                            {page}
                                        </button>
                                    ))}

                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="rounded-lg border border-neutral-light px-3 py-1.5 text-sm font-semibold text-text-main transition hover:bg-neutral-light disabled:opacity-40"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-base font-bold text-text-main">
                                    Threshold Change Events
                                </h2>
                                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                    Latest 5 updates
                                </span>
                            </div>

                            {eventsLoading ? (
                                <p className="py-6 text-sm text-text-muted">
                                    Loading threshold events...
                                </p>
                            ) : thresholdEvents.length === 0 ? (
                                <p className="py-6 text-sm text-text-muted">
                                    No threshold changes found.
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[720px] text-left">
                                        <thead className="border-b border-neutral-light bg-neutral-light/40">
                                            <tr>
                                                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-muted">
                                                    Timestamp
                                                </th>
                                                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-muted">
                                                    Tier
                                                </th>
                                                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-muted">
                                                    Region
                                                </th>
                                                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-muted">
                                                    Demand
                                                </th>
                                                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-muted">
                                                    Affected Item
                                                </th>
                                                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-muted">
                                                    Status
                                                </th>
                                            </tr>
                                        </thead>

                                        <tbody className="divide-y divide-neutral-light">
                                            {thresholdEvents.map((event, index) => (
                                                <tr
                                                    key={event.orderId || index}
                                                    className={`transition hover:bg-neutral-light/30 ${String(event.activeTier || "").includes("4")
                                                            ? "bg-red-50"
                                                            : String(event.activeTier || "").includes("3")
                                                                ? "bg-amber-50"
                                                                : ""
                                                        }`}
                                                >
                                                    <td className="px-4 py-4 text-sm text-text-muted">
                                                        {event.changedAt
                                                            ? new Date(event.changedAt).toLocaleString()
                                                            : "No timestamp"}
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <span
                                                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${String(event.activeTier || "").includes("4")
                                                                    ? "bg-red-100 text-red-700"
                                                                    : String(event.activeTier || "").includes("3")
                                                                        ? "bg-orange-100 text-orange-700"
                                                                        : "bg-emerald-100 text-emerald-700"
                                                                }`}
                                                        >
                                                            {event.activeTier || "Updated"}
                                                        </span>
                                                    </td>

                                                    <td className="px-4 py-4 text-sm font-semibold text-text-main">
                                                        {REGION_LABELS[event.ops_region] ||
                                                            event.ops_region ||
                                                            "N/A"}
                                                    </td>

                                                    <td
                                                        className={`px-4 py-4 text-sm font-bold ${String(event.activeTier || "").includes("4")
                                                                ? "text-red-600"
                                                                : "text-primary"
                                                            }`}
                                                    >
                                                        {event.totalDemand ?? 0}
                                                    </td>

                                                    <td className="px-4 py-4 text-sm text-text-main">
                                                        #{event.orderId || "N/A"}
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <span
                                                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${String(event.activeTier || "").includes("4")
                                                                    ? "bg-red-100 text-red-700"
                                                                    : "bg-slate-100 text-slate-700"
                                                                }`}
                                                        >
                                                            {String(event.activeTier || "").includes("4")
                                                                ? "Threshold Breach"
                                                                : event.status || "N/A"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </div>
                </main>
            </div>
        </div>
    );
}