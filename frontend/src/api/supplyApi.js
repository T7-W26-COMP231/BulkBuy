// src/api/supplyApi.js
import api from "./api";

export const fetchQuotesByStatus = async (status) => {
  const response = await api.get("/supls", {
    params: { status },
  });
  return response.data;
};

export const fetchQuoteCounts = async () => {
  const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
    fetchQuotesByStatus("quote"),
    fetchQuotesByStatus("accepted"),
    fetchQuotesByStatus("cancelled"),
  ]);

  return {
    Pending: (pendingRes.items || pendingRes.data || []).length,
    Approved: (approvedRes.items || approvedRes.data || []).length,
    Rejected: (rejectedRes.items || rejectedRes.data || []).length,
  };
};