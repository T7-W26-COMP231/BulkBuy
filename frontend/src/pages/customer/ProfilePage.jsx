import { useState } from "react";

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

const handleProfileSave = () => {
  const nextErrors = {};

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

  console.log("✅ Ready for API save:", profileForm);
};

return (
  <div className="min-h-screen bg-background-light px-6 py-8">
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Top right action icons */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-light bg-white shadow-sm"
        >
          <span className="material-symbols-outlined text-text-muted">
            notifications
          </span>
        </button>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-light bg-white shadow-sm"
        >
          <span className="material-symbols-outlined text-text-muted">
            person
          </span>
        </button>
      </div>

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
                John Doe
              </h1>
              <p className="mt-1 text-sm font-medium text-text-muted">
                Toronto City Assignment
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-text-main">
                  ACCOUNT MANAGER
                </span>
                <span className="rounded-full bg-neutral-light px-3 py-1 text-xs font-bold text-text-muted">
                  US-C9 TIER
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Main content */}
        <section className="rounded-2xl border border-neutral-light bg-white shadow-sm">
          {/* Tabs */}
          <div className="flex flex-wrap border-b border-neutral-light">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold transition ${
                  activeTab === tab.id
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
            {/* Notifications */}
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
                    className={`h-6 w-11 rounded-full transition ${
                      priceTierAlerts ? "bg-primary" : "bg-gray-300"
                    }`}
                  />
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
                    className={`h-6 w-11 rounded-full transition ${
                      orderUpdates ? "bg-primary" : "bg-gray-300"
                    }`}
                  />
                </div>
              </div>
            </section>

            {/* Payment methods */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold text-text-main">
                  Saved Payment Methods
                </h3>
                <button className="text-sm font-semibold text-primary">
                  + Add Card
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-primary bg-primary/5 p-5">
                  <p className="font-semibold text-text-main">
                    •••• •••• •••• 4242
                  </p>
                  <p className="mt-2 text-sm text-text-muted">
                    Visa Corporate
                  </p>
                  <p className="text-xs text-text-muted">12/25</p>
                </div>

                <div className="flex items-center justify-center rounded-2xl border border-dashed border-neutral-light p-5 text-sm font-semibold text-text-muted">
                  Add New Payment Method
                </div>
              </div>
            </section>

            {/* Profile form */}
<section className="rounded-2xl bg-neutral-light p-5">
  <div className="mb-4">
    <h3 className="font-bold text-text-main">
      Profile Details
    </h3>
    <p className="mt-1 text-sm text-text-muted">
      Update your account information and contact details
    </p>
  </div>

  <div className="grid gap-4 md:grid-cols-2">
    <div>
      <label className="mb-2 block text-sm font-semibold text-text-main">
        Full Name
      </label>
      <input
        type="text"
        name="fullName"
        value={profileForm.fullName}
        onChange={handleProfileInputChange}
        placeholder="Enter your full name"
        className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary"
      />
      {profileErrors.fullName && (
        <p className="mt-1 text-xs font-medium text-red-600">
          {profileErrors.fullName}
        </p>
      )}
    </div>

    <div>
      <label className="mb-2 block text-sm font-semibold text-text-main">
        Email Address
      </label>
      <input
        type="email"
        name="email"
        value={profileForm.email}
        onChange={handleProfileInputChange}
        placeholder="Enter your email address"
        className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary"
      />
      {profileErrors.email && (
        <p className="mt-1 text-xs font-medium text-red-600">
          {profileErrors.email}
        </p>
      )}
    </div>

    <div className="md:col-span-2">
      <label className="mb-2 block text-sm font-semibold text-text-main">
        Address Line
      </label>
      <input
        type="text"
        name="addressLine1"
        value={profileForm.addressLine1}
        onChange={handleProfileInputChange}
        placeholder="Enter your street address"
        className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary"
      />
      {profileErrors.addressLine1 && (
        <p className="mt-1 text-xs font-medium text-red-600">
          {profileErrors.addressLine1}
        </p>
      )}
    </div>

    <div>
      <label className="mb-2 block text-sm font-semibold text-text-main">
        City
      </label>
      <input
        type="text"
        name="city"
        value={profileForm.city}
        onChange={handleProfileInputChange}
        placeholder="Enter your city"
        className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary"
      />
      {profileErrors.city && (
        <p className="mt-1 text-xs font-medium text-red-600">
          {profileErrors.city}
        </p>
      )}
    </div>

    <div>
      <label className="mb-2 block text-sm font-semibold text-text-main">
        Postal Code
      </label>
      <input
        type="text"
        name="postalCode"
        value={profileForm.postalCode}
        onChange={handleProfileInputChange}
        placeholder="Enter your postal code"
        className="w-full rounded-xl border border-neutral-light bg-white px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary"
      />
      {profileErrors.postalCode && (
        <p className="mt-1 text-xs font-medium text-red-600">
          {profileErrors.postalCode}
        </p>
      )}
    </div>
  </div>
</section>

                       {/* Footer buttons */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-neutral-light px-5 py-2.5 text-sm font-semibold text-text-muted"
              >
                Discard
              </button>

              <button
                type="button"
                onClick={handleProfileSave}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-text-main"
              >
                Save Changes
              </button>
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <section className="grid gap-4 md:grid-cols-3">
          {quickActions.map((action) => (
            <div
              key={action.title}
              className="rounded-2xl border border-neutral-light bg-white p-5 shadow-sm"
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
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}