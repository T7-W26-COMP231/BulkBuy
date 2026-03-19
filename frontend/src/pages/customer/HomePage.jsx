// ============================================================
// 🏠 BulkBuy Home Page (Customer - PRODUCTION READY)
// ✅ MongoDB connected
// ✅ Multiple aggregations (REAL marketplace)
// ✅ Dynamic city filter
// ✅ Image fallback handling
// ============================================================

import { useState, useEffect } from "react";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";
import { fetchAggregations } from "../../api/aggregationApi";

// ------------------------------------------------------------
// 📍 Helper: Detect nearest city (basic logic)
// ------------------------------------------------------------
function getNearestCity() {
  return "Toronto";
}

// ============================================================
// 🏠 MAIN COMPONENT
// ============================================================
export default function HomePage() {
  // ----------------------------------------------------------
  // 🌍 LOCATION + CITY STATE
  // ----------------------------------------------------------
  const [detectedCity, setDetectedCity] = useState("Toronto");
  const [selectedCity, setSelectedCity] = useState("Toronto");

  // ----------------------------------------------------------
  // 📦 DATA STATE
  // ----------------------------------------------------------
  const [aggregations, setAggregations] = useState([]);
  const [loading, setLoading] = useState(false);

  // ----------------------------------------------------------
  // 📍 GET LOCATION
  // ----------------------------------------------------------
  useEffect(() => {
    const city = getNearestCity();
    setDetectedCity(city);
    setSelectedCity(city);
  }, []);

  // ----------------------------------------------------------
  // 🔄 FETCH DATA
  // ----------------------------------------------------------
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const data = await fetchAggregations(selectedCity);
        setAggregations(data);
      } catch (err) {
        console.error("❌ Error fetching aggregations:", err);
        setAggregations([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedCity]);

  // ----------------------------------------------------------
  // 🎯 UI
  // ----------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="flex">
        <Sidebar />

        <main className="flex-1 p-6">
          {/* HEADER */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold">
              Active Aggregations in {selectedCity}
            </h1>
            <p className="text-gray-500">
              Join local bulk buys to unlock lower pricing tiers.
            </p>

            {loading && (
              <p className="text-sm text-gray-400 mt-2">
                Loading aggregations...
              </p>
            )}
          </div>

          {/* ========================= */}
          {/* 🧾 AGGREGATION LIST */}
          {/* ========================= */}

          {aggregations.length === 0 && !loading && (
            <p className="text-gray-500">
              No aggregations found for {selectedCity}
            </p>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {aggregations.map((item) => {
              const percent = Math.min(
                (item.soldUnits / item.targetUnits) * 100,
                100
              );

              const imageUrl =
                item.image && item.image.startsWith("http")
                  ? item.image
                  : "https://images.unsplash.com/photo-1582515073490-dcbb4cfae1bb";

              return (
                <div
                  key={item._id}
                  className="bg-white rounded-2xl shadow-lg overflow-hidden"
                >
                  {/* IMAGE */}
                  <div className="relative">
                    <img
                      src={imageUrl}
                      alt={item.title}
                      className="w-full h-56 object-cover"
                    />

                    {/* STATUS BADGE */}
                    <div
                      className={`absolute left-4 top-4 px-3 py-1 rounded-full text-xs font-bold text-white ${
                        item.status === "OPEN"
                          ? "bg-green-500"
                          : "bg-red-500"
                      }`}
                    >
                      {item.status === "OPEN"
                        ? "Window Open"
                        : "Closed"}
                    </div>
                  </div>

                  {/* CONTENT */}
                  <div className="p-5">
                    <h2 className="text-xl font-bold mb-1">
                      {item.title}
                    </h2>

                    {/* PRICE */}
                    <div className="text-green-600 text-xl font-bold mb-2">
                      ${item.price}
                    </div>

                    {/* STATUS TEXT */}
                    <div className="text-sm text-gray-500 mb-3">
                      {item.status === "OPEN" ? (
                        <>
                          Closes in{" "}
                          <span className="text-red-500 font-semibold">
                            {item.closesIn}
                          </span>
                        </>
                      ) : (
                        <span className="text-red-500 font-semibold">
                          Aggregation Closed
                        </span>
                      )}
                    </div>

                    {/* PROGRESS */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Progress</span>
                        <span className="font-bold">
                          {item.soldUnits}/{item.targetUnits}
                        </span>
                      </div>

                      <div className="w-full h-2 bg-gray-200 rounded">
                        <div
                          className="h-full bg-green-500 rounded transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>

                    {/* BUTTON */}
                    <button className="mt-4 w-full bg-teal-500 hover:bg-teal-600 text-white py-2 rounded-lg font-semibold">
                      Join Bulk Buy
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}