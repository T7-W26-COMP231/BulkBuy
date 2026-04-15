import api from "./api";

export const fetchOrderInvoice = async (orderId) => {
  const { data } = await api.get(`/orders/${orderId}/invoice`);
  return data.data;
};

export const fetchOrderStatus = async (orderId) => {
  const { data } = await api.get(`/orders/${orderId}/status`);
  return data.data;
};

export const fetchAllOrders = async () => {
  const { data } = await api.get("/orders");
  console.log("fetchAllOrders response:", data);
  return data.items || data.data || [];
};

export const getThresholdChangeEvents = async (params = {}) => {
  const { data } = await api.get("/orders/threshold-change-events", {
    params,
  });

  return data?.data || data || { items: [] };
};