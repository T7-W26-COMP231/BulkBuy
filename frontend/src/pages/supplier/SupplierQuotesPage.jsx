import { useMemo, useState } from "react";
import SupplierLayout from "../../components/supplier/SupplierLayout";

export default function SupplierQuotesPage() {
  const [tiers, setTiers] = useState([
    { id: 1, minQty: "100", unitPrice: "2.50" },
    { id: 2, minQty: "500", unitPrice: "2.25" },
    { id: 3, minQty: "1000", unitPrice: "2.00" },
  ]);

  const [draftStatus, setDraftStatus] = useState("");

  const handleSaveDraft = () => {
    const draftPayload = {
      productName: "Organic Avocados (Hass)",
      skuId: "AVO-ORG-4402-XL",
      tiers,
      savedAt: new Date().toISOString(),
      status: "draft",
    };

    localStorage.setItem(
      "supplier-quote-draft",
      JSON.stringify(draftPayload)
    );

    setDraftStatus("Draft saved successfully.");
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
  className="rounded-xl border border-neutral-light bg-white px-5 py-3 text-sm font-semibold text-text-main shadow-sm transition hover:shadow-md"
>
  Save Draft
</button>
        </div>

        {draftStatus && (
  <div className="rounded-xl border border-green-200 bg-green-50 p-4">
    <p className="text-sm font-semibold text-green-700">{draftStatus}</p>
    <p className="mt-1 text-xs text-green-600">
      Quote draft stored locally and can be resumed later.
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
                    value="Organic Avocados (Hass)"
                    readOnly
                    className="w-full rounded-xl border border-neutral-light bg-neutral-light px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">
                    SKU ID
                  </label>
                  <input
                    type="text"
                    value="AVO-ORG-4402-XL"
                    readOnly
                    className="w-full rounded-xl border border-neutral-light bg-neutral-light px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-text-main">
                    Base Unit Price ($)
                  </label>
                  <input
                    type="number"
                    placeholder="2.50"
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
                    placeholder="5000"
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
                  className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-semibold text-primary"
                >
                  + Add Tier
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
            <h2 className="text-xl font-bold text-text-main">
              Quote Summary
            </h2>

            <div className="mt-6 overflow-hidden rounded-2xl bg-neutral-light">
              <div className="flex h-48 items-center justify-center text-text-muted">
                Product Image
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Product</span>
                <span className="font-semibold text-text-main">
                  Organic Avocados
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Base Price</span>
                <span className="font-semibold text-text-main">
                  $2.50 / unit
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Tiers Defined</span>
                <span className="font-semibold text-text-main">3 Levels</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Potential Savings</span>
                <span className="font-semibold text-green-600">Up to 20%</span>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-700">
                Tier Validation Active
              </p>
              <p className="mt-1 text-xs text-amber-600">
                Invalid pricing tiers are now flagged before submission.
              </p>
            </div>

            <button
              disabled={validationErrors.length > 0}
              className={`mt-6 w-full rounded-xl px-4 py-3 font-semibold text-white transition ${validationErrors.length > 0
                  ? "cursor-not-allowed bg-gray-400"
                  : "bg-primary hover:opacity-90"
                }`}
            >
              Submit for Review
            </button>
          </div>
        </div>
      </div>
    </SupplierLayout>
  );
}