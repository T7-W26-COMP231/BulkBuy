
import { useState, useEffect } from "react";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";
import { fetchAggregations } from "../../api/aggregationApi";


const GTA_CITIES = [
  { name: "Toronto", lat: 43.6532, lng: -79.3832 },
  { name: "Scarborough", lat: 43.7764, lng: -79.2318 },
  { name: "Mississauga", lat: 43.5890, lng: -79.6441 },
  { name: "Brampton", lat: 43.7315, lng: -79.7624 },
  { name: "Markham", lat: 43.8561, lng: -79.3370 },
  { name: "Vaughan", lat: 43.8361, lng: -79.4983 },
  { name: "Richmond Hill", lat: 43.8828, lng: -79.4403 },
  { name: "Oakville", lat: 43.4675, lng: -79.6877 },
  { name: "Burlington", lat: 43.3255, lng: -79.7990 },
  { name: "Pickering", lat: 43.8384, lng: -79.0868 },
  { name: "Ajax", lat: 43.8509, lng: -79.0204 },
  { name: "Whitby", lat: 43.8975, lng: -78.9429 },
  { name: "Oshawa", lat: 43.8971, lng: -78.8658 },
  { name: "Milton", lat: 43.5083, lng: -79.8774 },
  { name: "Newmarket", lat: 44.0592, lng: -79.4613 },
  { name: "Aurora", lat: 44.0065, lng: -79.4503 },
];

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

function getNearestCity(lat, lng) {
  return GTA_CITIES.reduce(
    (nearest, city) => {
      const dist = getDistance(lat, lng, city.lat, city.lng);
      return dist < nearest.dist ? { city: city.name, dist } : nearest;
    },
    { city: "Toronto", dist: Infinity }
  ).city;
}

