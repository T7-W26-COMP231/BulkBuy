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