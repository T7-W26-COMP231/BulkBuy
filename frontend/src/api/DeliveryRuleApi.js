// src/api/deliveryRuleApi.js
import api from "./api";

export const getDeliveryRules = async (query = {}) => {
    const response = await api.get("/delivery-rules", { params: query });
    return response.data;
};

export const createDeliveryRule = async (payload) => {
    const response = await api.post("/delivery-rules", payload);
    return response.data;
};

export const updateDeliveryRule = async (ruleId, payload) => {
    const response = await api.patch(`/delivery-rules/${ruleId}`, payload);
    return response.data;
};

export const deleteDeliveryRule = async (ruleId) => {
    const response = await api.post(`/delivery-rules/${ruleId}/soft-delete`);
    return response.data;
};