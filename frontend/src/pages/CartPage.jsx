// ============================================================
// 🛒 Cart Page - BulkBuy (Step 1: Quantity Control)
// ============================================================

import { useState } from "react";

const CartPage = () => {
  // ============================================================
  // 🔹 TEMP MOCK DATA (we will replace later with real API)
  // ============================================================
  const [cartItems, setCartItems] = useState([
    {
      _id: "1",
      name: "Premium Organic Avocados",
      price: 1.25,
      quantity: 2,
    },
  ]);

  // ============================================================
  // 🔹 HANDLE QUANTITY CHANGE
  // ============================================================
  const handleQuantityChange = (id, newQty) => {
    if (newQty < 1) return; // prevent 0 or negative

    setCartItems((prevItems) =>
      prevItems.map((item) =>
        item._id === id ? { ...item, quantity: newQty } : item
      )
    );
  };

  // ============================================================
  // 🧾 RENDER
  // ============================================================
  return (
    <div style={{ padding: "20px" }}>
      <h2>🛒 Your Cart</h2>

      {cartItems.length === 0 ? (
        <p>Your cart is empty</p>
      ) : (
        <table width="100%" border="1" cellPadding="10">
          <thead>
            <tr>
              <th>Item</th>
              <th>Price</th>
              <th>Quantity</th>
              <th>Total</th>
            </tr>
          </thead>

          <tbody>
            {cartItems.map((item) => (
              <tr key={item._id}>
                <td>{item.name}</td>

                <td>${item.price.toFixed(2)}</td>

                {/* ✅ THIS IS YOUR TASK (INPUT CONTROL) */}
                <td>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      handleQuantityChange(
                        item._id,
                        Number(e.target.value)
                      )
                    }
                    style={{ width: "60px" }}
                  />
                </td>

                <td>
                  ${(item.price * item.quantity).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default CartPage;