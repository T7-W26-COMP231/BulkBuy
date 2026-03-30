import { useState } from "react";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import AdminSummaryCard from "../../components/admin/AdminSummaryCard";

const initialTiers = [
  { id: 1, minQty: "1", unitPrice: "50.00", hasError: false },
  { id: 2, minQty: "100", unitPrice: "45.00", hasError: false },
  { id: 3, minQty: "500", unitPrice: "40.00", hasError: false },
  { id: 3, minQty: "500", unitPrice: "40.00", hasError: false },
];

export default function PricingBracketsPage() {
  const [tiers, setTiers] = useState(initialTiers);
  const hasAnyThresholdError = tiers.some((tier) => tier.hasError);

  const validateThresholds = (tiersToValidate) => {
    return tiersToValidate.map((tier, index, arr) => {
      if (index === 0) {
        return { ...tier, hasError: false };
      }

      const prevQty = Number(arr[index - 1].minQty);
      const currQty = Number(tier.minQty);

      const hasError =
        !tier.minQty ||
        Number.isNaN(currQty) ||
        currQty <= prevQty;

      return { ...tier, hasError };
    });
  };

  const handleTierChange = (id, field, value) => {
    setTiers((prev) => {
      const updated = prev.map((tier) =>
    setTiers((prev) => {
      const updated = prev.map((tier) =>
        tier.id === id ? { ...tier, [field]: value } : tier
      );

      return field === "minQty" ? validateThresholds(updated) : updated;
    });
      );

      return field === "minQty" ? validateThresholds(updated) : updated;
    });
  };

  const handleAddTier = () => {
    setTiers((prev) =>
      validateThresholds([
        ...prev,
        {
          id: Date.now(),
          minQty: "",
          unitPrice: "",
          hasError: false,
        },
      ])
    );
  };

  const handleRemoveTier = (id) => {
    setTiers((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((tier) => tier.id !== id);
    });
  };

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
                <div className="flex flex-col gap-4 border-b border-neutral-light px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-text-muted">
                    Tier Configuration
                  </h3>

                  <button
                    type="button"
                    onClick={handleAddTier}
                    className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-neutral-light bg-white px-4 py-2 text-sm font-semibold text-text-main transition hover:bg-neutral-light"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      add
                    </span>
                    Add Tier
                  </button>
                </div>

                <div className="flex flex-col">
                  {tiers.map((tier, index) => (
                    <div
                      key={tier.id}
                      className={`grid grid-cols-1 gap-6 border-b border-neutral-light px-6 py-6 md:grid-cols-2 ${
                        index === 0 ? "bg-primary/5" : "bg-white"
                      }`}
                    >
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-text-muted">
                          Min Quantity
                        </label>
                        <input
                          type="text"
                          value={tier.minQty}
                          onChange={(e) =>
                            handleTierChange(
                              tier.id,
                              "minQty",
                              e.target.value
                            )
                          }
                          className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-text-main outline-none transition ${
                            tier.hasError
                              ? "border-red-300 focus:border-red-400"
                              : "border-neutral-light focus:border-primary"
                          }`}
                        />
                        {tier.hasError ? (
                          <p className="mt-2 text-xs font-medium italic text-red-500">
                            Threshold must be higher than previous tier.
                          </p>
                        ) : null}
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="block text-sm font-semibold text-text-muted">
                            Unit Price ($)
                          </label>

                          <button
                            type="button"
                            onClick={() => handleRemoveTier(tier.id)}
                            disabled={tiers.length <= 1}
                            className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Remove
                          </button>
                        </div>

                        <input
                          type="text"
                          value={tier.unitPrice}
                          onChange={(e) =>
                            handleTierChange(
                              tier.id,
                              "unitPrice",
                              e.target.value
                            )
                          }
                          className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-text-muted">
                    Changes will apply to all 124 products in this category.
                  </p>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      className="rounded-xl px-4 py-3 text-sm font-semibold text-text-muted transition hover:bg-neutral-light"
                    >
                      Discard Changes
                    </button>

                    <button
                      type="button"
                      disabled={hasAnyThresholdError}
                      className={`rounded-xl px-5 py-3 text-sm font-bold text-text-main transition ${
                        hasAnyThresholdError
                          ? "cursor-not-allowed bg-neutral-light text-text-muted opacity-60"
                          : "bg-primary hover:opacity-90"
                      }`}
                      disabled={hasAnyThresholdError}
                      className={`rounded-xl px-5 py-3 text-sm font-bold text-text-main transition ${
                        hasAnyThresholdError
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
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}