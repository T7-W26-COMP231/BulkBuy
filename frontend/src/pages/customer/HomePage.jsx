// src/pages/marketplace/HomePage.jsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import { flattenAndRankItems } from "../../utils/popularity.js";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useOpsContext } from "../../contexts/OpsContext.jsx";
import { initSocket } from "../../comms-js/socket";
import { useNavigate } from "react-router-dom";


function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function HomePage() {
  const navigate = useNavigate();
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
  }, []);

  const { user, accessToken } = useAuth();
  const {
    orders,
    wsuorders,
    wsuproducts,
    products,
    productsMeta,
    regions,
    fetchAndSetRegions,
    setOps_region,
    setSocket,
    fetchAndSetUiProducts,
    fetchAndSetEnrichedOrders,
    clearState: clearOpsState,
    backendUrl,
  } = useOpsContext();

  const [locationState, setLocationState] = useState("idle");
  const [detectedRegionCode, setDetectedRegionCode] = useState(null);

  // ── Region resolution ─────────────────────────────────────────────────────
  const activeRegionCode =
    detectedRegionCode ||
    productsMeta?.region ||
    regions?.[0]?.code ||
    "north-america:ca-on";

  const activeRegion = regions?.find((r) => r.code === activeRegionCode);
  const regionLabel = activeRegion?.displayName || activeRegionCode;

  // ── Products → ranked items ───────────────────────────────────────────────
  const productsArray = Array.isArray(products?.data?.products)
    ? products.data.products
    : Array.isArray(products?.products)
      ? products.products
      : Array.isArray(products)
        ? products
        : [];

  const rankedItems = useMemo(
    () => flattenAndRankItems(productsArray, activeRegionCode),
    [productsArray, activeRegionCode]
  );
  console.log("products raw ->", products);
  console.log("productsArray ->", productsArray);



  const heroItem = rankedItems[0];
  const popularItems = rankedItems.slice(1, 7);

  // ADD THESE:
  console.log("rankedItems ->", rankedItems);
  console.log("heroItem ->", heroItem);
  console.log("popularItems ->", popularItems);

  // ── Hero card derived values ──────────────────────────────────────────────
  const toEpoch = heroItem?.window?.toEpoch;
  const aggregationStatus =
    toEpoch && Number(toEpoch) > Date.now() ? "OPEN" : "CLOSED";

  const closesIn = toEpoch
    ? (() => {
      const diff = Number(toEpoch) - Date.now();
      if (diff <= 0) return "Closed";
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      return `${h}h ${m}m`;
    })()
    : "TBD";

  const currentPrice =
    heroItem?.variants?.[0]?.price?.[0]?.sale ||
    heroItem?.variants?.[0]?.price?.[0]?.list ||
    0;

  const listPrice = heroItem?.variants?.[0]?.price?.[0]?.list || 0;
  const savingsPerUnit = listPrice > 0 ? (listPrice - currentPrice).toFixed(2) : "—";

  const qtySold = heroItem?.qtySold || heroItem?.inventory?.reserved || 0;
  const qtyAvailable = heroItem?.inventory?.stock || 1000;
  const progressPct = Math.min((qtySold / qtyAvailable) * 100, 100);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    setOps_region("north-america:ca-on");
  }, []);

  useEffect(() => {
    fetchAndSetRegions().catch(() => 0);
  }, []);

  // PRODUCTS — keep as-is
  useEffect(() => {
    const controller = new AbortController();
    const region = "north-america:ca-on" || productsMeta?.region || "Toronto";
    try {
      const socket = initSocket(null, { region, url: backendUrl });
      setSocket(socket);
      fetchAndSetUiProducts({
        region,
        page: 1,
        limit: 24,
        signal: controller.signal,
      }).then(() => {
        console.log("01 | products ->", products);
      }).catch((err) => {
        if (err && err.name === "AbortError") return;
      });
      setTimeout(() => {
        return () => controller.abort();
      }, 2000);
    } catch (error) {
      console.log("home page - products+socket : this is the error ", error);
    }
  }, [wsuproducts, productsMeta?.region, products, fetchAndSetUiProducts]);

  // ORDERS — keep as-is
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const run = async () => {
      try {
        if (!user || !user.userId || !accessToken) {
          if (!accessToken) {
            clearOpsState();
            return;
          }
        }
        if (!mounted || controller.signal.aborted) return;
        const region = "north-america:ca-on" || productsMeta?.region || "Toronto";
        await fetchAndSetEnrichedOrders({
          userId: user.userId,
          region,
          page: 1,
          limit: 25,
          requireAuth: true,
          signal: controller.signal,
          jwtAccessToken: accessToken,
        }).then(() => {
          console.log("02 | orders ->", orders);
        });
      } catch (err) {
        if (err && err.name === "AbortError") return;
        console.warn("[HomePage] orders fetch failed or was skipped:", err);
      }
    };
    run();
    setTimeout(() => {
      return () => { mounted = false; controller.abort(); };
    }, 2000);
  }, [
    user?.userId,
    accessToken,
    wsuorders,
    productsMeta?.region,
    fetchAndSetEnrichedOrders,
    clearOpsState,
    orders,
  ]);

  // Location modal init
  useEffect(() => {
    const savedCode = sessionStorage.getItem("detectedRegionCode");
    const dismissed = sessionStorage.getItem("locationModalDismissed");
    let timer = null;
    if (savedCode) {
      setDetectedRegionCode(savedCode);
      if (!dismissed) setLocationState("done");
    } else {
      const asked = sessionStorage.getItem("askedLocation");
      if (!asked) timer = setTimeout(() => setLocationState("asking"), 600);
    }
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleAllow = () => {
    sessionStorage.setItem("askedLocation", "true");
    setLocationState("detecting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nearest = regions?.length
          ? regions.reduce(
            (best, r) => {
              if (!r.coordinates) return best;
              const d = getDistance(
                pos.coords.latitude, pos.coords.longitude,
                r.coordinates.lat, r.coordinates.lng
              );
              return d < best.dist ? { code: r.code, dist: d } : best;
            },
            { code: null, dist: Infinity }
          )
          : { code: null };
        if (nearest.code) {
          setDetectedRegionCode(nearest.code);
          sessionStorage.setItem("detectedRegionCode", nearest.code);
          sessionStorage.removeItem("locationModalDismissed");
        }
        setLocationState("done");
      },
      () => setLocationState("denied")
    );
  };

  const handleDismiss = () => {
    sessionStorage.setItem("askedLocation", "true");
    sessionStorage.setItem("locationModalDismissed", "true");
    setLocationState("idle");
  };

  const handleCityChange = (newCode) => {
    setDetectedRegionCode(newCode);
    sessionStorage.setItem("detectedRegionCode", newCode);
    fetchAndSetUiProducts({ region: newCode, page: 1, limit: 24 }).catch(() => 0);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light text-text-main font-display">

      {/* Location modal */}
      {(locationState === "asking" ||
        locationState === "detecting" ||
        locationState === "done") &&
        !sessionStorage.getItem("locationModalDismissed") && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="relative mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <button
                onClick={handleDismiss}
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
                aria-label="Close location modal"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <span className="material-symbols-outlined text-3xl text-primary">
                  {locationState === "done" ? "check_circle" : "location_on"}
                </span>
              </div>
              {locationState === "asking" && (
                <>
                  <h2 className="mb-1 text-lg font-bold">Detect your location</h2>
                  <p className="mb-6 text-sm text-text-muted">
                    Allow BulkBuy to detect your location so we can show bulk deals near you.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={handleDismiss} className="flex-1 rounded-xl border border-neutral-light py-2.5 text-sm font-semibold text-text-muted hover:bg-gray-50 transition-colors">
                      Not now
                    </button>
                    <button onClick={handleAllow} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-text-main shadow-sm hover:bg-primary/90 transition-colors">
                      Allow
                    </button>
                  </div>
                </>
              )}
              {locationState === "detecting" && (
                <>
                  <h2 className="mb-1 text-lg font-bold">Detecting your region...</h2>
                  <p className="text-sm text-text-muted">Finding the nearest region to you.</p>
                  <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-light">
                    <div className="h-full animate-pulse rounded-full bg-primary" style={{ width: "60%" }} />
                  </div>
                </>
              )}
              {locationState === "done" && (
                <>
                  <h2 className="mb-1 text-lg font-bold">Location set!</h2>
                  <p className="text-sm text-text-muted">
                    We've set your region to{" "}
                    <span className="font-semibold text-text-main">
                      {activeRegion?.displayName || detectedRegionCode}
                    </span>
                    . You can change it anytime from the navbar.
                  </p>
                  <button onClick={handleDismiss} className="mt-5 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-text-main shadow-sm hover:bg-primary/90 transition-colors">
                    Got it
                  </button>
                </>
              )}
            </div>
          </div>
        )}

      <Navbar detectedCity={regionLabel}
        activeRegionCode={activeRegionCode}
        regions={regions}
        onCityChange={handleCityChange} />

      <main className="flex flex-1 flex-col gap-8 px-4 py-8 md:flex-row md:px-20 lg:px-40">
        <Sidebar totalSavings={0} savingsLabel="Saved this month" />

        <section className="flex flex-1 flex-col gap-8">

          {/* Heading */}
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">
              Active Aggregations in {regionLabel}
            </h1>
            <p className="text-text-muted">
              Join local bulk buys to unlock lower pricing tiers.
            </p>
          </div>

          {/* Hero card */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm lg:flex-row">
            <div className="relative h-64 w-full lg:h-auto lg:w-2/5">
              <img
                key={heroItem?.itemId}
                className="h-full w-full object-cover"
                src={heroItem?.images?.[0] || "https://via.placeholder.com/600x400"}
                alt={heroItem?.title || "Aggregation image"}
              />
              <div className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${aggregationStatus === "CLOSED" ? "bg-red-500 text-white" : "bg-primary text-text-main"}`}>
                {aggregationStatus === "CLOSED" ? "Window Closed" : "Window Open"}
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-between gap-6 p-6 md:p-8">
              <div>
                <div className="mb-2 flex items-start justify-between">
                  <h2 className="text-2xl font-bold">
                    {heroItem?.title || "Loading..."}
                  </h2>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-primary">
                      ${currentPrice > 0 ? currentPrice.toFixed(2) : "—"}
                    </span>
                    <span className="block text-sm text-text-muted">Current Price</span>
                  </div>
                </div>
                <div className="mb-6 flex items-center gap-2 text-sm text-text-muted">
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  <span>
                    {aggregationStatus === "CLOSED" ? (
                      <span className="font-semibold text-red-500">Closed</span>
                    ) : (
                      <>Closes in <span className="font-semibold text-red-500">{closesIn}</span></>
                    )}
                  </span>
                  <span className="mx-2">·</span>
                  <span className="material-symbols-outlined text-sm">local_shipping</span>
                  <span>Pickup: {regionLabel}</span>
                </div>
                <div className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">Group buy progress</span>
                      <span className="text-xs text-text-muted">
                        {qtyAvailable - qtySold} units remaining
                      </span>
                    </div>
                    <span className="text-sm font-bold">
                      {heroItem ? `${qtySold}/${qtyAvailable} units` : "—"}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-light">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-light pt-4">
                <div className="flex -space-x-3">
                  {/* {[1, 2, 3].map((n) => (
                    <img key={n} className="h-10 w-10 rounded-full border-2 border-white object-cover" src="https://via.placeholder.com/40" alt={`Participant ${n}`} />
                  ))}
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-neutral-light text-xs font-medium">
                    +{Math.max(0, qtySold - 3)}
                  </div> */}
                </div>
                <button
                  onClick={() => heroItem?.itemId && navigate(`/items/${heroItem.itemId}`)}
                  className="rounded-xl bg-primary px-8 py-3 font-bold text-text-main shadow-md transition-all hover:bg-primary/90"
                >
                  Join Bulk Buy
                </button>
              </div>
            </div>
          </div>

          {/* Savings + quality cards */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex items-center gap-5 rounded-2xl border border-neutral-light bg-white p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-3xl">savings</span>
              </div>
              <div>
                <h4 className="text-sm font-medium text-text-muted">Estimated Savings</h4>
                <p className="text-xl font-bold">
                  Save ${savingsPerUnit} per unit vs retail
                </p>
              </div>
            </div>
            <div className="flex items-center gap-5 rounded-2xl border border-neutral-light bg-white p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-3xl">verified_user</span>
              </div>
              <div>
                <h4 className="text-sm font-medium text-text-muted">Quality Guarantee</h4>
                <p className="text-xl font-bold">
                  {heroItem?.metadata?.material
                    ? `${heroItem.metadata.material} Certified`
                    : "Quality Guaranteed"}
                </p>
              </div>
            </div>
          </div>

          {/* Popular Items */}
          <div className="overflow-hidden rounded-2xl border border-neutral-light bg-white">
            <div className="flex items-center justify-between border-b border-neutral-light px-6 py-4">
              <h3 className="font-bold">Popular right now</h3>
              <span className="text-sm font-semibold text-primary">
                {rankedItems.length} live in {regionLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3">
              {popularItems.map((item) => {
                const price = item.variants?.[0]?.price?.[0];
                return (
                  <div
                    key={item.itemId}
                    onClick={() => navigate(`/items/${item.itemId}`)}
                    className="flex flex-col gap-2 rounded-xl border border-neutral-light p-3 hover:border-primary transition cursor-pointer"
                  >
                    <img
                      src={item.images?.[0] || "https://via.placeholder.com/200"}
                      alt={item.title}
                      className="h-24 w-full rounded-lg object-cover"
                    />
                    <p className="text-sm font-semibold line-clamp-2">{item.title || "Item"}</p>
                    <p className="text-sm font-bold text-primary">
                      ${price?.sale > 0 ? price.sale.toFixed(2) : "—"}/unit
                    </p>
                    <div className="flex items-center gap-1 text-xs text-text-muted">
                      <span className="text-amber-500">★</span>
                      {item.ratings?.avg?.toFixed(1)} ({item.ratings?.count})
                    </div>
                    {/* ADD THIS: */}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-light text-text-muted">
                      {item.ops_region?.split(":").pop().toUpperCase().replace(/-/g, " ")}
                    </span>
                  </div>
                );
              })}
              {rankedItems.length === 0 && (
                <div className="col-span-3 py-8 text-center text-sm text-text-muted">
                  Loading deals...
                </div>
              )}
            </div>
          </div>

        </section>
      </main>
      <Footer />
    </div>
  );
}