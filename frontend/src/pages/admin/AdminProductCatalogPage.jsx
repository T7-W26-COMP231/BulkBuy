import { useEffect, useMemo, useState } from "react";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";


const CATEGORY_OPTIONS = [
  "All Products",
  "Produce",
  "Dairy & Eggs",
  "Bakery",
  "Pantry",
];

const PRODUCT_CATEGORY_OPTIONS = [
  "Produce",
  "Dairy & Eggs",
  "Bakery",
  "Pantry",
];

const INITIAL_PRODUCTS = [
  {
    _id: "prod-1",
    name: "Breakfast Essentials Pack",
    image:
      "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
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
        name: "Item 1",
        status: "active",
        unitLabel: "pack",
        salesPrices: [{ price: 12.5, currency: "CAD" }],
        discountScheme: {
          type: "tiered",
          tiers: [
            { minQty: 10, discountPct: 5 },
            { minQty: 50, discountPct: 12 },
            { minQty: 200, discountPct: 20 },
          ],
        },
      },
      {
        itemId: "68000000000000000000102",
        name: "Item 2",
        status: "active",
        unitLabel: "pack",
        salesPrices: [{ price: 13.25, currency: "CAD" }],
        discountScheme: {
          type: "tiered",
          tiers: [
            { minQty: 15, discountPct: 4 },
            { minQty: 60, discountPct: 10 },
            { minQty: 150, discountPct: 18 },
          ],
        },
      },
    ],
  },
  {
    _id: "770000000000000000000002",
    name: "Easter Brunch Bundle",
    image:
      "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=900&q=80",
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
        name: "Item 1",
        status: "active",
        unitLabel: "bundle",
        salesPrices: [{ price: 18.5, currency: "CAD" }],
        discountScheme: {
          type: "tiered",
          tiers: [
            { minQty: 20, discountPct: 6 },
            { minQty: 75, discountPct: 14 },
            { minQty: 180, discountPct: 22 },
          ],
        },
      },
      {
        itemId: "68000000000000000000104",
        name: "Item 2",
        status: "low_stock",
        unitLabel: "bundle",
        salesPrices: [{ price: 19.75, currency: "CAD" }],
        discountScheme: {
          type: "tiered",
          tiers: [
            { minQty: 10, discountPct: 3 },
            { minQty: 40, discountPct: 9 },
            { minQty: 120, discountPct: 16 },
          ],
        },
      },
    ],
  },
  {
    _id: "770000000000000000000003",
    name: "Bakery Favorites Bundle",
    image:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80",
    metadata: {
      category: "Bakery",
      brand: "Golden Crust",
      status: "low_stock",
    },
    descriptions: [
      {
        locale: "en",
        title: "Bakery Favorites Bundle",
        body: "A warm assortment of bakery staples gathered into one easy-to-manage product bundle.",
      },
    ],
    items: [
      {
        itemId: "68000000000000000000105",
        name: "Item 1",
        status: "low_stock",
        unitLabel: "bundle",
        salesPrices: [{ price: 15.75, currency: "CAD" }],
        discountScheme: {
          type: "tiered",
          tiers: [
            { minQty: 12, discountPct: 5 },
            { minQty: 48, discountPct: 11 },
            { minQty: 140, discountPct: 19 },
          ],
        },
      },
    ],
  },
  {
    _id: "770000000000000000000004",
    name: "Family Dinner Essentials",
    image:
      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80",
    metadata: {
      category: "Produce",
      brand: "Harvest Home",
      status: "inactive",
    },
    descriptions: [
      {
        locale: "en",
        title: "Family Dinner Essentials",
        body: "A practical product grouping built around familiar dinner staples for everyday meal prep.",
      },
    ],
    items: [
      {
        itemId: "68000000000000000000106",
        name: "Item 1",
        status: "inactive",
        unitLabel: "box",
        salesPrices: [{ price: 24.0, currency: "CAD" }],
        discountScheme: {
          type: "tiered",
          tiers: [
            { minQty: 8, discountPct: 4 },
            { minQty: 30, discountPct: 10 },
            { minQty: 90, discountPct: 17 },
          ],
        },
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
  if (status === "active") return "bg-green-100 text-green-700";
  if (status === "low_stock") return "bg-yellow-100 text-yellow-700";
  if (status === "inactive") return "bg-gray-100 text-gray-600";
  return "bg-neutral-light text-text-muted";
}

function formatPriceValue(value) {
  if (typeof value !== "number") return "N/A";
  return `$${value.toFixed(2)}`;
}

function getProductBasePrice(product) {
  return product.items?.[0]?.salesPrices?.[0]?.price;
}

function getItemBasePrice(item) {
  return item?.salesPrices?.[0]?.price;
}

function getTierPrice(basePrice, discountPct) {
  if (typeof basePrice !== "number") return null;
  if (typeof discountPct !== "number") return basePrice;
  return basePrice * (1 - discountPct / 100);
}

export default function AdminProductCatalogPage() {
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Products");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftProduct, setDraftProduct] = useState({
    name: "",
    brand: "",
    category: "Produce",
    description: "",
  });

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
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
  }, [products, searchTerm, selectedCategory]);

  useEffect(() => {
    if (!selectedProduct) return;

    const updatedSelectedProduct = products.find(
      (product) => product._id === selectedProduct._id
    );

    if (!updatedSelectedProduct) {
      setSelectedProduct(null);
      setSelectedItem(null);
      setIsDetailsOpen(false);
      setIsEditing(false);
      return;
    }

    setSelectedProduct(updatedSelectedProduct);

    if (selectedItem) {
      const updatedSelectedItem = updatedSelectedProduct.items?.find(
        (item) => item.itemId === selectedItem.itemId
      );
      setSelectedItem(updatedSelectedItem ?? updatedSelectedProduct.items?.[0] ?? null);
    }
  }, [products, selectedProduct, selectedItem]);

  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setSelectedItem(product.items?.[0] ?? null);
    setIsDetailsOpen(true);
    setIsEditing(false);
  };

  const handleCloseDetails = () => {
    setIsDetailsOpen(false);
    setSelectedProduct(null);
    setSelectedItem(null);
    setIsEditing(false);
  };

  const handleStartEditing = () => {
    if (!selectedProduct) return;

    setDraftProduct({
      name: selectedProduct.name ?? "",
      brand: selectedProduct.metadata?.brand ?? "",
      category: selectedProduct.metadata?.category ?? "Produce",
      description: selectedProduct.descriptions?.[0]?.body ?? "",
    });

    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
  };

  const handleSaveEditing = () => {
    if (!selectedProduct) return;

    const updatedProducts = products.map((product) => {
      if (product._id !== selectedProduct._id) return product;

      return {
        ...product,
        name: draftProduct.name,
        metadata: {
          ...product.metadata,
          brand: draftProduct.brand,
          category: draftProduct.category,
        },
        descriptions: [
          {
            ...(product.descriptions?.[0] ?? { locale: "en" }),
            locale: "en",
            title: draftProduct.name,
            body: draftProduct.description,
          },
        ],
      };
    });

    setProducts(updatedProducts);
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-background-light text-text-main">
      <div className="flex min-h-screen">
       <AdminSidebar
  isMobileOpen={isMobileSidebarOpen}
  onClose={() => setIsMobileSidebarOpen(false)}
/>

        <div className="flex min-h-screen flex-1 flex-col">
          <AdminTopbar title="Product Catalog" />

          <main className="flex-1 px-6 py-8 md:px-8 lg:px-10">
            <div className="mx-auto max-w-[1400px]">
              <div className="flex flex-col gap-6 xl:flex-row">
                <section className={`min-w-0 ${isDetailsOpen ? "xl:w-[62%]" : "w-full"}`}>
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
                                const isSelected = selectedProduct?._id === product._id;

                                return (
                                  <tr
                                    key={product._id}
                                    onClick={() => handleSelectProduct(product)}
                                    className={`cursor-pointer transition ${
                                      index !== filteredProducts.length - 1
                                        ? "border-b border-neutral-light"
                                        : ""
                                    } ${isSelected ? "bg-[#F3FBF8]" : "hover:bg-[#F8FBFA]"}`}
                                  >
                                    <td className="px-6 py-5">
                                      <div className="flex items-center gap-4">
                                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#EEF2F6] text-lg">
                                          {product.image ? (
                                            <img
                                              src={product.image}
                                              alt={product.name}
                                              className="h-full w-full object-cover"
                                            />
                                          ) : (
                                            "🛒"
                                          )}
                                        </div>
                                        <div className="font-semibold text-text-main">
                                          {product.name}
                                        </div>
                                      </div>
                                    </td>

                                    <td className="px-6 py-5 text-text-main">{category}</td>

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
                                        {formatPriceValue(getProductBasePrice(product))} /{" "}
                                        {unitLabel}
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
                </section>

                {isDetailsOpen && selectedProduct && (
                  <aside className="min-w-0 xl:w-[38%]">
                    <div className="rounded-2xl bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                          <h2 className="text-2xl font-bold text-text-main">
                            Product Details
                          </h2>

                          <button
                            type="button"
                            onClick={handleCloseDetails}
                            className="text-text-muted transition hover:text-text-main"
                            aria-label="Close product details"
                          >
                            <span className="material-symbols-outlined text-[22px]">
                              close
                            </span>
                          </button>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-neutral-light">
                          <div className="relative h-56 w-full bg-[#EEF2F6]">
                            {selectedProduct.image ? (
                              <img
                                src={selectedProduct.image}
                                alt={selectedProduct.name}
                                className="h-full w-full object-cover"
                              />
                            ) : null}

                            <span className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-500 shadow-sm">
                              {selectedProduct.metadata?.category ?? "Product"}
                            </span>
                          </div>

                          <div className="p-5">
                            {isEditing ? (
                              <div className="space-y-4">
                                <div>
                                  <label className="mb-1 block text-sm font-semibold text-text-main">
                                    Product Name
                                  </label>
                                  <input
                                    type="text"
                                    value={draftProduct.name}
                                    onChange={(e) =>
                                      setDraftProduct((prev) => ({
                                        ...prev,
                                        name: e.target.value,
                                      }))
                                    }
                                    className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary"
                                  />
                                </div>

                                <div>
                                  <label className="mb-1 block text-sm font-semibold text-text-main">
                                    Brand
                                  </label>
                                  <input
                                    type="text"
                                    value={draftProduct.brand}
                                    onChange={(e) =>
                                      setDraftProduct((prev) => ({
                                        ...prev,
                                        brand: e.target.value,
                                      }))
                                    }
                                    className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary"
                                  />
                                </div>

                                <div>
                                  <label className="mb-1 block text-sm font-semibold text-text-main">
                                    Category
                                  </label>
                                  <select
                                    value={draftProduct.category}
                                    onChange={(e) =>
                                      setDraftProduct((prev) => ({
                                        ...prev,
                                        category: e.target.value,
                                      }))
                                    }
                                    className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary"
                                  >
                                    {PRODUCT_CATEGORY_OPTIONS.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="mb-1 block text-sm font-semibold text-text-main">
                                    Description
                                  </label>
                                  <textarea
                                    rows={4}
                                    value={draftProduct.description}
                                    onChange={(e) =>
                                      setDraftProduct((prev) => ({
                                        ...prev,
                                        description: e.target.value,
                                      }))
                                    }
                                    className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary"
                                  />
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <h3 className="text-2xl font-bold text-text-main">
                                      {selectedProduct.name}
                                    </h3>
                                    <p className="mt-1 text-sm text-text-muted">
                                      Brand: {selectedProduct.metadata?.brand ?? "N/A"}
                                    </p>
                                  </div>

                                  <div className="text-right">
                                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-text-muted">
                                      Base Price
                                    </p>
                                    <p className="mt-1 text-2xl font-bold text-text-main">
                                      {formatPriceValue(
                                        getProductBasePrice(selectedProduct)
                                      )}
                                    </p>
                                  </div>
                                </div>

                                <p className="mt-4 text-sm leading-7 text-text-muted">
                                  {selectedProduct.descriptions?.[0]?.body ??
                                    "No description available."}
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-text-muted">
                              Associated Items
                            </h3>
                            <span className="text-xs text-text-muted">
                              {selectedProduct.items?.length ?? 0} item
                              {(selectedProduct.items?.length ?? 0) === 1 ? "" : "s"}
                            </span>
                          </div>

                          <div className="space-y-3">
                            {selectedProduct.items?.map((item) => {
                              const isActive = selectedItem?.itemId === item.itemId;

                              return (
                                <button
                                  key={item.itemId}
                                  type="button"
                                  onClick={() => setSelectedItem(item)}
                                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                                    isActive
                                      ? "border-primary bg-[#F3FBF8]"
                                      : "border-neutral-light bg-white hover:bg-background-light"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <p className="font-semibold text-text-main">
                                        {item.name ?? "Item"}
                                      </p>
                                      <p className="mt-1 text-xs text-text-muted">
                                        ID: {item.itemId}
                                      </p>
                                      <p className="mt-2 text-sm text-text-muted">
                                        {formatPriceValue(getItemBasePrice(item))} /{" "}
                                        {item.unitLabel ?? "unit"}
                                      </p>
                                    </div>

                                    <span
                                      className={`inline-flex rounded-md px-3 py-1 text-xs font-medium ${getStatusClasses(
                                        item.status ?? "active"
                                      )}`}
                                    >
                                      {formatStatus(item.status ?? "active")}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-text-muted">
                              Volume Pricing Tiers
                            </h3>

                            <span className="material-symbols-outlined text-[18px] text-text-muted">
                              info
                            </span>
                          </div>

                          <div className="overflow-hidden rounded-2xl border border-neutral-light">
                            <table className="min-w-full">
                              <thead className="bg-background-light">
                                <tr className="text-left text-sm font-semibold text-text-main">
                                  <th className="px-4 py-4">Min. Quantity</th>
                                  <th className="px-4 py-4">Price per Unit</th>
                                </tr>
                              </thead>

                              <tbody>
                                {selectedItem?.discountScheme?.tiers?.length ? (
                                  selectedItem.discountScheme.tiers.map((tier, index, arr) => {
                                    const tierPrice = getTierPrice(
                                      getItemBasePrice(selectedItem),
                                      tier.discountPct
                                    );

                                    const nextTier = arr[index + 1];
                                    const rangeLabel = nextTier
                                      ? `${tier.minQty} - ${nextTier.minQty - 1} units`
                                      : `${tier.minQty}+ units`;

                                    return (
                                      <tr
                                        key={`${selectedItem.itemId}-${tier.minQty}`}
                                        className={
                                          index !== arr.length - 1
                                            ? "border-b border-neutral-light"
                                            : ""
                                        }
                                      >
                                        <td className="px-4 py-4 text-sm text-text-main">
                                          {rangeLabel}
                                        </td>
                                        <td className="px-4 py-4 text-sm font-semibold text-emerald-500">
                                          {formatPriceValue(tierPrice)}
                                        </td>
                                      </tr>
                                    );
                                  })
                                ) : (
                                  <tr>
                                    <td
                                      colSpan={2}
                                      className="px-4 py-8 text-center text-sm text-text-muted"
                                    >
                                      No pricing tiers available for this item.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={handleCancelEditing}
                                className="rounded-2xl border border-neutral-light bg-white px-4 py-3 text-sm font-semibold text-text-main transition hover:bg-background-light"
                              >
                                Cancel
                              </button>

                              <button
                                type="button"
                                onClick={handleSaveEditing}
                                className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-text-main transition hover:opacity-90"
                              >
                                Save Changes
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={handleStartEditing}
                                className="rounded-2xl border border-neutral-light bg-white px-4 py-3 text-sm font-semibold text-text-main transition hover:bg-background-light"
                              >
                                Edit Product
                              </button>

                              <button
                                type="button"
                                className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-text-main transition hover:opacity-90"
                              >
                                Export Specs
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </aside>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}