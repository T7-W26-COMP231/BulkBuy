// // ============================================================
// // 🛒 Cart Page - BulkBuy (Step 1: Quantity Control)
// // ============================================================

// import { useState } from "react";

// const CartPage = () => {
//   const [cartItems, setCartItems] = useState([
//     {
//       _id: "1",
//       name: "Premium Organic Avocados",
//       price: 1.25,
//       quantity: 2,
//     },
//   ]);

//   const handleQuantityChange = (id, newQty) => {
//     if (newQty < 1) return;
//     setCartItems((prevItems) =>
//       prevItems.map((item) =>
//         item._id === id ? { ...item, quantity: newQty } : item
//       )
//     );
//   };

//   return (
//     <div style={{ padding: "20px" }}>
//       <h2>🛒 Your Cart</h2>

//       {cartItems.length === 0 ? (
//         <p>Your cart is empty</p>
//       ) : (
//         <table width="100%" border="1" cellPadding="10">
//           <thead>
//             <tr>
//               <th>Item</th>
//               <th>Price</th>
//               <th>Quantity</th>
//               <th>Total</th>
//             </tr>
//           </thead>
//           <tbody>
//             {cartItems.map((item) => (
//               <tr key={item._id}>
//                 <td>{item.name}</td>
//                 <td>${item.price.toFixed(2)}</td>
//                 <td>
//                   <input
//                     type="number"
//                     min="1"
//                     value={item.quantity}
//                     onChange={(e) =>
//                       handleQuantityChange(item._id, Number(e.target.value))
//                     }
//                     style={{ width: "60px" }}
//                   />
//                 </td>
//                 <td>${(item.price * item.quantity).toFixed(2)}</td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       )}
//       {/* ⚠️ VALIDATION — Task #104 */}
//       {cartItems.length === 0 && (
//         <p style={{ color: "red" }}>
//           Please add at least one item before confirming.
//         </p>
//       )}

//       {/* 🧮 CART TOTAL — Task #46 */}
//       <p>
//         <strong>Total: </strong>
//         ${cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)}
//       </p>

//       {/* ✅ CONFIRM INTENT BUTTON — Task #48 */}
//       <button
//         disabled={cartItems.length === 0}
//         onClick={() => alert("Intent confirmed!")}
//       >
//         Confirm Intent
//       </button>
//     </div>
//   );
// };

// export default CartPage;