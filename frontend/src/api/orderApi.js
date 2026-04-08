import api from './api';

export const fetchOrderInvoice = async (orderId) => {
  const { data } = await api.get(`/api/orders/${orderId}/invoice`);
  return data.data;
};