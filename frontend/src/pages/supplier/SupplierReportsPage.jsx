import { useEffect, useMemo, useState } from "react";
import SupplierLayout from "../../components/supplier/SupplierLayout";
import api from "../../api/api";



const getStatusClasses = (status) => {
  switch (status) {
    case "Fulfilled":
    case "Delivered":
      return "bg-green-100 text-green-700";

    case "Submitted":
      return "bg-blue-100 text-blue-700";

    case "Draft":
      return "bg-yellow-100 text-yellow-700";

    case "Cancelled":
    case "Declined":
      return "bg-red-100 text-red-700";

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
  const [allReports, setAllReports] = useState([]);
  const [range, setRange] = useState("30");
  const [selectedProduct, setSelectedProduct] = useState("All Items");
  const [selectedStatus, setSelectedStatus] = useState("All Statuses");
  const [loading, setLoading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");
const [downloadError, setDownloadError] = useState("");

  const dateRange = useMemo(() => {
    const end = new Date();
    const start = new Date();

    start.setDate(end.getDate() - Number(range));

    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }, [range]);

  const productOptions = useMemo(() => {
    const unique = [...new Set(allReports.map((report) => report.item))];
    return ["All Items", ...unique];
  }, [allReports]);

  const statusOptions = useMemo(() => {
    const unique = [...new Set(allReports.map((report) => report.status))];
    return ["All Statuses", ...unique];
  }, [allReports]);

  const applyFilters = (sourceReports) => {
    let filtered = [...sourceReports];

    if (selectedProduct !== "All Items") {
      filtered = filtered.filter((report) => report.item === selectedProduct);
    }

    if (selectedStatus !== "All Statuses") {
      filtered = filtered.filter((report) => report.status === selectedStatus);
    }

    setReports(filtered);
  };

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

      const mappedReports = (data?.items || []).map((report) => ({
        id: report._id,
        date: report.createdAt
          ? new Date(Number(report.createdAt)).toLocaleDateString()
          : "N/A",
        item:
          report.items?.[0]?.productTitle ||
          report.items?.[0]?.itemId ||
          "Unknown Item",

        subtitle:
          report.items?.[0]?.ItemSysInfo?.shortDescription ||
          report.items?.[0]?.productTitle ||
          "No description available",

        city: report.city || report.ops_region || "Unknown City",
        quantity: report.items?.reduce(
          (sum, item) => sum + Number(item.quantity || 0),
          0
        ),

        priceTier: (() => {
          const totalQty = report.items?.reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
          );

          if (
            report.items?.[0]?.latestPricingSnapshot?.discountBracket?.final != null
          ) {
            return `Tier ${report.items[0].latestPricingSnapshot.discountBracket.final}`;
          }

          if (totalQty >= 3) return "Tier 3";
          if (totalQty >= 2) return "Tier 2";
          return totalQty > 0 ? "Tier 1" : "N/A";
        })(),

        status: report.status
          ? report.status.charAt(0).toUpperCase() + report.status.slice(1)
          : "Submitted",
      }));

      setAllReports(mappedReports);
      applyFilters(mappedReports);

    } catch (error) {
      console.error("Failed to fetch reports", error);
      setReports([]);
      setAllReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [range]);

  useEffect(() => {
    applyFilters(allReports);
  }, [selectedProduct, selectedStatus]);

  const handleExportCSV = () => {
  if (!reports.length) {
    setDownloadError("No reports available to export.");
    setDownloadMessage("");
    return;
  }

  const headers = [
    "Date",
    "Item",
    "City",
    "Quantity",
    "Price Tier",
    "Status",
  ];

  const rows = reports.map((report) => [
    report.date,
    report.item,
    report.city,
    report.quantity,
    report.priceTier,
    report.status,
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `supplier-order-reports-${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setDownloadMessage("CSV download started successfully.");
  setDownloadError("");
};

 const handleExportPDF = () => {
  if (!reports.length) {
    setDownloadError("No reports available to export.");
    setDownloadMessage("");
    return;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    setDownloadError("Popup blocked. Please allow popups for PDF export.");
    setDownloadMessage("");
    return;
  }

  const rowsHtml = reports
    .map(
      (report) => `
        <tr>
          <td>${report.date}</td>
          <td>${report.item}</td>
          <td>${report.city}</td>
          <td>${report.quantity}</td>
          <td>${report.priceTier}</td>
          <td>${report.status}</td>
        </tr>
      `
    )
    .join("");

  printWindow.document.write(`
    <html>
      <head>
        <title>Supplier Reports PDF</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          h1 { margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td {
            border: 1px solid #ccc;
            padding: 8px;
            text-align: left;
            font-size: 12px;
          }
          th { background: #f5f5f5; }
        </style>
      </head>
      <body>
        <h1>Supplier Order Reports</h1>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Item</th>
              <th>City</th>
              <th>Quantity</th>
              <th>Price Tier</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();

  setDownloadMessage("PDF export opened successfully.");
  setDownloadError("");
};

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
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm text-text-main outline-none focus:border-primary"
              >
                {productOptions.map((product) => (
                  <option key={product} value={product}>
                    {product}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-text-muted">
                Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm text-text-main outline-none focus:border-primary"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
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
            {downloadMessage && (
  <p className="text-sm font-medium text-green-600">
    {downloadMessage}
  </p>
)}

{downloadError && (
  <p className="text-sm font-medium text-red-600">
    {downloadError}
  </p>
)}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleExportCSV}
                className="rounded-xl border border-neutral-light bg-white px-4 py-2 text-sm font-medium text-text-main hover:bg-background-light"
              >
                Export CSV
              </button>

              <button
                type="button"
                onClick={handleExportPDF}
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