import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import SupplierLayout from "../../components/supplier/SupplierLayout";
import { useNotifications } from "../../contexts/NotificationContext";

export default function SupplierQuotesPage() {

  // ── Core quote fields ──────────────────────────────────────────────
  const [pricePerBulkUnit, setPricePerBulkUnit] = useState("");
  const [numberOfBulkUnits, setNumberOfBulkUnits] = useState("");
  const [requestedQuantity, setRequestedQuantity] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");

  // ── Discount scheme rows ───────────────────────────────────────────
  const [discountRows, setDiscountRows] = useState([
    { id: 1, minQty: "", discountPercent: "", description: "" },
  ]);

  // ── Product info ───────────────────────────────────────────────────
  const [productName, setProductName] = useState("");
  const [skuId, setSkuId] = useState("");
  const [totalCapacity, setTotalCapacity] = useState("");

  // ── Delivery info ──────────────────────────────────────────────────
  const [deliveryLabel, setDeliveryLabel] = useState("");
  const [deliveryLine1, setDeliveryLine1] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryRegion, setDeliveryRegion] = useState("");
  const [deliveryPostalCode, setDeliveryPostalCode] = useState("");
  const [deliveryCountry, setDeliveryCountry] = useState("CA");

  const [searchParams] = useSearchParams();
  const urlItemId = searchParams.get("itemId");

  const location = useLocation();
  const itemState = location.state;

  const [selectedItem, setSelectedItem] = useState(null);
  const [supplyId, setSupplyId] = useState("");
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [isReviewLocked, setIsReviewLocked] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");
  const { addNotification } = useNotifications();

  // ── Pre-fill from navigation state ────────────────────────────────
  useEffect(() => {
    if (!itemState) return;
    if (itemState.itemTitle) setProductName(itemState.itemTitle);
    if (itemState.itemSku) setSkuId(itemState.itemSku);
  }, [itemState]);

  // ── Load or create supply document ────────────────────────────────
  useEffect(() => {
    const fetchSupplies = async () => {
      try {
        const session = localStorage.getItem("app_auth_session_v1");
        const parsed = session ? JSON.parse(session) : {};
        const token = parsed?.accessToken || "";
        const supplierId =
          parsed?.user?.userId ||
          parsed?.user?._id ||
          parsed?.userId ||
          null;

        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/supls`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const result = await response.json();
        const supplies = result?.data || result?.items || result;

        let supply = null;

        if (Array.isArray(supplies) && supplies.length > 0) {
          supply = supplies.find((s) =>
            s.items?.some((it) => String(it.itemId) === String(urlItemId))
          );
        }

        // No match — create new supply for this item
        if (!supply && urlItemId && supplierId) {
          const createResponse = await fetch(
            `${import.meta.env.VITE_API_URL}/api/supls`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                supplierId,
                items: [{ itemId: urlItemId, requestedQuantity: 0 }],
                status: "draft",
              }),
            }
          );
          const createResult = await createResponse.json();
          supply = createResult?.data || createResult;
        }

        if (!supply) return;

        setSelectedItem(supply);
        setSupplyId(supply._id);
        setIsReviewLocked(false);
        setHasSavedDraft(false);

        if (supply.status === "pending_review" || supply.status === "accepted") {
          setIsReviewLocked(true);
          setHasSavedDraft(true);
        }

        // ── Restore delivery location ───────────────────────────
        const dl = supply.deliveryLocation;
        if (dl) {
          setDeliveryLabel(dl.label || "");
          setDeliveryLine1(dl.line1 || "");
          setDeliveryCity(dl.city || "");
          setDeliveryRegion(dl.region || "");
          setDeliveryPostalCode(dl.postalCode || "");
          setDeliveryCountry(dl.country || "CA");
        }

        // ── Restore from existing quote ─────────────────────────
        const existingQuote = supply.items?.[0]?.quotes?.[supply.items[0].quotes.length - 1];
        if (existingQuote) {
          setPricePerBulkUnit(String(existingQuote.pricePerBulkUnit || ""));
          setNumberOfBulkUnits(String(existingQuote.numberOfBulkUnits || ""));
          if (existingQuote.meta?.leadTimeDays)
            setLeadTimeDays(String(existingQuote.meta.leadTimeDays));
          if (existingQuote.meta?.totalCapacity)
            setTotalCapacity(String(existingQuote.meta.totalCapacity));
          if (existingQuote.meta?.requestedQuantity)
            setRequestedQuantity(String(existingQuote.meta.requestedQuantity));
          if (Array.isArray(existingQuote.discountingScheme) && existingQuote.discountingScheme.length > 0) {
            setDiscountRows(existingQuote.discountingScheme.map((d, i) => ({
              id: i + 1,
              minQty: String(d.minQty || ""),
              discountPercent: String(d.discountPercent || ""),
              description: d.description || "",
            })));
          }
          setHasSavedDraft(true);
        }

        // ── Restore from quoteDraft metadata ────────────────────
        const metadata = supply.metadata instanceof Map
          ? Object.fromEntries(supply.metadata)
          : supply.metadata || {};
        const draft = metadata?.quoteDraft;
        if (draft) {
          setProductName(prev => prev || draft.productName || "");
          setSkuId(prev => prev || draft.skuId || "");
          setTotalCapacity(draft.totalCapacity ? String(draft.totalCapacity) : "");
          if (draft.requestedQuantity)
            setRequestedQuantity(String(draft.requestedQuantity));
          setHasSavedDraft(true);
        }

      } catch (error) {
        console.error("Failed to fetch supplies", error);
      }
    };

    fetchSupplies();
  }, [urlItemId]);

  // ── Validation ────────────────────────────────────────────────────
  const validationErrors = useMemo(() => {
    const errors = [];

    if (!pricePerBulkUnit || Number(pricePerBulkUnit) <= 0)
      errors.push("Price per bulk unit must be greater than 0.");
    if (!numberOfBulkUnits || Number(numberOfBulkUnits) < 1)
      errors.push("Number of bulk units must be at least 1.");
    if (leadTimeDays && Number(leadTimeDays) < 0)
      errors.push("Lead time cannot be negative.");
    if (!productName || productName.trim() === "")
      errors.push("Product name is required.");
    if (!skuId || skuId.trim() === "")
      errors.push("SKU ID is required.");
    if (totalCapacity && Number(totalCapacity) < 0)
      errors.push("Total capacity cannot be negative.");
    if (requestedQuantity && Number(requestedQuantity) < 0)
      errors.push("Requested quantity cannot be negative.");

    discountRows.forEach((row, i) => {
      if (!row.minQty && !row.discountPercent) return;
      if (!row.minQty || Number(row.minQty) <= 0)
        errors.push(`Discount row ${i + 1}: min quantity must be greater than 0.`);
      if (!row.discountPercent || Number(row.discountPercent) <= 0)
        errors.push(`Discount row ${i + 1}: discount % must be greater than 0.`);
      if (Number(row.discountPercent) > 100)
        errors.push(`Discount row ${i + 1}: discount % cannot exceed 100.`);
      if (i > 0) {
        const prevQty = Number(discountRows[i - 1].minQty || 0);
        if (Number(row.minQty) <= prevQty)
          errors.push(`Discount row ${i + 1}: min qty must be higher than row ${i}.`);
      }
    });

    return errors;
  }, [pricePerBulkUnit, numberOfBulkUnits, leadTimeDays, productName, skuId, totalCapacity, requestedQuantity, discountRows]);

  // ── Save draft ────────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    try {
      if (!supplyId) throw new Error("No supply record found.");

      const token = JSON.parse(localStorage.getItem("app_auth_session_v1"))?.accessToken;

      const discountingScheme = discountRows
        .filter((r) => r.minQty && r.discountPercent)
        .map((r) => ({
          minQty: Number(r.minQty),
          discountPercent: Number(r.discountPercent),
          description: r.description || `${r.discountPercent}% at ${r.minQty}+`,
        }));

      // Step 1 — save quoteDraft to metadata
      const draftResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/api/supls/${supplyId}/save-draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            productName,
            skuId,
            totalCapacity: Number(totalCapacity || 0),
            requestedQuantity: Number(requestedQuantity || 0),
          }),
        }
      );

      const draftResult = await draftResponse.json();
      if (!draftResponse.ok) throw new Error(draftResult.message || "Failed to save draft");

      const updatedSupplyId = draftResult?.data?._id || draftResult?._id || supplyId;
      setSupplyId(updatedSupplyId);

      // Step 2 — save deliveryLocation via PATCH
      await fetch(
        `${import.meta.env.VITE_API_URL}/api/supls/${updatedSupplyId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            deliveryLocation: {
              label: deliveryLabel,
              line1: deliveryLine1,
              city: deliveryCity,
              region: deliveryRegion,
              postalCode: deliveryPostalCode,
              country: deliveryCountry,
            },
          }),
        }
      );

      // Step 3 — add formal quote to items[].quotes[]
      const quoteItemId = urlItemId || selectedItem?.items?.[0]?.itemId || null;

      if (quoteItemId && Number(pricePerBulkUnit) > 0 && Number(numberOfBulkUnits) >= 1) {
        const quoteResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/api/supls/${updatedSupplyId}/add-quote`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              itemId: quoteItemId,
              quote: {
                pricePerBulkUnit: Number(pricePerBulkUnit),
                numberOfBulkUnits: Number(numberOfBulkUnits),
                discountingScheme,
                isAccepted: false,
                meta: {
                  leadTimeDays: Number(leadTimeDays || 0),
                },
              },
            }),
          }
        );
        if (!quoteResponse.ok) {
          console.warn("[QuoteBuilder] add-quote failed — draft still saved");
        }
      }

      setHasSavedDraft(true);
      setDraftStatus("Draft saved successfully. You can now submit for review.");
    } catch (error) {
      setDraftStatus(error.message);
    }
  };

  // ── Submit for review ─────────────────────────────────────────────
  const handleSubmitForReview = () => {
    if (validationErrors.length > 0 || isSubmittingReview || isReviewLocked) return;
    if (!hasSavedDraft) {
      setDraftStatus("Please save your draft first before submitting for review.");
      return;
    }
    setIsConfirmOpen(true);
  };

  const confirmSubmitForReview = async () => {
    try {
      setSubmitStatus("");
      if (!supplyId) throw new Error("No supply record found.");
      if (validationErrors.length > 0) throw new Error("Please fix validation issues before submitting.");

      setIsSubmittingReview(true);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/supls/${supplyId}/submit-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${JSON.parse(localStorage.getItem("app_auth_session_v1"))?.accessToken}`,
          },
          body: JSON.stringify({ productName, skuId }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        if (Array.isArray(result.missingFields) && result.missingFields.length > 0)
          throw new Error(`${result.message || "Missing required fields"}: ${result.missingFields.join(", ")}`);
        throw new Error(result.message || "Failed to submit quote for review");
      }

      setSubmitStatus("Quote submitted for administrative review successfully.");
      setIsReviewLocked(true);
      setIsConfirmOpen(false);
      setDraftStatus("");
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

  const handleDiscountRowChange = (id, field, value) => {
    setDiscountRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: value };
        const isAutoPattern = /^\d+(\.\d+)?% at \d+\+$/.test(row.description || "");
        const isEmpty = !row.description;
        if ((isEmpty || isAutoPattern) && (field === "minQty" || field === "discountPercent")) {
          const qty = field === "minQty" ? value : row.minQty;
          const pct = field === "discountPercent" ? value : row.discountPercent;
          if (qty && pct) updated.description = `${pct}% at ${qty}+`;
        }
        return updated;
      })
    );
    setHasSavedDraft(false);
  };

  const handleAddDiscountRow = () => {
    setDiscountRows((current) => [
      ...current,
      { id: Date.now(), minQty: "", discountPercent: "", description: "" },
    ]);
    setHasSavedDraft(false);
  };

  const handleRemoveDiscountRow = (id) => {
    setDiscountRows((current) => current.filter((r) => r.id !== id));
    setHasSavedDraft(false);
  };

  const summaryStatus = validationErrors.length > 0 ? "Needs Review" : "Ready for Submission";

  const bestDiscount = useMemo(() => {
    const completed = discountRows.filter((r) => r.discountPercent && Number(r.discountPercent) > 0);
    if (!completed.length) return 0;
    return Math.max(...completed.map((r) => Number(r.discountPercent)));
  }, [discountRows]);

  return (
    <SupplierLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-text-muted">Quotes &gt; New Proposal</p>
            <h1 className="mt-2 text-3xl font-bold text-text-main">Quote Builder</h1>
            <p className="mt-2 text-text-muted">Create a pricing proposal for your approved supplier item.</p>
          </div>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isReviewLocked}
            className={`rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 ${isReviewLocked ? "cursor-not-allowed bg-gray-400" : "bg-primary hover:opacity-90 hover:-translate-y-0.5 hover:shadow-md"
              }`}
          >
            {isReviewLocked ? "Draft Locked" : "Save Draft"}
          </button>
        </div>

        {draftStatus && (
          <div className={`rounded-xl p-4 ${draftStatus.includes("Please save") ? "border border-amber-200 bg-amber-50" : "border border-green-200 bg-green-50"}`}>
            <p className={`text-sm font-semibold ${draftStatus.includes("Please save") ? "text-amber-700" : "text-green-700"}`}>
              {draftStatus}
            </p>
            {!draftStatus.includes("Please save") && (
              <p className="mt-1 text-xs text-green-600">Draft synced with backend and available across supplier sessions.</p>
            )}
          </div>
        )}

        {submitStatus && (
          <div className={`rounded-xl p-4 ${isReviewLocked ? "border border-green-200 bg-green-50" : "border border-amber-200 bg-amber-50"}`}>
            <p className={`text-sm font-semibold ${isReviewLocked ? "text-green-700" : "text-amber-700"}`}>{submitStatus}</p>
            <p className={`mt-1 text-xs ${isReviewLocked ? "text-green-600" : "text-amber-600"}`}>
              {isReviewLocked ? "This quote is now locked and waiting for administrative review." : "Submission could not be completed yet."}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">

            {/* Product Information */}
            <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-lg">📦</div>
                  <div>
                    <h2 className="text-xl font-bold text-text-main">Product Information</h2>
                    <p className="text-sm text-text-muted">Configure the selected approved supplier item</p>
                  </div>
                </div>
                <span className="rounded-full bg-neutral-light px-3 py-1 text-xs font-semibold text-text-main">Approved Item</span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">Product Name</label>
                  <input type="text" value={productName} onChange={(e) => { setProductName(e.target.value); setHasSavedDraft(false); }} className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">SKU ID</label>
                  <input type="text" value={skuId} onChange={(e) => { setSkuId(e.target.value); setHasSavedDraft(false); }} className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">Total Capacity (Units)</label>
                  <input type="number" min="0" value={totalCapacity} onChange={(e) => { setTotalCapacity(e.target.value); setHasSavedDraft(false); }} className="w-full rounded-xl border border-neutral-light px-4 py-3" />
                  <p className="mt-2 text-xs text-text-muted">Total stock available for this cycle.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">Requested Quantity</label>
                  <input type="number" min="0" value={requestedQuantity} onChange={(e) => { setRequestedQuantity(e.target.value); setHasSavedDraft(false); }} className="w-full rounded-xl border border-neutral-light px-4 py-3" />
                  <p className="mt-2 text-xs text-text-muted">How many units you can supply.</p>
                </div>
              </div>
            </div>

            {/* Quote Pricing */}
            <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-text-main">Quote Pricing</h2>
                <p className="text-sm text-text-muted">Set your unit price and bulk order size.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">Price Per Bulk Unit ($)</label>
                  <input type="number" step="0.01" min="0.01" value={pricePerBulkUnit} onChange={(e) => { setPricePerBulkUnit(e.target.value); setHasSavedDraft(false); }} className="w-full rounded-xl border border-neutral-light px-4 py-3" />
                  <p className="mt-2 text-xs text-text-muted">Your price per unit.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">Number of Bulk Units</label>
                  <input type="number" min="1" value={numberOfBulkUnits} onChange={(e) => { setNumberOfBulkUnits(e.target.value); setHasSavedDraft(false); }} className="w-full rounded-xl border border-neutral-light px-4 py-3" />
                  <p className="mt-2 text-xs text-text-muted">Units per bulk order.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">Lead Time (Days)</label>
                  <input type="number" min="0" value={leadTimeDays} onChange={(e) => { setLeadTimeDays(e.target.value); setHasSavedDraft(false); }} className="w-full rounded-xl border border-neutral-light px-4 py-3" />
                  <p className="mt-2 text-xs text-text-muted">Days to fulfil the order.</p>
                </div>
              </div>
            </div>

            {/* Delivery Information */}
            <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-text-main">Delivery Information</h2>
                <p className="text-sm text-text-muted">Where should the order be delivered?</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-text-main">Location Label</label>
                  <input type="text" value={deliveryLabel} placeholder="e.g. Main Warehouse" readOnly={isReviewLocked} onChange={(e) => { setDeliveryLabel(e.target.value); setHasSavedDraft(false); }} className="w-full rounded-xl border border-neutral-light px-4 py-3" />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-text-main">Street Address</label>
                  <input type="text" value={deliveryLine1} placeholder="e.g. 100 Logistics Way" readOnly={isReviewLocked} onChange={(e) => { setDeliveryLine1(e.target.value); setHasSavedDraft(false); }} className="w-full rounded-xl border border-neutral-light px-4 py-3" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">City</label>
                  <input type="text" value={deliveryCity} placeholder="e.g. Toronto" readOnly={isReviewLocked} onChange={(e) => { setDeliveryCity(e.target.value); setHasSavedDraft(false); }} className="w-full rounded-xl border border-neutral-light px-4 py-3" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">Province / Region</label>
                  <input type="text" value={deliveryRegion} placeholder="e.g. ON" readOnly={isReviewLocked} onChange={(e) => { setDeliveryRegion(e.target.value); setHasSavedDraft(false); }} className="w-full rounded-xl border border-neutral-light px-4 py-3" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">Postal Code</label>
                  <input type="text" value={deliveryPostalCode} placeholder="e.g. M5V2T6" readOnly={isReviewLocked} onChange={(e) => { setDeliveryPostalCode(e.target.value); setHasSavedDraft(false); }} className="w-full rounded-xl border border-neutral-light px-4 py-3" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">Country</label>
                  <input type="text" value={deliveryCountry} placeholder="e.g. CA" readOnly={isReviewLocked} onChange={(e) => { setDeliveryCountry(e.target.value); setHasSavedDraft(false); }} className="w-full rounded-xl border border-neutral-light px-4 py-3" />
                </div>
              </div>
            </div>

            {/* Discount Scheme */}
            <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-text-main">Discount Scheme</h2>
                  <p className="text-sm text-text-muted">Optional — offer discounts at higher quantity thresholds.</p>
                </div>
                <button type="button" onClick={handleAddDiscountRow} disabled={isReviewLocked} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${isReviewLocked ? "cursor-not-allowed bg-gray-200 text-gray-500" : "bg-primary/10 text-primary hover:bg-primary hover:text-white"}`}>
                  {isReviewLocked ? "Locked" : "+ Add Row"}
                </button>
              </div>
              <div className="grid grid-cols-10 gap-3 rounded-xl bg-neutral-light px-4 py-3 text-sm font-semibold text-text-main">
                <span className="col-span-2">Min Qty</span>
                <span className="col-span-2">Discount %</span>
                <span className="col-span-5">Description</span>
                <span className="col-span-1"></span>
              </div>
              <div className="mt-3 space-y-3">
                {discountRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-10 gap-3 rounded-xl border border-neutral-light px-4 py-3">
                    <input type="number" min="0" value={row.minQty} readOnly={isReviewLocked} placeholder="e.g. 50" onChange={(e) => handleDiscountRowChange(row.id, "minQty", e.target.value)} className="col-span-2 rounded-lg border border-neutral-light px-3 py-2 text-sm" />
                    <input type="number" min="1" max="100" value={row.discountPercent} readOnly={isReviewLocked} placeholder="e.g. 10" onChange={(e) => handleDiscountRowChange(row.id, "discountPercent", e.target.value)} className="col-span-2 rounded-lg border border-neutral-light px-3 py-2 text-sm" />
                    <input type="text" value={row.description} readOnly={isReviewLocked} placeholder="e.g. 10% at 50+" onChange={(e) => handleDiscountRowChange(row.id, "description", e.target.value)} className="col-span-5 rounded-lg border border-neutral-light px-3 py-2 text-sm" />
                    <button type="button" onClick={() => handleRemoveDiscountRow(row.id)} disabled={isReviewLocked || discountRows.length === 1} className="col-span-1 flex items-center justify-center text-red-400 hover:text-red-600 disabled:opacity-30">✕</button>
                  </div>
                ))}
              </div>
              {validationErrors.length > 0 ? (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-700">Validation Errors</p>
                  <ul className="mt-2 space-y-1 text-sm text-red-600">{validationErrors.map((error) => <li key={error}>• {error}</li>)}</ul>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4">
                  <p className="text-sm font-semibold text-green-700">Quote validation passed</p>
                  <p className="mt-1 text-xs text-green-600">All required fields are filled correctly.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right — summary */}
          <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-bold text-text-main">Quote Summary</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${validationErrors.length > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>{summaryStatus}</span>
            </div>
            <div className="mt-6 overflow-hidden rounded-2xl bg-neutral-light">
              {selectedItem?.imageUrl || selectedItem?.image || itemState?.itemImage ? (
                <img src={selectedItem?.imageUrl || selectedItem?.image || itemState?.itemImage} alt={productName || "Product"} className="h-48 w-full object-cover" />
              ) : (
                <div className="flex h-48 items-center justify-center text-text-muted">No Product Image</div>
              )}
            </div>
            <div className="mt-6 space-y-4">
              <div className="flex justify-between text-sm"><span className="text-text-muted">Product</span><span className="font-semibold text-text-main">{productName || "—"}</span></div>
              <div className="flex justify-between text-sm"><span className="text-text-muted">SKU</span><span className="font-semibold text-text-main">{skuId || "—"}</span></div>
              <div className="flex justify-between text-sm"><span className="text-text-muted">Price / Unit</span><span className="font-semibold text-text-main">{pricePerBulkUnit ? `$${Number(pricePerBulkUnit).toFixed(2)}` : "—"}</span></div>
              <div className="flex justify-between text-sm"><span className="text-text-muted">Bulk Units</span><span className="font-semibold text-text-main">{numberOfBulkUnits || "—"}</span></div>
              <div className="flex justify-between text-sm"><span className="text-text-muted">Lead Time</span><span className="font-semibold text-text-main">{leadTimeDays ? `${leadTimeDays} days` : "—"}</span></div>
              <div className="flex justify-between text-sm"><span className="text-text-muted">Delivery City</span><span className="font-semibold text-text-main">{deliveryCity || "—"}</span></div>
              <div className="flex justify-between text-sm"><span className="text-text-muted">Discount Rows</span><span className="font-semibold text-text-main">{discountRows.filter((r) => r.minQty && r.discountPercent).length} defined</span></div>
              <div className="flex justify-between text-sm"><span className="text-text-muted">Max Discount</span><span className="font-semibold text-green-600">Up to {bestDiscount}%</span></div>
            </div>

            {!hasSavedDraft && !isReviewLocked && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-700">⚠ Save your draft before submitting for review.</p>
              </div>
            )}

            <div className={`mt-4 rounded-xl p-4 ${validationErrors.length > 0 ? "border border-amber-200 bg-amber-50" : "border border-green-200 bg-green-50"}`}>
              <p className={`text-sm font-semibold ${validationErrors.length > 0 ? "text-amber-700" : "text-green-700"}`}>
                {validationErrors.length > 0 ? "Quote requires fixes" : "Quote summary ready"}
              </p>
              <p className={`mt-1 text-xs ${validationErrors.length > 0 ? "text-amber-600" : "text-green-600"}`}>
                {validationErrors.length > 0 ? "Fix errors before submitting." : hasSavedDraft ? "Draft saved. You can now submit for review." : "Save your draft first, then submit for review."}
              </p>
            </div>

            <button
              type="button"
              onClick={handleSubmitForReview}
              disabled={validationErrors.length > 0 || isSubmittingReview || isReviewLocked || !hasSavedDraft}
              className={`mt-6 w-full rounded-xl px-4 py-3 font-semibold text-white transition-all duration-200 ${validationErrors.length > 0 || isSubmittingReview || isReviewLocked || !hasSavedDraft
                ? "cursor-not-allowed bg-gray-400"
                : "bg-primary hover:opacity-90 hover:-translate-y-0.5 hover:shadow-md"
                }`}
            >
              {isReviewLocked ? "Under Review" : isSubmittingReview ? "Submitting..." : !hasSavedDraft ? "Save Draft First" : "Submit for Review"}
            </button>
          </div>
        </div>
      </div>

      {isConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-neutral-light">
            <h3 className="text-xl font-bold text-text-main">Confirm Quote Submission</h3>
            <p className="mt-3 text-sm text-text-muted">Are you sure you want to submit this quote for administrative review?</p>
            <p className="mt-2 text-sm text-text-muted">After submission this quote will be locked and editing will not be permitted.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setIsConfirmOpen(false)} className="rounded-xl border border-neutral-light bg-white px-4 py-2 text-sm font-semibold text-text-main">Cancel</button>
              <button type="button" onClick={confirmSubmitForReview} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Confirm Submission</button>
            </div>
          </div>
        </div>
      )}
    </SupplierLayout>
  );
}