import { createContext, useContext, useState, useCallback } from "react";
import { fetchAllOrders } from "../api/orderApi";

const SavingsContext = createContext(null);
const CONFIRMED_STATUSES = ["confirmed", "submitted", "completed", "fulfilled"];

function calcOrderSavings(order) {
    return (order.items || []).reduce((total, item) => {
        const snapshots = Array.isArray(item.pricingSnapshot)
            ? item.pricingSnapshot
            : [item.pricingSnapshot];
        const latest = snapshots[snapshots.length - 1];
        const initial = latest?.discountBracket?.initial ?? 0;
        const final = latest?.discountBracket?.final ?? latest?.atInstantPrice ?? 0;
        const saved = (initial - final) * (item.quantity ?? 1);
        return total + (saved > 0 ? saved : 0);
    }, 0);
}

export function SavingsProvider({ children }) {
    const [orderSavings, setOrderSavings] = useState({});

    const loadSavings = useCallback(async () => {
        try {
            const orders = await fetchAllOrders();
            const savingsMap = {};
            orders.forEach((order) => {
                const status = order.status?.toLowerCase();
                if (CONFIRMED_STATUSES.includes(status)) {
                    const savings = calcOrderSavings(order);
                    if (savings > 0) savingsMap[order._id] = savings;
                }
            });
            setOrderSavings(savingsMap);
        } catch (err) {
            console.error("Failed to load savings:", err);
        }
    }, []);

    const clearSavings = useCallback(() => setOrderSavings({}), []);

    const recordOrderSavings = useCallback((orderId, amount) => {
        setOrderSavings((prev) => ({ ...prev, [orderId]: amount }));
    }, []);

    const totalSaved = Object.values(orderSavings).reduce((sum, v) => sum + v, 0);

    return (
        <SavingsContext.Provider value={{ totalSaved, loadSavings, clearSavings, recordOrderSavings }}>
            {children}
        </SavingsContext.Provider>
    );
}

export function useSavings() {
    const ctx = useContext(SavingsContext);
    if (!ctx) throw new Error("useSavings must be used within SavingsProvider");
    return ctx;
}