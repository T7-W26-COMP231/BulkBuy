import SupplierSidebar from "./SupplierSidebar";
import SupplierTopbar from "./SupplierTopbar";

export default function SupplierLayout({ children }) {
  return (
    <div className="min-h-screen bg-background-light text-text-main">
      <div className="flex min-h-screen">
        <SupplierSidebar />

        <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
          <SupplierTopbar />

          <main className="flex-1 px-4 pb-6 md:px-6 xl:px-8">
            <div className="w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}