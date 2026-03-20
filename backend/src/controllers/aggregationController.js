// ============================================================
// 🗺️ AGGREGATION CONTROLLER - BULKBUY
// Handles aggregation list + city demand summary
// ============================================================

import Aggregation from "../models/Aggregation.js";

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
// 🧠 HELPER: CALCULATE TIME LEFT
// ============================================================

const getClosesIn = (closesAt) => {
  if (!closesAt) return "TBD";

  const now = new Date();
  const closeDate = new Date(closesAt);
  const diffMs = closeDate - now;

  if (diffMs <= 0) return "Closed";

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);

  if (diffDays > 0) {
    return `${diffDays}d ${diffHours}h`;
  }

  return `${diffHours}h`;
};

// ============================================================
// 🚀 GET ALL AGGREGATIONS (WITH STATUS)
// GET /api/aggregations
// Optional: ?city=Toronto
// ============================================================

export const getAggregations = async (req, res) => {
  try {
    const { city } = req.query;

    const filter = {};

    if (city) {
      filter.city = new RegExp(`^${city}$`, "i");
    }

    const aggregations = await Aggregation.find(filter).sort({ createdAt: -1 });

    const result = aggregations.map((item) => ({
      ...item.toObject(),
      status: getAggregationStatus(item),
      closesIn: getClosesIn(item.closesAt),
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

// ============================================================
// 🏙️ GET CITY DEMAND SUMMARY
// GET /api/aggregations/city-summary?city=Toronto
// ============================================================

export const getCityDemandSummary = async (req, res) => {
  try {
    const { city } = req.query;

    if (!city) {
      return res.status(400).json({
        success: false,
        message: "City is required",
      });
    }

    const cityAggregations = await Aggregation.find({
      city: new RegExp(`^${city}$`, "i"),
    });

    if (cityAggregations.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No aggregation data found for city: ${city}`,
      });
    }

    const totalSoldUnits = cityAggregations.reduce(
      (sum, item) => sum + item.soldUnits,
      0
    );

    const totalTargetUnits = cityAggregations.reduce(
      (sum, item) => sum + item.targetUnits,
      0
    );

    const totalSavings = cityAggregations.reduce(
      (sum, item) => sum + (item.estimatedSavingsPerUnit || 0),
      0
    );

    const overallProgress =
      totalTargetUnits > 0
        ? Number(((totalSoldUnits / totalTargetUnits) * 100).toFixed(2))
        : 0;

    const averageEstimatedSavingsPerUnit =
      cityAggregations.length > 0
        ? Number((totalSavings / cityAggregations.length).toFixed(2))
        : 0;

    const activeDeals = cityAggregations.map((item) => ({
      id: item._id,
      title: item.title,
      city: item.city,
      soldUnits: item.soldUnits,
      targetUnits: item.targetUnits,
      status: getAggregationStatus(item),
      estimatedSavingsPerUnit: item.estimatedSavingsPerUnit,
    }));

    res.status(200).json({
      success: true,
      data: {
        city,
        totalActiveAggregations: cityAggregations.length,
        totalSoldUnits,
        totalTargetUnits,
        overallProgress,
        estimatedSavingsPerUnit: averageEstimatedSavingsPerUnit,
        activeDeals,
      },
    });
  } catch (error) {
    console.error("🔥 City demand summary error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch city demand summary",
    });
  }
};