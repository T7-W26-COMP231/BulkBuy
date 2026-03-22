// src/pages/customer/ProductDetailsPage.jsx

import { useParams } from "react-router-dom";

// SAME MOCK DATA (keep consistent with Shop.jsx)
const products = [
  { title: "Avocados", category: "Fruits", price: 1.25 },
  { title: "Bananas", category: "Fruits", price: 0.99 },
  { title: "Rice", category: "Grains", price: 12.5 },
  { title: "Milk", category: "Dairy", price: 4.1 },
  { title: "Eggs", category: "Dairy", price: 5.2 },
  { title: "Almonds", category: "Nuts", price: 6.4 },
];

export default function ProductDetailsPage() {
  // ✅ GET ID FROM URL
  const { id } = useParams();

  const product = products[id];

  // ✅ HANDLE INVALID ID
  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500 text-xl">
        Product not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-light px-6 py-10 md:px-20 lg:px-40">

      <div className="rounded-2xl border border-neutral-light bg-white p-8 shadow-sm">

        {/* TITLE */}
        <h1 className="text-3xl font-bold text-text-main">
          {product.title}
        </h1>

        {/* CATEGORY */}
        <p className="mt-2 text-text-muted">
          Category: {product.category}
        </p>

        {/* PRICE */}
        <p className="mt-4 text-2xl font-bold text-primary">
          ${product.price}
        </p>

        {/* ACTION BUTTON */}
        <button className="mt-6 rounded-xl bg-primary px-6 py-3 text-white font-semibold shadow-md hover:bg-primary/90 transition-all">
          Join Bulk Buy
        </button>

      </div>
    </div>
  );
}