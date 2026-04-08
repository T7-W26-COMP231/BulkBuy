import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import ProductDetailsPanel from "../../pages/admin/ProductDetailsPanel";

const CATEGORY_OPTIONS = [
  "All Products", "Produce", "Dairy & Eggs", "Bakery", "Pantry", "Uncategorized",
];

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-primary/30 text-text-main rounded px-0.5">{part}</mark>
      : part
  );
}

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

function normalizeCategoryLabel(value) {
  if (!value || typeof value !== "string") return "Uncategorized";
  const n = value.toLowerCase().trim();
  if (n.includes("produce") || n.includes("fruit") || n.includes("vegetable")) return "Produce";
  if (n.includes("dairy") || n.includes("egg") || n.includes("milk") || n.includes("cheese")) return "Dairy & Eggs";
  if (n.includes("bakery") || n.includes("bread") || n.includes("bun") || n.includes("cake") || n.includes("pastry")) return "Bakery";
  if (n.includes("pantry") || n.includes("grocery") || n.includes("foodservice") || n.includes("cutlery") || n.includes("supplies") || n.includes("packaging") || n.includes("retail") || n.includes("product")) return "Pantry";
  return "Uncategorized";
}

function getProductCategory(raw) {
  if (typeof raw?.metadata?.category === "string" && raw.metadata.category.trim())
    return normalizeCategoryLabel(raw.metadata.category);
  if (Array.isArray(raw?.metadata?.tags) && raw.metadata.tags.length > 0) {
    const tag = raw.metadata.tags.find((t) => typeof t === "string" && t.trim());
    if (tag) return normalizeCategoryLabel(tag);
  }
  if (typeof raw?.name === "string" && raw.name.trim()) return normalizeCategoryLabel(raw.name);
  if (typeof raw?.descriptions?.[0]?.title === "string") return normalizeCategoryLabel(raw.descriptions[0].title);
  if (typeof raw?.descriptions?.[0]?.body === "string") return normalizeCategoryLabel(raw.descriptions[0].body);
  return "Uncategorized";
}

function normalizeProduct(raw) {
  const metadataImages = Array.isArray(raw?.metadata?.images) ? raw.metadata.images : [];
  const normalizedItems = Array.isArray(raw?.items)
    ? raw.items.map((item) => ({
      itemId: item.itemId,
      name: item.name ?? null,
      status: item.status ?? raw.status ?? "active",
      unitLabel: item.unitLabel ?? "unit",
      salesPrices: Array.isArray(item.salesPrices) ? item.salesPrices : [],
    }))
    : [];
  return {
    _id: raw?._id,
    name: raw?.name ?? "Unnamed Product",
    image: raw?.image ?? metadataImages[0] ?? null,
    metadata: {
      category: getProductCategory(raw),
      brand: raw?.metadata?.brand ?? "N/A",
      status: raw?.status ?? "unknown",
      sku: raw?.metadata?.sku ?? null,
      images: metadataImages,
      price: Array.isArray(raw?.metadata?.price) ? raw.metadata.price : [],
      tags: Array.isArray(raw?.metadata?.tags) ? raw.metadata.tags : [],
    },
    descriptions: Array.isArray(raw?.descriptions) ? raw.descriptions : [],
    items: normalizedItems,
    discountScheme: raw?.discountScheme ?? null,
    salesWindow: raw?.salesWindow ?? { fromEpoch: null, toEpoch: null },  // ✅ add
    ops_region: raw?.ops_region ?? "",                                      // ✅ add
    status: raw?.status ?? "unknown",
  };
}

