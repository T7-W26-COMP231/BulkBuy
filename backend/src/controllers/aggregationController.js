// ============================================================
// 🗺️ AGGREGATION CONTROLLER - BULKBUY
// Handles aggregation window status (OPEN / CLOSED)
// ============================================================

// ============================================================
// 🧠 HELPER: DETERMINE STATUS
// ============================================================

const getAggregationStatus = (aggregation) => {
  if (!aggregation) return "CLOSED";

  const { soldUnits = 0, targetUnits = 0 } = aggregation;

  // ✅ If target reached → CLOSED
  if (soldUnits >= targetUnits) {
    return "CLOSED";
  }

  // ✅ Otherwise → OPEN
  return "OPEN";
};

// ============================================================
// 🚀 GET ALL AGGREGATIONS (WITH STATUS)
// GET /api/aggregations
// ============================================================

export const getAggregations = async (req, res) => {
  try {
    // 🔥 TEMP MOCK DATA (until DB is connected)
    const aggregations = [
      {
        id: 1,
        title: "Premium Organic Avocados",
        price: 1.25,
        location: "Toronto",
        soldUnits: 750,
        targetUnits: 1000,
      },
      {
        id: 2,
        title: "Fresh Milk (1L)",
        price: 2.99,
        location: "Etobicoke",
        soldUnits: 600,
        targetUnits: 600,
      },
    ];

    // 🔹 ADD STATUS TO EACH
    const result = aggregations.map((item) => ({
      ...item,
      status: getAggregationStatus(item),
    }));

    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });

  } catch (error) {
    console.error("🔥 Aggregation error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch aggregations",
    });
  }
};