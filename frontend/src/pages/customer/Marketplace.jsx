// src/pages/marketplace/Shop.jsx
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";

const products = Array(6).fill({});

export default function Shop() {
    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light text-text-main font-display">
            <Navbar locationLabel="Organic / Produce" />

            <main className="flex flex-1 flex-col gap-8 px-4 py-8 md:flex-row md:px-20 lg:px-40 border border-neutral-light rounded-2xl">
                <Sidebar showSummary={false} />

                <section className="flex flex-1 flex-col gap-8">
                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl font-extrabold tracking-tight">Browse Bulk Items</h1>
                        <p className="text-text-muted">
                            Join active buying groups to unlock premium tier discounts.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {products.map((_, index) => (
                            <div
                                key={index}
                                className="flex flex-col overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm"
                            >
                                <div className="relative h-64 w-full bg-neutral-light flex items-center justify-center text-text-muted text-xl">
                                    Image
                                </div>
                                <div className="flex flex-1 flex-col justify-between gap-4 p-6">
                                    <h2 className="text-xl font-bold">Details go here</h2>
                                    <p className="text-sm text-text-muted">Details go here</p>
                                    <span className="text-2xl font-bold text-primary">Details go here</span>
                                    <button className="mt-3 rounded-xl bg-primary py-3 text-text-main font-bold shadow-md hover:bg-primary/90 transition-all">
                                        Details go here
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