export default function AdminProductCatalogPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Products");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState(""); // add this


  // panel state
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedItemDetails, setSelectedItemDetails] = useState(null);
  const [detailsView, setDetailsView] = useState("product");
  const [itemLoading, setItemLoading] = useState(false);
  const [productError, setProductError] = useState(false);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        (product.name ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.descriptions?.[0]?.body ?? "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory =
        selectedCategory === "All Products" ||
        (product.metadata?.category ?? "") === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  useEffect(() => {
    fetchProducts(1, false);
  }, [debouncedSearch]);

  // keep selectedProduct in sync when products list refreshes
  useEffect(() => {
    if (!selectedProduct) return;
    const updated = products.find((p) => p._id === selectedProduct._id);
    if (!updated) {
      setSelectedProduct(null); setSelectedItem(null);
      setSelectedItemDetails(null); setIsDetailsOpen(false); setDetailsView("product");
      return;
    }
    setSelectedProduct(updated);
    if (selectedItem) {
      const updatedItem = updated.items?.find((i) => i.itemId === selectedItem.itemId);
      setSelectedItem(updatedItem ?? updated.items?.[0] ?? null);
    }
  }, [products]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  async function fetchProducts(nextPage = 1, append = false) {
    try {
      append ? setLoadingMore(true) : setLoading(true);
      setError("");
      const response = await api.get("/prdts", { params: { page: nextPage, limit: 25, ...(debouncedSearch ? { q: debouncedSearch } : {}) } });
      const payload = response.data;
      const normalized = (Array.isArray(payload?.items) ? payload.items : []).map(normalizeProduct);
      setProducts((prev) => append ? [...prev, ...normalized] : normalized);
      setPage(payload?.page ?? nextPage);
      setPages(payload?.pages ?? 1);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load product catalog.");
      if (!append) setProducts([]);
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }

  const fetchItemDetails = async (itemId) => {
    try {
      setItemLoading(true);
      const response = await api.get(`/items/${itemId}`);
      setSelectedItemDetails(response.data?.data ?? null);
    } catch {
      setSelectedItemDetails(null);
    } finally {
      setItemLoading(false);
    }
  };

  const handleSelectProduct = async (product) => {
    setProductError(false);


    try {
      // verify product still exists on backend
      await api.get(`/prdts/${product._id}`);
    } catch (err) {
      setProductError(true);
      setIsDetailsOpen(true);
      setSelectedProduct(product);
      return;
    }


    const firstItem = product.items?.[0] ?? null;
    setSelectedProduct(product);
    setSelectedItem(firstItem);
    setSelectedItemDetails(null);
    setDetailsView("product");
    setIsDetailsOpen(true);
    if (firstItem?.itemId) await fetchItemDetails(firstItem.itemId);
  };

  const handleSelectItem = async (item) => {
    setSelectedItem(item);
    setSelectedItemDetails(null);
    setDetailsView("item");
    if (item?.itemId) await fetchItemDetails(item.itemId);
  };

  const handleCloseDetails = () => {
    setIsDetailsOpen(false);
    setSelectedProduct(null); setSelectedItem(null);
    setSelectedItemDetails(null); setDetailsView("product");
    setProductError(false); // add this

  };

  const handleProductUpdated = (updatedFromBackend, fallbackPayload) => {
    const normalized = updatedFromBackend
      ? normalizeProduct(updatedFromBackend)
      : normalizeProduct({
        ...selectedProduct,
        name: fallbackPayload.name,
        status: fallbackPayload.status,
        ops_region: fallbackPayload.ops_region,
        salesWindow: fallbackPayload.salesWindow,
        discountScheme: fallbackPayload.discountScheme,
        metadata: fallbackPayload.metadata,
        descriptions: fallbackPayload.descriptions,
      });
    setProducts((prev) => prev.map((p) => p._id === selectedProduct._id ? normalized : p));
    setSelectedProduct(normalized);
  };

  return (
    <div className="min-h-screen bg-background-light text-text-main">
      <div className="flex min-h-screen">
        <AdminSidebar isMobileOpen={isMobileSidebarOpen} onClose={() => setIsMobileSidebarOpen(false)} />

        <div className="flex min-h-screen flex-1 flex-col">
          <AdminTopbar title="Product Catalog" />

          <main className="flex-1 px-6 py-8 md:px-8 lg:px-10">
            <div className="mx-auto max-w-[1400px]">
              <div className="flex flex-col gap-6 xl:flex-row">

                {/* Product table */}
                <section className={`min-w-0 ${isDetailsOpen ? "xl:w-[62%]" : "w-full"}`}>
                  <div className="rounded-2xl bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-5">

                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <h1 className="text-3xl font-bold text-text-main">Product Catalog</h1>
                        <div className="relative w-full lg:max-w-sm">
                          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">search</span>
                          <input type="text" placeholder="Search catalog..." value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full rounded-2xl border border-neutral-light bg-background-light py-3 pl-12 pr-4 text-sm outline-none transition focus:border-primary" />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        {CATEGORY_OPTIONS.map((category) => (
                          <button key={category} type="button" onClick={() => setSelectedCategory(category)}
                            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selectedCategory === category ? "bg-primary text-text-main" : "bg-[#EEF2F6] text-text-muted hover:bg-neutral-light"}`}>
                            {category}
                          </button>
                        ))}
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
                              <tr><td colSpan={4} className="px-6 py-10 text-center text-sm text-text-muted">Loading products...</td></tr>
                            ) : error ? (
                              <tr><td colSpan={4} className="px-6 py-10 text-center text-sm text-red-500">{error}</td></tr>
                            ) : filteredProducts.length > 0 ? (
                              filteredProducts.map((product, index) => {
                                const isSelected = selectedProduct?._id === product._id;
                                return (
                                  <tr key={product._id} onClick={() => handleSelectProduct(product)}
                                    className={`cursor-pointer transition ${index !== filteredProducts.length - 1 ? "border-b border-neutral-light" : ""} ${isSelected ? "bg-[#F3FBF8]" : "hover:bg-[#F8FBFA]"}`}>
                                    <td className="px-6 py-5">
                                      <div className="flex items-center gap-4">
                                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#EEF2F6] text-lg">
                                          {product.image
                                            ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                                            : "🛒"}
                                        </div>
                                        <div className="font-semibold text-text-main">
                                          {highlightMatch(product.name, debouncedSearch)}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-5 text-text-main">{product.metadata?.category ?? "Uncategorized"}</td>
                                    <td className="px-6 py-5">
                                      <span className={`inline-flex rounded-md px-3 py-1 text-sm font-medium ${getStatusClasses(product.metadata?.status ?? "unknown")}`}>
                                        {formatStatus(product.metadata?.status ?? "unknown")}
                                      </span>
                                    </td>
                                    <td className="px-6 py-5 text-text-main">
                                      <div className="font-medium">
                                        {formatPriceValue(getProductBasePrice(product))} / {product.items?.[0]?.unitLabel ?? "unit"}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr><td colSpan={4} className="px-6 py-10 text-center text-sm text-text-muted">No matching products found.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm text-text-muted">
                          Showing {filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"}.
                        </p>
                        {page < pages && (
                          <button type="button" onClick={() => fetchProducts(page + 1, true)} disabled={loadingMore}
                            className="rounded-2xl border border-neutral-light bg-white px-4 py-2 text-sm font-semibold text-text-main transition hover:bg-background-light disabled:cursor-not-allowed disabled:opacity-60">
                            {loadingMore ? "Loading..." : "Load More"}
                          </button>
                        )}
                      </div>

                    </div>
                  </div>
                </section>

                {/* Details panel */}
                {isDetailsOpen && selectedProduct && (
                  <ProductDetailsPanel
                    productError={productError}
                    selectedProduct={selectedProduct}
                    selectedItem={selectedItem}
                    selectedItemDetails={selectedItemDetails}
                    detailsView={detailsView}
                    itemLoading={itemLoading}
                    onClose={handleCloseDetails}
                    onSelectItem={handleSelectItem}
                    onProductUpdated={handleProductUpdated}
                    onItemUpdated={(updatedItem) => setSelectedItemDetails(updatedItem)}
                  />
                )}

              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}