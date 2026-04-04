import SupplierLayout from "../../components/supplier/SupplierLayout";
import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";

const MOCK_ORDERS = [
  { id: "ORD-2023-8841", product: "Organic Whole Milk 1L", city: "New York, NY", quantity: "1,200 Units", windowStart: "Oct 12", windowEnd: "Oct 14", status: "pending" },
  { id: "ORD-2023-8842", product: "Premium Coffee Beans (Dark)", city: "Austin, TX", quantity: "450 kg", windowStart: "Oct 14", windowEnd: "Oct 15", status: "pending" },
  { id: "ORD-2023-8843", product: "Eco-Friendly Paper Bags (M)", city: "Chicago, IL", quantity: "5,000 Pcs", windowStart: "Oct 13", windowEnd: "Oct 18", status: "pending" },
  { id: "ORD-2023-8844", product: "Aluminum Foil Wraps", city: "Seattle, WA", quantity: "800 Boxes", windowStart: "Oct 15", windowEnd: "Oct 16", status: "pending" },
  { id: "ORD-2023-8845", product: "Bulk Rice (Basmati) 25kg", city: "Miami, FL", quantity: "200 Bags", windowStart: "Oct 16", windowEnd: "Oct 20", status: "pending" },
];

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
};

export default function SupplierOrdersPage() {
  const { accessToken } = useAuth();
  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [cityFilter, setCityFilter] = useState("All Cities");
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [dateFilter, setDateFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const itemsPerPage = 5;

  const cities = ["All Cities", ...Array.from(new Set(MOCK_ORDERS.map((o) => o.city)))];

  const filtered = orders.filter((o) => {
    const cityMatch = cityFilter === "All Cities" || o.city === cityFilter;
    const statusMatch = statusFilter === "" || o.status.toLowerCase() === statusFilter.toLowerCase();
    return cityMatch && statusMatch;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleApply = () => setCurrentPage(1);

  const handleApprove = (id) => {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: "approved" } : o));
  };

  const handleDecline = (id) => {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: "declined" } : o));
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
              <p className="text-4xl font-bold">92%</p>
              <div className="h-2.5 w-48 overflow-hidden rounded-full bg-white/15">
                <div className="h-full w-[92%] rounded-full bg-primary" />
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
                {cities.map((c) => (
                  <option key={c}>{c}</option>
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
                <option>Pending</option>
                <option>Approved</option>
                <option>Declined</option>
                <option value="">All</option>
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
                {paginated.length === 0 ? (
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
                        <span className={`inline-flex rounded-lg px-3 py-1 text-xs font-bold capitalize ${STATUS_STYLES[order.status] ?? "bg-slate-100 text-slate-700"}`}>
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-sm font-semibold text-primary transition hover:opacity-70"
                          >
                            View
                          </button>
                          {order.status === "pending" && (
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
              Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filtered.length)} to{" "}
              {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} results
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
    </SupplierLayout>
  );
}