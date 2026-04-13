import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import SupplierLayout from "../../components/supplier/SupplierLayout";
import { useNotifications } from "../../contexts/NotificationContext";

export default function SupplierQuotesPage() {
  const [tiers, setTiers] = useState([
    { id: 1, minQty: "100", unitPrice: "2.50" },
    { id: 2, minQty: "500", unitPrice: "2.25" },
    { id: 3, minQty: "1000", unitPrice: "2.00" },
  ]);

  const [searchParams] = useSearchParams();
  const itemId = searchParams.get("itemId");

  const location = useLocation();
  const itemState = location.state;

  const [selectedItem, setSelectedItem] = useState(null);
  const [baseUnitPrice, setBaseUnitPrice] = useState("");
  const [totalCapacity, setTotalCapacity] = useState("");
  const [productName, setProductName] = useState("");
  const [skuId, setSkuId] = useState("");

  const [draftStatus, setDraftStatus] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isReviewLocked, setIsReviewLocked] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [supplyId, setSupplyId] = useState("");
  const { addNotification } = useNotifications();

  useEffect(() => {
    const fetchSupplies = async () => {
      try {
        const session = localStorage.getItem("app_auth_session_v1");
        const token = session ? JSON.parse(session).accessToken : "";

        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/supls`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const result = await response.json();
        const supplies = result?.data || result?.items || result;

        if (Array.isArray(supplies) && supplies.length > 0) {
          const supply =
            supplies.find((item) => String(item._id) === String(itemId)) ||
            supplies[0];

          setIsReviewLocked(false);

          setSelectedItem(supply);
          // ← only pre-fill from API if not already filled from navigation state
          setProductName(prev => prev || supply?.productName || supply?.title || "");
          setSkuId(prev => prev || supply?.skuId || supply?.sku || supply?.itemCode || "");

          setSupplyId(supply._id);

          const restoredTiers =
            Array.isArray(supply?.tiers) && supply.tiers.length > 0
              ? supply.tiers.map((tier, index) => ({
                id: index + 1,
                minQty: String(tier.minQty || ""),
                unitPrice: String(tier.unitPrice || ""),
              }))
              : null;

          if (restoredTiers) {
            setTiers(restoredTiers);
          }

          setBaseUnitPrice(
            supply?.baseUnitPrice
              ? String(supply.baseUnitPrice)
              : restoredTiers?.[0]?.unitPrice || ""
          );

          setTotalCapacity(
            supply?.totalCapacity ? String(supply.totalCapacity) : ""
          );


          // Rehydrate lock state from server
          if (supply.status === "pending_review" || supply.status === "approved") {
            setIsReviewLocked(true);
          }
        }
      } catch (error) {
        console.error("Failed to fetch supplies", error);
      }
    };

    fetchSupplies();
  }, [itemId]);

  // ← ADD THIS NEW useEffect HERE:
  useEffect(() => {
    if (!itemState) return;
    if (itemState.itemTitle) setProductName(itemState.itemTitle);
    if (itemState.itemSku) setSkuId(itemState.itemSku);
  }, [itemState]);

  const handleSaveDraft = async () => {
    try {
      if (!supplyId) {
        throw new Error("No supply record found for this supplier.");
      }

      // const response = await fetch(
      //   `${import.meta.env.VITE_API_URL}/api/supls/${supplyId}/save-draft`,
      //   {
      //     method: "POST",
      //     headers: {
      //       "Content-Type": "application/json",
      //       Authorization: `Bearer ${JSON.parse(
      //         localStorage.getItem("app_auth_session_v1")
      //       )?.accessToken}`,
      //     },
      //     body: JSON.stringify({
      //       productName: "Organic Avocados",
      //       skuId: "AVO-ORG-4402-XL",
      //       tiers: tiers.map((tier) => ({
      //         minQty: Number(tier.minQty),
      //         unitPrice: Number(tier.unitPrice),
      //       })),
      //     }),
      //   }
      // );


      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/supls/${supplyId}/save-draft`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${JSON.parse(localStorage.getItem("app_auth_session_v1"))?.accessToken}`,
          },
          body: JSON.stringify({
            productName,
            skuId,
            baseUnitPrice: Number(baseUnitPrice || 0),
            totalCapacity: Number(totalCapacity || 0),
            tiers: tiers.map((tier) => ({
              minQty: Number(tier.minQty),
              unitPrice: Number(tier.unitPrice),
            })),
          }),
        }
      );

      const result = await response.json();

      const updatedSupplyId =
        result?.data?._id ||
        result?._id ||
        supplyId;

      setSupplyId(updatedSupplyId);

      if (!response.ok) {
        throw new Error(result.message || "Failed to save draft");
      }

      setDraftStatus("Draft saved successfully to server.");
    } catch (error) {
      setDraftStatus(error.message);
    }
  };

  const handleSubmitForReview = () => {
    if (validationErrors.length > 0 || isSubmittingReview || isReviewLocked) {
      return;
    }

    setIsConfirmOpen(true);
  };

  const confirmSubmitForReview = async () => {
    try {
      setSubmitStatus("");

      if (!supplyId) {
        throw new Error("No supply record found for this supplier.");
      }

      if (validationErrors.length > 0) {
        throw new Error("Please fix the validation issues before submitting.");
      }

      setIsSubmittingReview(true);

      /*const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/supls/${supplyId}/submit-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${JSON.parse(
              localStorage.getItem("app_auth_session_v1")
            )?.accessToken}`,
          },
        }
      );*/

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/supls/${supplyId}/submit-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${JSON.parse(localStorage.getItem("app_auth_session_v1"))?.accessToken}`,
          },
          body: JSON.stringify({          // ← ADD THIS
            productName: productName,
            skuId: skuId,
            baseUnitPrice: Number(baseUnitPrice || 0),
            totalCapacity: Number(totalCapacity || 0),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (Array.isArray(result.missingFields) && result.missingFields.length > 0) {
          throw new Error(
            `${result.message || "Missing required fields"}: ${result.missingFields.join(", ")}`
          );
        }

        throw new Error(result.message || "Failed to submit quote for review");
      }

      setSubmitStatus("Quote submitted for administrative review successfully.");
      setIsReviewLocked(true);
      setIsConfirmOpen(false);
      addNotification(
        `Your quote for ${productName || "the selected item"} has been submitted for review.`,
        "success"
      );
    } catch (error) {
      setSubmitStatus(error.message);
      setIsConfirmOpen(false);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleTierChange = (id, field, value) => {
    setTiers((current) =>
      current.map((tier) =>
        tier.id === id ? { ...tier, [field]: value } : tier
      )
    );
  };

  const handleAddTier = () => {
    setTiers((current) => [
      ...current,
      {
        id: Date.now(),
        minQty: "",
        unitPrice: "",
      },
    ]);
  };

  const validationErrors = useMemo(() => {
    const errors = [];

    for (let i = 0; i < tiers.length; i += 1) {
      const currentTier = tiers[i];
      const previousTier = tiers[i - 1];

      const currentQty = Number(currentTier.minQty);
      const currentPrice = Number(currentTier.unitPrice);

      if (!currentTier.minQty || currentQty <= 0) {
        errors.push(`Tier ${i + 1}: minimum quantity must be greater than 0.`);
      }

      if (!currentTier.unitPrice || currentPrice <= 0) {
        errors.push(`Tier ${i + 1}: unit price must be greater than 0.`);
      }

      if (previousTier) {
        const previousQty = Number(previousTier.minQty);
        const previousPrice = Number(previousTier.unitPrice);

        if (currentQty <= previousQty) {
          errors.push(
            `Tier ${i + 1}: minimum quantity must be higher than Tier ${i}.`
          );
        }

        if (currentPrice > previousPrice) {
          errors.push(
            `Tier ${i + 1}: unit price cannot be higher than Tier ${i}.`
          );
        }
      }
    }

    return errors;
  }, [tiers]);

  const completedTiers = tiers.filter(
    (tier) => tier.minQty && Number(tier.minQty) > 0 && tier.unitPrice && Number(tier.unitPrice) > 0
  );

  const basePrice = Number(baseUnitPrice || tiers[0]?.unitPrice || 0);

  const bestDiscount = useMemo(() => {
    if (!completedTiers.length || basePrice <= 0) return 0;

    const lowestPrice = Math.min(
      ...completedTiers.map((tier) => Number(tier.unitPrice || 0))
    );

    return Math.max(0, Math.round(((basePrice - lowestPrice) / basePrice) * 100));
  }, [completedTiers, basePrice]);

  const bestTierQuantity = useMemo(() => {
    if (!completedTiers.length) return 0;

    const lowestPriceTier = [...completedTiers].sort(
      (a, b) => Number(a.unitPrice) - Number(b.unitPrice)
    )[0];

    return Number(lowestPriceTier?.minQty || 0);
  }, [completedTiers]);

  const summaryStatus =
    validationErrors.length > 0 ? "Needs Review" : "Ready for Submission";

  return (
    <SupplierLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-text-muted">Quotes &gt; New Proposal</p>
            <h1 className="mt-2 text-3xl font-bold text-text-main">
              Quote Builder
            </h1>
            <p className="mt-2 text-text-muted">
              Create a dynamic pricing proposal for supplier catalog.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isReviewLocked}
            className={`rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 ${isReviewLocked
              ? "cursor-not-allowed bg-gray-400"
              : "bg-primary hover:opacity-90 hover:-translate-y-0.5 hover:shadow-md"
              }`}
          >
            {isReviewLocked ? "Draft Locked" : "Save Draft"}
          </button>
        </div>

        {draftStatus && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-semibold text-green-700">
              {draftStatus}
            </p>
            <p className="mt-1 text-xs text-green-600">
              Draft synced with backend and available across supplier sessions.
            </p>
          </div>
        )}

        {submitStatus && (
          <div
            className={`rounded-xl p-4 ${isReviewLocked
              ? "border border-green-200 bg-green-50"
              : "border border-amber-200 bg-amber-50"
              }`}
          >
            <p
              className={`text-sm font-semibold ${isReviewLocked ? "text-green-700" : "text-amber-700"
                }`}
            >
              {submitStatus}
            </p>
            <p
              className={`mt-1 text-xs ${isReviewLocked ? "text-green-600" : "text-amber-600"
                }`}
            >
              {isReviewLocked
                ? "This quote is now locked and waiting for administrative review."
                : "Submission could not be completed yet."}
            </p>
          </div>
        )}

        {/* Main layout */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Left side */}
          <div className="space-y-6 xl:col-span-2">
            {/* Product information */}
            <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-lg">
                    📦
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-text-main">
                      Product Information
                    </h2>
                    <p className="text-sm text-text-muted">
                      Configure the selected approved supplier item
                    </p>
                  </div>
                </div>

                <span className="rounded-full bg-neutral-light px-3 py-1 text-xs font-semibold text-text-main">
                  Approved Item
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">
                    SKU ID
                  </label>
                  <input
                    type="text"
                    value={skuId}
                    onChange={(e) => setSkuId(e.target.value)}
                    className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">
                    Base Unit Price ($)
                  </label>
                  <input
                    type="number"
                    value={baseUnitPrice}
                    onChange={(e) => setBaseUnitPrice(e.target.value)}
                    className="w-full rounded-xl border border-neutral-light px-4 py-3"
                  />
                  <p className="mt-2 text-xs text-text-muted">
                    Enter supplier starting unit price.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">
                    Total Capacity (Units)
                  </label>
                  <input
                    type="number"
                    value={totalCapacity}
                    onChange={(e) => setTotalCapacity(e.target.value)}
                    className="w-full rounded-xl border border-neutral-light px-4 py-3"
                  />
                  <p className="mt-2 text-xs text-text-muted">
                    Available stock for aggregation cycle.
                  </p>
                </div>
              </div>
            </div>
            {/* Dynamic tier table with validation */}
            <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-text-main">
                    Volume Pricing Tiers
                  </h2>
                  <p className="text-sm text-text-muted">
                    Define quantity thresholds and discounted supplier pricing.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddTier}
                  disabled={isReviewLocked}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${isReviewLocked
                    ? "cursor-not-allowed bg-gray-200 text-gray-500"
                    : "bg-primary/10 text-primary hover:bg-primary hover:text-white hover:-translate-y-0.5 hover:shadow-md"
                    }`}
                >
                  {isReviewLocked ? "Tier Locked" : "+ Add Tier"}
                </button>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-4 gap-4 rounded-xl bg-neutral-light px-4 py-3 text-sm font-semibold text-text-main">
                <span>Tier</span>
                <span>Min Qty</span>
                <span>Unit Price</span>
                <span>Discount</span>
              </div>

              {/* Dynamic tier rows */}
              <div className="mt-4 space-y-3">
                {tiers.map((tier, index) => {
                  const previousPrice =
                    index === 0
                      ? Number(tier.unitPrice || 0)
                      : Number(tiers[index - 1].unitPrice || 0);

                  const currentPrice = Number(tier.unitPrice || 0);

                  const discount =
                    index === 0 || previousPrice <= 0
                      ? "0%"
                      : `${Math.max(
                        0,
                        Math.round(
                          ((previousPrice - currentPrice) / previousPrice) *
                          100
                        )
                      )}%`;

                  return (
                    <div
                      key={tier.id}
                      className="grid grid-cols-4 gap-4 rounded-xl border border-neutral-light px-4 py-3"
                    >
                      <span className="font-semibold text-text-main">
                        Tier {index + 1}
                      </span>

                      <input
                        type="number"
                        value={tier.minQty}
                        readOnly={isReviewLocked}
                        onChange={(e) =>
                          handleTierChange(
                            tier.id,
                            "minQty",
                            e.target.value
                          )
                        }
                        className="rounded-lg border border-neutral-light px-3 py-2"
                      />

                      <input
                        type="number"
                        step="0.01"
                        value={tier.unitPrice}
                        readOnly={isReviewLocked}
                        onChange={(e) =>
                          handleTierChange(
                            tier.id,
                            "unitPrice",
                            e.target.value
                          )
                        }
                        className="rounded-lg border border-neutral-light px-3 py-2"
                      />

                      <span className="font-semibold text-green-600">
                        {discount}
                      </span>
                    </div>
                  );
                })}
              </div>

              {validationErrors.length > 0 ? (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-700">
                    Validation Errors
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-red-600">
                    {validationErrors.map((error) => (
                      <li key={error}>• {error}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4">
                  <p className="text-sm font-semibold text-green-700">
                    Tier validation passed
                  </p>
                  <p className="mt-1 text-xs text-green-600">
                    Each new tier has a higher quantity threshold and an equal
                    or lower unit price.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right side summary */}
          <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-bold text-text-main">
                Quote Summary
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${validationErrors.length > 0
                  ? "bg-amber-100 text-amber-700"
                  : "bg-green-100 text-green-700"
                  }`}
              >
                {summaryStatus}
              </span>
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl bg-neutral-light">
              {selectedItem?.imageUrl || selectedItem?.image || itemState?.itemImage ? (
                <img
                  src={selectedItem?.imageUrl || selectedItem?.image || itemState?.itemImage}
                  alt={productName || "Product"}
                  className="h-48 w-full object-cover"
                />
              ) : (
                <div className="flex h-48 items-center justify-center text-text-muted">
                  No Product Image
                </div>
              )}
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Product</span>
                <span className="font-semibold text-text-main">
                  {productName || "—"}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-text-muted">SKU</span>
                <span className="font-semibold text-text-main">
                  {skuId || "—"}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Base Price</span>
                <span className="font-semibold text-text-main">
                  ${basePrice.toFixed(2)} / unit
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Tiers Defined</span>
                <span className="font-semibold text-text-main">
                  {completedTiers.length} Level{completedTiers.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Best Tier Qty</span>
                <span className="font-semibold text-text-main">
                  {bestTierQuantity || 0} units
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Potential Savings</span>
                <span className="font-semibold text-green-600">
                  Up to {bestDiscount}%
                </span>
              </div>
            </div>

            <div
              className={`mt-6 rounded-xl p-4 ${validationErrors.length > 0
                ? "border border-amber-200 bg-amber-50"
                : "border border-green-200 bg-green-50"
                }`}
            >
              <p
                className={`text-sm font-semibold ${validationErrors.length > 0
                  ? "text-amber-700"
                  : "text-green-700"
                  }`}
              >
                {validationErrors.length > 0
                  ? "Quote requires validation fixes"
                  : "Quote summary ready"}
              </p>
              <p
                className={`mt-1 text-xs ${validationErrors.length > 0
                  ? "text-amber-600"
                  : "text-green-600"
                  }`}
              >
                {validationErrors.length > 0
                  ? "Resolve tier pricing issues before submitting for review."
                  : "Summary reflects the current pricing tiers and best available savings."}
              </p>
            </div>

            <button
              type="button"
              onClick={handleSubmitForReview}
              disabled={
                validationErrors.length > 0 ||
                isSubmittingReview ||
                isReviewLocked
              }
              className={`mt-6 w-full rounded-xl px-4 py-3 font-semibold text-white transition-all duration-200 ${validationErrors.length > 0 || isSubmittingReview || isReviewLocked
                ? "cursor-not-allowed bg-gray-400"
                : "bg-primary hover:opacity-90 hover:-translate-y-0.5 hover:shadow-md"
                }`}
            >
              {isReviewLocked
                ? "Under Review"
                : isSubmittingReview
                  ? "Submitting..."
                  : "Submit for Review"}
            </button>
          </div>
        </div>
      </div>
      {isConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-neutral-light">
            <h3 className="text-xl font-bold text-text-main">
              Confirm Quote Submission
            </h3>

            <p className="mt-3 text-sm text-text-muted">
              Are you sure you want to submit this finalized quote for
              administrative review?
            </p>

            <p className="mt-2 text-sm text-text-muted">
              After submission, this quote will be locked and editing will not
              be permitted while it is under review.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="rounded-xl border border-neutral-light bg-white px-4 py-2 text-sm font-semibold text-text-main transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmSubmitForReview}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 hover:-translate-y-0.5 hover:shadow-md"
              >
                Confirm Submission
              </button>
            </div>
          </div>
        </div>
      )}
    </SupplierLayout>
  );
}