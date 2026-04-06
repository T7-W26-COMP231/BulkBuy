import SupplierLayout from "../../components/supplier/SupplierLayout";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const formatEpochDate = (value) => {
    if (!value) return "N/A";
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString();
};

const STATUS_STYLES = {
    pending: "bg-amber-100 text-amber-700",
    requested: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    declined: "bg-red-100 text-red-700",
    dispatched: "bg-blue-100 text-blue-700",
    fulfilled: "bg-emerald-100 text-emerald-700",
};

export default function SupplierFulfillmentPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { accessToken } = useAuth();

    const [order, setOrder] = useState(null);
    const [loadingOrder, setLoadingOrder] = useState(true);
    const [orderError, setOrderError] = useState("");

    const [deliveryDate, setDeliveryDate] = useState("");
    const [fulfillmentNotes, setFulfillmentNotes] = useState("");

    const [confirming, setConfirming] = useState(false);

    const [showDeclineModal, setShowDeclineModal] = useState(false);
    const [declineReason, setDeclineReason] = useState("");
    const [declineError, setDeclineError] = useState("");
    const [declining, setDeclining] = useState(false);

    const [checklist, setChecklist] = useState([
        { id: 1, label: "Batch quality certificate attached", checked: true },
        { id: 2, label: "Standard pallet dimensions (48\" x 40\") used", checked: true },
        { id: 3, label: "Moisture-proof wrapping applied", checked: false },
    ]);

    useEffect(() => {
        const fetchOrder = async () => {
            try {
                setLoadingOrder(true);
                setOrderError("");
                const response = await fetch(
                    `${import.meta.env.VITE_API_URL}/api/ordrs/${id}`,
                    {
                        headers: accessToken
                            ? { Authorization: `Bearer ${accessToken}` }
                            : {},
                    }
                );
                const data = await response.json();
                if (!response.ok) throw new Error(data?.message || "Failed to load order");
                setOrder(data);
            } catch (err) {
                setOrderError(err.message || "Failed to load order");
            } finally {
                setLoadingOrder(false);
            }
        };
        if (id) fetchOrder();
    }, [id, accessToken]);

    const handleConfirmFulfillment = async () => {

        try {
            setConfirming(true);

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/api/ordrs/${id}/fulfill`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                    },
                    body: JSON.stringify({ deliveryDate, notes: fulfillmentNotes }),
                }
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data?.message || "Failed to confirm fulfillment");
            navigate("/supplier/order-requests");
        } catch (err) {

        } finally {
            setConfirming(false);
        }
    };

    const handleDecline = async () => {
        if (!declineReason.trim()) {
            setDeclineError("Decline reason is required.");
            return;
        }
        try {
            setDeclining(true);
            setDeclineError("");
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/api/ordrs/${id}/decline`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                    },
                    body: JSON.stringify({ reason: declineReason.trim() }),
                }
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data?.message || "Failed to decline");
            navigate("/supplier/order-requests");
        } catch (err) {
            setDeclineError(err.message || "Failed to decline");
        } finally {
            setDeclining(false);
        }
    };

    // Derived order values
    const items = Array.isArray(order?.items) ? order.items : [];
    const totalQty = items.reduce(
        (sum, item) => sum + Number(item?.quantity || item?.meta?.quantity || 0),
        0
    );
    const firstItem = items[0] || {};
    const productName =
        items.length > 1
            ? `${items.length} items`
            : firstItem.productId
                ? `Product ${String(firstItem.productId).slice(-6)}`
                : "N/A";
    const windowStart = order?.salesWindow?.fromEpoch
        ? formatEpochDate(order.salesWindow.fromEpoch)
        : "N/A";
    const windowEnd = order?.salesWindow?.toEpoch
        ? formatEpochDate(order.salesWindow.toEpoch)
        : "N/A";
    const orderStatus = (order?.status || "approved").toLowerCase();

    return (
        <SupplierLayout>
            <div className="flex flex-col gap-6">

                {/* Breadcrumb */}
                <nav className="flex items-center gap-2 text-sm text-text-muted">
                    <button
                        type="button"
                        onClick={() => navigate("/supplier/order-requests")}
                        className="transition hover:text-text-main"
                    >
                        Orders
                    </button>
                    <span>›</span>
                    <span className="font-semibold text-text-main">Confirm Fulfillment</span>
                </nav>

                {/* Hero */}
                <section className="overflow-hidden rounded-3xl bg-[#083b2d] px-8 py-8 text-white shadow-lg">
                    <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                        Fulfillment Confirmation
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-white/75">
                        Confirm readiness to fulfill approved orders and provide expected delivery date. Once
                        confirmed, logistics will be notified for pickup scheduling.
                    </p>
                </section>

                {/* Loading / Error */}
                {loadingOrder ? (
                    <div className="rounded-2xl border border-neutral-light bg-white px-6 py-16 text-center text-sm text-text-muted shadow-sm">
                        Loading order details...
                    </div>
                ) : orderError ? (
                    <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-16 text-center text-sm text-red-600 shadow-sm">
                        {orderError}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

                        {/* LEFT COLUMN */}
                        <div className="flex flex-col gap-6 lg:col-span-2">

                            {/* Order Summary */}
                            <section className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                                <div className="mb-5 flex items-center justify-between">
                                    <h2 className="text-base font-bold text-text-main">Order Summary</h2>
                                    <span
                                        className={`rounded-lg px-3 py-1 text-xs font-bold uppercase ${STATUS_STYLES[orderStatus] ?? "bg-slate-100 text-slate-700"}`}
                                    >
                                        {orderStatus}
                                    </span>
                                </div>

                                {/* Order meta */}
                                <div className="grid grid-cols-3 gap-4 mb-5">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                            Order ID
                                        </p>
                                        <p className="mt-1 text-sm font-bold text-text-main">
                                            #ORD-2023-8912
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                            Quantity
                                        </p>
                                        <p className="mt-1 text-sm font-bold text-text-main">
                                            500 Units
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                            Delivery City
                                        </p>
                                        <p className="mt-1 text-sm font-bold text-text-main">
                                            San Francisco, CA
                                        </p>
                                    </div>
                                </div>

                                {/* Product card */}
                                <div className="rounded-2xl border border-neutral-light bg-neutral-light/20 p-4">
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                                            <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-text-main">Organic Arabica Beans</p>
                                            <p className="text-xs text-text-muted">Premium Grade-A Whole Beans</p>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-text-muted">
                                            <span className="flex items-center gap-1">
                                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                Oct 12 - Oct 15 · 25kg Sacks
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Quality & Packing Checklist */}
                            <section className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                                <h2 className="mb-4 text-base font-bold text-text-main">
                                    Quality & Packing Checklist
                                </h2>
                                <div className="flex flex-col gap-3">
                                    {checklist.map((item) => (
                                        <label
                                            key={item.id}
                                            className="flex cursor-pointer items-center gap-3"
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setChecklist((prev) =>
                                                        prev.map((c) =>
                                                            c.id === item.id ? { ...c, checked: !c.checked } : c
                                                        )
                                                    )
                                                }
                                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${item.checked
                                                    ? "border-primary bg-primary"
                                                    : "border-neutral-light bg-white"
                                                    }`}
                                            >
                                                {item.checked && (
                                                    <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </button>
                                            <span className="text-sm text-text-main">{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </section>

                        </div>

                        {/* RIGHT COLUMN */}
                        <div className="flex flex-col gap-6">

                            {/* Fulfillment Details */}
                            <section className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                                <h2 className="mb-5 text-base font-bold text-text-main">
                                    Fulfillment Details
                                </h2>

                                <div className="flex flex-col gap-4">
                                    <div>
                                        <label className="mb-2 block text-sm font-semibold text-text-main">
                                            Expected Delivery Date{" "}
                                            <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            value={deliveryDate}
                                            onChange={(e) => setDeliveryDate(e.target.value)}
                                            className="w-full rounded-xl border border-neutral-light px-4 py-2.5 text-sm outline-none focus:border-primary"
                                        />

                                    </div>

                                    <div>
                                        <label className="mb-2 block text-sm font-semibold text-text-main">
                                            Fulfillment Notes (Optional)
                                        </label>
                                        <textarea
                                            value={fulfillmentNotes}
                                            onChange={(e) => setFulfillmentNotes(e.target.value)}
                                            rows={4}
                                            placeholder="Any specific loading instructions..."
                                            className="w-full resize-none rounded-xl border border-neutral-light px-4 py-2.5 text-sm outline-none focus:border-primary"
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleConfirmFulfillment}
                                        disabled={confirming}
                                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-text-main transition hover:opacity-90 disabled:opacity-50"
                                    >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                        </svg>
                                        {confirming ? "Confirming..." : "Confirm Fulfillment"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowDeclineModal(true);
                                            setDeclineReason("");
                                            setDeclineError("");
                                        }}
                                        disabled={confirming}
                                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-3 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                                    >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                        </svg>
                                        {declining ? "Declining..." : "Decline Fulfillment"}
                                    </button>
                                </div>
                            </section>

                            {/* Logistics Note */}
                            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 mt-0.5">
                                        <span className="text-[10px] font-bold text-white">i</span>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-blue-700">Logistics Note</p>
                                        <p className="mt-1 text-xs leading-5 text-blue-600">
                                            By confirming, you agree to have the cargo ready for pickup by the
                                            scheduled date. Carrier details will be provided 24h before pickup.
                                        </p>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </div>

            {/* Decline Modal */}
            {showDeclineModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
                        <div className="border-b border-neutral-light px-6 py-4">
                            <h2 className="text-lg font-bold text-text-main">Decline Fulfillment</h2>
                            <p className="mt-1 text-sm text-text-muted">
                                Please provide a reason before declining this fulfillment.
                            </p>
                        </div>

                        <div className="px-6 py-5">
                            <label className="mb-2 block text-sm font-semibold text-text-main">
                                Decline Reason <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={declineReason}
                                onChange={(e) => {
                                    setDeclineReason(e.target.value);
                                    setDeclineError("");
                                }}
                                rows={4}
                                placeholder="Example: Insufficient stock for requested delivery window"
                                className="w-full rounded-2xl border border-neutral-light px-4 py-3 text-sm outline-none focus:border-primary"
                            />
                            {declineError && (
                                <p className="mt-2 text-sm font-medium text-red-600">{declineError}</p>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 border-t border-neutral-light px-6 py-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowDeclineModal(false);
                                    setDeclineReason("");
                                    setDeclineError("");
                                }}
                                className="rounded-xl border border-neutral-light px-4 py-2 text-sm font-semibold text-text-main"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={!declineReason.trim() || declining}
                                onClick={handleDecline}
                                className={`rounded-xl px-4 py-2 text-sm font-bold text-white transition ${declineReason.trim() && !declining
                                    ? "bg-red-600 hover:opacity-90"
                                    : "cursor-not-allowed bg-red-300"
                                    }`}
                            >
                                {declining ? "Declining..." : "Submit Decline"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </SupplierLayout>
    );
}