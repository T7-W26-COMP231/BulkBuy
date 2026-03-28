// ============================================================
// 📡 AGGREGATION API SERVICE
// ============================================================

const API_URL = `${import.meta.env.VITE_API_URL}/api/aggregations`;

// GET AGGREGATIONS BY CITY
export const fetchAggregations = async (city) => {
  try {
    const res = await fetch(`${API_URL}?city=${city}`);

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.message || "Failed to fetch");
    }

    return data.data;

  } catch (error) {
    console.error("🔥 API Error:", error);
    return [];
  }
};