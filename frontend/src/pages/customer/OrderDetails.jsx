import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";

export default function OrderDetailsPage() {
  const order = {
    orderNumber: "BB-8821",
    breadcrumb: "Orders / Toronto Hub History",
    status: "CONFIRMED / PAID",
    statusNote: "Aggregation window closed · Final pricing locked",
    finalPricePerUnit: "$1.10",
    priceComparisonNote: "(-45% vs retail)",
    totalSavings: "$10.80",
    savingsNote: "Credited to Wallet",
    achievement: "Tier 3 Reached",
    achievementNote: "Maximum discount applied",
    product: {
      name: "Premium Organic Avocados (Box of 12)",
      subtitle: "Grown in Mexico · Certified Organic",
      quantity: "12 Units",
      subtotal: "$13.20",
      initialPrice: "$24.00",
      bulkDiscountLabel: "Bulk Discount (Tier 3 Achievement)",
      bulkDiscountValue: "-$10.80",
      serviceFee: "$0.00 (Free for Hub Pickup)",
      totalPaid: "$13.20",
    },
    pickup: {
      title: "Toronto Hub - Liberty Village",
      address: "62 Atlantic Ave, Toronto, ON M6K 1X9",
      pickupDate: "Friday, Oct 27, 2025",
      pickupWindow: "10:00 AM - 6:00 PM",
    },
  };

  return (
    <div className="min-h-screen bg-background-light font-display text-text-main">
      <Navbar showLocation={false} />

      <main className="px-6 py-8 md:px-10 lg:px-16 xl:px-20">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Sidebar showSummary={true} />

          <section className="flex min-w-0 flex-col gap-6">
            {/* Page header */}
            <section className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm text-text-muted">{order.breadcrumb}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
                      Order #{order.orderNumber}
                    </h1>

                    <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                      {order.status}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-text-muted">
                    {order.statusNote}
                  </p>
                </div>

                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-text-main shadow-sm transition hover:opacity-90"
                >
                  Download Invoice
                </button>
              </div>
            </section>

            {/* Summary cards */}
            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <article className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                  Final Price / Unit
                </p>

                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <span className="text-3xl font-bold tracking-tight text-text-main">
                    {order.finalPricePerUnit}
                  </span>
                  <span className="text-sm font-semibold text-primary">
                    {order.priceComparisonNote}
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-light">
                  <div className="h-full w-[76%] rounded-full bg-primary" />
                </div>
              </article>

              <article className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                  Total Savings
                </p>

                <p className="mt-3 text-3xl font-bold tracking-tight text-text-main">
                  {order.totalSavings}
                </p>

                <p className="mt-2 text-sm font-medium text-emerald-600">
                  {order.savingsNote}
                </p>
              </article>

              <article className="rounded-2xl bg-primary p-6 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-main/70">
                  Achievement
                </p>

                <p className="mt-3 text-3xl font-bold tracking-tight text-text-main">
                  {order.achievement}
                </p>

                <p className="mt-2 text-sm font-medium text-text-main/70">
                  {order.achievementNote}
                </p>
              </article>
            </section>

            {/* Main detail area */}
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.65fr_0.95fr]">
              {/* Left side */}
              <div className="flex min-w-0 flex-col gap-6">
                <article className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                  <h2 className="text-2xl font-bold text-text-main">
                    Product Summary
                  </h2>

                  <div className="mt-6 flex flex-col gap-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex min-w-0 gap-4">
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                          <span className="material-symbols-outlined text-[32px]">
                            nutrition
                          </span>
                        </div>

                        <div className="min-w-0">
                          <h3 className="text-lg font-bold leading-snug text-text-main">
                            {order.product.name}
                          </h3>

                          <p className="mt-1 text-sm text-text-muted">
                            {order.product.subtitle}
                          </p>

                          <div className="mt-4">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                              Quantity
                            </p>
                            <p className="mt-1 text-sm font-semibold text-text-main">
                              {order.product.quantity}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="md:text-right">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Subtotal
                        </p>
                        <p className="mt-2 text-3xl font-bold tracking-tight text-text-main">
                          {order.product.subtotal}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-neutral-light pt-5">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="text-text-muted">
                            Initial Estimated Price (Retail)
                          </span>
                          <span className="font-medium text-text-main">
                            {order.product.initialPrice}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="font-semibold text-primary">
                            {order.product.bulkDiscountLabel}
                          </span>
                          <span className="font-bold text-primary">
                            {order.product.bulkDiscountValue}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="text-text-muted">Service Fee</span>
                          <span className="font-medium text-text-main">
                            {order.product.serviceFee}
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-neutral-light pt-4">
                        <span className="text-2xl font-bold text-text-main">
                          Total Paid
                        </span>
                        <span className="text-3xl font-bold tracking-tight text-text-main">
                          {order.product.totalPaid}
                        </span>
                      </div>
                    </div>
                  </div>
                </article>

                <article className="rounded-2xl border border-neutral-light bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <span className="material-symbols-outlined text-[20px]">
                          support_agent
                        </span>
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-text-main">
                          Need help with this order?
                        </h3>
                        <p className="mt-1 text-sm text-text-muted">
                          Our Toronto team is available 24/7 for support.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-xl border border-neutral-light bg-white px-4 py-2 text-sm font-bold text-text-main transition hover:bg-neutral-light/40"
                    >
                      Contact Support
                    </button>
                  </div>
                </article>
              </div>

              {/* Right side */}
              <div className="flex min-w-0 flex-col gap-6">
                <article className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">
                      location_on
                    </span>
                    <h2 className="text-xl font-bold text-text-main">
                      Pick-up details
                    </h2>
                  </div>

                  <div className="mt-4">
                    <h3 className="font-semibold text-text-main">
                      {order.pickup.title}
                    </h3>
                    <p className="mt-1 text-sm text-text-muted">
                      {order.pickup.address}
                    </p>
                  </div>

                  <div className="mt-4 flex h-36 items-center justify-center rounded-2xl bg-neutral-light/60 text-sm font-medium text-text-muted">
                    Map preview
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-[18px] text-text-muted">
                        calendar_today
                      </span>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Pickup Date
                        </p>
                        <p className="mt-1 text-sm font-semibold text-text-main">
                          {order.pickup.pickupDate}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-[18px] text-text-muted">
                        schedule
                      </span>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Pickup Window
                        </p>
                        <p className="mt-1 text-sm font-semibold text-text-main">
                          {order.pickup.pickupWindow}
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-primary/30 bg-white px-4 py-3 text-sm font-bold text-text-main transition hover:bg-primary/5"
                  >
                    View Pickup Instructions
                  </button>
                </article>

                <article className="rounded-2xl bg-[#071a3d] p-6 text-center text-white shadow-sm">
                  <p className="text-sm font-bold">Pickup QR Code</p>

                  <div className="mx-auto mt-5 flex h-32 w-32 items-center justify-center rounded-2xl bg-white text-[#071a3d]">
                    <span className="material-symbols-outlined text-[42px]">
                      qr_code_2
                    </span>
                  </div>

                  <p className="mt-4 text-xs text-white/70">
                    Scan this code at the hub desk to verify your identity.
                  </p>
                </article>
              </div>
            </section>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}