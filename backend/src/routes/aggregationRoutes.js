// ============================================================
// 🛣️ AGGREGATION ROUTES - BULKBUY
// ============================================================

import express from "express";
import {
  getAggregations,
  getCityDemandSummary,
} from "../controllers/aggregationController.js";

const router = express.Router();

// ============================================================
// 📊 GET CITY DEMAND SUMMARY
// GET /api/aggregations/city-summary?city=Toronto
// ============================================================

router.get("/city-summary", getCityDemandSummary);

// ============================================================
// 📊 GET ALL AGGREGATIONS
// GET /api/aggregations
// Optional: ?city=Toronto
// ============================================================

router.get("/", getAggregations);

export default router;