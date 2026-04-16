import { useMemo, useState } from "react";
import SupplierLayout from "../../components/supplier/SupplierLayout";

const initialProfile = {
  companyName: "BulkBuy Suppliers Inc.",
  businessAddress: "123 Industrial Park Dr, Logistics City, LC 90210",
  contactEmail: "",
  phone: "+1 (555) 000-0000",
  pickup: true,
  delivery: false,
  serviceArea: "e.g. Nationwide, West Coast, etc.",
  leadTime: "3-5 Days",
  orderAlerts: true,
  stockWarnings: true,
  systemUpdates: false,
};

export default function SupplierProfilePage() {
  const [profile, setProfile] = useState(initialProfile);
  const [savedProfile, setSavedProfile] = useState(initialProfile);
  const [errors, setErrors] = useState({});
  const [saveMessage, setSaveMessage] = useState("");

  const isDirty = useMemo(() => {
    return JSON.stringify(profile) !== JSON.stringify(savedProfile);
  }, [profile, savedProfile]);

  const handleChange = (field, value) => {
    setProfile((prev) => ({
      ...prev,
      [field]: value,
    }));

    setErrors((prev) => ({
      ...prev,
      [field]: "",
    }));

    setSaveMessage("");
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!profile.companyName.trim()) {
      nextErrors.companyName = "Company name is required";
    }

    if (!profile.businessAddress.trim()) {
      nextErrors.businessAddress = "Business address is required";
    }

    if (!profile.contactEmail.trim()) {
      nextErrors.contactEmail = "Contact email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.contactEmail)) {
      nextErrors.contactEmail = "Enter a valid email address";
    }

    if (!profile.phone.trim()) {
      nextErrors.phone = "Phone number is required";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = (e) => {
    e.preventDefault();

    if (!validateForm()) {
      setSaveMessage("");
      return;
    }

    setSavedProfile(profile);
    setSaveMessage("Company details saved successfully.");
  };

  const handleCancel = () => {
    setProfile(savedProfile);
    setErrors({});
    setSaveMessage("");
  };

  return (
    <SupplierLayout>
      <form className="space-y-6" onSubmit={handleSave}>
        <div className="rounded-2xl border border-neutral-light bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-text-main">
            Supplier Profile
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Update your company information for accurate fulfillment and
            communication.
          </p>

          {isDirty ? (
            <p className="mt-3 text-xs font-medium text-amber-600">
              You have unsaved changes.
            </p>
          ) : null}

          {saveMessage ? (
            <p className="mt-3 text-sm font-medium text-green-600">
              {saveMessage}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-text-main">
            Company Info
          </h2>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-text-main">
                Company Name *
              </label>
              <input
                type="text"
                value={profile.companyName}
                onChange={(e) => handleChange("companyName", e.target.value)}
                className={`w-full rounded-xl px-4 py-3 outline-none focus:border-primary ${
                  errors.companyName
                    ? "border border-red-300"
                    : "border border-neutral-light"
                }`}
                placeholder="Enter company name"
              />
              {errors.companyName ? (
                <p className="mt-1 text-xs text-red-500">
                  {errors.companyName}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-text-main">
                Business Address *
              </label>
              <input
                type="text"
                value={profile.businessAddress}
                onChange={(e) =>
                  handleChange("businessAddress", e.target.value)
                }
                className={`w-full rounded-xl px-4 py-3 outline-none focus:border-primary ${
                  errors.businessAddress
                    ? "border border-red-300"
                    : "border border-neutral-light"
                }`}
                placeholder="Enter business address"
              />
              {errors.businessAddress ? (
                <p className="mt-1 text-xs text-red-500">
                  {errors.businessAddress}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-text-main">Contacts</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-text-main">
                Contact Email *
              </label>
              <input
                type="email"
                value={profile.contactEmail}
                onChange={(e) => handleChange("contactEmail", e.target.value)}
                className={`w-full rounded-xl px-4 py-3 outline-none focus:border-primary ${
                  errors.contactEmail
                    ? "border border-red-300"
                    : "border border-neutral-light"
                }`}
                placeholder="supplier@bulkbuy.com"
              />
              {errors.contactEmail ? (
                <p className="mt-1 text-xs text-red-500">
                  {errors.contactEmail}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-text-main">
                Phone *
              </label>
              <input
                type="text"
                value={profile.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                className={`w-full rounded-xl px-4 py-3 outline-none focus:border-primary ${
                  errors.phone
                    ? "border border-red-300"
                    : "border border-neutral-light"
                }`}
                placeholder="+1 (555) 000-0000"
              />
              {errors.phone ? (
                <p className="mt-1 text-xs text-red-500">{errors.phone}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-text-main">
            Dispatch Preferences
          </h2>

          <div className="space-y-4">
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-text-main">
                <input
                  type="checkbox"
                  checked={profile.pickup}
                  onChange={(e) => handleChange("pickup", e.target.checked)}
                />
                Pickup
              </label>

              <label className="flex items-center gap-2 text-sm text-text-main">
                <input
                  type="checkbox"
                  checked={profile.delivery}
                  onChange={(e) => handleChange("delivery", e.target.checked)}
                />
                Delivery
              </label>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-text-main">
                Service Area
              </label>
              <input
                type="text"
                value={profile.serviceArea}
                onChange={(e) => handleChange("serviceArea", e.target.value)}
                className="w-full rounded-xl border border-neutral-light px-4 py-3 outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-text-main">
            Lead Times
          </h2>

          <select
            value={profile.leadTime}
            onChange={(e) => handleChange("leadTime", e.target.value)}
            className="w-full rounded-xl border border-neutral-light px-4 py-3 outline-none focus:border-primary"
          >
            <option>1-2 Days</option>
            <option>3-5 Days</option>
            <option>5-7 Days</option>
            <option>7+ Days</option>
          </select>
        </div>

        <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-text-main">
            Notification Settings
          </h2>

          <div className="space-y-4">
            {[
              ["orderAlerts", "Order Alerts"],
              ["stockWarnings", "Stock Warnings"],
              ["systemUpdates", "System Updates"],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-main">
                  {label}
                </span>
                <button
                  type="button"
                  onClick={() => handleChange(key, !profile[key])}
                  className={`h-6 w-12 rounded-full transition ${
                    profile[key] ? "bg-primary" : "bg-gray-300"
                  }`}
                >
                  <div
                    className={`h-6 w-6 rounded-full bg-white shadow transition ${
                      profile[key] ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl border border-neutral-light px-6 py-3 font-semibold text-text-main"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-xl bg-primary px-6 py-3 font-semibold text-white"
          >
            Save Changes
          </button>
        </div>
      </form>
    </SupplierLayout>
  );
}