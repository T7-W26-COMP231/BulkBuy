// ============================================================
// 🛣️ AGGREGATION ROUTES - BULKBUY
// Handles aggregation endpoints
// ============================================================

import express from "express";
import {
  getAggregations,
  getCityDemandSummary,
} from "../controllers/aggregationController.js";

const router = express.Router();

// ============================================================
// 📊 GET ALL AGGREGATIONS (WITH STATUS)
// GET /api/aggregations
// Optional: ?city=Toronto
// ============================================================

router.get("/", getAggregations);

// ============================================================
// 🏙️ GET CITY DEMAND SUMMARY
// GET /api/aggregations/city-summary?city=Toronto
// ============================================================

router.get("/city-summary", getCityDemandSummary);

export default router;