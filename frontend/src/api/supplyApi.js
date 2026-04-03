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

export const approveQuote = async ({ supplyId, itemId, quoteId }) => {
  await api.post(`/supls/${supplyId}/accept-quote`, {
    itemId,
    quoteId,
  });

  const response = await api.post(`/supls/${supplyId}/update-status`, {
    status: "accepted",
  });

  return response.data;
};

export const rejectQuote = async ({ supplyId, rejectionReason }) => {
  const response = await api.post(`/supls/${supplyId}/update-status`, {
    status: "cancelled",
    rejectionReason,
  });

  return response.data;
};

export const fetchSupplierDashboardSummary = async () => {
  const response = await api.get("/supls/dashboard/summary");
  return response.data;
};

// to get aggregation window by supplierID
export const fetchSupplierAggregations = async (supplierId) => {
  const response = await api.get("/aggrs", {
    params: { supplierId },
  });
  return response.data;
};
export const fetchSupplierSuppliesByStatus = async (supplierId, status) => {
  const response = await api.get("/supls", {
    params: { supplierId, status },
  });
  return response.data;
};

export const fetchSupplierRecentSupplies = async () => {
  const response = await api.get("/supls", {
    params: { limit: 5 }
  });
  return response.data;
};

export const fetchApprovedItems = async () => {
  const response = await api.get("/items/approved");
  return response.data;
};