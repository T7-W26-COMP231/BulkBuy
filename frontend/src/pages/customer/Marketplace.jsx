import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";
import ProductCard from "../../components/ProductCard";
import { fetchItemCatalog } from "../../api/itemApi";

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
        setProducts(Array.isArray(data.items) ? data.items : []);
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

  const getTitle = (item) => {
    const en = item.descriptions?.find((d) => d.locale === "en");
    return en?.title || item.name || "";
  };

  const getDescription = (item) => {
    const en = item.descriptions?.find((d) => d.locale === "en");
    return en?.body || "";
  };

  const getDisplayPrice = (item) => {
    const prices = (item.items ?? [])
      .flatMap((i) => i.salesPrices ?? [])
      .filter((sp) => sp.currency === "USD")
      .map((sp) => sp.price);

    return prices.length ? Math.min(...prices) : 0;
  };

  const getMinTierPrice = (item, basePrice) => {
    const tier = item.discountScheme?.tiers?.[0];
    if (!tier || !basePrice) return null;
    return +(basePrice * (1 - tier.discountPct / 100)).toFixed(2);
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
        locationLabel="Organic / Produce"
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
              {filteredProducts.map((item, index) => {
                const id = getId(item, index);
                const price = getDisplayPrice(item);
                //console.log(price)
                const minTierPrice = getMinTierPrice(item, price);

                return (
                  <div
                    key={id}
                    onClick={() => navigate(`/items/${id}`)}
                    className="cursor-pointer"
                  >
                    <ProductCard
                      id={id}
                      title={getTitle(item)}
                      category={getDescription(item)}
                      price={price}
                      image={item.image || item.images?.[0] || ""}
                      size="large"
                      minTierPrice={minTierPrice}      // ← uncomment
                      minTierQty={item.discountScheme?.tiers?.[0]?.minQty ?? null}  // ← uncomment
                      estimatedSavings={item.estimatedSavings ?? 0}

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