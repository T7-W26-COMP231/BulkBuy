import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";

export default function AdminSettingsPage() {
  return (
    <div className="min-h-screen bg-background-light text-text-main">
      <div className="flex min-h-screen">
        <AdminSidebar />

        <div className="flex min-h-screen flex-1 flex-col">
          <AdminTopbar title="Settings" />

          <main className="flex-1 px-6 py-8 md:px-8 lg:px-10">
            <div className="mx-auto max-w-6xl">
              <div className="rounded-2xl border border-neutral-light bg-white p-8 shadow-sm">
                <h1 className="text-3xl font-bold text-text-main">Settings</h1>
                <p className="mt-3 text-text-muted">
                  This admin settings page is connected through routing and can
                  be built out later.
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}