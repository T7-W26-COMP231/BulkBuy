import SupplierLayout from "../../components/supplier/SupplierLayout";

export default function SupplierQuotesPage() {
  return (
    <SupplierLayout>
      <div className="rounded-2xl border border-neutral-light bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-text-main">Supplier Quotes</h1>
        <p className="mt-3 text-text-muted">
          This page is connected through routing and can be built out later.
        </p>
      </div>
    </SupplierLayout>
  );
}