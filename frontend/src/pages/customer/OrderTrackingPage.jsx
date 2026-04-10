// src/pages/customer/OrderTrackingPage.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";
import { useAuth } from "../../contexts/AuthContext";
import api from "../../api/api";
import { fetchOrderStatus } from "../../api/orderApi";

const STATUS_RANK = {
    draft: 0,
    submitted: 0,
    approved: 1,
    confirmed: 2,
    dispatched: 3,
    fulfilled: 4,
};

function getStatusRank(status) {
    return STATUS_RANK[String(status || "").toLowerCase()] ?? 0;
}

function getFulfillmentMode(order) {
    const explicitMode = String(
        order?.fulfillmentMethod || order?.deliveryMethod || ""
    ).toLowerCase();

    if (explicitMode === "pickup" || explicitMode === "delivery") {
        return explicitMode;
    }

    if (order?.trackingNumber) {
        return "delivery";
    }

    if (order?.deliveryLocation) {
        return "pickup";
    }

    return "unknown";
}

function buildLifecycleStages(order) {
    const status = String(order?.status || "").toLowerCase();
    const rank = getStatusRank(status);
    const fulfillmentMode = getFulfillmentMode(order);

    const fulfillmentLabel =
        fulfillmentMode === "pickup"
            ? "Ready for Pickup"
            : fulfillmentMode === "delivery"
                ? "Shipped"
                : "Fulfillment Update";

    const completedLabel =
        fulfillmentMode === "pickup"
            ? "Picked Up"
            : fulfillmentMode === "delivery"
                ? "Delivered"
                : "Completed";

    return [
        {
            key: "submitted",
            label: "Order Submitted",
            icon: "shopping_bag",
            completed: rank >= 0,
            timestamp: order?.createdAt || null,
        },
        {
            key: "aggregation_closed",
            label: "Aggregation Closed",
            icon: "groups",
            completed:
                Boolean(order?.salesWindow?.toEpoch) &&
                Number(order.salesWindow.toEpoch) <= Date.now(),
            timestamp: order?.salesWindow?.toEpoch || null,
        },
        {
            key: "confirmed",
            label: "Confirmed",
            icon: "check_circle",
            completed: rank >= 2,
            timestamp:
                order?.confirmedAt ||
                (rank >= 2 ? order?.updatedAt : null) ||
                null,
        },
        {
            key: "fulfillment_update",
            label: fulfillmentLabel,
            icon: fulfillmentMode === "pickup" ? "store" : "local_shipping",
            completed: rank >= 3,
            timestamp:
                order?.dispatchedAt ||
                order?.fulfillmentUpdatedAt ||
                (rank >= 3 ? order?.updatedAt : null) ||
                null,
        },
        {
            key: "completed",
            label: completedLabel,
            icon: "inventory_2",
            completed: rank >= 4,
            timestamp:
                order?.fulfilledAt ||
                order?.deliveredAt ||
                order?.pickedUpAt ||
                (rank >= 4 ? order?.updatedAt : null) ||
                null,
        },
    ];
}

function formatEpoch(epoch) {
    if (!epoch) return "Pending";
    return new Date(Number(epoch)).toLocaleDateString("en-CA", {
        month: "short", day: "numeric", year: "numeric",
    });
}

