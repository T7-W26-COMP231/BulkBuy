import api from "./api";

export const fetchOrderInvoice = async (orderId) => {
  const { data } = await api.get(`/orders/${orderId}/invoice`);
  return data.data;
};

export const fetchOrderStatus = async (orderId) => {
  const { data } = await api.get(`/orders/${orderId}/status`);
  return data.data;
};

// src/api/orderApi.js  — add this function
export const fetchAllOrders = async () => {
  const { data } = await api.get("/orders");
  console.log("fetchAllOrders response:", data); // ← add this
  return data.data;
};