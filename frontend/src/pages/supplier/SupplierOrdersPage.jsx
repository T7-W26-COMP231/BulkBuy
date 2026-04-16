import SupplierLayout from "../../components/supplier/SupplierLayout";
import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700",
  requested: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  dispatched: "bg-blue-100 text-blue-700",
  fulfilled: "bg-emerald-100 text-emerald-700",
};

const NEXT_STATUS_BY_CURRENT = {
  confirmed: "dispatched",
  dispatched: "fulfilled",
};

const getNextOrderStatus = (status) =>
  NEXT_STATUS_BY_CURRENT[String(status || "").toLowerCase()] || "";
const AGGREGATION_PROGRESS = 92;

const formatEpochDate = (value) => {
  if (!value) return "N/A";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString();
};

const mapApiOrder = (order) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const firstItem = items[0] || {};
  const totalQty = items.reduce(
    (sum, item) => sum + Number(item?.quantity || item?.meta?.quantity || 0),
    0
  );

  return {
    id: order._id,
    product:
      items.length > 1
        ? `${items.length} items`
        : firstItem.productId
          ? `Product ${String(firstItem.productId).slice(-6)}`
          : "N/A",
    city: order.ops_region || "N/A",
    quantity: `${totalQty || 0} Units`,
    windowStart: order.salesWindow?.fromEpoch
      ? formatEpochDate(order.salesWindow.fromEpoch)
      : "N/A",
    windowEnd: order.salesWindow?.toEpoch
      ? formatEpochDate(order.salesWindow.toEpoch)
      : "N/A",
    status: (order.status || "pending").toLowerCase(),
    createdAt: order.createdAt || null,
  };
};

