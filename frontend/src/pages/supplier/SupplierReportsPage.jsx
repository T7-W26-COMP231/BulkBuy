import { useEffect, useMemo, useState } from "react";
import SupplierLayout from "../../components/supplier/SupplierLayout";
import api from "../../api/api";



const getStatusClasses = (status) => {
  switch (status) {
    case "Delivered":
      return "bg-green-100 text-green-700";
    case "In Transit":
      return "bg-blue-100 text-blue-700";
    case "Pending Review":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-neutral-light text-text-muted";
  }
};

const getTierClasses = (tier) => {
  switch (tier) {
    case "Tier 1":
      return "bg-orange-100 text-orange-700";
    case "Tier 2":
      return "bg-blue-100 text-blue-700";
    case "Tier 3":
      return "bg-purple-100 text-purple-700";
    default:
      return "bg-neutral-light text-text-muted";
  }
};
export default function SupplierReportsPage() {
  const [reports, setReports] = useState([]);
  const [range, setRange] = useState("30");
  const [loading, setLoading] = useState(false);

  const dateRange = useMemo(() => {
    const end = new Date();
    const start = new Date();

    start.setDate(end.getDate() - Number(range));

    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }, [range]);

  const fetchReports = async () => {
    try {
      setLoading(true);

      const sessionRaw = localStorage.getItem("app_auth_session_v1");
      const session = sessionRaw ? JSON.parse(sessionRaw) : null;
      const supplierId = session?.user?._id;

      const { data } = await api.get("/orders/supplier-reports", {
        params: {
          supplierId,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          page: 1,
          limit: 50,
        },
      });

      setReports(
        (data?.items || []).map((report) => ({
          id: report._id,
          date: report.createdAt
            ? new Date(Number(report.createdAt)).toLocaleDateString()
            : "N/A",
          item:
            report.items?.[0]?.ItemSysInfo?.title ||
            report.items?.[0]?.productId ||
            "Unknown Item",
          subtitle:
            report.items?.[0]?.ItemSysInfo?.shortDescription ||
            "Bulk order item",
          city: report.ops_region || "Unknown City",
          quantity: report.items?.reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
          ),
          priceTier:
            report.items?.[0]?.latestPricingSnapshot?.discountBracket?.final != null
              ? `Tier ${report.items[0].latestPricingSnapshot.discountBracket.final}`
              : "Tier 1",
          status: report.status
            ? report.status.charAt(0).toUpperCase() + report.status.slice(1)
            : "Submitted",
        }))
      );
    } catch (error) {
      console.error("Failed to fetch reports", error);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [range]);
  return (
    <SupplierLayout>
      <div className="flex flex-col gap-6">
        <section className="rounded-3xl bg-gradient-to-r from-[#071d1b] to-[#0e3b3d] px-8 py-10 text-white shadow-sm">
          <h1 className="text-3xl font-bold">Performance &amp; Order Reports</h1>
          <p className="mt-3 max-w-3xl text-sm text-white/80 md:text-base">
            Generate historical reports filtered by item, city, and date range.
            Monitor supply chain efficiency and product movement.
          </p>
        </section>

        <section className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-text-muted">
                Date Range
              </label>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value)}
                className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm text-text-main outline-none focus:border-primary"
              >
                <option value="30">Last 30 Days</option>
                <option value="7">Last 7 Days</option>
                <option value="90">Last 90 Days</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-text-muted">
                Product Item
              </label>
              <select className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm text-text-main outline-none focus:border-primary">
                <option>All Items</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-text-muted">
                City
              </label>
              <select className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm text-text-main outline-none focus:border-primary">
                <option>All Cities</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={fetchReports}
                className="w-full rounded-xl bg-primary px-5 py-3 font-semibold text-text-main transition hover:opacity-90"
              >
                {loading ? "Loading..." : "Generate Report"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-light bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-neutral-light bg-background-light text-left text-xs font-bold uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Item</th>
                  <th className="px-6 py-4">City</th>
                  <th className="px-6 py-4">Quantity</th>
                  <th className="px-6 py-4">Price Tier</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>

              <tbody>
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-10 text-center text-text-muted">
                      No reports found for selected date range
                    </td>
                  </tr>
                ) : (
                  reports.map((report) => (
                    <tr
                      key={report.id}
                      className="border-b border-neutral-light last:border-b-0"
                    >
                      <td className="px-6 py-5 text-text-muted">
                        {report.date}
                      </td>

                      <td className="px-6 py-5">
                        <div className="font-semibold text-text-main">
                          {report.item}
                        </div>
                        <div className="text-xs text-text-muted">
                          {report.subtitle}
                        </div>
                      </td>

                      <td className="px-6 py-5 text-text-main">
                        {report.city}
                      </td>

                      <td className="px-6 py-5">
                        <span className="font-bold text-text-main">
                          {report.quantity}
                        </span>
                        <span className="ml-1 text-xs text-text-muted">Units</span>
                      </td>

                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getTierClasses(
                            report.priceTier
                          )}`}
                        >
                          {report.priceTier}
                        </span>
                      </td>

                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                            report.status
                          )}`}
                        >
                          {report.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-4 border-t border-neutral-light px-6 py-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-text-muted">
              Showing {reports.length} report results
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-neutral-light bg-white px-4 py-2 text-sm font-medium text-text-main hover:bg-background-light"
              >
                Export CSV
              </button>
              <button
                type="button"
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-text-main hover:opacity-90"
              >
                Export PDF
              </button>
            </div>
          </div>
        </section>
      </div>
    </SupplierLayout>
  );
}