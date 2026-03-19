// ============================================================
// 🚀 BULKBUY BACKEND SERVER (PRODUCTION READY + MONGODB)
// ============================================================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// 🔗 DB CONNECTION
import connectDB from "./src/config/db.js";

// 🔗 ROUTES
import aggregationRoutes from "./src/routes/aggregationRoutes.js";

// 🔹 Load environment variables
dotenv.config();

// ============================================================
// 🗄️ CONNECT DATABASE (VERY IMPORTANT)
// ============================================================
connectDB();

// 🔹 Create app
const app = express();

// ============================================================
// 🛡️ MIDDLEWARE
// ============================================================

// 🔹 CORS (Production Safe)
app.use(
  cors({
    origin: "*", // 👉 later restrict to frontend domain
    credentials: true,
  })
);

// 🔹 JSON parser
app.use(express.json());

// ============================================================
// 🧪 TEST ROUTE (HEALTH CHECK)
// ============================================================

app.get("/", (req, res) => {
  res.send("🚀 BulkBuy API is running...");
});

// ============================================================
// 📊 API ROUTES
// ============================================================

// 🔹 Aggregations API
app.use("/api/aggregations", aggregationRoutes);

// ============================================================
// ❌ 404 HANDLER (IMPORTANT)
// ============================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// ============================================================
// ❌ GLOBAL ERROR HANDLER (PRODUCTION SAFE)
// ============================================================

app.use((err, req, res, next) => {
  console.error("🔥 Server Error:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// ============================================================
// 🌐 PORT CONFIG
// ============================================================

const PORT = process.env.PORT || 5000;

// ============================================================
// 🚀 START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});