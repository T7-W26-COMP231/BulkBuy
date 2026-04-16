import axios from "axios";
import { useEffect, useMemo, useState } from "react";
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
  const [isSaving, setIsSaving] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [logoError, setLogoError] = useState("");

  useEffect(() => {
    if (!logoFile) {
      return undefined;
    }

    const previewUrl = URL.createObjectURL(logoFile);
    setLogoPreview(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [logoFile]);

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

  const handleSave = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      setSaveMessage("");
      return;
    }

    try {
      setIsSaving(true);
      setSaveMessage("");

      const session = JSON.parse(
        localStorage.getItem("app_auth_session_v1") || "{}"
      );

      const token = session?.accessToken;

      await axios.patch(
  `${import.meta.env.VITE_API_URL}/api/configs/company-profile`,
  {
          companyName: profile.companyName,
          businessAddress: profile.businessAddress,
          contactEmail: profile.contactEmail,
          phone: profile.phone,
          serviceArea: profile.serviceArea,
          leadTime: profile.leadTime,
          logoUrl: logoPreview || "",
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setSavedProfile(profile);
      setSaveMessage("Company details saved successfully.");
    } catch (error) {
      setSaveMessage(
        error?.response?.data?.message ||
          "Failed to save company details."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setProfile(savedProfile);
    setErrors({});
    setSaveMessage("");
    setLogoFile(null);
    setLogoPreview("");
    setLogoError("");
  };

  const handleLogoChange = (e) => {
    const selectedFile = e.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ];

    const maxSizeInBytes = 2 * 1024 * 1024;

    if (!allowedTypes.includes(selectedFile.type)) {
      setLogoError(
        "Only PNG, JPG, JPEG, and WEBP files are allowed."
      );
      setLogoFile(null);
      setLogoPreview("");
      return;
    }

    if (selectedFile.size > maxSizeInBytes) {
      setLogoError("Logo must be smaller than 2 MB.");
      setLogoFile(null);
      setLogoPreview("");
      return;
    }

    setLogoError("");
    setLogoFile(selectedFile);
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

            <div>
              <label className="mb-2 block text-sm font-semibold text-text-main">
                Company Logo
              </label>

              <div className="rounded-2xl border border-dashed border-primary/30 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-neutral-light bg-white">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Company logo preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-text-muted">No Logo</span>
                    )}
                  </div>

                  <div className="flex-1">
                    <input
                      id="companyLogo"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={handleLogoChange}
                      className="hidden"
                    />

                    <label
                      htmlFor="companyLogo"
                      className="inline-flex cursor-pointer rounded-xl border border-neutral-light bg-white px-4 py-2 text-sm font-semibold text-text-main shadow-sm"
                    >
                      Choose Logo
                    </label>

                    <p className="mt-2 text-sm font-medium text-text-main">
                      Upload a company logo to preview how it will appear on the
                      supplier profile.
                    </p>

                    {logoFile ? (
                      <p className="mt-2 text-sm font-semibold text-text-main">
                        Selected file: {logoFile.name}
                      </p>
                    ) : null}

                    {logoError ? (
                      <p className="mt-2 text-sm font-semibold text-red-500">
                        {logoError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
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
            disabled={isSaving}
            className="rounded-xl bg-primary px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </SupplierLayout>
  );
}