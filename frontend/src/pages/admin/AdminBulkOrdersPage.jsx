import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import { useEffect, useMemo, useState } from "react";

export default function AdminBulkOrdersPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [warningAfterDays, setWarningAfterDays] = useState(5);

  const approvedOrders = useMemo(
    () => [
      {
        id: "ORD-1001",
        supplier: "Fresh Farms Supplier",
        region: "Vaughan",
        status: "confirmed",
        lastDeliveryUpdateDays: 2,
      },
      {
        id: "ORD-1002",
        supplier: "Fresh Farms Supplier",
        region: "Vaughan",
        status: "confirmed",
        lastDeliveryUpdateDays: 5,
      },
      {
        id: "ORD-1003",
        supplier: "North Food Wholesale",
        region: "Brampton",
        status: "confirmed",
        lastDeliveryUpdateDays: 7,
      },
    ],
    []
  );

  useEffect(() => {
    const tokenRaw = localStorage.getItem("app_auth_session_v1");
    const session = tokenRaw ? JSON.parse(tokenRaw) : null;
    const accessToken = session?.accessToken;

    if (!accessToken) return;

    fetch(`${import.meta.env.VITE_API_URL}/api/configs/delivery-rules`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        const days = data?.data?.deliveryRules?.warningAfterDays;
        if (typeof days === "number") {
          setWarningAfterDays(days);
        }
      })
      .catch(() => {
        setWarningAfterDays(5);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background-light text-text-main">
      <div className="flex min-h-screen">
        <AdminSidebar
          isMobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex min-h-screen flex-1 flex-col">
          <AdminTopbar
            title="Bulk Orders"
            onMenuClick={() => setSidebarOpen(true)}
          />

          <main className="flex-1 px-6 py-8 md:px-8 lg:px-10">
            <div className="mx-auto max-w-6xl">
              <div className="rounded-2xl border border-neutral-light bg-white p-8 shadow-sm">
                <h1 className="text-3xl font-bold text-text-main">
                  Delivery Monitoring
                </h1>
                <p className="mt-3 text-text-muted">
                  Orders approaching the delivery deadline are highlighted in
                  yellow.
                </p>

                <div className="mt-8 overflow-hidden rounded-xl border border-neutral-light">
                  <table className="min-w-full">
                    <thead className="bg-neutral-100">
                      <tr>
                        <th className="px-4 py-3 text-left">Order</th>
                        <th className="px-4 py-3 text-left">Supplier</th>
                        <th className="px-4 py-3 text-left">Region</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">
                          Days Since Update
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedOrders.map((order) => {
                        const warning =
                          order.lastDeliveryUpdateDays >= warningAfterDays;

                        return (
                          <tr
                            key={order.id}
                            className={
                              warning
                                ? "bg-yellow-100"
                                : "bg-white"
                            }
                          >
                            <td className="px-4 py-3">{order.id}</td>
                            <td className="px-4 py-3">{order.supplier}</td>
                            <td className="px-4 py-3">{order.region}</td>
                            <td className="px-4 py-3">{order.status}</td>
                            <td className="px-4 py-3">
                              {order.lastDeliveryUpdateDays} days
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-sm text-text-muted">
                  Warning threshold: {warningAfterDays} days
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}