import { useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";
import { useToast } from "../../contexts/ToastProvider";
import { getCityData } from "../../data/mockData";

export default function CartPage() {
  const { showToast } = useToast();
  const [detectedCity, setDetectedCity] = useState("Scarborough");
  const [intentConfirmed, setIntentConfirmed] = useState(false);

  const [cartItem, setCartItem] = useState({
    id: 1,
    name: "This should be connected to backend",
    supplier: "Supplier name should be here",
    quantity: 12,
    unitPrice: 1.25,
    imageLabel: "🥑",
  });

  useEffect(() => {
    const savedCity = sessionStorage.getItem("detectedCity");
    if (savedCity) {
      setDetectedCity(savedCity);
    }
  }, []);

  const handleCityChange = (newCity) => {
    setDetectedCity(newCity);
    sessionStorage.setItem("detectedCity", newCity);
    setIntentConfirmed(false);
  };

  const handleQuantityChange = (event) => {
    const value = Number(event.target.value);

    if (!Number.isFinite(value)) return;
    if (value < 1) return;

    setCartItem((prev) => ({
      ...prev,
      quantity: value,
    }));

    setIntentConfirmed(false);
  };

  const cityData = getCityData(detectedCity);

  const totalPrice = useMemo(() => {
    return [cartItem].reduce((total, item) => {
      return total + item.quantity * item.unitPrice;
    }, 0);
  }, [cartItem]);

  const projectedSavings = 3.0;

  const infoMessage = intentConfirmed
    ? "Intent confirmed successfully. You may update your request again if needed."
    : "Existing intent detected: You already have an active request for this item. Submit again to update your quantity.";

  const handleConfirmIntent = () => {
    if (cartItem.quantity < 1) {
      showToast(
        <div className="p-3 text-sm font-medium text-red-700">
          ❌ Quantity must be at least 1
        </div>
      );
      return;
    }

    setIntentConfirmed(true);

    showToast(
      <div className="p-3 text-sm font-medium text-green-700">
        ✅ Intent confirmed for {detectedCity}. Your quantity request has been recorded.
      </div>
    );
  };

  const handleModifyQuantity = () => {
    showToast(
      <div className="p-3 text-sm font-medium text-blue-700">
        ℹ️ You can now adjust your quantity.
      </div>
    );
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light font-display text-text-main">
      <Navbar detectedCity={detectedCity} onCityChange={handleCityChange} />

      <main className="flex flex-1 flex-col gap-8 rounded-2xl border border-neutral-light px-4 py-8 md:flex-row md:px-20 lg:px-40">
        <Sidebar
          totalSavings={cityData.totalSavings}
          savingsLabel={cityData.savingsLabel}
        />

        <section className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">
              Confirm Intent
            </h1>
            <p className="max-w-2xl text-base leading-7 text-text-muted">
              Please review the details for your bulk purchase request for the
              current group buy window.
            </p>
          </div>

          <div
            className={`rounded-2xl px-5 py-4 shadow-sm ${
              intentConfirmed
                ? "border border-green-300 bg-green-50 text-green-800"
                : "border border-amber-300 bg-amber-50 text-amber-800"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-sm font-bold">
                i
              </div>
              <p className="text-base font-medium leading-7">{infoMessage}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
            <div className="grid grid-cols-[2.2fr_0.7fr_0.9fr_0.9fr] bg-primary/10 px-5 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-main">
              <div>Item Details</div>
              <div className="text-center">Qty</div>
              <div className="text-center">Unit Price</div>
              <div className="text-right">Total</div>
            </div>

            <div className="grid grid-cols-[2.2fr_0.7fr_0.9fr_0.9fr] items-center gap-4 px-5 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl">
                  {cartItem.imageLabel}
                </div>

                <div>
                  <h2 className="text-xl font-bold leading-7">{cartItem.name}</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    Source: {cartItem.supplier}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    Pickup area: {detectedCity}
                  </p>
                </div>
              </div>

              <div className="flex justify-center">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={cartItem.quantity}
                  onChange={handleQuantityChange}
                  className="w-20 rounded-lg border border-neutral-light bg-white px-3 py-2 text-center text-lg font-semibold outline-none transition focus:border-primary"
                />
              </div>

              <div className="text-center text-xl font-medium">
                ${cartItem.unitPrice.toFixed(2)}
              </div>

              <div className="text-right text-2xl font-extrabold">
                ${totalPrice.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="w-full max-w-sm rounded-2xl border border-neutral-light bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-lg font-medium text-text-main">
                <span>Subtotal</span>
                <span>${totalPrice.toFixed(2)}</span>
              </div>

              <div className="mt-3 border-t border-neutral-light pt-3">
                <div className="flex items-center justify-between text-2xl font-extrabold text-text-main">
                  <span>Total</span>
                  <span>${totalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between">
                <p className="text-xl font-medium text-text-main">
                  Projected Savings
                </p>
                <div className="text-2xl">💸</div>
              </div>

              <div className="flex items-end gap-2">
                <span className="text-4xl font-extrabold">
                  ${projectedSavings.toFixed(2)}
                </span>
                <span className="pb-1 text-xl font-bold text-green-600">
                  +20% VS RETAIL THIS SHOULD COME FROM BACKEND
                </span>
              </div>

              <p className="mt-4 text-sm text-text-muted">
                Based on current market price of $1.50/unit THIS SHOULD COME FROM BACKEND
              </p>
            </div>

            <div className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between">
                <p className="text-xl font-medium text-text-main">Status</p>
                <div className="text-2xl text-green-600">✔</div>
              </div>

              <h3 className="text-3xl font-extrabold text-green-700">
                Ready to Commit THIS SHOULD COME FROM BACKEND
              </h3>

              <p className="mt-4 text-sm text-text-muted">
                Minimum group threshold reached: 85% THIS SHOULD COME FROM BACKEND
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-1 md:flex-row">
            <button
              type="button"
              onClick={handleConfirmIntent}
              disabled={cartItem.quantity < 1}
              className={`flex-1 rounded-2xl px-6 py-4 text-xl font-bold shadow-md transition ${
                cartItem.quantity < 1
                  ? "cursor-not-allowed bg-gray-300 text-white"
                  : "bg-primary text-text-main hover:bg-primary/90"
              }`}
            >
              Confirm Intent →
            </button>

            <button
              type="button"
              onClick={handleModifyQuantity}
              className="flex-1 rounded-2xl border border-neutral-light bg-white px-6 py-4 text-xl font-bold text-text-main shadow-sm transition hover:bg-neutral-light"
            >
              Modify Quantity
            </button>
          </div>

          <p className="pb-4 text-center text-xs leading-6 text-text-muted">
            By confirming, you agree to be notified when the group purchase is
            finalized. No payment is required until the window closes.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}import { useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";
import { useToast } from "../../contexts/ToastProvider";
import { getCityData } from "../../data/mockData";

export default function CartPage() {
  const { showToast } = useToast();
  const [detectedCity, setDetectedCity] = useState("Scarborough");
  const [intentConfirmed, setIntentConfirmed] = useState(false);

  const [cartItem, setCartItem] = useState({
    id: 1,
    name: "This should be connected to backend",
    supplier: "Supplier name should be here",
    quantity: 12,
    unitPrice: 1.25,
    imageLabel: "🥑",
  });

  useEffect(() => {
    const savedCity = sessionStorage.getItem("detectedCity");
    if (savedCity) {
      setDetectedCity(savedCity);
    }
  }, []);

  const handleCityChange = (newCity) => {
    setDetectedCity(newCity);
    sessionStorage.setItem("detectedCity", newCity);
    setIntentConfirmed(false);
  };

  const handleQuantityChange = (event) => {
    const value = Number(event.target.value);

    if (!Number.isFinite(value)) return;
    if (value < 1) return;

    setCartItem((prev) => ({
      ...prev,
      quantity: value,
    }));

    setIntentConfirmed(false);
  };

  const cityData = getCityData(detectedCity);

  const totalPrice = useMemo(() => {
    return [cartItem].reduce((total, item) => {
      return total + item.quantity * item.unitPrice;
    }, 0);
  }, [cartItem]);

  const projectedSavings = 3.0;

  const infoMessage = intentConfirmed
    ? "Intent confirmed successfully. You may update your request again if needed."
    : "Existing intent detected: You already have an active request for this item. Submit again to update your quantity.";

  const handleConfirmIntent = () => {
    if (cartItem.quantity < 1) {
      showToast(
        <div className="p-3 text-sm font-medium text-red-700">
          ❌ Quantity must be at least 1
        </div>
      );
      return;
    }

    setIntentConfirmed(true);

    showToast(
      <div className="p-3 text-sm font-medium text-green-700">
        ✅ Intent confirmed for {detectedCity}. Your quantity request has been recorded.
      </div>
    );
  };

  const handleModifyQuantity = () => {
    showToast(
      <div className="p-3 text-sm font-medium text-blue-700">
        ℹ️ You can now adjust your quantity.
      </div>
    );
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light font-display text-text-main">
      <Navbar detectedCity={detectedCity} onCityChange={handleCityChange} />

      <main className="flex flex-1 flex-col gap-8 rounded-2xl border border-neutral-light px-4 py-8 md:flex-row md:px-20 lg:px-40">
        <Sidebar
          totalSavings={cityData.totalSavings}
          savingsLabel={cityData.savingsLabel}
        />

        <section className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">
              Confirm Intent
            </h1>
            <p className="max-w-2xl text-base leading-7 text-text-muted">
              Please review the details for your bulk purchase request for the
              current group buy window.
            </p>
          </div>

          <div
            className={`rounded-2xl px-5 py-4 shadow-sm ${
              intentConfirmed
                ? "border border-green-300 bg-green-50 text-green-800"
                : "border border-amber-300 bg-amber-50 text-amber-800"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-sm font-bold">
                i
              </div>
              <p className="text-base font-medium leading-7">{infoMessage}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
            <div className="grid grid-cols-[2.2fr_0.7fr_0.9fr_0.9fr] bg-primary/10 px-5 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-main">
              <div>Item Details</div>
              <div className="text-center">Qty</div>
              <div className="text-center">Unit Price</div>
              <div className="text-right">Total</div>
            </div>

            <div className="grid grid-cols-[2.2fr_0.7fr_0.9fr_0.9fr] items-center gap-4 px-5 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl">
                  {cartItem.imageLabel}
                </div>

                <div>
                  <h2 className="text-xl font-bold leading-7">{cartItem.name}</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    Source: {cartItem.supplier}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    Pickup area: {detectedCity}
                  </p>
                </div>
              </div>

              <div className="flex justify-center">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={cartItem.quantity}
                  onChange={handleQuantityChange}
                  className="w-20 rounded-lg border border-neutral-light bg-white px-3 py-2 text-center text-lg font-semibold outline-none transition focus:border-primary"
                />
              </div>

              <div className="text-center text-xl font-medium">
                ${cartItem.unitPrice.toFixed(2)}
              </div>

              <div className="text-right text-2xl font-extrabold">
                ${totalPrice.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="w-full max-w-sm rounded-2xl border border-neutral-light bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-lg font-medium text-text-main">
                <span>Subtotal</span>
                <span>${totalPrice.toFixed(2)}</span>
              </div>

              <div className="mt-3 border-t border-neutral-light pt-3">
                <div className="flex items-center justify-between text-2xl font-extrabold text-text-main">
                  <span>Total</span>
                  <span>${totalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between">
                <p className="text-xl font-medium text-text-main">
                  Projected Savings
                </p>
                <div className="text-2xl">💸</div>
              </div>

              <div className="flex items-end gap-2">
                <span className="text-4xl font-extrabold">
                  ${projectedSavings.toFixed(2)}
                </span>
                <span className="pb-1 text-xl font-bold text-green-600">
                  +20% VS RETAIL THIS SHOULD COME FROM BACKEND
                </span>
              </div>

              <p className="mt-4 text-sm text-text-muted">
                Based on current market price of $1.50/unit THIS SHOULD COME FROM BACKEND
              </p>
            </div>

            <div className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between">
                <p className="text-xl font-medium text-text-main">Status</p>
                <div className="text-2xl text-green-600">✔</div>
              </div>

              <h3 className="text-3xl font-extrabold text-green-700">
                Ready to Commit THIS SHOULD COME FROM BACKEND
              </h3>

              <p className="mt-4 text-sm text-text-muted">
                Minimum group threshold reached: 85% THIS SHOULD COME FROM BACKEND
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-1 md:flex-row">
            <button
              type="button"
              onClick={handleConfirmIntent}
              disabled={cartItem.quantity < 1}
              className={`flex-1 rounded-2xl px-6 py-4 text-xl font-bold shadow-md transition ${
                cartItem.quantity < 1
                  ? "cursor-not-allowed bg-gray-300 text-white"
                  : "bg-primary text-text-main hover:bg-primary/90"
              }`}
            >
              Confirm Intent →
            </button>

            <button
              type="button"
              onClick={handleModifyQuantity}
              className="flex-1 rounded-2xl border border-neutral-light bg-white px-6 py-4 text-xl font-bold text-text-main shadow-sm transition hover:bg-neutral-light"
            >
              Modify Quantity
            </button>
          </div>

          <p className="pb-4 text-center text-xs leading-6 text-text-muted">
            By confirming, you agree to be notified when the group purchase is
            finalized. No payment is required until the window closes.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}