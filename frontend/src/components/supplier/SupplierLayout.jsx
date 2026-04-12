import SupplierSidebar from "./SupplierSidebar";
import SupplierTopbar from "./SupplierTopbar";

export default function SupplierLayout({ children }) {
  return (
    <div className="min-h-screen bg-background-light text-text-main">
      <div className="flex min-h-screen">
        <SupplierSidebar />

        <div className="flex min-h-screen flex-1 flex-col">
          <SupplierTopbar />

          <main className="flex-1 px-6 pb-8 md:px-8">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}