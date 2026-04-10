import { useEffect, useMemo, useState } from "react";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import {
  approveQuote,
  fetchQuoteCounts,
  fetchQuotesByStatus,
  rejectQuote,
} from "../../api/supplyApi";



const filters = ["Pending", "Approved", "Rejected"];

function statusClasses(status) {
  switch (status) {
    case "Approved":
      return "bg-emerald-100 text-emerald-700";
    case "Rejected":
      return "bg-red-100 text-red-600";
    default:
      return "bg-amber-100 text-amber-700";
  }
}

function mapBackendStatus(status) {
  switch (status) {
    case "accepted":
      return "Approved";
    case "cancelled":
      return "Rejected";
    case "pending_review":
      return "Pending";
    default:
      return "Pending";
  }
}

function formatDate(dateValue) {
  if (!dateValue) return "Unknown date";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function mapSupplyToQuoteRows(supply) {
  const quoteDraft =
    supply?.metadata?.quoteDraft ||
    supply?.metadata?.get?.("quoteDraft") ||
    null;

  if (quoteDraft) {
    return [
      {
        id: `${supply._id || supply.id || "supply"}-draft`,
        supplyId: supply._id || supply.id || "",
        itemId: supply?.items?.[0]?.itemId?._id || supply?.items?.[0]?.itemId || "",
        quoteId: "",
        supplier:
          supply?.supplierId?.name ||
          supply?.supplierId?.companyName ||
          supply?.supplierId?.businessName ||
          "Unknown Supplier",
        contactEmail: supply?.supplierId?.email || "No email provided",
        contactPhone: supply?.supplierId?.phone || "No phone provided",
        product: quoteDraft.productName || "Unnamed Product",
        submittedOn: formatDate(supply?.submittedAt || supply?.updatedAt || supply?.createdAt),
        tiers: Array.isArray(quoteDraft.tiers)
          ? quoteDraft.tiers.map((tier) => ({
            minQty: tier.minQty,
            unitPrice: tier.unitPrice,
            discountPercent: null,
            description: "",
          }))
          : [],
        status: mapBackendStatus(supply?.status),
        rawSupply: supply,
        rawItem: supply?.items?.[0] || null,
        rawQuote: null,
      },
    ];
  }

  if (!Array.isArray(supply?.items)) return [];

  return supply.items.map((item, index) => {
    const firstQuote = item?.quotes?.[0] ?? null;

    return {
      id: `${supply._id || supply.id || "supply"}-${item._id || index}`,
      supplyId: supply._id || supply.id || "",
      itemId: item?.itemId?._id || item?.itemId || "",
      quoteId: firstQuote?._id || "",
      supplier:
        supply?.supplierId?.name ||
        supply?.supplierId?.companyName ||
        supply?.supplierId?.businessName ||
        "Unknown Supplier",
      contactEmail: supply?.supplierId?.email || "No email provided",
      contactPhone: supply?.supplierId?.phone || "No phone provided",
      product:
        item?.itemId?.name ||
        item?.meta?.productName ||
        `Item ${index + 1}`,
      submittedOn: formatDate(firstQuote?.createdAt || supply?.createdAt),
      tiers: (firstQuote?.discountingScheme || []).map((bracket) => ({
        minQty: bracket.minQty,
        unitPrice: firstQuote?.pricePerBulkUnit ?? null,
        discountPercent: bracket.discountPercent ?? null,
        description: bracket.description || "",
      })),
      status: mapBackendStatus(supply?.status),
      rawSupply: supply,
      rawItem: item,
      rawQuote: firstQuote,
    };
  });
}

export default function AdminQuotesReviewPage() {
  const [activeFilter, setActiveFilter] = useState("Pending");
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [notifySupplier, setNotifySupplier] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // ← ADD THIS


  // Ready for backend later
  const [supplies, setSupplies] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [tabCounts, setTabCounts] = useState({
    Pending: 0,
    Approved: 0,
    Rejected: 0,
  });

  const statusMap = {
    Pending: "pending_review",
    Approved: "accepted",
    Rejected: "cancelled",
  };

  const loadQuotes = async (statusLabel = activeFilter) => {
    try {
      setIsLoading(true);
      setError("");

      const response = await fetchQuotesByStatus(statusMap[statusLabel]);
      setSupplies(response.items || response.data || []);
    } catch (err) {
      console.error("Failed to load supplier quotes:", err);
      setError("Failed to load supplier quotes.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadCounts = async () => {
    try {
      const counts = await fetchQuoteCounts();
      setTabCounts(counts);
    } catch (err) {
      console.error("Failed to load quote counts:", err);
    }
  };

  useEffect(() => {
    loadQuotes(activeFilter);
  }, [activeFilter]);

  useEffect(() => {
    loadCounts();
  }, []);

  // const quoteRows = useMemo(() => {
  //   if (supplies.length > 0) {
  //     return supplies.flatMap(mapSupplyToQuoteRows);
  //   }
  //   return mockQuoteRows;
  // }, [supplies]);
  const quoteRows = useMemo(() => {
    return supplies.flatMap(mapSupplyToQuoteRows);
  }, [supplies]);

  const filteredQuotes = useMemo(() => {
    return quoteRows.filter((quote) => quote.status === activeFilter);
  }, [quoteRows, activeFilter]);

  const handleApproveClick = (quote) => {
    setSelectedQuote(quote);
    setNotifySupplier(false);
    setShowApproveModal(true);
  };

  const handleRejectClick = (quote) => {
    setSelectedQuote(quote);
    setRejectionReason("");
    setShowRejectModal(true);
  };

  const handleCloseModals = () => {
    setShowApproveModal(false);
    setShowRejectModal(false);
    setSelectedQuote(null);
    setRejectionReason("");
    setNotifySupplier(false);
  };

  const handleConfirmApproval = async () => {
    if (!selectedQuote) return;

    try {
      await approveQuote({
        supplyId: selectedQuote.supplyId,
      });

      handleCloseModals();
      await loadCounts();
      await loadQuotes(activeFilter);
    } catch (err) {
      console.error("Failed to approve quote:", err);
      setError("Failed to approve quote.");
    }
  };

  const handleConfirmReject = async () => {
    if (!selectedQuote || !rejectionReason.trim()) return;

    try {
      await rejectQuote({
        supplyId: selectedQuote.supplyId,
        rejectionReason: rejectionReason.trim(),
      });

      handleCloseModals();
      await loadCounts();
      await loadQuotes(activeFilter);
    } catch (err) {
      console.error("Failed to reject quote:", err);
      setError("Failed to reject quote.");
    }
  };

  return (
    <div className="min-h-screen bg-background-light text-text-main">
      <div className="flex min-h-screen">
        <AdminSidebar
          isMobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex min-h-screen flex-1 flex-col">
          <AdminTopbar
            title="Supplier Quotes"
            onMenuClick={() => setSidebarOpen(true)}
          />

          <main className="flex-1 px-6 py-8 md:px-8 lg:px-10">
            <div className="mx-auto flex max-w-7xl flex-col gap-8">
              <section>
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Supplier Quotes
                </h2>
                <p className="mt-2 max-w-3xl text-sm text-text-muted md:text-base">
                  Review and manage incoming wholesale pricing tiers for the
                  current procurement cycle.
                </p>
              </section>

              <section className="flex flex-wrap gap-3">
                {filters.map((filter) => {
                  const count = tabCounts[filter] ?? 0;

                  const isActive = activeFilter === filter;

                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setActiveFilter(filter)}
                      className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${isActive
                        ? "bg-primary text-text-main shadow-sm"
                        : "border border-neutral-light bg-white text-text-muted hover:bg-neutral-light"
                        }`}
                    >
                      {filter}
                      <span className="ml-2 opacity-70">{count}</span>
                    </button>
                  );
                })}
              </section>

              {error && (
                <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">
                  {error}
                </section>
              )}

              <section className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1120px] text-left">
                    <thead className="border-b border-neutral-light bg-neutral-light/40">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Supplier Company
                        </th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Contact Info
                        </th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Product Name
                        </th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Submitted Pricing Tiers
                        </th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Status
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-neutral-light">
                      {isLoading ? (
                        <tr>
                          <td
                            colSpan="6"
                            className="px-6 py-12 text-center text-sm text-text-muted"
                          >
                            Loading supplier quotes...
                          </td>
                        </tr>
                      ) : filteredQuotes.length > 0 ? (
                        filteredQuotes.map((quote) => (
                          <tr
                            key={quote.id}
                            className={`transition hover:bg-neutral-light/40 ${selectedQuote?.id === quote.id
                              ? "bg-primary/5"
                              : ""
                              }`}
                          >
                            <td className="px-6 py-5 align-top">
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                  <span className="material-symbols-outlined text-[20px]">
                                    business
                                  </span>
                                </div>

                                <div>
                                  <p className="text-sm font-semibold text-text-main">
                                    {quote.supplier}
                                  </p>
                                  <p className="mt-1 text-xs text-text-muted">
                                    Quote #{String(quote.id).slice(-6)}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-5 align-top">
                              <div className="space-y-1">
                                <p className="text-sm text-text-main">
                                  {quote.contactEmail}
                                </p>
                                <p className="text-sm text-text-muted">
                                  {quote.contactPhone}
                                </p>
                              </div>
                            </td>

                            <td className="px-6 py-5 align-top">
                              <div>
                                <p className="text-sm font-semibold text-text-main">
                                  {quote.product}
                                </p>
                                <p className="mt-1 text-xs text-text-muted">
                                  Submitted on {quote.submittedOn}
                                </p>
                              </div>
                            </td>

                            <td className="px-6 py-5 align-top">
                              <div className="flex flex-wrap gap-2">
                                {quote.tiers.length > 0 ? (
                                  quote.tiers.map((tier, index) => (
                                    <span
                                      key={`${quote.id}-${index}`}
                                      className="rounded-lg bg-neutral-light px-3 py-1.5 text-xs font-semibold text-text-main"
                                    >
                                      {tier.minQty}+ units ·{" "}
                                      {tier.discountPercent != null
                                        ? `${tier.discountPercent}% off`
                                        : tier.unitPrice != null
                                          ? `$${tier.unitPrice.toFixed(2)}`
                                          : "Tier"}
                                    </span>
                                  ))
                                ) : (
                                  <span className="rounded-lg bg-neutral-light px-3 py-1.5 text-xs font-semibold text-text-muted">
                                    No pricing tiers
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="px-6 py-5 align-top">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(
                                  quote.status
                                )}`}
                              >
                                {quote.status}
                              </span>
                            </td>

                            <td className="px-6 py-5 align-top">
                              {quote.status === "Pending" ? (
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleApproveClick(quote)}
                                    className="rounded-xl border border-primary/30 bg-primary/15 px-4 py-2 text-sm font-bold text-text-main transition hover:bg-primary/25"
                                  >
                                    Approve
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleRejectClick(quote)}
                                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-100"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="block text-right text-sm text-text-muted">
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan="6"
                            className="px-6 py-12 text-center text-sm text-text-muted"
                          >
                            No supplier quotes are currently available under
                            this status.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>

      {showApproveModal && selectedQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-light bg-neutral-light/40 px-6 py-5">
              <h3 className="text-2xl font-bold text-text-main">
                Approve Supplier Quote
              </h3>

              <button
                type="button"
                onClick={handleCloseModals}
                className="text-text-muted transition hover:text-text-main"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="px-6 py-6">
              <p className="text-base leading-7 text-text-muted">
                You are about to approve the pricing tiers from{" "}
                <span className="font-semibold text-text-main">
                  {selectedQuote.supplier}
                </span>{" "}
                for{" "}
                <span className="font-semibold text-text-main">
                  {selectedQuote.product}
                </span>
                .
              </p>

              <div className="mt-6 rounded-2xl border border-neutral-light bg-neutral-light/40 p-5">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-text-muted">
                  Proposed Pricing Tiers
                </p>

                <div className="space-y-3">
                  {selectedQuote.tiers.length > 0 ? (
                    selectedQuote.tiers.map((tier, index) => (
                      <div
                        key={`${selectedQuote.id}-${index}`}
                        className={`flex items-center justify-between text-sm ${index !== selectedQuote.tiers.length - 1
                          ? "border-b border-neutral-light pb-3"
                          : ""
                          }`}
                      >
                        <span className="text-text-muted">
                          {tier.minQty}+ units
                        </span>
                        <span className="font-bold text-text-main">
                          {tier.discountPercent != null
                            ? `${tier.discountPercent}% off`
                            : tier.unitPrice != null
                              ? `$${tier.unitPrice.toFixed(2)} / unit`
                              : "Tier"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-text-muted">
                      No pricing tiers available for this quote.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <input
                  id="notifySupplier"
                  type="checkbox"
                  checked={notifySupplier}
                  onChange={(e) => setNotifySupplier(e.target.checked)}
                  className="size-4 rounded border-neutral-light text-primary focus:ring-primary"
                />
                <label
                  htmlFor="notifySupplier"
                  className="text-sm text-text-muted"
                >
                  Notify supplier immediately via email
                </label>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModals}
                  className="rounded-xl border border-neutral-light px-5 py-3 text-sm font-semibold text-text-muted transition hover:bg-neutral-light"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleConfirmApproval}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-text-main transition hover:opacity-90"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    check_circle
                  </span>
                  Confirm Approval
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRejectModal && selectedQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-light bg-neutral-light/40 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <span className="material-symbols-outlined">cancel</span>
                </div>
                <h3 className="text-2xl font-bold text-text-main">
                  Reject Quote
                </h3>
              </div>

              <button
                type="button"
                onClick={handleCloseModals}
                className="text-text-muted transition hover:text-text-main"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="px-6 py-6">
              <p className="text-base leading-7 text-text-muted">
                You are about to reject the quote from{" "}
                <span className="font-semibold text-text-main">
                  {selectedQuote.supplier}
                </span>
                . This action cannot be undone and the supplier will be
                notified.
              </p>

              <div className="mt-6">
                <label className="mb-2 block text-sm font-bold text-text-main">
                  Reason for Rejection <span className="text-red-500">*</span>
                </label>

                <textarea
                  rows="4"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Please provide a detailed reason (e.g., price too high, lead time unsatisfactory...)"
                  className="w-full rounded-2xl border border-neutral-light bg-white px-4 py-3 text-sm text-text-main outline-none transition placeholder:text-text-muted focus:border-red-300"
                />
              </div>

              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                The supplier will see this reason in their rejection email.
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModals}
                  className="rounded-xl border border-neutral-light px-5 py-3 text-sm font-semibold text-text-muted transition hover:bg-neutral-light"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={!rejectionReason.trim()}
                  onClick={handleConfirmReject}
                  className={`rounded-xl px-5 py-3 text-sm font-bold text-white transition ${rejectionReason.trim()
                    ? "bg-red-600 hover:bg-red-700"
                    : "cursor-not-allowed bg-red-300"
                    }`}
                >
                  Confirm Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}