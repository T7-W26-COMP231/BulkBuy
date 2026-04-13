import SupplierLayout from "../../components/supplier/SupplierLayout";

export default function SupplierRequestItemPage() {
  return (
    <SupplierLayout>
      <div className="space-y-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-text-main">
            Request New Item
          </h1>
          <p className="mt-2 text-text-muted">
            Submit a request for a new item to be reviewed by administrators.
          </p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <form className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-text-main">
                Item Name
              </label>
              <input
                type="text"
                placeholder="Enter requested item name"
                className="w-full rounded-2xl border border-neutral-light px-4 py-3 outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-text-main">
                Category
              </label>
              <input
                type="text"
                placeholder="Enter category"
                className="w-full rounded-2xl border border-neutral-light px-4 py-3 outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-text-main">
                Reason
              </label>
              <textarea
                rows="4"
                placeholder="Explain why this item should be approved"
                className="w-full rounded-2xl border border-neutral-light px-4 py-3 outline-none focus:border-primary"
              />
            </div>

            <button
              type="submit"
              className="rounded-2xl bg-primary px-6 py-3 font-semibold text-text-main transition hover:opacity-90"
            >
              Submit Request
            </button>
          </form>
        </div>
      </div>
    </SupplierLayout>
  );
}