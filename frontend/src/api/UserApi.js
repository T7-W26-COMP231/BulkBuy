// src/api/UserApi.js
import api from "./api";

export const getSuppliers = async () => {
    const response = await api.get("/users", {
        params: {
            filter: JSON.stringify({ role: "supplier" })
        }
    });
    return response.data;
};