import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";



function formatStatus(status) {
  if (status === "active") return "In Stock";
  if (status === "low_stock") return "Low Stock";
  if (status === "inactive") return "Inactive";
  if (status === "draft") return "Draft";
  if (status === "suspended") return "Suspended";
  return "Unknown";
}

function getStatusClasses(status) {
  if (status === "active") return "bg-green-100 text-green-700";
  if (status === "low_stock") return "bg-yellow-100 text-yellow-700";
  if (status === "inactive") return "bg-gray-100 text-gray-600";
  if (status === "draft") return "bg-neutral-light text-text-muted";
  if (status === "suspended") return "bg-red-100 text-red-700";
  return "bg-neutral-light text-text-muted";
}

function formatPriceValue(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return `$${value.toFixed(2)}`;
}

function getProductBasePrice(product) {
  if (!product) return null;

  const firstItemPrice = product.items?.[0]?.salesPrices?.[0]?.price;
  if (typeof firstItemPrice === "number") return firstItemPrice;

  const metadataSale = product.metadata?.price?.[0]?.sale;
  if (typeof metadataSale === "number") return metadataSale;

  const metadataList = product.metadata?.price?.[0]?.list;
  if (typeof metadataList === "number") return metadataList;

  return null;
}

function getItemBasePrice(item) {
  if (!item) return null;

  const sale = item.price?.[0]?.sale;
  if (typeof sale === "number") return sale;

  const list = item.price?.[0]?.list;
  if (typeof list === "number") return list;

  const salesPrice = item.salesPrices?.[0]?.price;
  if (typeof salesPrice === "number") return salesPrice;

  return null;
}

function normalizeCategoryLabel(value) {
  if (!value || typeof value !== "string") return "Uncategorized";

  const normalized = value.toLowerCase().trim();

  if (
    normalized.includes("produce") ||
    normalized.includes("fruit") ||
    normalized.includes("vegetable")
  ) {
    return "Produce";
  }

  if (
    normalized.includes("dairy") ||
    normalized.includes("egg") ||
    normalized.includes("milk") ||
    normalized.includes("cheese")
  ) {
    return "Dairy & Eggs";
  }

  if (
    normalized.includes("bakery") ||
    normalized.includes("bread") ||
    normalized.includes("bun") ||
    normalized.includes("cake") ||
    normalized.includes("pastry")
  ) {
    return "Bakery";
  }

  if (
    normalized.includes("pantry") ||
    normalized.includes("grocery") ||
    normalized.includes("foodservice") ||
    normalized.includes("cutlery") ||
    normalized.includes("supplies") ||
    normalized.includes("packaging") ||
    normalized.includes("retail") ||
    normalized.includes("product")
  ) {
    return "Pantry";
  }

  return "Uncategorized";
}

function getProductCategory(raw) {
  if (typeof raw?.metadata?.category === "string" && raw.metadata.category.trim()) {
    return normalizeCategoryLabel(raw.metadata.category);
  }

  if (Array.isArray(raw?.metadata?.tags) && raw.metadata.tags.length > 0) {
    const matchingTag = raw.metadata.tags.find(
      (tag) => typeof tag === "string" && tag.trim()
    );
    if (matchingTag) return normalizeCategoryLabel(matchingTag);
  }

  if (typeof raw?.name === "string" && raw.name.trim()) {
    return normalizeCategoryLabel(raw.name);
  }

  if (typeof raw?.descriptions?.[0]?.title === "string") {
    return normalizeCategoryLabel(raw.descriptions[0].title);
  }

  if (typeof raw?.descriptions?.[0]?.body === "string") {
    return normalizeCategoryLabel(raw.descriptions[0].body);
  }

  return "Uncategorized";
}

