const API_URL = "http://localhost:5000/api/prdts"; // ← was /api/items

export const fetchItemCatalog = async (params = {}) => {
  try {
    const query = new URLSearchParams();
    if (params.page) query.append("page", params.page);
    if (params.limit) query.append("limit", params.limit);
    if (params.ops_region) query.append("ops_region", params.ops_region);
    if (params.q) query.append("q", params.q);

    const url = `${API_URL}${query.toString() ? `?${query.toString()}` : ""}`;

    const res = await fetch(url);
    const data = await res.json();
    console.log(data);

    if (!res.ok) {
      throw new Error("Failed to fetch products");
    }

    // Normalize whatever shape the backend returns
    const items = Array.isArray(data)
      ? data
      : Array.isArray(data.products)
        ? data.products
        : Array.isArray(data.items)
          ? data.items
          : [];

    return { success: true, items };
  } catch (error) {
    console.error("Products API Error:", error);
    return { success: false, items: [], total: 0, page: 1, limit: 24, pages: 1 };
  }
};