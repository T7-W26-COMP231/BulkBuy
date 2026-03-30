import { useEffect, useState } from "react";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import AdminSummaryCard from "../../components/admin/AdminSummaryCard";
import { updateItemPricingTiers, fetchItemById } from "../../api/itemApi";

const initialTiers = [
  { id: 1, minQty: "1", unitPrice: "50.00", qtyError: false, priceError: false },
  { id: 2, minQty: "100", unitPrice: "45.00", qtyError: false, priceError: false },
  { id: 3, minQty: "500", unitPrice: "40.00", qtyError: false, priceError: false },
];

// Temporary hardcoded item id for quick testing
const testItemId = "69c35324dec6d4f932a8063c";

export default function PricingBracketsPage() {
  const [tiers, setTiers] = useState(initialTiers);
  const [activeTierLabel, setActiveTierLabel] = useState("Loading...");
  const [aggregatedDemand, setAggregatedDemand] = useState(0);

  const hasAnyError = tiers.some((tier) => tier.qtyError || tier.priceError);

  // ✅ Task #120 — validate increasing quantity thresholds
  // ✅ Task #121 — validate decreasing or equal pricing tiers
  const validateTiers = (tiersToValidate) => {
    return tiersToValidate.map((tier, index, arr) => {
      if (index === 0) {
        return { ...tier, qtyError: false, priceError: false };
      }

      const prevQty = Number(arr[index - 1].minQty);
      const currQty = Number(tier.minQty);
      const prevPrice = Number(arr[index - 1].unitPrice);
      const currPrice = Number(tier.unitPrice);

      // ✅ Task #120 — qty must strictly increase
      const qtyError =
        !tier.minQty ||
        Number.isNaN(currQty) ||
        currQty <= prevQty;

      // ✅ Task #121 — price must strictly decrease (higher qty = lower price)
      const priceError =
        !tier.unitPrice ||
        Number.isNaN(currPrice) ||
        currPrice >= prevPrice;

      return { ...tier, qtyError, priceError };
    });
  };

  // ✅ Task #118 — handle input field changes
  const handleTierChange = (id, field, value) => {
    setTiers((prev) => {
      const updated = prev.map((tier) =>
        tier.id === id ? { ...tier, [field]: value } : tier
      );
      return validateTiers(updated);
    });
  };

  const handleAddTier = () => {
    setTiers((prev) =>
      validateTiers([
        ...prev,
        {
          id: Date.now(),
          minQty: "",
          unitPrice: "",
          qtyError: false,
          priceError: false,
        },
      ])
    );
  };

  const handleRemoveTier = (id) => {
    setTiers((prev) => {
      if (prev.length <= 1) return prev;
      return validateTiers(prev.filter((tier) => tier.id !== id));
    });
  };

  const handleDiscard = () => {
    setTiers(initialTiers);
  };

  const handleSavePricingStrategy = async () => {
    try {
      await updateItemPricingTiers(testItemId, tiers);
      alert("Pricing brackets saved successfully.");
    } catch (error) {
      console.error("Save error:", error);
      alert(error.message || "Failed to save pricing brackets.");
    }
  };

  useEffect(() => {
    const loadPricingState = async () => {
      try {
        const item = await fetchItemById(testItemId);

        setAggregatedDemand(item.aggregatedDemand ?? 0);

        if (item.activeTier) {
          setActiveTierLabel(
            `Min ${item.activeTier.minQty}+ • $${Number(item.activeTier.price).toFixed(2)}`
          );
        } else {
          setActiveTierLabel("No active tier");
        }
      } catch (error) {
        console.error("Failed to load active tier:", error);
        setActiveTierLabel("Unavailable");
      }
    };

    loadPricingState();
  }, []);

  return (
    <div className="min-h-screen bg-background-light text-text-main">
      <div className="flex min-h-screen">
        <AdminSidebar />

        <div className="flex min-h-screen flex-1 flex-col">
          <AdminTopbar title="Pricing Bracket Editor" />

          <main className="flex-1 px-6 py-8 md:px-8 lg:px-10">
            <div className="mx-auto flex max-w-6xl flex-col gap-8">

              <section>
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Manage Tiered Pricing
                </h2>
                <p className="mt-2 max-w-3xl text-sm text-text-muted md:text-base">
                  Define quantity thresholds and unit prices for automated bulk
                  discounts across your catalog.
                </p>
              </section>

              <section className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
                {/* Header */}
                <div className="flex flex-col gap-4 border-b border-neutral-light px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-text-muted">
                    Tier Configuration
                  </h3>
                  {/* ✅ Task #119 — Add tier button */}
                  <button
                    type="button"
                    onClick={handleAddTier}
                    className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-neutral-light bg-white px-4 py-2 text-sm font-semibold text-text-main transition hover:bg-neutral-light"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    Add Tier
                  </button>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[1fr_1fr_auto] gap-6 border-b border-neutral-light bg-neutral-light/40 px-6 py-3 text-xs font-bold uppercase tracking-widest text-text-muted">
                  <span>Min Quantity (units)</span>
                  <span>Unit Price ($)</span>
                  <span className="w-20 text-center">Action</span>
                </div>

                {/* Tier rows */}
                <div className="flex flex-col divide-y divide-neutral-light">
                  {tiers.map((tier, index) => (
                    <div
                      key={tier.id}
                      className={`grid grid-cols-1 gap-6 px-6 py-5 md:grid-cols-[1fr_1fr_auto] md:items-start ${index === 0 ? "bg-primary/5" : "bg-white"
                        }`}
                    >
                      {/* ✅ Task #118 — Min Quantity input */}
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-text-muted">
                          {index === 0 ? "Base Tier (Min Qty)" : `Tier ${index + 1} Min Qty`}
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={tier.minQty}
                          onChange={(e) => handleTierChange(tier.id, "minQty", e.target.value)}
                          placeholder="e.g. 100"
                          className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-text-main outline-none transition ${tier.qtyError
                            ? "border-red-300 focus:border-red-400"
                            : "border-neutral-light focus:border-primary"
                            }`}
                        />
                        {/* ✅ Task #120 — qty validation message */}
                        {tier.qtyError && (
                          <p className="mt-2 text-xs font-medium italic text-red-500">
                            Quantity must be higher than the previous tier.
                          </p>
                        )}
                      </div>

                      {/* ✅ Task #118 — Unit Price input */}
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-text-muted">
                          Unit Price ($)
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={tier.unitPrice}
                            onChange={(e) => handleTierChange(tier.id, "unitPrice", e.target.value)}
                            placeholder="e.g. 45.00"
                            className={`w-full rounded-xl border bg-white py-3 pl-8 pr-4 text-sm text-text-main outline-none transition ${tier.priceError
                              ? "border-red-300 focus:border-red-400"
                              : "border-neutral-light focus:border-primary"
                              }`}
                          />
                        </div>
                        {/* ✅ Task #121 — price validation message */}
                        {tier.priceError && (
                          <p className="mt-2 text-xs font-medium italic text-red-500">
                            Price must be lower than the previous tier (higher qty = lower price).
                          </p>
                        )}
                      </div>

                      {/* ✅ Task #119 — Remove tier button */}
                      <div className="flex items-center justify-end md:pt-8">
                        <button
                          type="button"
                          onClick={() => handleRemoveTier(tier.id)}
                          disabled={tiers.length <= 1}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex flex-col gap-4 border-t border-neutral-light px-6 py-5 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-text-muted">
                    Changes will apply to all products using this pricing strategy.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleDiscard}
                      className="rounded-xl px-4 py-3 text-sm font-semibold text-text-muted transition hover:bg-neutral-light"
                    >
                      Discard Changes
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePricingStrategy}
                      disabled={hasAnyError}
                      className={`rounded-xl px-5 py-3 text-sm font-bold text-text-main transition ${hasAnyError
                        ? "cursor-not-allowed bg-neutral-light text-text-muted opacity-60"
                        : "bg-primary hover:opacity-90"
                        }`}
                    >
                      Save Pricing Strategy
                    </button>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <AdminSummaryCard
                  label="Avg. Discount"
                  value="12.5%"
                  extra="↑+2%"
                />
                <AdminSummaryCard
                  label="Total Tiers"
                  value={String(tiers.length).padStart(2, "0")}
                />
                <AdminSummaryCard
                  label="Strategy Type"
                  badge="Volume Based"
                />
                <AdminSummaryCard
                  label="Active Tier"
                  value={activeTierLabel}
                  extra={`Demand: ${aggregatedDemand}`}
                />
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}