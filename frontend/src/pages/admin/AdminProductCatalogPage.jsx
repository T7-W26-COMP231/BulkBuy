import { useMemo, useState } from "react";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";

const CATEGORY_OPTIONS = [
  "All Products",
  "Produce",
  "Dairy & Eggs",
  "Bakery",
  "Pantry",
];

const MOCK_PRODUCTS = [
  {
    _id: "prod-1",
    name: "Breakfast Essentials Pack",
    metadata: {
      category: "Dairy & Eggs",
      brand: "Morning Basket Co.",
      status: "active",
    },
    descriptions: [
      {
        locale: "en",
        title: "Breakfast Essentials Pack",
        body: "A cozy breakfast bundle featuring staple morning items grouped into one convenient product.",
      },
    ],
    items: [
      {
        itemId: "68000000000000000000101",
        unitLabel: "pack",
        salesPrices: [
          {
            price: 12.5,
            currency: "CAD",
          },
        ],
      },
      {
        itemId: "68000000000000000000102",
        unitLabel: "pack",
        salesPrices: [
          {
            price: 13.25,
            currency: "CAD",
          },
        ],
      },
    ],
  },
  {
    _id: "770000000000000000000002",
    name: "Easter Brunch Bundle",
    metadata: {
      category: "Bakery",
      brand: "Sunny Table Market",
      status: "active",
    },
    descriptions: [
      {
        locale: "en",
        title: "Easter Brunch Bundle",
        body: "A festive brunch-themed product bundle designed for holiday gatherings and seasonal breakfast tables.",
      },
    ],
    items: [
      {
        itemId: "68000000000000000000103",
        unitLabel: "bundle",
        salesPrices: [
          {
            price: 18.5,
            currency: "CAD",
          },
        ],
      },
      {
        itemId: "68000000000000000000104",
        unitLabel: "bundle",
        salesPrices: [
          {
            price: 19.75,
            currency: "CAD",
          },
        ],
      },
    ],
  },

  {
    _id: "770000000000000000000003",
    name: "Bakery Favorites Bundle",
    metadata: {
      category: "Bakery",
      brand: "Golden Crust",
      status: "low_stock",
    },
    descriptions: [
      {
        locale: "en",
        title: "Fresh Sourdough Loaf",
        body: "Artisan sourdough loaf with a crisp crust and soft center.",
      },
    ],
    items: [
      {
        itemId: "68000000000000000000103",
        unitLabel: "unit",
        salesPrices: [
          {
            price: 5.75,
            currency: "CAD",
          },
        ],
      },
    ],
  },
  {
    _id: "770000000000000000000004",
    name: "Family Dinner Essentials",
    metadata: {
      category: "Produce",
      brand: "Sweet Batch",
      status: "inactive",
    },
    descriptions: [
      {
        locale: "en",
        title: "Chocolate Chip Bulk Box",
        body: "Bulk pack of chocolate chip treats for large orders.",
      },
    ],
    items: [
      {
        itemId: "68000000000000000000104",
        unitLabel: "box",
        salesPrices: [
          {
            price: 24.0,
            currency: "CAD",
          },
        ],
      },
    ],
  },
];

function formatStatus(status) {
  if (status === "active") return "In Stock";
  if (status === "low_stock") return "Low Stock";
  if (status === "inactive") return "Inactive";
  return "Unknown";
}

function getStatusClasses(status) {
  if (status === "active") {
    return "bg-green-100 text-green-700";
  }
  if (status === "low_stock") {
    return "bg-yellow-100 text-yellow-700";
  }
  if (status === "inactive") {
    return "bg-gray-100 text-gray-600";
  }
  return "bg-neutral-light text-text-muted";
}

function formatPrice(product) {
  const firstItem = product.items?.[0];
  const firstPrice = firstItem?.salesPrices?.[0]?.price;

  if (typeof firstPrice !== "number") return "N/A";

  return `$${firstPrice.toFixed(2)}`;
}

export default function AdminProductCatalogPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Products");

  const filteredProducts = useMemo(() => {
    return MOCK_PRODUCTS.filter((product) => {
      const productCategory = product.metadata?.category ?? "";
      const productName = product.name ?? "";

      const matchesSearch = productName
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

      const matchesCategory =
        selectedCategory === "All Products" ||
        productCategory === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

  return (
    <div className="min-h-screen bg-background-light text-text-main">
      <div className="flex min-h-screen">
        <AdminSidebar />

        <div className="flex min-h-screen flex-1 flex-col">
          <AdminTopbar title="Product Catalog" />

          <main className="flex-1 px-6 py-8 md:px-8 lg:px-10">
            <div className="mx-auto max-w-7xl">
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <h1 className="text-3xl font-bold text-text-main">
                      Product Catalog
                    </h1>

                    <div className="relative w-full lg:max-w-sm">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
                        search
                      </span>
                      <input
                        type="text"
                        placeholder="Search catalog..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-2xl border border-neutral-light bg-background-light py-3 pl-12 pr-4 text-sm outline-none transition focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {CATEGORY_OPTIONS.map((category) => {
                      const isActive = selectedCategory === category;

                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setSelectedCategory(category)}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                            isActive
                              ? "bg-primary text-text-main"
                              : "bg-[#EEF2F6] text-text-muted hover:bg-neutral-light"
                          }`}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-neutral-light">
                    <table className="min-w-full">
                      <thead className="bg-white">
                        <tr className="border-b border-neutral-light text-left text-xs font-bold uppercase tracking-[0.18em] text-text-muted">
                          <th className="px-6 py-5">Name</th>
                          <th className="px-6 py-5">Category</th>
                          <th className="px-6 py-5">Status</th>
                          <th className="px-6 py-5">Base Price</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredProducts.length > 0 ? (
                          filteredProducts.map((product, index) => {
                            const status = product.metadata?.status ?? "unknown";
                            const category = product.metadata?.category ?? "Uncategorized";
                            const unitLabel = product.items?.[0]?.unitLabel ?? "unit";

                            return (
                              <tr
                                key={product._id}
                                className={`${
                                  index !== filteredProducts.length - 1
                                    ? "border-b border-neutral-light"
                                    : ""
                                } hover:bg-[#F8FBFA]`}
                              >
                                <td className="px-6 py-5">
                                  <div className="flex items-center gap-4">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EEF2F6] text-lg">
                                      🛒
                                    </div>
                                    <div className="font-semibold text-text-main">
                                      {product.name}
                                    </div>
                                  </div>
                                </td>

                                <td className="px-6 py-5 text-text-main">
                                  {category}
                                </td>

                                <td className="px-6 py-5">
                                  <span
                                    className={`inline-flex rounded-md px-3 py-1 text-sm font-medium ${getStatusClasses(
                                      status
                                    )}`}
                                  >
                                    {formatStatus(status)}
                                  </span>
                                </td>

                                <td className="px-6 py-5 text-text-main">
                                  <div className="font-medium">
                                    {formatPrice(product)} / {unitLabel}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-6 py-10 text-center text-sm text-text-muted"
                            >
                              No matching products found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-sm text-text-muted">
                    Showing {filteredProducts.length} product
                    {filteredProducts.length === 1 ? "" : "s"}.
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}