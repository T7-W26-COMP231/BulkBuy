import SupplierLayout from "../../components/supplier/SupplierLayout";

export default function SupplierQuotesPage() {
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

          <button className="rounded-xl border border-neutral-light bg-white px-5 py-3 text-sm font-semibold text-text-main shadow-sm transition hover:shadow-md">
            Save Draft
          </button>
        </div>

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

            {/* Dynamic tier table mock-up */}
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

                <button className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
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

              {/* Tier rows */}
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-4 gap-4 rounded-xl border border-neutral-light px-4 py-3">
                  <span className="font-semibold text-text-main">Tier 1</span>
                  <input
                    type="number"
                    value="100"
                    readOnly
                    className="rounded-lg border border-neutral-light bg-neutral-light px-3 py-2"
                  />
                  <input
                    type="number"
                    value="2.50"
                    readOnly
                    className="rounded-lg border border-neutral-light bg-neutral-light px-3 py-2"
                  />
                  <span className="font-semibold text-green-600">0%</span>
                </div>

                <div className="grid grid-cols-4 gap-4 rounded-xl border border-neutral-light px-4 py-3">
                  <span className="font-semibold text-text-main">Tier 2</span>
                  <input
                    type="number"
                    value="500"
                    readOnly
                    className="rounded-lg border border-neutral-light bg-neutral-light px-3 py-2"
                  />
                  <input
                    type="number"
                    value="2.25"
                    readOnly
                    className="rounded-lg border border-neutral-light bg-neutral-light px-3 py-2"
                  />
                  <span className="font-semibold text-green-600">10%</span>
                </div>

                <div className="grid grid-cols-4 gap-4 rounded-xl border border-neutral-light px-4 py-3">
                  <span className="font-semibold text-text-main">Tier 3</span>
                  <input
                    type="number"
                    value="1000"
                    readOnly
                    className="rounded-lg border border-neutral-light bg-neutral-light px-3 py-2"
                  />
                  <input
                    type="number"
                    value="2.00"
                    readOnly
                    className="rounded-lg border border-neutral-light bg-neutral-light px-3 py-2"
                  />
                  <span className="font-semibold text-green-600">20%</span>
                </div>
              </div>
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
                Dynamic Tier Table Ready
              </p>
              <p className="mt-1 text-xs text-amber-600">
                Validation logic will be added in task #137.
              </p>
            </div>

            <button className="mt-6 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white transition hover:opacity-90">
              Submit for Review
            </button>
          </div>
        </div>
      </div>
    </SupplierLayout>
  );
}