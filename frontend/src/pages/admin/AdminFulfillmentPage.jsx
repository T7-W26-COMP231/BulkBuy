import { useState, useMemo } from "react";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";

const STATUS_STYLES = {
    delivered: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    delayed: "bg-red-100 text-red-700",
    dispatched: "bg-blue-100 text-blue-700",
    confirmed: "bg-green-100 text-green-700",
};

const COMPLIANCE_STYLES = {
    compliant: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    non_compliant: "bg-red-100 text-red-700",
};

const STATUS_DOT = {
    delivered: "bg-emerald-500",
    pending: "bg-amber-400",
    delayed: "bg-red-500",
    dispatched: "bg-blue-500",
    confirmed: "bg-green-500",
};

function getComplianceStatus(confirmationAge) {
    if (confirmationAge == null) return "compliant";
    if (confirmationAge > 7) return "non_compliant";
    if (confirmationAge > 5) return "warning";
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

const SUPPLIER_OPTIONS = [
    { label: "All Suppliers", value: "" },
    { label: "Global Logistics Corp", value: "Global Logistics Corp" },
    { label: "Prime Delivery Systems", value: "Prime Delivery Systems" },
    { label: "Swift Freight Solutions", value: "Swift Freight Solutions" },
];

const CITY_OPTIONS = [
    { label: "All Cities", value: "" },
    { label: "Toronto", value: "ON-TOR" },
    { label: "Mississauga", value: "ON-MIS" },
    { label: "Brampton", value: "ON-BRA" },
    { label: "Vaughan", value: "ON-VAU" },
    { label: "Markham", value: "ON-MAR" },
    { label: "Richmond Hill", value: "ON-RHL" },
    { label: "Oakville", value: "ON-OAK" },
];

const STATUS_OPTIONS = [
    { label: "All Statuses", value: "" },
    { label: "Delivered", value: "delivered" },
    { label: "Pending", value: "pending" },
    { label: "Delayed", value: "delayed" },
    { label: "Dispatched", value: "dispatched" },
    { label: "Confirmed", value: "confirmed" },
];

const MOCK_SHIPMENTS = [
    {
        id: "1",
        orderId: "ORD-90234",
        product: "Industrial Grade Steel Pipes",
        supplier: "Global Logistics Corp",
        city: "ON-TOR",
        cityLabel: "Toronto",
        status: "delivered",
        confirmationAge: 2,
    },
    {
        id: "2",
        orderId: "ORD-88120",
        product: "HVAC Cooling Units (x12)",
        supplier: "Prime Delivery Systems",
        city: "ON-MIS",
        cityLabel: "Mississauga",
        status: "pending",
        confirmationAge: 8,
    },
    {
        id: "3",
        orderId: "ORD-90511",
        product: "Electrical Wiring Kits",
        supplier: "Swift Freight Solutions",
        city: "ON-BRA",
        cityLabel: "Brampton",
        status: "delayed",
        confirmationAge: 4,
    },
    {
        id: "4",
        orderId: "ORD-87442",
        product: "Solar Panel Array A-Grade",
        supplier: "Global Logistics Corp",
        city: "ON-VAU",
        cityLabel: "Vaughan",
        status: "pending",
        confirmationAge: 6,
    },
    {
        id: "5",
        orderId: "ORD-96600",
        product: "Bulk Concrete Mix (500t)",
        supplier: "Prime Delivery Systems",
        city: "ON-MAR",
        cityLabel: "Markham",
        status: "delivered",
        confirmationAge: 1,
    },
    {
        id: "6",
        orderId: "ORD-91023",
        product: "Reinforced Aluminum Sheets",
        supplier: "Swift Freight Solutions",
        city: "ON-RHL",
        cityLabel: "Richmond Hill",
        status: "confirmed",
        confirmationAge: 3,
    },
    {
        id: "7",
        orderId: "ORD-85317",
        product: "Commercial Grade Lumber",
        supplier: "Global Logistics Corp",
        city: "ON-OAK",
        cityLabel: "Oakville",
        status: "dispatched",
        confirmationAge: 7,
    },
    {
        id: "8",
        orderId: "ORD-93840",
        product: "Copper Piping Bundle",
        supplier: "Prime Delivery Systems",
        city: "ON-TOR",
        cityLabel: "Toronto",
        status: "delayed",
        confirmationAge: 9,
    },
    {
        id: "9",
        orderId: "ORD-79214",
        product: "LED Flood Lights (x50)",
        supplier: "Swift Freight Solutions",
        city: "ON-MIS",
        cityLabel: "Mississauga",
        status: "delivered",
        confirmationAge: 1,
    },
    {
        id: "10",
        orderId: "ORD-88765",
        product: "Insulation Foam Boards",
        supplier: "Global Logistics Corp",
        city: "ON-BRA",
        cityLabel: "Brampton",
        status: "pending",
        confirmationAge: 5,
    },
    {
        id: "11",
        orderId: "ORD-92150",
        product: "Hydraulic Pumps (x4)",
        supplier: "Prime Delivery Systems",
        city: "ON-VAU",
        cityLabel: "Vaughan",
        status: "confirmed",
        confirmationAge: 2,
    },
    {
        id: "12",
        orderId: "ORD-80431",
        product: "Fire Suppression Systems",
        supplier: "Swift Freight Solutions",
        city: "ON-MAR",
        cityLabel: "Markham",
        status: "dispatched",
        confirmationAge: 6,
    },
];

const ITEMS_PER_PAGE = 5;

export default function AdminFulfillmentPage() {
    const [mobileOpen, setMobileOpen] = useState(false);

    const [supplierFilter, setSupplierFilter] = useState("");
    const [cityFilter, setCityFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    const [appliedSupplier, setAppliedSupplier] = useState("");
    const [appliedCity, setAppliedCity] = useState("");
    const [appliedStatus, setAppliedStatus] = useState("");

    const [currentPage, setCurrentPage] = useState(1);

    const filtered = useMemo(() => {
        return MOCK_SHIPMENTS.filter((s) => {
            if (appliedSupplier && s.supplier !== appliedSupplier) return false;
            if (appliedCity && s.city !== appliedCity) return false;
            if (appliedStatus && s.status !== appliedStatus) return false;
            return true;
        });
    }, [appliedSupplier, appliedCity, appliedStatus]);

    const totalResults = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalResults / ITEMS_PER_PAGE));
    const paginated = filtered.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const hasActionRequired = filtered.some(
        (s) => s.confirmationAge != null && s.confirmationAge > 5
    );

    const handleApply = () => {
        setCurrentPage(1);
        setAppliedSupplier(supplierFilter);
        setAppliedCity(cityFilter);
        setAppliedStatus(statusFilter);
    };

    const handleClear = () => {
        setSupplierFilter("");
        setCityFilter("");
        setStatusFilter("");
        setCurrentPage(1);
        setAppliedSupplier("");
        setAppliedCity("");
        setAppliedStatus("");
    };

    return (
        <div className="flex h-screen overflow-hidden bg-neutral-light/30">
            {/* Sidebar */}
            <AdminSidebar
                isMobileOpen={mobileOpen}
                onClose={() => setMobileOpen(false)}
            />

            {/* Main */}
            <div className="flex flex-1 flex-col overflow-hidden">
                {/* Topbar */}
                <AdminTopbar
                    title="Fulfillment"
                    searchPlaceholder="Search orders, suppliers, or locations..."
                    onMenuClick={() => setMobileOpen(true)}
                />

                {/* Page content */}
                <main className="flex-1 overflow-y-auto p-6">
                    <div className="flex flex-col gap-6">

                        {/* Hero */}
                        <section className="overflow-hidden rounded-3xl bg-[#0d3028] px-8 py-8 text-white shadow-lg">
                            <span className="mb-3 inline-flex items-center rounded-full border border-[#a8f0c6]/30 bg-[#a8f0c6]/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#a8f0c6]">
                                Operational Insight
                            </span>
                            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                                Fulfillment &amp; Delivery Monitoring
                            </h1>
                            <p className="mt-3 max-w-xl text-sm leading-7 text-white/60 md:text-base">
                                Track approved quotes, delivery status, and supplier compliance across regions in real-time.
                            </p>
                        </section>

                        {/* Filters */}
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
                                        {SUPPLIER_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                        City
                                    </label>
                                    <select
                                        value={cityFilter}
                                        onChange={(e) => setCityFilter(e.target.value)}
                                        className="rounded-xl border border-neutral-light bg-white px-4 py-2.5 text-sm text-text-main outline-none focus:border-primary"
                                    >
                                        {CITY_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
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
                                            <option key={o.value} value={o.value}>{o.label}</option>
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

                        {/* Table */}
                        <section className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
                            <div className="flex items-center justify-between border-b border-neutral-light px-6 py-4">
                                <h2 className="text-base font-bold text-text-main">Shipment Tracking</h2>
                                <div className="flex items-center gap-4">
                                    {hasActionRequired && (
                                        <span className="flex items-center gap-1.5 text-xs text-text-muted">
                                            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                                            Action Required (&gt; 5 days)
                                        </span>
                                    )}
                                    <div className="flex overflow-hidden rounded-xl border border-neutral-light">
                                        <button
                                            type="button"
                                            className="bg-neutral-light/60 px-4 py-1.5 text-xs font-semibold text-text-main"
                                        >
                                            Table View
                                        </button>
                                        <button
                                            type="button"
                                            className="px-4 py-1.5 text-xs font-semibold text-text-muted transition hover:bg-neutral-light/30"
                                        >
                                            Map View
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[800px] text-left">
                                    <thead className="border-b border-neutral-light bg-neutral-light/40">
                                        <tr>
                                            {["Order ID", "Item", "Supplier", "City", "Status", "Confirmation Age", "Compliance", ""].map((h) => (
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
                                        {paginated.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="px-6 py-12 text-center text-sm text-text-muted">
                                                    No shipments found.
                                                </td>
                                            </tr>
                                        ) : (
                                            paginated.map((row) => {
                                                const isOverdue = row.confirmationAge != null && row.confirmationAge > 5;
const complianceStatus = getComplianceStatus(row.confirmationAge);
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
                                                            {row.cityLabel}
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
                                                                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${COMPLIANCE_STYLES[complianceStatus]}`}
                                                            >
                                                                {getComplianceLabel(complianceStatus)}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <button
                                                                type="button"
                                                                className="rounded-lg border border-neutral-light px-2 py-1 text-base text-text-muted transition hover:bg-neutral-light"
                                                            >
                                                                ⋯
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="flex items-center justify-between border-t border-neutral-light px-6 py-4">
                                <p className="text-sm text-text-muted">
                                    Showing{" "}
                                    {totalResults === 0
                                        ? 0
                                        : (currentPage - 1) * ITEMS_PER_PAGE + 1}{" "}
                                    to {Math.min(currentPage * ITEMS_PER_PAGE, totalResults)} of{" "}
                                    {totalResults} shipments
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

                    </div>
                </main>
            </div>
        </div>
    );
}