function formatEpochFull(epoch) {
    if (!epoch) return "Pending";
    return new Date(Number(epoch)).toLocaleString("en-CA", {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

function StatusBadge({ status }) {
    const map = {
        draft: { label: "Draft", cls: "bg-neutral-light text-text-muted" },
        submitted: { label: "In Progress", cls: "bg-amber-100 text-amber-700" },
        approved: { label: "Approved", cls: "bg-blue-100 text-blue-700" },
        confirmed: { label: "Confirmed", cls: "bg-teal-100 text-teal-700" },
        dispatched: { label: "Dispatched", cls: "bg-purple-100 text-purple-700" },
        fulfilled: { label: "Delivered", cls: "bg-green-100 text-green-700" },
        cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-700" },
        declined: { label: "Declined", cls: "bg-red-100 text-red-700" },
    };
    const { label, cls } = map[status] || { label: status, cls: "bg-neutral-light text-text-muted" };
    return (
        <span className={`rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wide ${cls}`}>
            {label}
        </span>
    );
}

export default function OrderTrackingPage() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [itemDataMap, setItemDataMap] = useState({});
    const [statusData, setStatusData] = useState(null);

        useEffect(() => {
        if (!orderId) return;

        let intervalId;

        const load = async (showLoader = false) => {
            try {
                if (showLoader) setLoading(true);

                const res = await api.get(`/ordrs/${orderId}`);
                const o = res.data?.data || res.data;
                setOrder(o);

                const statusRes = await fetchOrderStatus(orderId);
                setStatusData(statusRes);

                const ids = [
                    ...new Set(
                        (o.items || [])
                            .map((i) => i.itemId?._id || i.itemId)
                            .filter(Boolean)
                    ),
                ];

                const responses = await Promise.all(
                    ids.map((id) =>
                        api
                            .get(`/items/${id}`)
                            .then((r) => r.data)
                            .catch(() => null)
                    )
                );

                const map = {};
                responses.forEach((r, i) => {
                    if (!r) return;
                    const d = r.data ?? r;
                    if (d?._id) map[ids[i]] = d;
                });

                setItemDataMap(map);
                setError(null);
            } catch {
                setError("Could not load order tracking details.");
            } finally {
                if (showLoader) setLoading(false);
            }
        };

        load(true);

        intervalId = setInterval(() => {
            load(false);
        }, 10000);

        return () => {
            clearInterval(intervalId);
        };
    }, [orderId]);

    const getItemDoc = (itemId) => {
        const id = itemId?._id || itemId;
        return itemDataMap[id] ?? {};
    };

    const getSnap = (item) =>
        Array.isArray(item.pricingSnapshot)
            ? item.pricingSnapshot[item.pricingSnapshot.length - 1]
            : item.pricingSnapshot || {};

    const lifecycleStages = order ? buildLifecycleStages(order) : [];
   const firstPendingIndex = lifecycleStages.findIndex(
    (stage) => !stage.completed
);

const stageIndex = lifecycleStages.length
    ? firstPendingIndex === -1
        ? lifecycleStages.length - 1
        : Math.max(firstPendingIndex - 1, 0)
    : 0;
    const currentDemandQty = (order?.items || []).reduce(
    (sum, item) => sum + Number(item?.quantity || 0),
    0
);

const aggregationTargetQty =
    Number(order?.aggregationWindow?.targetQuantity) ||
    Number(order?.targetQuantity) ||
    Number(order?.minimumOrderQuantity) ||
    Math.max(currentDemandQty, 1);

const aggregationProgressPercent = Math.min(
    (currentDemandQty / aggregationTargetQty) * 100,
    100
);

    const fulfillmentStatusLabel = (() => {
        const status = statusData?.status || order?.status;

        switch (status) {
            case "confirmed":
                return "Confirmed by supplier";
            case "dispatched":
                return "In transit";
            case "fulfilled":
                return "Delivered / Ready for pickup";
            case "submitted":
            case "approved":
                return "Pending fulfillment";
            case "cancelled":
                return "Cancelled";
            case "declined":
                return "Declined";
            default:
                return "Pending update";
        }
    })();

       const estimatedDeliveryText = statusData?.expectedDeliveryDate
        ? formatEpoch(statusData.expectedDeliveryDate)
        : "Next update pending";

    const supplierConfirmationText =
        statusData?.confirmedAt ||
        order?.confirmedAt ||
        (order?.status === "confirmed" ||
            order?.status === "dispatched" ||
            order?.status === "fulfilled"
            ? order?.updatedAt
            : null);

    const supplierConfirmationLabel = supplierConfirmationText
        ? formatEpochFull(supplierConfirmationText)
        : "Pending supplier confirmation";

    const supplierConfirmationMethod =
        getFulfillmentMode(order) === "delivery"
            ? order?.trackingNumber
                ? `Tracking #: ${order.trackingNumber}`
                : "Delivery confirmed by supplier"
            : order?.deliveryLocation?.city
                ? `Pickup confirmed for ${order.deliveryLocation.city}`
                : "Pickup confirmation pending";

    const fulfillmentNote = (() => {
        const status = statusData?.status || order?.status;

        if (status === "fulfilled") {
            return order?.deliveryLocation
                ? "Your order is ready for pickup."
                : "Your order has been delivered.";
        }

        if (status === "dispatched") {
            return "Your order is on the way.";
        }

        if (status === "confirmed") {
            return "Supplier has confirmed fulfillment details.";
        }

        if (status === "cancelled" || status === "declined") {
            return "This order no longer has an active fulfillment flow.";
        }

        return "The last known status has been recorded. The next update is pending.";
    })();

    const alerts = order ? [
        // ✅ ADDED THIS FIRST — Tier 3 reached alert
        (order.status === "confirmed" || order.status === "dispatched" || order.status === "fulfilled") && {
            icon: "trending_up",
            iconColor: "text-teal-600",
            bg: "bg-teal-50",
            title: "Tier 3 Reached!",
            body: "Maximum discount applied. Your final price per unit is now locked in.",
            time: formatEpochFull(order.updatedAt),
        },
        (order.status === "confirmed" || order.status === "dispatched" || order.status === "fulfilled") && {
            icon: "check_circle",
            iconColor: "text-teal-600",
            bg: "bg-teal-50",
            title: "Order confirmed",
            body: "Aggregation session is complete. Supplier has accepted the bulk order.",
            time: formatEpochFull(order.updatedAt),
        },
        order.status === "dispatched" && {
            icon: "local_shipping",
            iconColor: "text-purple-600",
            bg: "bg-purple-50",
            title: "Order dispatched",
            body: "Your order is on its way to the pickup location.",
            time: formatEpochFull(order.updatedAt),
        },
        order.expectedDeliveryDate && {
            icon: "warehouse",
            iconColor: "text-blue-600",
            bg: "bg-blue-50",
            title: `Ready for pickup at ${order.deliveryLocation?.city || order.ops_region || "your location"}`,
            body: "Your order is scheduled for pickup. Please bring your QR code.",
            time: formatEpoch(order.expectedDeliveryDate),
        },
        order.salesWindow?.toEpoch && Number(order.salesWindow.toEpoch) < Date.now() && {
            icon: "timer",
            iconColor: "text-amber-600",
            bg: "bg-amber-50",
            title: "Aggregation window closed",
            body: "Final pricing has been locked in for all participants.",
            time: formatEpochFull(order.salesWindow.toEpoch),
        },
        !order.expectedDeliveryDate && order.status !== "cancelled" && order.status !== "declined" && {
            icon: "pending",
            iconColor: "text-text-muted",
            bg: "bg-neutral-light",
            title: "Next update pending",
            body: "The last known status has been recorded. We will notify you when there is a new update.",
            time: formatEpochFull(order.updatedAt),
        },
    ].filter(Boolean) : [];

    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light font-display text-text-main">
            <Navbar showLocation={false} />

            <main className="flex flex-1 flex-col gap-8 px-4 py-8 md:flex-row md:px-10 lg:px-20">
                <Sidebar showSummary={false} />

                <section className="flex flex-1 flex-col gap-6 min-w-0">

                    {/* Back button */}
                    <button
                        onClick={() => navigate(-1)}
                        className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-text-muted transition hover:text-primary"
                    >
                        <span className="material-symbols-outlined text-base">arrow_back</span>
                        Back to orders
                    </button>

                    {loading && (
                        <p className="py-20 text-center text-text-muted">Loading tracking details…</p>
                    )}

                    {error && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
                            {error}
                        </div>
                    )}

                    {!loading && !error && order && (
                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">

                            {/* ── Left column ── */}
                            <div className="flex flex-col gap-6">

                                {/* Header card */}
                                <article className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <StatusBadge status={order.status} />
                                                <span className="text-sm font-semibold text-text-muted">
                                                    Order #{String(order._id || "").slice(-8).toUpperCase()}
                                                </span>
                                            </div>
                                            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
                                                Premium Organic Avocados
                                            </h1>
                                            <p className="mt-1 flex items-center gap-1 text-sm text-text-muted">
                                                <span className="material-symbols-outlined text-base">location_on</span>
                                                Toronto Hub - Front St West
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/order-details/${order._id}`)}
                                            className="inline-flex items-center gap-2 rounded-xl border border-neutral-light bg-white px-4 py-2.5 text-sm font-semibold text-text-main transition hover:bg-neutral-light whitespace-nowrap"
                                        >
                                            <span className="material-symbols-outlined text-base">receipt_long</span>
                                            View Invoice
                                        </button>
                                    </div>

                                    {/* Stats row */}
                                    {/* FIND the entire grid grid-cols-3 div and REPLACE WITH: */}
                                    <div className="mt-6 grid grid-cols-3 gap-4">
                                        <div className="flex flex-col gap-1">
                                            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Package info</p>
                                            <p className="font-semibold text-text-main">Box of 12 Units</p>
                                            <p className="text-sm text-text-muted">Premium Grade A</p>
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Quantity</p>
                                            <p className="font-semibold text-text-main">12 Boxes Purchased</p>
                                            <p className="text-sm text-text-muted">Total 144 Avocados</p>
                                        </div>

                                        <div className="flex flex-col gap-1 rounded-xl bg-primary/10 p-4">
                                            <p className="text-xs font-bold uppercase tracking-widest text-teal-700">
                                                Pricing status
                                            </p>
                                            <p className="font-bold text-teal-800">Final price locked</p>
                                            <p className="text-2xl font-extrabold text-teal-900">
                                                $1.10
                                                <span className="ml-1 text-sm font-medium text-teal-700">per unit</span>
                                            </p>
                                        </div>
                                    </div>
                                </article>

                                                                {/* Live demand progress */}
                                <article className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                                    <div className="mb-5 flex items-center justify-between">
                                        <div>
                                            <h2 className="text-lg font-bold text-text-main">
                                                Live Demand Progress
                                            </h2>
                                            <p className="text-sm text-text-muted">
                                                Current aggregation window progress
                                            </p>
                                        </div>

                                        <span className="text-2xl font-extrabold text-primary">
                                            {currentDemandQty}
                                            <span className="ml-1 text-base font-medium text-text-muted">
                                                / {aggregationTargetQty} units
                                            </span>
                                        </span>
                                    </div>

                                    <div className="h-4 w-full overflow-hidden rounded-full bg-neutral-light">
                                        <div
                                            className="h-full rounded-full bg-primary transition-all duration-700"
                                            style={{
                                                width: `${aggregationProgressPercent}%`,
                                            }}
                                        />
                                    </div>

                                    <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                                        <span>
                                            {aggregationProgressPercent.toFixed(0)}% completed
                                        </span>
                                        <span>
                                            {Math.max(
                                                aggregationTargetQty - currentDemandQty,
                                                0
                                            )} units remaining
                                        </span>
                                    </div>
                                </article>

                                {/* Order Lifecycle */}
                                <article className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                                    <h2 className="mb-8 text-lg font-bold text-text-main">Order Lifecycle</h2>

                                    <div className="relative flex items-start justify-between">
                                        {/* Background track */}
                                        <div className="absolute left-5 right-5 top-5 h-0.5 bg-neutral-light" style={{ zIndex: 0 }}>
                                            <div
                                                className="h-full bg-primary transition-all duration-700"
                                                style={{
                                                    width: `${lifecycleStages.length > 1
                                                            ? (stageIndex / (lifecycleStages.length - 1)) * 100
                                                            : 0
                                                        }%`,
                                                }}
                                            />
                                        </div>

                                        {lifecycleStages.map((stage, idx) => {
                                            const done = stage.completed;

                                            return (
                                                <div
                                                    key={stage.key}
                                                    className="relative z-10 flex flex-1 flex-col items-center gap-2"
                                                >
                                                    <div
                                                        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${done
                                                                ? "border-primary bg-primary"
                                                                : "border-neutral-light bg-white"
                                                            }`}
                                                    >
                                                        <span
                                                            className={`material-symbols-outlined text-[18px] ${done ? "text-white" : "text-text-muted"
                                                                }`}
                                                        >
                                                            {stage.icon}
                                                        </span>
                                                    </div>

                                                    <p
                                                        className={`text-center text-xs font-semibold ${done ? "text-text-main" : "text-text-muted"
                                                            }`}
                                                    >
                                                        {stage.label}
                                                    </p>

                                                    <p className="text-center text-xs text-text-muted">
                                                        {stage.timestamp
                                                            ? formatEpoch(stage.timestamp)
                                                            : "Next update pending"}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </article>

                            </div>

                            {/* ── Right column ── */}
                            <div className="flex flex-col gap-6">

                                {/* Fulfillment status */}
                                <article className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <h2 className="text-lg font-bold text-text-main">Fulfillment Status</h2>
                                            <p className="mt-1 text-sm text-text-muted">{fulfillmentNote}</p>
                                        </div>
                                        <StatusBadge status={statusData?.status || order.status} />
                                    </div>
                                    <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                                        <div className="rounded-xl bg-neutral-light p-4 min-h-[140px] flex flex-col">
                                            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
                                                Current status
                                            </p>
                                            <p className="mt-1 font-semibold text-text-main">
                                                {fulfillmentStatusLabel}
                                            </p>
                                        </div>

                                        <div className="rounded-xl bg-primary/10 p-4 min-h-[140px] flex flex-col">
                                            <p className="text-xs font-bold uppercase tracking-widest text-teal-700">
                                                Estimated delivery
                                            </p>
                                            <p className="mt-1 font-semibold text-teal-900">
                                                {estimatedDeliveryText}
                                            </p>
                                        </div>

                                        <div className="rounded-xl bg-blue-50 p-4 min-h-[140px] flex flex-col">
                                            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
                                                Supplier confirmation
                                            </p>
                                            <p className="mt-1 font-semibold text-text-main">
                                                {supplierConfirmationLabel}
                                            </p>
                                            <p className="mt-1 text-xs text-text-muted">
                                                {supplierConfirmationMethod}
                                            </p>
                                        </div>
                                    </div>
                                </article>

                                {/* Alerts & Updates */}
                                <article className="rounded-2xl border border-neutral-light bg-white shadow-sm">
                                    <div className="flex items-center justify-between border-b border-neutral-light px-6 py-4">
                                        <h2 className="text-lg font-bold text-text-main">Alerts & Updates</h2>
                                        {alerts.filter(a => a.icon !== "pending").length > 0 && (
                                            <span className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-text-main">
                                                {alerts.filter(a => a.icon !== "pending").length} new
                                            </span>
                                        )}
                                    </div>

                                    <div className="divide-y divide-neutral-light">
                                        {alerts.map((alert, i) => (
                                            <div key={i} className="flex gap-4 px-6 py-4">
                                                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${alert.bg}`}>
                                                    <span className={`material-symbols-outlined text-[18px] ${alert.iconColor}`}>
                                                        {alert.icon}
                                                    </span>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-text-main">{alert.title}</p>
                                                    <p className="mt-0.5 text-xs text-text-muted">{alert.body}</p>
                                                    <p className="mt-1 text-xs text-text-muted">{alert.time}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Pickup details */}
                                    {order.deliveryLocation && (
                                        <div className="border-t border-neutral-light px-6 py-4">
                                            <div className="mb-3 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-base text-text-muted">location_on</span>
                                                <h3 className="text-sm font-bold text-text-main">Pick-up details</h3>
                                            </div>
                                            <div className="flex flex-col gap-1 text-sm text-text-muted">
                                                {order.deliveryLocation.line1 && <p>{order.deliveryLocation.line1}</p>}
                                                {order.deliveryLocation.city && (
                                                    <p>
                                                        {order.deliveryLocation.city}, {order.deliveryLocation.region}{" "}
                                                        {order.deliveryLocation.postalCode}
                                                    </p>
                                                )}
                                                {order.expectedDeliveryDate && (
                                                    <p className="mt-1 font-semibold text-text-main">
                                                        Expected: {formatEpoch(order.expectedDeliveryDate)}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Pickup code CTA */}
                                    <div className="border-t border-neutral-light px-6 py-5">
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-text-main px-5 py-3.5 text-sm font-bold text-white transition hover:opacity-90"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">qr_code_2</span>
                                            Show Pickup Code
                                        </button>
                                        <p className="mt-3 text-center text-xs text-text-muted">
                                            Help & Support: (416) 555-0123
                                        </p>
                                    </div>
                                </article>

                                {/* Contact support */}
                                <article className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                                    <h3 className="mb-2 text-sm font-bold text-text-main">Need help?</h3>
                                    <p className="mb-4 text-xs text-text-muted">
                                        Contact our support team for questions about your order status.
                                    </p>
                                    <button
                                        type="button"
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-light bg-white px-4 py-2.5 text-sm font-semibold text-text-main transition hover:bg-neutral-light"
                                    >
                                        <span className="material-symbols-outlined text-base">support_agent</span>
                                        Contact Support
                                    </button>
                                </article>

                            </div>
                        </div>
                    )}
                </section>
            </main>

            <Footer />
        </div>
    );
}