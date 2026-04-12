import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Footer from "../../components/Footer";

const tabs = [
  { id: "profile", label: "Profile", icon: "person" },
  { id: "payment", label: "Payment", icon: "credit_card" },
  { id: "notifications", label: "Notifications", icon: "notifications" },
  { id: "security", label: "Security", icon: "shield" },
];

const quickActions = [
  {
    title: "Order History",
    subtitle: "View past invoices",
    icon: "receipt_long",
  },
  {
    title: "Inventory Sync",
    subtitle: "Auto-replenish settings",
    icon: "inventory_2",
  },
  {
    title: "Support Portal",
    subtitle: "24/7 Priority assistance",
    icon: "help",
  },
];

export default function ProfilePage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("profile");
  const [priceTierAlerts, setPriceTierAlerts] = useState(true);
  const [orderUpdates, setOrderUpdates] = useState(true);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    email: "",
    addressLine1: "",
    city: "",
    postalCode: "",
  });
  const [profileErrors, setProfileErrors] = useState({});
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [originalEmail, setOriginalEmail] = useState("");

  const [paymentForm, setPaymentForm] = useState({
    cardholderName: "",
    cardNumber: "",
    expiryDate: "",
    cvv: "",
  });
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentMethods, setPaymentMethods] = useState([]);

  useEffect(() => {
    const loadCustomerProfile = async () => {
      try {
        const response = await api.get("/users/profile");

        const user =
          response?.data?.data?.user ||
          response?.data?.data ||
          {};

        setPaymentMethods(user.paymentMethods || []);

        setPriceTierAlerts(
          user.notificationPreferences?.priceTierAlerts ?? true
        );
        setOrderUpdates(
          user.notificationPreferences?.orderUpdates ?? true
        );

        const primaryEmail =
          user.emails?.find((email) => email.primary)?.address ||
          "";

        const primaryAddress = user.addresses?.[0] || {};

        setProfileForm({
          fullName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          email: primaryEmail,
          addressLine1:
            primaryAddress.line1 ||
            primaryAddress.addressLine1 ||
            "",
          city: primaryAddress.city || "",
          postalCode: primaryAddress.postalCode || "",
        });

        setOriginalEmail(primaryEmail);
      } catch (error) {
        console.error("Failed to load profile", error);
      }
    };

    loadCustomerProfile();
  }, []);

  const handleProfileInputChange = (event) => {
    const { name, value } = event.target;

    setProfileForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setProfileErrors((prev) => ({
      ...prev,
      [name]: "",
    }));
  };

  const handlePaymentInputChange = (event) => {
    const { name, value } = event.target;

    setPaymentForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleProfileSave = async () => {
    const nextErrors = {};

    setSaveMessage("");
    setSaveError("");

    if (!profileForm.fullName.trim()) {
      nextErrors.fullName = "Full name is required";
    }

    if (!profileForm.email.trim()) {
      nextErrors.email = "Email address is required";
    } else if (!/\S+@\S+\.\S+/.test(profileForm.email)) {
      nextErrors.email = "Enter a valid email address";
    }

    if (!profileForm.addressLine1.trim()) {
      nextErrors.addressLine1 = "Address is required";
    }

    if (!profileForm.city.trim()) {
      nextErrors.city = "City is required";
    }

    if (!profileForm.postalCode.trim()) {
      nextErrors.postalCode = "Postal code is required";
    }

    setProfileErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const emailChanged =
      profileForm.email.trim().toLowerCase() !==
      originalEmail.trim().toLowerCase();

    if (emailChanged) {
      const confirmed = window.confirm(
        "You changed your email address. Please make sure it is correct before saving."
      );

      if (!confirmed) {
        return;
      }
    }

    try {
      setIsSaving(true);

      const [firstName = "", ...rest] = profileForm.fullName
        .trim()
        .split(" ");
      const lastName = rest.join(" ");

      await api.patch("/users/profile", {
        firstName,
        lastName,
        email: profileForm.email,
        addressLine1: profileForm.addressLine1,
        city: profileForm.city,
        postalCode: profileForm.postalCode,
        notificationPreferences: {
          priceTierAlerts,
          orderUpdates,
        },
      });

      setSaveMessage("Profile updated successfully.");
      setOriginalEmail(profileForm.email.trim());
    } catch (error) {
      setSaveError(
        error?.response?.data?.message ||
        "Could not save profile changes."
      );
    } finally {
      setIsSaving(false);
    }
  };
  const handlePaymentSave = async () => {
    setPaymentMessage("");
    setPaymentError("");

    if (
      !paymentForm.cardholderName.trim() ||
      !paymentForm.cardNumber.trim() ||
      !paymentForm.expiryDate.trim() ||
      !paymentForm.cvv.trim()
    ) {
      setPaymentError("All payment fields are required.");
      return;
    }

    try {
      const response = await api.patch("/users/payment-methods", {
        cardNumber: paymentForm.cardNumber,
        expiryDate: paymentForm.expiryDate,
        provider: "visa",
        tokenRef: `pm_${Date.now()}`,
      });

      const savedMethods =
        response?.data?.data?.paymentMethods ||
        response?.data?.data?.user?.paymentMethods ||
        response?.data?.paymentMethods ||
        [];

      setPaymentMethods(savedMethods);
      setPaymentMessage("Payment method added successfully.");

      setPaymentForm({
        cardholderName: "",
        cardNumber: "",
        expiryDate: "",
        cvv: "",
      });
    } catch (error) {
      setPaymentError(
        error?.response?.data?.message ||
        "Could not save payment method."
      );
    }
  };

  const handleRemovePayment = async (paymentId) => {
    setPaymentMessage("");
    setPaymentError("");

    try {
      const response = await api.delete(
        `/users/payment-methods/${paymentId}`
      );

      const savedMethods =
        response?.data?.data?.paymentMethods ||
        response?.data?.data?.user?.paymentMethods ||
        response?.data?.paymentMethods ||
        [];

      setPaymentMethods(savedMethods);
      setPaymentMessage("Payment method removed successfully.");
    } catch (error) {
      setPaymentError(
        error?.response?.data?.message ||
        "Could not remove payment method."
      );
    }
  };
  const handleSetDefaultPayment = async (paymentId) => {
    setPaymentMessage("");
    setPaymentError("");

    try {
      await api.patch(
        `/users/payment-methods/${paymentId}/default`
      );

      const profileResponse = await api.get("/users/profile");

      const user =
        profileResponse?.data?.data?.user ||
        profileResponse?.data?.data ||
        {};

      setPaymentMethods(user.paymentMethods || []);
      setPaymentMessage("Default payment method updated.");
    } catch (error) {
      setPaymentError(
        error?.response?.data?.message ||
        "Could not update default payment."
      );
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light text-text-main font-display">
      <Navbar />

      <main className="flex flex-1 flex-col gap-8 px-4 py-8 md:flex-row md:px-20 lg:px-40">
        <Sidebar
          totalSavings={Number(profileForm.totalSavings || 0)}
          savingsLabel="Saved this month"
        />

        <section className="flex flex-1 flex-col gap-6">
          {/* Hero */}
          <section className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-primary/30 bg-neutral-light">
                <span className="material-symbols-outlined text-5xl text-text-muted">
                  person
                </span>
              </div>

              <div className="flex-1">
                <h1 className="text-3xl font-bold text-text-main">
                  {profileForm.fullName || "Customer Profile"}
                </h1>
                <p className="mt-1 text-sm font-medium text-text-muted">
                  {profileForm.city || "Profile settings"}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-text-main">
                    CUSTOMER
                  </span>
                  <span className="rounded-full bg-neutral-light px-3 py-1 text-xs font-bold text-text-muted">
                    BULKBUY USER
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Main content */}
          <section className="rounded-2xl border border-neutral-light bg-white shadow-sm">
            <div className="flex flex-wrap border-b border-neutral-light">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold transition ${activeTab === tab.id
                    ? "border-b-2 border-primary text-text-main"
                    : "text-text-muted hover:text-text-main"
                    }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {tab.icon}
                  </span>
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="space-y-6 p-6">

              {/* ── Profile Tab ── */}
              {activeTab === "profile" && (
                <>
                  <section className="rounded-2xl bg-neutral-light p-5">
                    <div className="mb-4">
                      <h3 className="font-bold text-text-main">Profile Details</h3>
                      <p className="mt-1 text-sm text-text-muted">Update your account information and contact details</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-text-main">Full Name</label>
                        <input type="text" name="fullName" value={profileForm.fullName} onChange={handleProfileInputChange}
                          className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3" />
                        {profileErrors.fullName && <p className="mt-1 text-xs text-red-600">{profileErrors.fullName}</p>}
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-text-main">Email Address</label>
                        <input type="email" name="email" value={profileForm.email} onChange={handleProfileInputChange}
                          className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3" />
                        {profileErrors.email && <p className="mt-1 text-xs text-red-600">{profileErrors.email}</p>}
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-2 block text-sm font-semibold text-text-main">Address Line</label>
                        <input type="text" name="addressLine1" value={profileForm.addressLine1} onChange={handleProfileInputChange}
                          className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3" />
                        {profileErrors.addressLine1 && <p className="mt-1 text-xs text-red-600">{profileErrors.addressLine1}</p>}
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-text-main">City</label>
                        <input type="text" name="city" value={profileForm.city} onChange={handleProfileInputChange}
                          className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3" />
                        {profileErrors.city && <p className="mt-1 text-xs text-red-600">{profileErrors.city}</p>}
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-text-main">Postal Code</label>
                        <input type="text" name="postalCode" value={profileForm.postalCode} onChange={handleProfileInputChange}
                          className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3" />
                        {profileErrors.postalCode && <p className="mt-1 text-xs text-red-600">{profileErrors.postalCode}</p>}
                      </div>
                    </div>
                  </section>

                  {saveMessage && (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                      ✅ Notification preferences updated successfully.
                    </div>
                  )}
                  {saveError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                      ❌ {saveError}
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => { setProfileForm(prev => ({ ...prev, email: originalEmail })); setProfileErrors({}); setSaveMessage(""); setSaveError(""); }}
                      className="rounded-xl border border-primary/20 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-text-main transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/20 hover:shadow-sm">
                      Discard
                    </button>
                    <button type="button" onClick={handleProfileSave} disabled={isSaving}
                      className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-text-main transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md hover:brightness-95">
                      {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </>
              )}

              {/* ── Payment Tab ── */}
              {activeTab === "payment" && (
                <>
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-text-main">Add Payment Method</h3>
                    <p className="text-sm text-text-muted">Securely add a new payment method for future purchases</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold">Cardholder Name</label>
                      <input type="text" name="cardholderName" value={paymentForm.cardholderName} onChange={handlePaymentInputChange}
                        className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3" />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold">Card Number</label>
                      <input type="text" name="cardNumber" value={paymentForm.cardNumber} onChange={handlePaymentInputChange}
                        className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3" />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold">Expiry Date</label>
                      <input type="text" name="expiryDate" placeholder="MM/YY" value={paymentForm.expiryDate} onChange={handlePaymentInputChange}
                        className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3" />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold">CVV</label>
                      <input type="password" name="cvv" value={paymentForm.cvv} onChange={handlePaymentInputChange}
                        className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3" />
                    </div>
                  </div>

                  {paymentMessage && (
                    <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                      ✅ {paymentMessage}
                    </div>
                  )}
                  {paymentError && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                      ❌ {paymentError}
                    </div>
                  )}

                  <div className="mt-4 flex justify-end">
                    <button type="button" onClick={handlePaymentSave}
                      className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-text-main transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md hover:brightness-95">
                      Add Payment Method
                    </button>
                  </div>

                  {paymentMethods.length > 0 && (
                    <div className="mt-6">
                      <h3 className="mb-4 text-lg font-bold text-text-main">Saved Payment Methods</h3>
                      <div className="space-y-4">
                        {paymentMethods.map((card) => (
                          <div key={card.tokenRef} className="flex flex-col gap-3 rounded-xl border border-neutral-light p-4 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="font-semibold text-text-main">**** **** **** {card.last4}</p>
                              <p className="text-sm text-text-muted">{card.provider?.toUpperCase() || "CARD"} • Expires {card.expiry}</p>
                              {card.isDefault && (
                                <span className="mt-2 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-text-main">Default</span>
                              )}
                            </div>
                            <div className="flex gap-3">
                              {!card.isDefault && (
                                <button type="button" onClick={() => handleSetDefaultPayment(card.tokenRef)}
                                  className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-semibold text-text-main transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/20">
                                  Set Default
                                </button>
                              )}
                              <button type="button" onClick={() => handleRemovePayment(card.tokenRef)}
                                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-100">
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── Notifications Tab ── */}
              {activeTab === "notifications" && (
                <section className="space-y-4">
                  <h2 className="text-lg font-bold text-text-main">
                    Notification Preferences
                  </h2>

                  <div className="rounded-xl bg-neutral-light p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-text-main">
                          Price Tier Alerts
                        </p>
                        <p className="text-sm text-text-muted">
                          Get notified when products move to a better bulk pricing tier
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPriceTierAlerts((prev) => !prev)}
                        className={`relative h-7 w-14 rounded-full transition-all duration-300 ${priceTierAlerts ? "bg-primary" : "bg-gray-300"
                          }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-300 ${priceTierAlerts ? "left-8" : "left-1"
                            }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-neutral-light p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-text-main">
                          Order Updates
                        </p>
                        <p className="text-sm text-text-muted">
                          Status changes, shipping confirmations, and delivery alerts
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOrderUpdates((prev) => !prev)}
                        className={`relative h-7 w-14 rounded-full transition-all duration-300 ${orderUpdates ? "bg-primary" : "bg-gray-300"
                          }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-300 ${orderUpdates ? "left-8" : "left-1"
                            }`}
                        />
                      </button>
                    </div>
                  </div>

                  {saveMessage && (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                      ✅ {saveMessage}
                    </div>
                  )}

                  {saveError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                      ❌ {saveError}
                    </div>
                  )}

                  <div className="flex justify-end pt-4">
                    <button
                      type="button"
                      onClick={handleProfileSave}
                      className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-text-main transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md hover:brightness-95"
                    >
                      Save Notification Preferences
                    </button>
                  </div>
                </section>
              )}

              {/* ── Security Tab ── */}
              {activeTab === "security" && (
                <div className="py-10 text-center text-text-muted">
                  Security settings coming soon.
                </div>
              )}
            </div>
          </section>


          {/* Add payment method */}
          <section className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-text-main">
                Add Payment Method
              </h3>
              <p className="text-sm text-text-muted">
                Securely add a new payment method for future purchases
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Cardholder Name
                </label>
                <input
                  type="text"
                  name="cardholderName"
                  value={paymentForm.cardholderName}
                  onChange={handlePaymentInputChange}
                  className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Card Number
                </label>
                <input
                  type="text"
                  name="cardNumber"
                  value={paymentForm.cardNumber}
                  onChange={handlePaymentInputChange}
                  className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Expiry Date
                </label>
                <input
                  type="text"
                  name="expiryDate"
                  placeholder="MM/YY"
                  value={paymentForm.expiryDate}
                  onChange={handlePaymentInputChange}
                  className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  CVV
                </label>
                <input
                  type="password"
                  name="cvv"
                  value={paymentForm.cvv}
                  onChange={handlePaymentInputChange}
                  className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3"
                />
              </div>
            </div>

            {paymentMessage && (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                {paymentMessage}
              </div>
            )}

            {paymentError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {paymentError}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handlePaymentSave}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-text-main transition-transform transition-colors duration-200 hover:-translate-y-0.5 hover:shadow-md hover:brightness-95"
              >
                Add Payment Method
              </button>
            </div>
          </section>

          {/* Saved payment methods */}
          {paymentMethods.length > 0 && (
            <section className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-bold text-text-main">
                Saved Payment Methods
              </h3>

              <div className="space-y-4">
                {paymentMethods.map((card) => (
                  <div
                    key={card.tokenRef}
                    className="flex flex-col gap-3 rounded-xl border border-neutral-light p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-text-main">
                        **** **** **** {card.last4}
                      </p>
                      <p className="text-sm text-text-muted">
                        {card.provider?.toUpperCase() || "CARD"} • Expires {card.expiry}
                      </p>

                      {card.isDefault && (
                        <span className="mt-2 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-text-main">
                          Default
                        </span>
                      )}
                    </div>

                    <div className="flex gap-3">
                      {!card.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDefaultPayment(card.tokenRef)}
                          className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-semibold text-text-main transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/20"
                        >
                          Set Default
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemovePayment(card.tokenRef)}
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-100"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

            {/* Quick actions */}
          <section className="grid gap-4 md:grid-cols-3">
            {quickActions.map((action) => (
              <button
                key={action.title}
                type="button"
                onClick={() => {
                  if (action.title === "Order History") {
                    navigate("/orders");
                  }
                }}
                className="rounded-2xl border border-neutral-light bg-white p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">
                    {action.icon}
                  </span>
                  <div>
                    <p className="font-semibold text-text-main">
                      {action.title}
                    </p>
                    <p className="text-sm text-text-muted">
                      {action.subtitle}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </section>
        </section>
      </main>

      <Footer />
    </div>
  );
}