export default function AdminProductCatalogPage() {
  const [selectedItemDetails, setSelectedItemDetails] = useState(null);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Products");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [detailsView, setDetailsView] = useState("product");
  const [itemLoading, setItemLoading] = useState(false);
  const [draftProduct, setDraftProduct] = useState({
    name: "",
    brand: "",
    category: "",
    description: "",
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);


  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const productCategory = product.metadata?.category ?? "";
      const productName = product.name ?? "";
      const productDescription = product.descriptions?.[0]?.body ?? "";

      const matchesSearch =
        productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        productDescription.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory =
        selectedCategory === "All Products" ||
        productCategory === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const fetchItemDetails = async (itemId) => {
    try {
      setItemLoading(true);

      const response = await api.get(`/items/${itemId}`);
      const fullItem = response.data?.data ?? null;

      setSelectedItemDetails(fullItem);
    } catch (err) {
      console.error("Failed to fetch item details:", err);
      setSelectedItemDetails(null);
    } finally {
      setItemLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(1, false);
  }, []);

  useEffect(() => {
    if (!selectedProduct) return;

    const updatedSelectedProduct = products.find(
      (product) => product._id === selectedProduct._id
    );

    if (!updatedSelectedProduct) {
      setSelectedProduct(null);
      setSelectedItem(null);
      setSelectedItemDetails(null);
      setIsDetailsOpen(false);
      setIsEditing(false);
      setDetailsView("product");
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

  async function fetchProducts(nextPage = 1, append = false) {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      setError("");

      const response = await api.get("/prdts", {
        params: {
          page: nextPage,
          limit: 25,
        },
      });

      const payload = response.data;
      const incoming = Array.isArray(payload?.items) ? payload.items : [];
      const normalized = incoming.map(normalizeProduct);

      setProducts((prev) => (append ? [...prev, ...normalized] : normalized));
      setPage(payload?.page ?? nextPage);
      setPages(payload?.pages ?? 1);
    } catch (err) {
      console.error("Failed to load products:", err);
      setError(err.response?.data?.message || "Failed to load product catalog.");
      if (!append) {
        setProducts([]);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  const handleLoadMore = () => {
    if (page < pages && !loadingMore) {
      fetchProducts(page + 1, true);
    }
  };

  const handleSelectProduct = async (product) => {
    const firstItem = product.items?.[0] ?? null;

    setSelectedProduct(product);
    setSelectedItem(firstItem);
    setSelectedItemDetails(null);
    setDetailsView("product");
    setIsDetailsOpen(true);
    setIsEditing(false);

    if (firstItem?.itemId) {
      await fetchItemDetails(firstItem.itemId);
    }
  };

  const handleSelectItem = async (item) => {
    setSelectedItem(item);
    setSelectedItemDetails(null);
    setDetailsView("item");
    setIsEditing(false);

    if (item?.itemId) {
      await fetchItemDetails(item.itemId);
    }
  };

  const handleCloseDetails = () => {
    setIsDetailsOpen(false);
    setSelectedProduct(null);
    setSelectedItem(null);
    setSelectedItemDetails(null);
    setIsEditing(false);
    setDetailsView("product");
  };

  const handleStartEditing = () => {
    if (!selectedProduct) return;

    setDraftProduct({
      name: selectedProduct.name ?? "",
      brand: selectedProduct.metadata?.brand ?? "",
      category: selectedProduct.metadata?.category ?? "",
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
          category: draftProduct.category || "Uncategorized",
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

  const activeItem = selectedItemDetails || selectedItem;

  const activeDetails =
    detailsView === "item" && activeItem
      ? {
        title: activeItem.title ?? activeItem.name ?? "Item",
        subtitle: `SKU: ${activeItem.sku ?? activeItem.itemId ?? "N/A"}`,
        price: getItemBasePrice(activeItem),
        description:
          activeItem.shortDescription ??
          activeItem.description ??
          "No item description available.",
        category: selectedProduct?.metadata?.category ?? "Associated Item",
        image:
          activeItem.image ??
          activeItem.images?.[0] ??
          selectedProduct?.image ??
          selectedProduct?.metadata?.images?.[0] ??
          null,
        badge: "Item Details",
      }
      : {
        title: selectedProduct?.name ?? "Product",
        subtitle: `Brand: ${selectedProduct?.metadata?.brand ?? "N/A"}`,
        price: getProductBasePrice(selectedProduct),
        description:
          selectedProduct?.descriptions?.[0]?.body ??
          "No description available.",
        category: selectedProduct?.metadata?.category ?? "Product",
        image:
          selectedProduct?.image ??
          selectedProduct?.metadata?.images?.[0] ??
          null,
        badge: "Product Details",
      };

  const tierRows = Array.isArray(selectedItemDetails?.pricingTiers)
    ? selectedItemDetails.pricingTiers
    : [];

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
                              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${isActive
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
                            {loading ? (
                              <tr>
                                <td
                                  colSpan={4}
                                  className="px-6 py-10 text-center text-sm text-text-muted"
                                >
                                  Loading products...
                                </td>
                              </tr>
                            ) : error ? (
                              <tr>
                                <td
                                  colSpan={4}
                                  className="px-6 py-10 text-center text-sm text-red-500"
                                >
                                  {error}
                                </td>
                              </tr>
                            ) : filteredProducts.length > 0 ? (
                              filteredProducts.map((product, index) => {
                                const status = product.metadata?.status ?? "unknown";
                                const category = product.metadata?.category ?? "Uncategorized";
                                const unitLabel = product.items?.[0]?.unitLabel ?? "unit";
                                const isSelected = selectedProduct?._id === product._id;

                                return (
                                  <tr
                                    key={product._id}
                                    onClick={() => handleSelectProduct(product)}
                                    className={`cursor-pointer transition ${index !== filteredProducts.length - 1
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
                                        {formatPriceValue(getProductBasePrice(product))} / {unitLabel}
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

                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm text-text-muted">
                          Showing {filteredProducts.length} product
                          {filteredProducts.length === 1 ? "" : "s"}.
                        </p>

                        {page < pages && (
                          <button
                            type="button"
                            onClick={handleLoadMore}
                            disabled={loadingMore}
                            className="rounded-2xl border border-neutral-light bg-white px-4 py-2 text-sm font-semibold text-text-main transition hover:bg-background-light disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {loadingMore ? "Loading..." : "Load More"}
                          </button>
                        )}
                      </div>
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
                            {activeDetails.image ? (
                              <img
                                src={activeDetails.image}
                                alt={activeDetails.title}
                                className="h-full w-full object-cover"
                              />
                            ) : null}

                            <span className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-500 shadow-sm">
                              {activeDetails.category}
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
                                  <input
                                    type="text"
                                    value={draftProduct.category}
                                    onChange={(e) =>
                                      setDraftProduct((prev) => ({
                                        ...prev,
                                        category: e.target.value,
                                      }))
                                    }
                                    className="w-full rounded-xl border border-neutral-light bg-background-light px-4 py-3 text-sm outline-none focus:border-primary"
                                  />
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
                                    <div className="mb-2">
                                      <span className="rounded-full bg-[#EEF2F6] px-3 py-1 text-xs font-semibold text-text-muted">
                                        {activeDetails.badge}
                                      </span>
                                    </div>

                                    <h3 className="text-2xl font-bold text-text-main">
                                      {activeDetails.title}
                                    </h3>
                                    <p className="mt-1 text-sm text-text-muted">
                                      {activeDetails.subtitle}
                                    </p>
                                  </div>

                                  <div className="text-right">
                                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-text-muted">
                                      Base Price
                                    </p>
                                    <p className="mt-1 text-2xl font-bold text-text-main">
                                      {itemLoading && detailsView === "item"
                                        ? "Loading..."
                                        : formatPriceValue(activeDetails.price)}
                                    </p>
                                  </div>
                                </div>

                                <p className="mt-4 text-sm leading-7 text-text-muted">
                                  {itemLoading && detailsView === "item"
                                    ? "Loading item details..."
                                    : activeDetails.description}
                                </p>

                                {detailsView === "item" && selectedItemDetails?.inventory && (
                                  <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-background-light p-4">
                                    <div>
                                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
                                        Stock
                                      </p>
                                      <p className="mt-1 text-sm font-semibold text-text-main">
                                        {selectedItemDetails.inventory.stock ?? 0}
                                      </p>
                                    </div>

                                    <div>
                                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
                                        Reserved
                                      </p>
                                      <p className="mt-1 text-sm font-semibold text-text-main">
                                        {selectedItemDetails.inventory.reserved ?? 0}
                                      </p>
                                    </div>
                                  </div>
                                )}
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
                                  onClick={() => handleSelectItem(item)}
                                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${isActive
                                    ? "border-primary bg-[#F3FBF8]"
                                    : "border-neutral-light bg-white hover:bg-background-light"
                                    }`}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <p className="font-semibold text-text-main">
                                        {item.name ?? item.itemId}
                                      </p>
                                      <p className="mt-1 text-xs text-text-muted">
                                        ID: {item.itemId}
                                      </p>
                                      <p className="mt-2 text-sm text-text-muted">
                                        {formatPriceValue(getItemBasePrice(item))} / {item.unitLabel ?? "unit"}
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
                                {tierRows.length ? (
                                  tierRows.map((tier, index, arr) => {
                                    const nextTier = arr[index + 1];
                                    const rangeLabel = nextTier
                                      ? `${tier.minQty} - ${nextTier.minQty - 1} units`
                                      : `${tier.minQty}+ units`;

                                    return (
                                      <tr
                                        key={`${selectedItemDetails?._id ?? "item"}-${tier.minQty}`}
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
                                          {formatPriceValue(tier.price)}
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