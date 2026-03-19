// ============================================================
// 🛣️ AGGREGATION ROUTES - BULKBUY
// ============================================================

import express from "express";
import { getAggregations } from "../controllers/aggregationController.js";

const router = express.Router();

// ============================================================
// 📊 GET ALL AGGREGATIONS
// GET /api/aggregations
// ============================================================

router.get("/", getAggregations);

export default router;