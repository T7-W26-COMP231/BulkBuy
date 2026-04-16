import React, { createContext, useContext, useState, useCallback } from "react";
import { fetchAllOrders } from "../api/orderApi";

const SavingsContext = createContext(null);
const CONFIRMED_STATUSES = ["confirmed", "completed", "fulfilled"];

function calcOrderSavings(order) {
    if (order.summary?.totalSavings !== undefined) {
        return Number(order.summary.totalSavings) || 0;
    }
    return (order.items || []).reduce((total, item) => {
        const snapshots = Array.isArray(item.pricingSnapshot)
            ? item.pricingSnapshot : [item.pricingSnapshot];
        const latest = snapshots[snapshots.length - 1];
        const initial = latest?.discountBracket?.initial ?? 0;
        const final = latest?.discountBracket?.final ?? latest?.atInstantPrice ?? 0;
        const saved = (initial - final) * (item.quantity ?? 1);
        return total + (saved > 0 ? saved : 0);
    }, 0);
}

export const SavingsProvider = React.forwardRef(({ children }, ref) => {
    const [orderSavings, setOrderSavings] = useState({});
    const [loadingState, setLoadingState] = useState(false); // ← MOVED HERE

    const loadSavings = useCallback(async (userId) => {
        setLoadingState(true); // ← ADD
        console.log("🔍 loadSavings called with userId:", userId); // ← ADD

        try {
            const orders = await fetchAllOrders();
            const savingsMap = {};
            (orders || []).forEach((order) => {
                const status = order.status?.toLowerCase();
                const isUsersOrder = !userId || String(order.userId) === String(userId); // ← ADD
                console.log(`order ${order._id}: userId=${order.userId} match=${isUsersOrder} status=${status}`);
                if (CONFIRMED_STATUSES.includes(status) && isUsersOrder) {
                    const savings = calcOrderSavings(order);
                    if (savings > 0) savingsMap[order._id] = savings;
                }
            });
            console.log("💰 final savingsMap:", savingsMap);
            setOrderSavings(savingsMap);
        } catch (err) {
            console.error("Failed to load savings:", err);
        } finally {
            setLoadingState(false); // ← ADD
        }
    }, []);

    const clearSavings = useCallback(() => setOrderSavings({}), []);

    const recordOrderSavings = useCallback((orderId, amount) => {
        setOrderSavings((prev) => ({ ...prev, [orderId]: amount }));
    }, []);

    React.useImperativeHandle(ref, () => ({ loadSavings, clearSavings }));

    const totalSaved = Object.values(orderSavings).reduce((sum, v) => sum + v, 0);

    return (
        <SavingsContext.Provider value={{ totalSaved, loadSavings, clearSavings, recordOrderSavings, loadingState }}>
            {children}
        </SavingsContext.Provider>
    );
});

export function useSavings() {
    const ctx = useContext(SavingsContext);
    if (!ctx) {
        return {
            totalSaved: 0,
            loadSavings: () => { },
            clearSavings: () => { },
            recordOrderSavings: () => { },
            loadingState: false
        };
    }
    return ctx;
}