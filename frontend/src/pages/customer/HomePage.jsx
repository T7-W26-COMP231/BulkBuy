// src/pages/marketplace/HomePage.jsx
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";
import { getCityData, getFeaturedAggregation } from "../../data/mockData";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useOpsContext } from "../../contexts/OpsContext.jsx";

import { initSocket } from "../../comms-js/socket";

const GTA_CITIES = [
  { name: "Toronto", lat: 43.6532, lng: -79.3832 },
  { name: "Scarborough", lat: 43.7764, lng: -79.2318 },
  { name: "Mississauga", lat: 43.589, lng: -79.6441 },
  { name: "Brampton", lat: 43.7315, lng: -79.7624 },
  { name: "Markham", lat: 43.8561, lng: -79.337 },
  { name: "Vaughan", lat: 43.8361, lng: -79.4983 },
  { name: "Richmond Hill", lat: 43.8828, lng: -79.4403 },
  { name: "Oakville", lat: 43.4675, lng: -79.6877 },
  { name: "Burlington", lat: 43.3255, lng: -79.799 },
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
    { city: "Toronto", dist: Infinity },
  ).city;
}

export default function HomePage() {
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
  }, []);

  // Auth + Ops contexts
  const { user, accessToken } = useAuth();
  const {
    orders,
    wsuorders, wsuproducts,
    products,
    productsMeta,
    setOps_region,
    setSocket,
    fetchAndSetUiProducts,
    fetchAndSetEnrichedOrders,
    clearState: clearOpsState,
    // applyRealtimeUpdate,
    backendUrl
  } = useOpsContext();

  const [locationState, setLocationState] = useState("idle");
  const [detectedCity, setDetectedCity] = useState(null);

  // Derived display city
  const activeCity = detectedCity || productsMeta?.region || "Toronto";
  const cityData = getCityData(activeCity);
  const selectedAggregation = getFeaturedAggregation(activeCity);
  const aggregationStatus = selectedAggregation?.status ?? "OPEN";
  const closesIn = selectedAggregation?.closesIn ?? "TBD";
  const progressPct = selectedAggregation ? Math.min((selectedAggregation.soldUnits / selectedAggregation.targetUnits) * 100, 100,) : 0;

  useEffect(() => {
    setOps_region((() => "north-america:ca-on" || activeCity)());
  }, []);

  //-------------------------------------------------------------------------------------------------------

  // PRODUCTS: run on mount and when region changes
  useEffect(() => {
    const controller = new AbortController();
    const region = "north-america:ca-on" || productsMeta?.region || detectedCity || "Toronto";
    try {
      const socket = initSocket(null, { region, url: backendUrl });
      setSocket(socket)
      fetchAndSetUiProducts({
        region,
        page: 1,
        limit: 24,
        signal: controller.signal,
      }).then((e) => {
        // eslint-disable-next-line no-console
        console.log("01 | products ->", products /* JSON.stringify(products)*/); //----------------------
      }).catch((err) => {
        if (err && err.name === "AbortError") return;
      });

      setTimeout(() => {
        return () => controller.abort();
      }, 2000);
    } catch (error) {
      console.log("home page - products+socket : this is the error ", error);
    }

  }, [wsuproducts, productsMeta?.region, products, detectedCity, fetchAndSetUiProducts]);

  //-------------------------------------------------------------------------------------------------------

  // ORDERS: ensure fetch runs only when auth is available (user._id AND accessToken)
  // This guarantees the request includes auth headers and runs immediately after sign-in.
  // Orders loader: busy while loop that yields to the event loop each iteration
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const run = async () => {
      try {
        // If there's no user at all, clear ops and exit early.
        if (!user || !user.userId || !accessToken) {
          if (!accessToken) {
            clearOpsState();
            return;
          }
        }
        if (!mounted || controller.signal.aborted) return;

        const region = "north-america:ca-on" || productsMeta?.region || detectedCity || "Toronto";
        await fetchAndSetEnrichedOrders({
          userId: user.userId, //user._id, --- careful this : endpoint expects the users public ID
          region,
          page: 1,
          limit: 25,
          requireAuth: true,
          signal: controller.signal,
          jwtAccessToken: accessToken
        }).then(() => {
          // eslint-disable-next-line no-console
          console.log("02 | orders ->", orders /* JSON.stringify(orders) */); //------------------------
        });

      } catch (err) {
        if (err && err.name === "AbortError") return;
        // eslint-disable-next-line no-console
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
    detectedCity,
    fetchAndSetEnrichedOrders,
    clearOpsState,

  ]);

  // useEffect(() => {
  //   const socketUrl =
  //     import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
  //   const socket = io(socketUrl, { autoConnect: true });
  //   socketRef.current = socket;

  //   socket.on("connect", () => setSocketConnected(true));
  //   socket.on("disconnect", () => setSocketConnected(false));

  //   socket.on("product:update", (payload) => {
  //     try {
  //       applyRealtimeUpdate({
  //         products: Array.isArray(payload) ? payload : [payload],
  //       });
  //     } catch (e) {}
  //   });

  //   socket.on("order:update", (payload) => {
  //     try {
  //       applyRealtimeUpdate({
  //         orders: Array.isArray(payload) ? payload : [payload],
  //       });
  //     } catch (e) {}
  //   });

  //   socket.on("order_created", (data) => {
  //     try {
  //       applyRealtimeUpdate({ order: data });
  //     } catch (e) {}
  //     // eslint-disable-next-line no-alert
  //     alert("New order created");
  //   });

  //   return () => {
  //     try {
  //       socket.disconnect();
  //     } catch {}
  //     socketRef.current = null;
  //   };
  // }, [applyRealtimeUpdate]);

  // Location modal logic



  useEffect(() => {
    const savedCity = sessionStorage.getItem("detectedCity");
    const dismissed = sessionStorage.getItem("locationModalDismissed");
    let timer = null;
    if (savedCity) {
      setDetectedCity(savedCity);
      if (!dismissed) setLocationState("done");
    } else {
      const asked = sessionStorage.getItem("askedLocation");
      if (!asked) timer = setTimeout(() => setLocationState("asking"), 600);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  const handleAllow = () => {
    sessionStorage.setItem("askedLocation", "true");
    setLocationState("detecting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const city = getNearestCity(pos.coords.latitude, pos.coords.longitude);
        setDetectedCity(city);
        sessionStorage.setItem("detectedCity", city);
        sessionStorage.removeItem("locationModalDismissed");
        setLocationState("done");
      },
      () => setLocationState("denied"),
    );
  };

  const handleDismiss = () => {
    sessionStorage.setItem("askedLocation", "true");
    sessionStorage.setItem("locationModalDismissed", "true");
    setLocationState("idle");
  };

  const handleCityChange = (newCity) => {
    setDetectedCity(newCity);
    sessionStorage.setItem("detectedCity", newCity);
    fetchAndSetUiProducts({ region: newCity, page: 1, limit: 24 }).catch(
      () => 0,
    );
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light text-text-main font-display">
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
                  <h2 className="mb-1 text-lg font-bold">
                    Detect your location
                  </h2>
                  <p className="mb-6 text-sm text-text-muted">
                    Allow BulkBuy to detect your location so we can show bulk
                    deals near you in the GTA.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleDismiss}
                      className="flex-1 rounded-xl border border-neutral-light py-2.5 text-sm font-semibold text-text-muted transition-colors hover:bg-gray-50"
                    >
                      Not now
                    </button>
                    <button
                      onClick={handleAllow}
                      className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-text-main shadow-sm transition-colors hover:bg-primary/90"
                    >
                      Allow
                    </button>
                  </div>
                </>
              )}
              {locationState === "detecting" && (
                <>
                  <h2 className="mb-1 text-lg font-bold">
                    Detecting your city ...
                  </h2>
                  <p className="text-sm text-text-muted">
                    Finding the nearest GTA city to you.
                  </p>
                  <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-light">
                    <div
                      className="h-full animate-pulse rounded-full bg-primary"
                      style={{ width: "60%" }}
                    />
                  </div>
                </>
              )}
              {locationState === "done" && (
                <>
                  <h2 className="mb-1 text-lg font-bold">Location set!</h2>
                  <p className="text-sm text-text-muted">
                    We've set your city to{" "}
                    <span className="font-semibold text-text-main">
                      {detectedCity}
                    </span>
                    . You can change it anytime from the navbar.
                  </p>
                  <button
                    onClick={handleDismiss}
                    className="mt-5 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-text-main shadow-sm transition-colors hover:bg-primary/90"
                  >
                    Got it
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      <Navbar detectedCity={activeCity} onCityChange={handleCityChange} />
      <main className="flex flex-1 flex-col gap-8 px-4 py-8 md:flex-row md:px-20 lg:px-40">
        <Sidebar
          totalSavings={cityData.totalSavings}
          savingsLabel={cityData.savingsLabel}
        />
        <section className="flex flex-1 flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">
              Active Aggregations in {activeCity}
            </h1>
            <p className="text-text-muted">
              Join local bulk buys to unlock lower pricing tiers.
            </p>
          </div>
          <div className="flex flex-col overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm lg:flex-row">
            <div className="relative h-64 w-full lg:h-auto lg:w-2/5">
              <img
                key={selectedAggregation?.id}
                className="h-full w-full object-cover"
                src={selectedAggregation?.imageUrl}
                alt={selectedAggregation?.title || "Aggregation image"}
              />
              <div
                className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${aggregationStatus === "CLOSED" ? "bg-red-500 text-white" : "bg-primary text-text-main"}`}
              >
                {aggregationStatus === "CLOSED"
                  ? "Window Closed"
                  : "Window Open"}
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-between gap-6 p-6 md:p-8">
              <div>
                <div className="mb-2 flex items-start justify-between">
                  <h2 className="text-2xl font-bold">
                    {selectedAggregation?.title ?? "-"}
                  </h2>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-primary">
                      ${selectedAggregation?.price?.toFixed(2) ?? "-"}
                    </span>
                    <span className="block text-sm text-text-muted">
                      Current Tier 2 Price
                    </span>
                  </div>
                </div>
                <div className="mb-6 flex items-center gap-2 text-sm text-text-muted">
                  <span className="material-symbols-outlined text-sm">
                    schedule
                  </span>
                  <span>
                    {aggregationStatus === "CLOSED" ? (
                      <span className="font-semibold text-red-500">Closed</span>
                    ) : (
                      <>
                        Closes in{" "}
                        <span className="font-semibold text-red-500">
                          {closesIn}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="mx-2">.</span>
                  <span className="material-symbols-outlined text-sm">
                    local_shipping
                  </span>
                  <span>
                    Pickup: {selectedAggregation?.pickupLocation ?? activeCity}
                  </span>
                </div>
                <div className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">
                        Progress to{" "}
                        {selectedAggregation?.nextTierLabel ?? "Next Tier"}
                      </span>
                      <span className="text-xs text-text-muted">
                        {selectedAggregation?.unitsToNextTier ?? 0} units
                        remaining to trigger next discount
                      </span>
                    </div>
                    <span className="text-sm font-bold">
                      {selectedAggregation
                        ? `$${selectedAggregation.soldUnits}/$${selectedAggregation.targetUnits} units`
                        : "-"}
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
                  <img
                    className="h-10 w-10 rounded-full border-2 border-white object-cover"
                    src="https://via.placeholder.com/40"
                    alt="Participant 1"
                  />
                  <img
                    className="h-10 w-10 rounded-full border-2 border-white object-cover"
                    src="https://via.placeholder.com/40"
                    alt="Participant 2"
                  />
                  <img
                    className="h-10 w-10 rounded-full border-2 border-white object-cover"
                    src="https://via.placeholder.com/40"
                    alt="Participant 3"
                  />
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-neutral-light text-xs font-medium">
                    +
                    {Math.max(
                      0,
                      (selectedAggregation?.participants ?? 145) - 3,
                    )}
                  </div>
                </div>
                <button className="rounded-xl bg-primary px-8 py-3 font-bold text-text-main shadow-md transition-all hover:bg-primary/90">
                  Join Bulk Buy
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex items-center gap-5 rounded-2xl border border-neutral-light bg-white p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-3xl">
                  savings
                </span>
              </div>
              <div>
                <h4 className="text-sm font-medium text-text-muted">
                  Estimated Savings
                </h4>
                <p className="text-xl font-bold">
                  {selectedAggregation?.estimatedSavings ?? "-"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-5 rounded-2xl border border-neutral-light bg-white p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-3xl">
                  verified_user
                </span>
              </div>
              <div>
                <h4 className="text-sm font-medium text-text-muted">
                  Quality Guarantee
                </h4>
                <p className="text-xl font-bold">
                  {selectedAggregation?.qualityLabel ?? "-"}
                </p>
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-neutral-light bg-white">
            <div className="flex items-center justify-between border-b border-neutral-light px-6 py-4">
              <h3 className="font-bold">Aggregations Map</h3>
              <span className="text-sm font-semibold text-primary">
                Live in {activeCity}
              </span>
            </div>
            <div className="relative h-48 bg-neutral-light">
              <img
                className="h-full w-full object-cover opacity-50 grayscale"
                src="https://via.placeholder.com/800x300"
                alt={`${activeCity} aggregation map`}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  <div className="absolute -left-1/2 -top-10 whitespace-nowrap rounded border border-primary bg-white px-3 py-1 text-xs shadow-lg">
                    Pickup Point:{" "}
                    {selectedAggregation?.pickupDetail ?? `${activeCity} Hub`}
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
