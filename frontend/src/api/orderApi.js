import api from "./api";

export const fetchOrderInvoice = async (orderId) => {
  const { data } = await api.get(`/orders/${orderId}/invoice`);
  return data.data;
};

export const fetchOrderStatus = async (orderId) => {
  const { data } = await api.get(`/orders/${orderId}/status`);
  return data.data;
};