export default function HomePage() {
  const [locationState, setLocationState] = useState("idle");
  const [aggregations, setAggregations] = useState([]);
  const [loadingAggregations, setLoadingAggregations] = useState(false);
  const [detectedCity, setDetectedCity] = useState(null);

  useEffect(() => {
    // Check if city is already saved in sessionStorage
    const savedCity = sessionStorage.getItem("detectedCity");
    const dismissed = sessionStorage.getItem("locationModalDismissed");

    if (savedCity) {
      setDetectedCity(savedCity);
      // Only show modal if it was not dismissed
      if (!dismissed) {
        setLocationState("done");
      }
    } else {
      // Only ask if not already asked this session
      setDetectedCity("Toronto");
      sessionStorage.setItem("detectedCity", "Toronto");
      const asked = sessionStorage.getItem("askedLocation");
      if (!asked) {
        const timer = setTimeout(() => setLocationState("asking"), 600);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  useEffect(() => {
    const loadAggregations = async () => {
      const city = detectedCity || "Toronto";
      console.log("Using city:", city, "| detectedCity:", detectedCity);

      try {
        setLoadingAggregations(true);
        const start = performance.now();
        const response = await fetchAggregations(city);
        const end = performance.now(); // ADD
        console.log(`API call took ${(end - start).toFixed(2)} ms`);

        const data = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
            ? response.data
            : [];
        if (data.length === 0) {
          console.warn("No aggregations found for city:", city);
        } else {
          console.log("Aggregations loaded:", data.length);
        }
        setAggregations(data);
      } catch (error) {
        console.error("Failed to load aggregations:", error);
        setAggregations([]);
      } finally {
        setLoadingAggregations(false);
      }
    };

    loadAggregations();
  }, [detectedCity]);

  const selectedAggregation =
    Array.isArray(aggregations) && aggregations.length > 0
      ? aggregations[0]
      : null;

  const aggregationStatus =
    selectedAggregation && selectedAggregation.status
      ? selectedAggregation.status
      : "OPEN";

  const closesIn =
    selectedAggregation && selectedAggregation.closesIn
      ? selectedAggregation.closesIn
      : "TBD";

  const handleAllow = () => {
    sessionStorage.setItem("askedLocation", "true");
    setLocationState("detecting");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const city = getNearestCity(pos.coords.latitude, pos.coords.longitude);
        setDetectedCity(city);
        sessionStorage.setItem("detectedCity", city); // persist in session
        setLocationState("done");
      },
      () => setLocationState("denied")
    );
  };

  const handleDismiss = () => {
    sessionStorage.setItem("askedLocation", "true");
    sessionStorage.setItem("locationModalDismissed", "true"); // mark modal as dismissed
    setLocationState("idle"); // hide modal
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light text-text-main font-display">

      {/* Location Modal */}
      {(locationState === "asking" || locationState === "detecting" || locationState === "done") &&
        !sessionStorage.getItem("locationModalDismissed") && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="relative mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">

              <button
                onClick={handleDismiss}
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
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
                    Allow BulkBuy to detect your location so we can show bulk deals near you in the GTA.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleDismiss}
                      className="flex-1 rounded-xl border border-neutral-light py-2.5 text-sm font-semibold text-text-muted hover:bg-gray-50 transition-colors"
                    >
                      Not now
                    </button>
                    <button
                      onClick={handleAllow}
                      className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-text-main shadow-sm hover:bg-primary/90 transition-colors"
                    >
                      Allow
                    </button>
                  </div>
                </>
              )}

              {locationState === "detecting" && (
                <>
                  <h2 className="mb-1 text-lg font-bold">Detecting your city…</h2>
                  <p className="text-sm text-text-muted">Finding the nearest GTA city to you.</p>
                  <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-light">
                    <div className="h-full animate-pulse rounded-full bg-primary" style={{ width: "60%" }} />
                  </div>
                </>
              )}

              {locationState === "done" && (
                <>
                  <h2 className="mb-1 text-lg font-bold">Location set!</h2>
                  <p className="text-sm text-text-muted">
                    We've set your city to{" "}
                    <span className="font-semibold text-text-main">{detectedCity}</span>.
                    You can change it anytime from the navbar.
                  </p>
                  <button
                    onClick={handleDismiss}
                    className="mt-5 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-text-main shadow-sm hover:bg-primary/90 transition-colors"
                  >
                    Got it
                  </button>
                </>
              )}
            </div>
          </div>
        )}

      <Navbar detectedCity={detectedCity} />

      <main className="flex flex-1 flex-col gap-8 px-4 py-8 md:flex-row md:px-20 lg:px-40">
        <Sidebar />

        <section className="flex flex-1 flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">
              Active Aggregations in {detectedCity || "Toronto"}
            </h1>

            <p className="text-text-muted">
              Join local bulk buys to unlock lower pricing tiers.
            </p>
          </div>

          {loadingAggregations && (
            <p className="text-sm text-text-muted">Loading aggregation status...</p>
          )}

          <div className="flex flex-col overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm lg:flex-row">
            <div className="relative h-64 w-full lg:h-auto lg:w-2/5">
              <img
                className="h-full w-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAs5mRtJWYgicX4MpUHUxkozzsqxNYGZdf2dh0KbBVY6ymbmX9cEHyHEopXQmC5CPo0IAIh4Zq4Z1dTSAQg5mMn3vc2K_szU8u4vaYxzLCYK6IoHPmAwChr8oeJRy1cLxdXiVzSltoAKb9at-xfLehd3lVC1cvW5bTD3c1kdpmoYmVcDpsMrOQ8jONhajYH5ifXz6AJ0alLeJvvneQPquNecKzQDghsLMgjC72S4gltD8GwRNa30pHXy_5y4k3kH8WItjAopsJDxgI"
                alt="Premium Organic Avocados"
              />

              <div
                className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${aggregationStatus === "CLOSED"
                  ? "bg-red-500 text-white"
                  : "bg-primary text-text-main"
                  }`}
              >
                {aggregationStatus === "CLOSED" ? "Window Closed" : "Window Open"}
              </div>

            </div>

            <div className="flex flex-1 flex-col justify-between gap-6 p-6 md:p-8">
              <div>

                <div className="mb-2 flex items-start justify-between">
                  <h2 className="text-2xl font-bold">
                    {selectedAggregation?.title || "Premium Organic Avocados"}
                  </h2>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-primary">
                      ${selectedAggregation?.price ?? 1.25}
                    </span>
                    <span className="block text-sm text-text-muted">Current Tier 2 Price</span>
                  </div>
                </div>

                <div className="mb-6 flex items-center gap-2 text-sm text-text-muted">
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  <span>
                    {aggregationStatus === "CLOSED" ? (
                      <span className="font-semibold text-red-500">Closed</span>
                    ) : (
                      <>
                        Closes in <span className="font-semibold text-red-500">{closesIn}</span>
                      </>
                    )}
                  </span>
                  <span className="mx-2">•</span>
                  <span className="material-symbols-outlined text-sm">local_shipping</span>
                  <span>Pickup: Toronto Central</span>
                </div>

                <div className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">Progress to Tier 3 ($1.10)</span>
                      <span className="text-xs text-text-muted">250 units remaining to trigger next discount</span>
                    </div>
                    <span className="text-sm font-bold">
                      {selectedAggregation
                        ? `${selectedAggregation.soldUnits}/${selectedAggregation.targetUnits} units`
                        : "750/1000 units"}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-light">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{
                        width:
                          selectedAggregation && selectedAggregation.targetUnits > 0
                            ? `${Math.min(
                              ((selectedAggregation.soldUnits || 0) /
                                (selectedAggregation.targetUnits || 1)) *
                              100,
                              100
                            )}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-light pt-4">
                <div className="flex -space-x-3">
                  <img className="h-10 w-10 rounded-full border-2 border-white object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDpdfgua5aFPlAwPtt5cfUEFEgDqMKbkk9Bm1GEEhhpBQD9TpE3WtQ_H6OkhfG7846fRpNPW1SAZYt4uaEolVo5c8Fg-TLpWTeXWQIx6wBXyWfzEtVM9c-YlOdA9uILcoubEdB9PWbWlIv6j7egNb6KAeM5HfPRRq_IUmucWPO9tWTjjt2b75HGD7J31I-d-XuyjgddMcHpFUdmYaWXamY6Z9EMT1HEjBuepehcx-s7bBhqhPe0CqmVTI6enIV0vXE3O0DiEhKRp04" alt="Participant 1" />
                  <img className="h-10 w-10 rounded-full border-2 border-white object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAsFULVhDcJWof7HJFmTV9SQlBsdZK2lMRvE4dSA6C6CLc3HPdtSr_UghpK3wnLAZYvYXXllRXwSQdieSCBhFSNoLqLTFIZq0GOtAq4My17dSpXxARXibYtPLZ4D7KIMlApKjxOul-iP12lVDzAxMfRBDykpSjPSrbeLFkEVKTV30b7vQ2XU0w3f0BzAsJDPEHaApyPLtCoGMouRddO-LBK-8VUupZGCCgPG9ypjpuB28rxOaI9Fd1KGgbE0EHt5tBluKUU9jyDez4" alt="Participant 2" />
                  <img className="h-10 w-10 rounded-full border-2 border-white object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCqEU1n3_0rGsl32BaBlsOo7qDxsdmDRSgkyxiJdNEfF2lzEPzoBc4KPn9qwNnwzzFAmfFDX5xvo3B02SxEEj8Hb2oRiA2NrSv1GHezDBik7fArh4OZ90nXltDmAgd5U57fd4HyOWvSqccHjKjt_3nsCl2IvHvcJouYl5ouKp3HR6yBAR1Cr3-1yCh4O5XXQXtESidlk-iZAZ5J3rXIjH77Fu3uNxZzntfsjD1eRY7i3uhQ5jDa4mQEuHPwaTn8JBgWZfRgZkUUyb8" alt="Participant 3" />
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-neutral-light text-xs font-medium">+142</div>
                </div>
                <button className="rounded-xl bg-primary px-8 py-3 font-bold text-text-main shadow-md transition-all hover:bg-primary/90">
                  Join Bulk Buy
                </button>
              </div>
            </div>
          </div>

          {/* Rest of your sections, Estimated Savings, Quality Guarantee, Map, etc. */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex items-center gap-5 rounded-2xl border border-neutral-light bg-white p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-3xl">savings</span>
              </div>
              <div>
                <h4 className="text-sm font-medium text-text-muted">Estimated Savings</h4>
                <p className="text-xl font-bold">Save $0.65 per unit vs Retail</p>
              </div>
            </div>

            <div className="flex items-center gap-5 rounded-2xl border border-neutral-light bg-white p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-3xl">verified_user</span>
              </div>
              <div>
                <h4 className="text-sm font-medium text-text-muted">Quality Guarantee</h4>
                <p className="text-xl font-bold">Grade A Organic Certified</p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-neutral-light bg-white">
            <div className="flex items-center justify-between border-b border-neutral-light px-6 py-4">
              <h3 className="font-bold">Aggregations Map</h3>
              <span className="text-sm font-semibold text-primary">
                Live in {detectedCity || "Toronto"}
              </span>
            </div>

            <div className="relative h-48 bg-neutral-light">
              <img
                className="h-full w-full object-cover opacity-50 grayscale"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCmMtUsrVJCgccxbkNopo_TMbC9d2xxPTsVyOZkRvhjmeYhEXglAoibwJ7oaEubZvYhftt3ZS1Gb-T14g5akFnaAytM-X0DX8Hd7AJq2bGV9Oy5SInujSd1yGwrhz2yV4HXzs04PwZmZcx_kfxLwebkZfMHQpoNa6Gc5rTfbePc3C73NQIEGE0w5kG5cjq3HXWIPGvxQjuYMn_WU44jL1tbCq5rydk-A-XGSjmD0u6UdD7aoRx9OfsiEvLgkaqQ8A3iFvPc6C3nQAk"
                alt="Toronto aggregation map"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  <div className="absolute -left-1/2 -top-10 whitespace-nowrap rounded border border-primary bg-white px-3 py-1 text-xs shadow-lg">
                    Pickup Point: St. Lawrence Market
                  </div>
                  <span className="material-symbols-outlined animate-bounce text-4xl text-primary">
                    location_on
                  </span>
                </div>
              </div>
            </div>
          </div>

        </section>
      </main>

      <Footer />
    </div>
  );
}
