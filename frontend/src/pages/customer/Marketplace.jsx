// src/pages/customer/Marketplace.jsx

import { useState } from "react"; // ✅ YOUR PART
import { useNavigate } from "react-router-dom"; // ✅ YOUR PART
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";

const products = [
    { title: "Avocados", category: "Fruits", price: 1.25 },
    { title: "Bananas", category: "Fruits", price: 0.99 },
    { title: "Rice", category: "Grains", price: 12.5 },
    { title: "Milk", category: "Dairy", price: 4.1 },
    { title: "Eggs", category: "Dairy", price: 5.2 },
    { title: "Almonds", category: "Nuts", price: 6.4 },
];

export default function Marketplace() {

    // ✅ YOUR PART — STATE
    const [searchTerm, setSearchTerm] = useState("");
    const [sortOption, setSortOption] = useState("default"); // ⭐ NEW

    // ✅ YOUR PART — NAVIGATION
    const navigate = useNavigate();

    // ✅ YOUR PART — FILTER
    let filteredProducts = products.filter((item) =>
        item.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // ✅ YOUR PART — SORT LOGIC
    if (sortOption === "priceLow") {
        filteredProducts = [...filteredProducts].sort((a, b) => a.price - b.price);
    } else if (sortOption === "priceHigh") {
        filteredProducts = [...filteredProducts].sort((a, b) => b.price - a.price);
    }

    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light text-text-main font-display">

            {/* ✅ YOUR PART — CONNECT SEARCH */}
            <Navbar
                locationLabel="Organic / Produce"
                onSearch={(value) => setSearchTerm(value)}
            />

            <main className="flex flex-1 flex-col gap-8 px-4 py-8 md:flex-row md:px-20 lg:px-40 border border-neutral-light rounded-2xl">
                <Sidebar showSummary={false} />

                <section className="flex flex-1 flex-col gap-8">

                    {/* HEADER */}
                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl font-extrabold tracking-tight">
                            Browse Bulk Items
                        </h1>
                        <p className="text-text-muted">
                            Join active buying groups to unlock premium tier discounts.
                        </p>
                    </div>

                    {/* ⭐ NEW — FILTER + SORT BAR */}
                    <div className="flex items-center justify-end gap-3 mt-4 pr-2">
                        <button className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-neutral-light">
                            <span className="material-symbols-outlined text-base">filter_list</span>
                            Filter
                        </button>

                        <select
                            value={sortOption}
                            onChange={(e) => setSortOption(e.target.value)}
                            className="rounded-lg border px-4 py-2 text-sm"
                        >
                            <option value="default">Sort: Popular</option>
                            <option value="priceLow">Price: Low → High</option>
                            <option value="priceHigh">Price: High → Low</option>
                        </select>
                    </div>

                    {/* GRID */}
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">

                        {/* ✅ YOUR PART — FILTERED + SORTED */}
                        {filteredProducts.map((item, index) => (
                            <div
                                key={index}
                                onClick={() => navigate(`/product/${index}`)}
                                className="flex flex-col cursor-pointer overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm hover:shadow-lg transition"
                            >
                                <div className="relative h-64 w-full bg-neutral-light flex items-center justify-center text-text-muted text-xl">
                                    Image
                                </div>

                                <div className="flex flex-1 flex-col justify-between gap-4 p-6">

                                    <h2 className="text-xl font-bold">{item.title}</h2>
                                    <p className="text-sm text-text-muted">{item.category}</p>

                                    <span className="text-2xl font-bold text-primary">
                                        ${item.price}
                                    </span>

                                    {/* FIX CLICK */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/product/${index}`);
                                        }}
                                        className="mt-3 rounded-xl bg-primary py-3 text-text-main font-bold shadow-md hover:bg-primary/90 transition-all"
                                    >
                                        View Details
                                    </button>

                                </div>
                            </div>
                        ))}

                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
}