// ============================================================
// ITEM API SERVICE
// Public item catalog for marketplace page
// ============================================================

const API_URL = "http://localhost:5000/api/items";

// ------------------------------------------------------------
// FETCH ITEM CATALOG
// GET /api/items/catalog
// ------------------------------------------------------------
export const fetchItemCatalog = async (params = {}) => {
  try {
    const query = new URLSearchParams();
    if (params.page) query.append("page", params.page);
    if (params.limit) query.append("limit", params.limit);
    if (params.category) query.append("category", params.category);
    if (params.ops_region) query.append("ops_region", params.ops_region);
    if (params.q) query.append("q", params.q);

    const url = `${API_URL}/catalog${query.toString() ? `?${query.toString()}` : ""}`;

    const res = await fetch(url);
    const data = await res.json();
    console.log(data)
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to fetch item catalog");
    }

    return data;
  } catch (error) {
    console.error("Item Catalog API Error:", error);
    return {
      success: false,
      items: [],
      total: 0,
      page: 1,
      limit: 24,
      pages: 1,
    };
  }
};