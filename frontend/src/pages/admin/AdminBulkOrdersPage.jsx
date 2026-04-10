import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import { useState } from "react";



export default function AdminBulkOrdersPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background-light text-text-main">
      <div className="flex min-h-screen">
        <AdminSidebar isMobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />


        <div className="flex min-h-screen flex-1 flex-col">
          <AdminTopbar title="Bulk Orders" onMenuClick={() => setSidebarOpen(true)} />

          <main className="flex-1 px-6 py-8 md:px-8 lg:px-10">
            <div className="mx-auto max-w-6xl">
              <div className="rounded-2xl border border-neutral-light bg-white p-8 shadow-sm">
                <h1 className="text-3xl font-bold text-text-main">
                  Bulk Orders
                </h1>
                <p className="mt-3 text-text-muted">
                  This admin bulk orders page is connected through routing and
                  can be built out later.
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}