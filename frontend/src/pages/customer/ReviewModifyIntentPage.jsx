import { useState } from "react";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import Sidebar from "../../components/Sidebar";

export default function ReviewModifyIntentPage() {
  const [quantity, setQuantity] = useState(12);

  const product = {
    name: "Premium Organic Avocados (Box of 12)- this is should come from",
    city: "Toronto",
    description:
      "Fresh, Grade A organic avocados sourced directly from sustainable farms. Perfectly ripened and packed for delivery.",
    image:
      "https://images.unsplash.com/photo-1519162808019-7de1683fa2ad?auto=format&fit=crop&w=1200&q=80",
    unitPrice: 1.5,
    savings: 3.0,
    platformFeeRate: 0.02,
    progressUnits: 750,
    goalUnits: 1000,
  };

  const decreaseQty = () => {
    if (quantity > 0) setQuantity((prev) => prev - 1);  // ← change 1 to 0
  };

  const increaseQty = () => {
    setQuantity((prev) => prev + 1);
  };

  const baseSubtotal = quantity * product.unitPrice;
  const platformFee = baseSubtotal * product.platformFeeRate;
  const updatedTotal = baseSubtotal - product.savings + platformFee;
  const progressPercent = Math.min(
    (product.progressUnits / product.goalUnits) * 100,
    100
  );

  const handleSaveChanges = () => {
    alert("Intent changes saved.");
  };

  const handleCancelIntent = () => {
    alert("Intent cancelled.");
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light font-display text-text-main">
      <Navbar />

      <main className="flex flex-1 flex-col gap-8 rounded-2xl border border-neutral-light px-4 py-8 md:flex-row md:px-20 lg:px-40">
        <Sidebar />

        <section className="flex flex-1 flex-col gap-6">
          {/* <div className="flex items-center gap-2 text-sm font-medium text-text-muted">
            <span>Home</span>
            <span className="material-symbols-outlined text-xs">
              chevron_right
            </span>
            <span>My Intents</span>
            <span className="material-symbols-outlined text-xs">
              chevron_right
            </span>
            <span className="font-bold text-text-main">Review Intent</span>
          </div> */}

          <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-8 lg:flex-row">
              <div className="w-full lg:w-[48%]">
                <div className="overflow-hidden rounded-2xl bg-neutral-light">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <h1 className="text-2xl md:text-3xl font-black leading-tight text-text-main">
                      {product.name}
                    </h1>

                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">
                        ${product.unitPrice.toFixed(2)}
                      </p>
                      <p className="text-sm text-text-muted">/ unit</p>
                    </div>
                  </div>

                  <p className="mb-6 text-base leading-relaxed text-text-muted">
                    {product.city} Bulk Purchase Group. {product.description}
                  </p>

                  <div className="mb-2 text-sm font-bold uppercase tracking-wide text-text-muted">
                    Submitted Quantity
                  </div>

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex w-fit items-center rounded-xl border border-neutral-light">
                      <button
                        onClick={decreaseQty}
                        className="px-4 py-3 text-lg transition hover:bg-background-light"
                      >
                        -
                      </button>

                      <div className="min-w-[70px] px-4 py-3 text-center font-bold">
                        {quantity}
                      </div>

                      <button
                        onClick={increaseQty}
                        className="px-4 py-3 text-lg transition hover:bg-background-light"
                      >
                        +
                      </button>
                    </div>

                    <button
                      onClick={handleSaveChanges}
                      className="rounded-xl bg-primary px-5 py-2.5 font-bold text-text-main transition hover:opacity-90"
                    >
                      Save Changes
                    </button>

                    <button
                      onClick={handleCancelIntent}
                      className="rounded-xl border border-neutral-light bg-white px-5 py-2.5 font-semibold text-text-main transition hover:bg-background-light"
                    >
                      Cancel Intent
                    </button>
                  </div>

                  <div className="mt-4 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-text-main">
                    Aggregation window open
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-text-main">
                <span className="material-symbols-outlined text-primary">
                  sell
                </span>
                Volume Pricing Tiers
              </h2>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-neutral-light bg-background-light p-4">
                  <span className="font-medium text-text-muted">
                    Tier 1 (100+ units)
                  </span>
                  <span className="font-bold text-text-main">$1.40/unit</span>
                </div>

                <div className="relative flex items-center justify-between rounded-xl border-2 border-primary bg-primary/10 p-4">
                  <span className="font-bold text-text-main">
                    Tier 2 (500+ units)
                  </span>
                  <span className="font-black text-text-main">$1.25/unit</span>
                  <span className="absolute -right-2 -top-2 rounded-full bg-primary px-2 py-1 text-[10px] font-black text-text-main">
                    ACTIVE
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-neutral-light bg-background-light p-4">
                  <span className="font-medium text-text-muted">
                    Tier 3 (1000+ units)
                  </span>
                  <span className="font-bold text-text-muted">$1.10/unit</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-xl font-bold text-text-main">
                  <span className="material-symbols-outlined text-primary">
                    groups
                  </span>
                  Community Progress
                </h2>

                <span className="font-semibold text-text-muted">
                  {product.progressUnits} / {product.goalUnits} units
                </span>
              </div>

              <div className="h-4 w-full overflow-hidden rounded-full bg-neutral-light">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="mt-4 flex justify-between text-xs font-bold uppercase tracking-widest text-text-muted">
                <span>Tier 1 Met</span>
                <span className="text-primary">Tier 2 Active</span>
                <span>Next: Tier 3</span>
              </div>

              <p className="mt-4 text-sm italic text-text-muted">
                We need {product.goalUnits - product.progressUnits} more units
                to unlock the next pricing tier.
              </p>
            </div>
          </div>
        </section>

        <aside className="mt-6 w-full lg:mt-0 lg:w-[340px]">
          <div className="sticky top-24 rounded-2xl bg-[#071d1b] p-6 text-white shadow-xl">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-xl bg-white/10 p-3">
                <span className="material-symbols-outlined text-primary">
                  inventory
                </span>
              </div>

              <div>
                <h2 className="text-xl font-bold">Submitted Intent</h2>
                <p className="text-sm text-primary/80">{quantity} units selected</p>
              </div>
            </div>

            <div className="space-y-4 border-b border-white/10 pb-6">
              <div className="flex justify-between text-sm">
                <span className="text-white/70">Subtotal (Base Price)</span>
                <span>${baseSubtotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-sm text-primary">
                <span>Tier 2 Savings</span>
                <span>-${product.savings.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-white/70">Platform Fee (2%)</span>
                <span>${platformFee.toFixed(2)}</span>
              </div>
            </div>

            <div className="my-6 flex items-center justify-between">
              <span className="text-lg font-bold">Updated Total</span>
              <span className="text-3xl font-black text-primary">
                ${updatedTotal.toFixed(2)}
              </span>
            </div>

            <button
              onClick={handleSaveChanges}
              className="w-full rounded-xl bg-primary px-5 py-3 font-bold text-text-main transition hover:opacity-90"
            >
              Update Intent
            </button>

            <p className="mt-4 text-center text-xs uppercase tracking-widest text-white/40">
              Final pricing may adjust before the aggregation window closes.
            </p>
          </div>
        </aside>
      </main>

      <Footer />
    </div>
  );
}