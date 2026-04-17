import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";
import ProductCard from "../../components/ProductCard";
import { useOpsContext } from "../../contexts/OpsContext.jsx";

export default function Marketplace() {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [sortOption, setSortOption] = useState("default");
  const navigate = useNavigate();

  const { products, loadingProducts, fetchAndSetUiProducts } = useOpsContext();

  useEffect(() => {
    fetchAndSetUiProducts({ region: "north-america:ca-on", page: 1, limit: 50 });
  }, []);

  useEffect(() => {
    const q = searchParams.get("q") || "";
    setSearchTerm(q);
  }, [searchParams]);

  // ── Extract products array from OpsContext shape ──
  const productsArray = useMemo(() => {
    return Array.isArray(products?.data?.products)
      ? products.data.products
      : Array.isArray(products?.products)
        ? products.products
        : Array.isArray(products)
          ? products
          : [];
  }, [products]);

  // ── Helpers ──
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

  const getFeaturedItem = (product) => {
    const items = product.items ?? [];
    return items.length > 0 ? items[0] : null;
  };

  const getTitle = (product) => {
    const fi = getFeaturedItem(product);
    return fi?.title || product.name || product.productId || "";
  };

  const getDescription = (product) => {
    const fi = getFeaturedItem(product);
    return fi?.shortDescription || fi?.description || "";
  };

  const getDisplayPrice = (product) => {
    const fi = getFeaturedItem(product);
    if (!fi) return null;

    // 1) latest pricing snapshot
    const snaps = fi.pricing_snapshots ?? [];
    if (snaps.length > 0) {
      return Number(snaps[snaps.length - 1].atInstantPrice ?? 0);
    }

    // 2) item price array
    const itemPrice = fi.price?.find(p => p.currency === "CAD" || p.currency === "USD");
    if (itemPrice) return itemPrice.sale ?? itemPrice.list ?? null;

    return null;
  };

  const getImage = (product) => {
    const fi = getFeaturedItem(product);
    return fi?.images?.[0] || fi?.metadata?.imageUrl || "";
  };

  const getTierInfo = (product) => {
    const fi = getFeaturedItem(product);
    if (!fi) return null;
    const tiers = fi.pricing_tiers ?? [];
    if (!tiers.length) return null;
    const sorted = [...tiers].sort((a, b) => (a.minQty ?? a.quantity ?? 0) - (b.minQty ?? b.quantity ?? 0));
    const discounts = sorted.map(t => t.discountPercentagePerUnitBulk ?? 0);
    return {
      minQty: sorted[0]?.minQty ?? sorted[0]?.quantity ?? null,
      maxDiscountPct: Math.max(...discounts),
    };
  };

  const getCardSubtitle = (product) => {
    const count = (product.items ?? []).length;
    if (count > 1) return `From ${count} options`;
    if (count === 1) return "Single option available";
    return getDescription(product);
  };

  const getId = (product) => product.productId || product._id || "";

  // ── Filtering ──
  let filteredProducts = productsArray.filter((p) =>
    getTitle(p).toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── Sorting ──
  if (sortOption === "priceLow") {
    filteredProducts = [...filteredProducts].sort((a, b) => (getDisplayPrice(a) ?? 0) - (getDisplayPrice(b) ?? 0));
  } else if (sortOption === "priceHigh") {
    filteredProducts = [...filteredProducts].sort((a, b) => (getDisplayPrice(b) ?? 0) - (getDisplayPrice(a) ?? 0));
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light font-display text-text-main">
      <Navbar label="Organic / Produce" showLocation={false} onSearch={(value) => setSearchTerm(value)} />

      <main className="flex flex-1 flex-col gap-8 rounded-2xl border border-neutral-light px-4 py-8 md:flex-row md:px-20 lg:px-40">
        <Sidebar showSummary={false} />

        <section className="flex flex-1 flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Browse Bulk Products</h1>
            <p className="text-text-muted">Join active buying groups to unlock premium tier discounts.</p>
          </div>

          <div className="mt-4 flex items-center justify-end gap-3 pr-2">
            <button className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-neutral-light">
              <span className="material-symbols-outlined text-base">filter_list</span>
              Filter
            </button>
            <select value={sortOption} onChange={(e) => setSortOption(e.target.value)} className="rounded-lg border px-4 py-2 text-sm">
              <option value="default">Sort: Popular</option>
              <option value="priceLow">Price: Low → High</option>
              <option value="priceHigh">Price: High → Low</option>
            </select>
          </div>

          {loadingProducts && <p className="text-text-muted">Loading products...</p>}

          {!loadingProducts && filteredProducts.length === 0 && (
            <div className="rounded-2xl border border-neutral-light bg-white p-8 text-center shadow-sm">
              <h2 className="text-xl font-bold">No products available right now.</h2>
              <p className="mt-2 text-text-muted">The marketplace is connected to the backend, but no product data is currently available.</p>
            </div>
          )}

          {!loadingProducts && filteredProducts.length > 0 && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map((product) => {
                const id = getId(product);
                const price = getDisplayPrice(product);
                const tierInfo = getTierInfo(product);
                const hasMultipleItems = (product.items ?? []).length > 1;

                return (
                  <div key={id} onClick={() => navigate(`/items/${id}`)} className="cursor-pointer">
                    <ProductCard
                      id={id}
                      title={highlightMatch(getTitle(product), searchTerm)}
                      category={getCardSubtitle(product)}
                      price={price ?? 0}
                      image={getImage(product)}
                      size="large"
                      minTierPrice={null}
                      minTierQty={tierInfo?.minQty ?? null}
                      estimatedSavings={tierInfo?.maxDiscountPct ?? null}
                      pricePrefix={hasMultipleItems ? "From" : ""}
                      salePrice={null}
                      listPrice={null}
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