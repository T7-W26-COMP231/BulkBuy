import { useState } from "react";
import SupplierLayout from "../../components/supplier/SupplierLayout";

export default function SupplierProfilePage() {
  const [profile, setProfile] = useState({
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
  });

  const handleChange = (field, value) => {
    setProfile((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <SupplierLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-2xl border border-neutral-light bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-text-main">
            Supplier Profile
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Update your company information for accurate fulfillment and
            communication.
          </p>
        </div>

        {/* Company Info */}
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
                onChange={(e) =>
                  handleChange("companyName", e.target.value)
                }
                className="w-full rounded-xl border border-neutral-light px-4 py-3 outline-none focus:border-primary"
              />
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
                className="w-full rounded-xl border border-neutral-light px-4 py-3 outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Contacts */}
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
                onChange={(e) =>
                  handleChange("contactEmail", e.target.value)
                }
                className="w-full rounded-xl border border-red-300 px-4 py-3 outline-none focus:border-primary"
                placeholder="supplier@bulkbuy.com"
              />
              <p className="mt-1 text-xs text-red-500">Email is required</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-text-main">
                Phone *
              </label>
              <input
                type="text"
                value={profile.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                className="w-full rounded-xl border border-neutral-light px-4 py-3 outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Dispatch Preferences */}
        <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-text-main">
            Dispatch Preferences
          </h2>

          <div className="space-y-4">
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={profile.pickup}
                  onChange={(e) =>
                    handleChange("pickup", e.target.checked)
                  }
                />
                Pickup
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={profile.delivery}
                  onChange={(e) =>
                    handleChange("delivery", e.target.checked)
                  }
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
                onChange={(e) =>
                  handleChange("serviceArea", e.target.value)
                }
                className="w-full rounded-xl border border-neutral-light px-4 py-3 outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Lead Time */}
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

        {/* Notifications */}
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
              <div
                key={key}
                className="flex items-center justify-between"
              >
                <span className="text-sm font-medium text-text-main">
                  {label}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleChange(key, !profile[key])
                  }
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

        {/* Footer Actions */}
        <div className="flex justify-end gap-3">
          <button className="rounded-xl border border-neutral-light px-6 py-3 font-semibold text-text-main">
            Cancel
          </button>
          <button className="rounded-xl bg-primary px-6 py-3 font-semibold text-white">
            Save Changes
          </button>
        </div>
      </div>
    </SupplierLayout>
  );
}