export default function SupplierOrdersPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [cityFilter, setCityFilter] = useState("All Cities");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [appliedCityFilter, setAppliedCityFilter] = useState("All Cities");
  const [appliedStatusFilter, setAppliedStatusFilter] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [declineTargetId, setDeclineTargetId] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const [declineError, setDeclineError] = useState("");
  const [statusTargetOrder, setStatusTargetOrder] = useState(null);
  const [nextStatus, setNextStatus] = useState("");
  const [statusUpdateError, setStatusUpdateError] = useState("");

  const itemsPerPage = 5;

  const cityOptions = [
    { label: "All Cities", value: "All Cities" },
    { label: "Toronto", value: "ON-TOR" },
    { label: "Mississauga", value: "ON-MIS" },
    { label: "Brampton", value: "ON-BRA" },
    { label: "Vaughan", value: "ON-VAU" },
    { label: "Markham", value: "ON-MAR" },
    { label: "Richmond Hill", value: "ON-RHL" },
    { label: "Oakville", value: "ON-OAK" },
    { label: "Burlington", value: "ON-BUR" },
    { label: "Ajax", value: "ON-AJX" },
    { label: "Pickering", value: "ON-PCK" },
    { label: "Oshawa", value: "ON-OSH" },
    { label: "Milton", value: "ON-MLT" },
  ];

  const statusOptions = [
    { label: "All", value: "All" },
    { label: "Draft", value: "Draft" },
    { label: "Submitted", value: "Submitted" },
    { label: "Approved", value: "Approved" },
    { label: "Confirmed", value: "Confirmed" },
    { label: "Declined", value: "Declined" },
    { label: "Dispatched", value: "Dispatched" },
    { label: "Fulfilled", value: "Fulfilled" },
  ];

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        setError("");

        const params = new URLSearchParams();
        params.set("page", currentPage);
        params.set("limit", itemsPerPage);

        if (appliedCityFilter !== "All Cities") {
          params.set("ops_region", appliedCityFilter);
        }

        if (appliedStatusFilter) {
          params.set("status", appliedStatusFilter);
        }

        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/ordrs/supplier-requests?${params.toString()}`,
          {
            headers: accessToken
              ? {
                Authorization: `Bearer ${accessToken}`,
              }
              : {},
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message || "Failed to load supplier order requests");
        }

        const mappedOrders = Array.isArray(data.items)
          ? data.items.map(mapApiOrder)
          : [];

        setOrders(mappedOrders);
        setTotalPages(Number(data.pages) || 1);
        setTotalResults(Number(data.total) || 0);
      } catch (err) {
        setOrders([]);
        setTotalPages(1);
        setTotalResults(0);
        setError(err.message || "Failed to load order requests");
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [accessToken, currentPage, appliedCityFilter, appliedStatusFilter]);

  const filtered = dateFilter
    ? orders.filter((o) => {
      if (!o.createdAt) return false;
      const iso = new Date(Number(o.createdAt)).toISOString().slice(0, 10);
      return iso === dateFilter;
    })
    : orders;

  const paginated = filtered;

  const handleApply = () => {
    setCurrentPage(1);
    setAppliedCityFilter(cityFilter);
    setAppliedStatusFilter(statusFilter ? statusFilter.toLowerCase() : "");
  };

  const handleApprove = async (id) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/ordrs/${id}/approve`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : {}),
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Failed to approve order");
      }

      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: "approved" } : o))
      );

      if (selectedOrder?.id === id) {
        setSelectedOrder((prev) =>
          prev ? { ...prev, status: "approved" } : prev
        );
      }
    } catch (err) {
      setError(err.message || "Failed to approve order");
    }
  };

  const handleDecline = (id) => {
    setDeclineTargetId(id);
    setDeclineReason("");
    setDeclineError("");
  };

  return (
    <SupplierLayout>
      <div className="flex flex-col gap-6">

        {/* Hero banner */}
        <section className="overflow-hidden rounded-3xl bg-[#083b2d] px-6 py-7 text-white shadow-lg md:px-8 md:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                Order Requests Review
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75 md:text-base">
                Review incoming order requests after aggregation window closes.
                Efficiently manage approvals to streamline your supply chain.
              </p>
            </div>

            <div className="flex flex-col items-start gap-2 lg:items-end lg:text-right">
              <p className="text-xs font-bold uppercase tracking-widest text-white/60">
                Aggregation Progress
              </p>
              <p className="text-4xl font-bold">{AGGREGATION_PROGRESS}%</p>
              <div className="h-2.5 w-48 overflow-hidden rounded-full bg-white/15">
                <div
  className="h-full rounded-full bg-primary"
  style={{ width: `${AGGREGATION_PROGRESS}%` }}
/>
              </div>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="rounded-2xl border border-neutral-light bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            {/* City */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-muted">City</label>
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="rounded-xl border border-neutral-light bg-white px-4 py-2.5 text-sm text-text-main outline-none focus:border-primary"
              >
                {cityOptions.map((city) => (
                  <option key={city.value} value={city.value}>
                    {city.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date range */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-muted">Date Range</label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="rounded-xl border border-neutral-light bg-white px-4 py-2.5 text-sm text-text-main outline-none focus:border-primary"
              />
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-muted">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-neutral-light bg-white px-4 py-2.5 text-sm text-text-main outline-none focus:border-primary"
              >
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleApply}
              className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-text-main transition hover:opacity-90"
            >
              Apply Filters
            </button>
          </div>
        </section>

        {/* Table */}
        <section className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b border-neutral-light bg-neutral-light/40">
                <tr>
                  {["Order ID", "Product Item", "City", "Quantity", "Delivery Window", "Status", "Actions"].map((h) => (
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
                      Loading order requests...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-red-600">
                      {error}
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-text-muted">
                      No order requests found.
                    </td>
                  </tr>
                ) : (
                  paginated.map((order) => (
                    <tr key={order.id} className="transition hover:bg-neutral-light/30">
                      <td className="px-6 py-5 text-sm font-semibold text-text-main">
                        #{order.id}
                      </td>
                      <td className="px-6 py-5 text-sm text-text-main">
                        {order.product}
                      </td>
                      <td className="px-6 py-5 text-sm text-text-muted">
                        {order.city}
                      </td>
                      <td className="px-6 py-5 text-sm font-bold text-text-main">
                        {order.quantity}
                      </td>
                      <td className="px-6 py-5 text-sm text-text-muted">
                        {order.windowStart} - {order.windowEnd}
                      </td>
                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex rounded-lg px-3 py-1 text-xs font-bold capitalize ${STATUS_STYLES[order.status] ?? "bg-slate-100 text-slate-700"
                            }`}
                        >
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="text-sm font-semibold text-primary transition hover:opacity-70"
                          >
                            View
                          </button>
                          {(order.status === "pending" || order.status === "submitted") && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApprove(order.id)}
                                className="rounded-lg bg-green-50 px-3 py-1 text-xs font-bold text-green-700 transition hover:bg-green-100"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDecline(order.id)}
                                className="rounded-lg bg-red-50 px-3 py-1 text-xs font-bold text-red-600 transition hover:bg-red-100"
                              >
                                Decline
                              </button>
                            </>

                          )}
                          {/* Existing fulfillment action */}
                          {order.status === "approved" && (
                            <button
                              type="button"
                              onClick={() =>
                                navigate(`/supplier/order-requests/${order.id}/fulfillment`)
                              }
                              className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                            >
                              Confirm Fulfillment
                            </button>
                          )}

                          {/* New supplier order status update modal trigger */}
                          {getNextOrderStatus(order.status) && (
                            <button
                              type="button"
                              onClick={() => {
                                setStatusTargetOrder(order);
                                setNextStatus(getNextOrderStatus(order.status));
                                setStatusUpdateError("");
                              }}
                              className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100"
                            >
                              Update Status
                            </button>
                          )}

                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>


          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-neutral-light px-6 py-4">
            <p className="text-sm text-text-muted">
              Showing {totalResults === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to{" "}
              {Math.min(currentPage * itemsPerPage, totalResults)} of {totalResults} results
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

        {declineTargetId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
              <div className="border-b border-neutral-light px-6 py-4">
                <h2 className="text-lg font-bold text-text-main">
                  Decline Order Request
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  Please provide a reason before declining this request.
                </p>
              </div>

              <div className="px-6 py-5">
                <label className="mb-2 block text-sm font-semibold text-text-main">
                  Decline Reason
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
                  <p className="mt-2 text-sm font-medium text-red-600">
                    {declineError}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-neutral-light px-6 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setDeclineTargetId(null);
                    setDeclineReason("");
                    setDeclineError("");
                  }}
                  className="rounded-xl border border-neutral-light px-4 py-2 text-sm font-semibold text-text-main"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!declineReason.trim()}
                  onClick={async () => {
                    if (!declineReason.trim()) {
                      setDeclineError("Decline reason is required");
                      return;
                    }

                    try {
                      const response = await fetch(
                        `${import.meta.env.VITE_API_URL}/api/ordrs/${declineTargetId}/decline`,
                        {
                          method: "PATCH",
                          headers: {
                            "Content-Type": "application/json",
                            ...(accessToken
                              ? { Authorization: `Bearer ${accessToken}` }
                              : {}),
                          },
                          body: JSON.stringify({
                            reason: declineReason.trim(),
                          }),
                        }
                      );

                      const data = await response.json();

                      if (!response.ok) {
                        throw new Error(data?.message || "Failed to decline order");
                      }

                      setOrders((prev) =>
                        prev.map((o) =>
                          o.id === declineTargetId
                            ? { ...o, status: "declined" }
                            : o
                        )
                      );

                      if (selectedOrder?.id === declineTargetId) {
                        setSelectedOrder((prev) =>
                          prev ? { ...prev, status: "declined" } : prev
                        );
                      }

                      setDeclineTargetId(null);
                      setDeclineReason("");
                      setDeclineError("");
                    } catch (err) {
                      setDeclineError(err.message || "Failed to decline order");
                    }
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-bold text-white transition ${declineReason.trim()
                    ? "bg-red-600 hover:opacity-90"
                    : "bg-red-300 cursor-not-allowed"
                    }`}
                >
                  Submit Decline
                </button>
              </div>
            </div>
          </div>
        )}

        {statusTargetOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
              <div className="border-b border-neutral-light px-6 py-4">
                <h2 className="text-lg font-bold text-text-main">
                  Update Order Status
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  Move this order to the next fulfillment step.
                </p>
              </div>

              <div className="px-6 py-5">
                <label className="mb-2 block text-sm font-semibold text-text-main">
                  Next Status
                </label>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-light bg-white px-4 py-3 text-sm capitalize outline-none focus:border-primary"
                >
                  {getNextOrderStatus(statusTargetOrder?.status) && (
                    <option value={getNextOrderStatus(statusTargetOrder?.status)}>
                      {getNextOrderStatus(statusTargetOrder?.status)}
                    </option>
                  )}
                </select>

                {statusUpdateError && (
                  <p className="mt-2 text-sm font-medium text-red-600">
                    {statusUpdateError}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-neutral-light px-6 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setStatusTargetOrder(null);
                    setNextStatus("");
                    setStatusUpdateError("");
                  }}
                  className="rounded-xl border border-neutral-light px-4 py-2 text-sm font-semibold text-text-main"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const response = await fetch(
                        `${import.meta.env.VITE_API_URL}/api/ordrs/${statusTargetOrder.id}/update-status`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            ...(accessToken
                              ? { Authorization: `Bearer ${accessToken}` }
                              : {}),
                          },
                          body: JSON.stringify({
                            status: nextStatus,
                          }),
                        }
                      );

                      const data = await response.json();

                      if (!response.ok) {
                        throw new Error(data?.message || "Failed to update order status");
                      }

                      setOrders((prev) =>
                        prev.map((o) =>
                          o.id === statusTargetOrder.id
                            ? { ...o, status: nextStatus }
                            : o
                        )
                      );

                      if (selectedOrder?.id === statusTargetOrder.id) {
                        setSelectedOrder((prev) =>
                          prev ? { ...prev, status: nextStatus } : prev
                        );
                      }

                      setStatusTargetOrder(null);
                      setNextStatus("");
                      setStatusUpdateError("");
                    } catch (err) {
                      setStatusUpdateError(
                        err.message || "Failed to update order status"
                      );
                    }
                  }}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
                >
                  Confirm Update
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-neutral-light px-6 py-4">
                <h2 className="text-lg font-bold text-text-main">
                  Order Details
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="text-sm font-semibold text-text-muted transition hover:text-text-main"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Order ID
                  </p>
                  <p className="mt-1 text-sm font-bold text-text-main">
                    #{selectedOrder.id}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Product
                  </p>
                  <p className="mt-1 text-sm text-text-main">
                    {selectedOrder.product}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    City
                  </p>
                  <p className="mt-1 text-sm text-text-main">
                    {selectedOrder.city}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Quantity
                  </p>
                  <p className="mt-1 text-sm text-text-main">
                    {selectedOrder.quantity}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Delivery Start
                  </p>
                  <p className="mt-1 text-sm text-text-main">
                    {selectedOrder.windowStart}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Delivery End
                  </p>
                  <p className="mt-1 text-sm text-text-main">
                    {selectedOrder.windowEnd}
                  </p>
                </div>

                <div className="md:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Status
                  </p>
                  <span
                    className={`mt-2 inline-flex rounded-lg px-3 py-1 text-xs font-bold capitalize ${STATUS_STYLES[selectedOrder.status] ?? "bg-slate-100 text-slate-700"
                      }`}
                  >
                    {selectedOrder.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </SupplierLayout>
  );
}