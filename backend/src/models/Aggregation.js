// ============================================================
// 📦 AGGREGATION MODEL - BULKBUY
// Stores aggregation items for each city
// ✅ Includes status (OPEN / CLOSED)
// ============================================================

import mongoose from "mongoose";

const aggregationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    soldUnits: {
      type: Number,
      default: 0,
      min: 0,
    },
    targetUnits: {
      type: Number,
      required: true,
      min: 1,
    },

    // ⭐ ADD THIS (VERY IMPORTANT)
    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
    },

    estimatedSavingsPerUnit: {
      type: Number,
      default: 0,
      min: 0,
    },
    image: {
      type: String,
      default: "",
      trim: true,
    },
    closesAt: {
      type: Date,
      default: null,
    },
    pickupLocation: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Aggregation = mongoose.model("Aggregation", aggregationSchema);

export default Aggregation;