import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";
import ProductCard from "../../components/ProductCard";
import { fetchItemCatalog, fetchItemById } from "../../api/itemApi";


export default function Marketplace() {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [sortOption, setSortOption] = useState("default");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    async function loadProducts() {
      try {
        setLoading(true);
        const data = await fetchItemCatalog();
        const rawProducts = Array.isArray(data.items) ? data.items : [];

        // Enrich each product by fetching full item data for featured item
        const enriched = await Promise.all(
          rawProducts.map(async (product) => {
            const stub = product.items?.[0];
            if (!stub?.itemId) return product;
            try {
              const fullItem = await fetchItemById(stub.itemId);
              return {
                ...product,
                items: [
                  { ...stub, ...fullItem },
                  ...product.items.slice(1),
                ],
              };
            } catch {
              return product; // keep stub if item fetch fails
            }
          })
        );

        setProducts(enriched);
      } catch (err) {
        console.error(err);
        setError("Could not load products.");
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, []);

  useEffect(() => {
    const q = searchParams.get("q") || "";
    setSearchTerm(q);
  }, [searchParams]);

  // ── Helpers ────────────────────────────────────────────────────────────────────
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

  const getTitle = (product) => {
    const en = product.descriptions?.find((d) => d.locale === "en");
    return en?.title || product.name || "";
  };

  const getDescription = (product) => {
    const en = product.descriptions?.find((d) => d.locale === "en");
    return en?.body || "";
  };

  const getFeaturedItem = (product) => {
    const productItems = product.items ?? [];
    if (!productItems.length) return null;
    return productItems[0];
  };

  const getDisplayPrice = (product) => {
    const featuredItem = getFeaturedItem(product);

    if (featuredItem) {
      // 1) item.price[].sale or .list
      const itemPrice = featuredItem.price?.find(
        (p) => p.currency === "CAD" || p.currency === "USD"
      );
      if (itemPrice) return itemPrice.sale ?? itemPrice.list ?? null;

      // 2) item.salesPrices[]
      const salePrices = (featuredItem.salesPrices ?? [])
        .filter((sp) => sp.currency === "CAD" || sp.currency === "USD")
        .map((sp) => Number(sp.price))
        .filter((p) => !Number.isNaN(p));
      if (salePrices.length) return Math.min(...salePrices);
    }

    // 3) product root price[] fallback
    const rootPrice = product.price?.find(
      (p) => p.currency === "CAD" || p.currency === "USD"
    );
    if (rootPrice) return rootPrice.sale ?? rootPrice.list ?? null;

    return null;
  };

  const isSalePrice = (product) => {
    const featuredItem = getFeaturedItem(product);
    if (featuredItem?.price?.some((p) => p.sale != null)) return true;
    return product.price?.some((p) => p.sale != null) ?? false;
  };

  const getTierInfo = (product) => {
    const featuredItem = getFeaturedItem(product);
    const basePrice = getDisplayPrice(product);

    const tiers = featuredItem?.pricingTiers ?? featuredItem?.tiers ?? [];
    if (!tiers.length) return null;

    const firstTier = tiers[0];
    const discounts = tiers.map((tier) => {
      if (typeof tier.discountPct === "number") return tier.discountPct;
      if (typeof tier.price === "number" && typeof basePrice === "number" && basePrice > 0)
        return Math.round(((basePrice - tier.price) / basePrice) * 100);
      return 0;
    });

    return {
      minQty: firstTier.minQty ?? null,
      firstDiscountPct:
        typeof firstTier.discountPct === "number"
          ? firstTier.discountPct
          : typeof firstTier.price === "number" && basePrice > 0
            ? Math.round(((basePrice - firstTier.price) / basePrice) * 100)
            : null,
      maxDiscountPct: Math.max(...discounts),
    };
  };

  const getCardSubtitle = (product) => {
    const count = (product.items ?? []).length;
    if (count > 1) return `From ${count} options`;
    if (count === 1) return "Single option available";
    return getDescription(product);
  };

  const getId = (item, index) =>
    item._id?.$oid || item._id || String(index);

  // ── Filtering ──────────────────────────────────────────────────────────────────
  let filteredProducts = products.filter((item) =>
    getTitle(item).toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── Sorting ────────────────────────────────────────────────────────────────────
  if (sortOption === "priceLow") {
    filteredProducts = [...filteredProducts].sort(
      (a, b) => getDisplayPrice(a) - getDisplayPrice(b)
    );
  } else if (sortOption === "priceHigh") {
    filteredProducts = [...filteredProducts].sort(
      (a, b) => getDisplayPrice(b) - getDisplayPrice(a)
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light font-display text-text-main">
      <Navbar
        label="Organic / Produce"
        showLocation={false}
        onSearch={(value) => setSearchTerm(value)}
      />

      <main className="flex flex-1 flex-col gap-8 rounded-2xl border border-neutral-light px-4 py-8 md:flex-row md:px-20 lg:px-40">
        <Sidebar showSummary={false} />

        <section className="flex flex-1 flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">
              Browse Bulk Products
            </h1>
            <p className="text-text-muted">
              Join active buying groups to unlock premium tier discounts.
            </p>
          </div>

          <div className="mt-4 flex items-center justify-end gap-3 pr-2">
            <button className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-neutral-light">
              <span className="material-symbols-outlined text-base">
                filter_list
              </span>
              Filter
            </button>

            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              <option value="default">Sort: Popular</option>
              <option value="priceLow">Price: Low → High</option>
              <option value="priceHigh">Price: High → Low</option>
            </select>
          </div>

          {loading && <p className="text-text-muted">Loading products...</p>}
          {error && <p className="text-red-500">{error}</p>}

          {!loading && !error && filteredProducts.length === 0 && (
            <div className="rounded-2xl border border-neutral-light bg-white p-8 text-center shadow-sm">
              <h2 className="text-xl font-bold">No products available right now.</h2>
              <p className="mt-2 text-text-muted">
                The marketplace is connected to the backend, but no product data
                is currently available.
              </p>
            </div>
          )}

          {!loading && !error && filteredProducts.length > 0 && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map((product, index) => {
                const id = getId(product, index);
                const price = getDisplayPrice(product);
                const tierInfo = getTierInfo(product);
                const hasMultipleItems = (product.items ?? []).length > 1;

                return (
                  <div
                    key={id}
                    onClick={() => navigate(`/items/${id}`)}
                    className="cursor-pointer"
                  >
                    <ProductCard
                      id={id}
                      title={highlightMatch(getTitle(product), searchTerm)}
                      category={getCardSubtitle(product)}
                      price={price ?? 0}
                      image={
                        (() => {
                          const featuredItem = getFeaturedItem(product);
                          // Use enriched item images first, then fall back to product-level fields
                          return (
                            featuredItem?.images?.[0] ||
                            featuredItem?.metadata?.imageUrl ||
                            product.previewImage ||
                            product.image ||
                            product.images?.[0] ||
                            ""
                          );
                        })()
                      }
                      size="large"
                      minTierPrice={null}
                      minTierQty={tierInfo?.minQty ?? null}
                      estimatedSavings={tierInfo?.maxDiscountPct ?? null}
                      pricePrefix={hasMultipleItems ? "From" : ""}
                      salePrice={
                        isSalePrice(product) ? getDisplayPrice(product) : null
                      }
                      listPrice={(() => {
                        const fi = getFeaturedItem(product);
                        return (
                          fi?.price?.find((p) => p.currency === "CAD")?.list ??
                          product.price?.find((p) => p.currency === "CAD")?.list ??
                          null
                        );
                      })()}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}