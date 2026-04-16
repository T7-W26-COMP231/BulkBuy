import { useEffect, useState } from "react";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import api from "../../api/api";

const LIMIT = 25;
const filters = ["All", "Customers", "Suppliers", "Suspended"];

/* -------------------------
   User Detail Modal
   ------------------------- */
function UserDetailModal({ user, onClose, onToggleStatus }) {
  if (!user) return null;

  const primaryEmail = user.emails?.[0]?.address || "—";
  const primaryPhone = user.phones?.[0]?.number || "—";
  const primaryAddress = user.addresses?.[0];
  const isActive = user.status === "active";

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      {/* Modal panel */}
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header banner */}
        <div className="bg-[#083b2d] px-6 py-6 text-white">
          <div className="flex items-center gap-4">
            <img
              src={user.avatar}
              alt={user.firstName}
              className="h-16 w-16 rounded-full border-2 border-white/30 object-cover"
            />
            <div>
              <h2 className="text-xl font-bold">
                {user.firstName} {user.lastName}
              </h2>
              <p className="mt-0.5 text-sm text-white/70">{user.userId}</p>
              <div className="mt-2 flex gap-2">
                {/* Role badge */}
                <span className="rounded-full bg-white/20 px-3 py-0.5 text-xs font-bold capitalize">
                  {user.role}
                </span>
                {/* Status badge */}
                <span
                  className={`rounded-full px-3 py-0.5 text-xs font-bold ${isActive
                    ? "bg-emerald-400/30 text-emerald-200"
                    : "bg-red-400/30 text-red-200"
                    }`}
                >
                  {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="divide-y divide-neutral-100 px-6 py-4">

          {/* Contact info */}
          <div className="py-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">
              Contact
            </h3>
            <div className="flex flex-col gap-2">
              <Row icon="email" label="Email" value={primaryEmail} />
              <Row icon="phone" label="Phone" value={primaryPhone} />
            </div>
          </div>

          {/* Address */}
          <div className="py-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">
              Address
            </h3>
            {primaryAddress ? (
              <p className="text-sm text-text-main">
                {primaryAddress.line1}
                {primaryAddress.city ? `, ${primaryAddress.city}` : ""}
                {primaryAddress.region ? `, ${primaryAddress.region}` : ""}
                {primaryAddress.postalCode ? ` ${primaryAddress.postalCode}` : ""}
                {primaryAddress.country ? `, ${primaryAddress.country}` : ""}
              </p>
            ) : (
              <p className="text-sm text-text-muted">No address on file</p>
            )}
          </div>

          {/* Account info */}
          <div className="py-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">
              Account
            </h3>
            <div className="flex flex-col gap-2">
              <Row icon="calendar_today" label="Joined" value={new Date(user.createdAt).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })} />
              <Row icon="update" label="Last updated" value={new Date(user.updatedAt).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })} />
              <Row icon="verified" label="Email verified" value={user.emails?.[0]?.verified ? "Yes" : "No"} />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex gap-3 border-t border-neutral-100 px-6 py-4">
          <button
            type="button"
            onClick={() => { onToggleStatus(user._id, user.status); onClose(); }}
            className={`flex-1 rounded-2xl py-3 text-sm font-bold transition ${isActive
              ? "bg-red-50 text-red-500 hover:bg-red-100"
              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
              }`}
          >
            {isActive ? "Suspend User" : "Activate User"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-neutral-100 py-3 text-sm font-bold text-text-muted transition hover:bg-neutral-200"
          >
            Close
          </button>
        </div>

        {/* Close X */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>
  );
}

/* Small helper row for the modal */
function Row({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3">
      <span className="material-symbols-outlined text-[18px] text-text-muted">{icon}</span>
      <span className="w-24 text-xs text-text-muted">{label}</span>
      <span className="text-sm font-medium text-text-main">{value}</span>
    </div>
  );
}

/* -------------------------
   Main Page
   ------------------------- */
export default function AdminUserManagementPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Task #276 — selected user for detail modal
  const [selectedUser, setSelectedUser] = useState(null);

  // Fetch from API — re-runs when page, searchTerm, or activeFilter changes
  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const roleFilter =
          activeFilter === "Customers" ? { role: "customer" } :
            activeFilter === "Suppliers" ? { role: "supplier" } :
              activeFilter === "Suspended" ? { role: { $in: ["customer", "supplier"] }, status: "suspended" } :
                { role: { $in: ["customer", "supplier"] } };

        const res = await api.get(
          `/users?filter=${encodeURIComponent(JSON.stringify(roleFilter))}&page=${page}&limit=${LIMIT}`
        );
        setUsers(res.data.items);
        setTotal(res.data.total);
      } catch (err) {
        console.error("Failed to fetch users", err);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchUsers, searchTerm ? 400 : 0);
    return () => clearTimeout(debounce);
  }, [page, searchTerm, activeFilter]);

  // Reset to page 1 whenever filter or search changes
  useEffect(() => {
    setPage(1);
  }, [searchTerm, activeFilter]);

  const filteredUsers = users;

  // Call API to suspend or activate, then update local state
  const toggleUserStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    try {
      await api.patch(`/users/${id}`, { status: newStatus });
      setUsers((prev) =>
        prev.map((u) => (u._id === id ? { ...u, status: newStatus } : u))
      );
      // Also update selectedUser if the modal is open for this user
      setSelectedUser((prev) =>
        prev?._id === id ? { ...prev, status: newStatus } : prev
      );
    } catch (err) {
      console.error("Failed to update user status", err);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="min-h-screen bg-background-light text-text-main">

      {/* User detail modal — Task #276 */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onToggleStatus={toggleUserStatus}
        />
      )}

      <div className="flex min-h-screen">
        <AdminSidebar
          isMobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex min-h-screen flex-1 flex-col">
          <AdminTopbar
            title="User Account Management"
            onMenuClick={() => setSidebarOpen(true)}
          />

          <main className="flex-1 px-6 py-8 md:px-8 lg:px-10">
            <div className="mx-auto flex max-w-7xl flex-col gap-5">

              {/* Hero Banner */}
              <section className="overflow-hidden rounded-3xl bg-[#083b2d] px-6 py-7 text-white shadow-lg md:px-8 md:py-8">
                <div className="grid gap-8 lg:grid-cols-[1.4fr_320px] lg:items-center">
                  <div>
                    <h1 className="text-4xl font-bold tracking-tight">
                      User Account Management
                    </h1>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-white/75 md:text-base">
                      Activate or suspend customers and suppliers with a single
                      click. Maintain security and oversight across the BulkBuy
                      ecosystem.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 lg:items-end">
                    <button
                      type="button"
                      className="w-full rounded-2xl bg-primary px-6 py-4 text-base font-bold text-text-main transition hover:opacity-90 lg:max-w-[230px]"
                    >
                      View Documentation
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-white/20 bg-white/10 px-6 py-4 text-base font-bold text-white transition hover:bg-white/15 lg:max-w-[230px]"
                    >
                      Export User List
                    </button>
                  </div>
                </div>
              </section>

              {/* Search */}
              <section className="rounded-2xl border border-neutral-light bg-white p-4 shadow-sm">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Search users by name, email or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-light bg-background-light py-4 pl-12 pr-4 text-sm text-text-main outline-none transition focus:border-primary"
                  />
                </div>
              </section>

              {/* Filter tabs */}
              <section className="flex flex-wrap gap-3">
                {filters.map((filter) => {
                  const isActive = activeFilter === filter;
                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setActiveFilter(filter)}
                      className={`rounded-full px-5 py-2.5 text-sm font-bold transition ${isActive
                        ? "bg-primary text-text-main"
                        : "bg-neutral-light text-text-muted hover:bg-neutral-light/80"
                        }`}
                    >
                      {filter}
                    </button>
                  );
                })}
              </section>

              {/* User Table */}
              <section className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left">
                    <thead className="border-b border-neutral-light bg-neutral-light/40">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">Name</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">Role</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">Email</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">Status</th>
                        <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-[0.16em] text-text-muted">Actions</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-neutral-light">
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-sm text-text-muted">
                            Loading users...
                          </td>
                        </tr>
                      ) : filteredUsers.length > 0 ? (
                        filteredUsers.map((user) => (
                          <tr
                            key={user._id}
                            className="cursor-pointer transition hover:bg-neutral-light/40"
                            onClick={() => setSelectedUser(user)}
                          >
                            {/* Name + Avatar */}
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <img
                                  src={user.avatar}
                                  alt={user.firstName}
                                  className="h-12 w-12 rounded-full object-cover"
                                />
                                <div>
                                  <p className="text-sm font-semibold text-text-main">
                                    {user.firstName} {user.lastName}
                                  </p>
                                  <p className="mt-0.5 text-xs text-text-muted">{user.userId}</p>
                                </div>
                              </div>
                            </td>

                            {/* Role */}
                            <td className="px-6 py-5 text-sm font-medium text-text-main">
                              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                            </td>

                            {/* Email */}
                            <td className="px-6 py-5 text-sm text-text-muted">
                              {user.emails?.[0]?.address || "—"}
                            </td>

                            {/* Status badge */}
                            <td className="px-6 py-5">
                              <span
                                className={`inline-flex rounded-lg px-3 py-1 text-xs font-bold ${user.status === "active"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-red-100 text-red-600"
                                  }`}
                              >
                                {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                              </span>
                            </td>

                            {/* Actions — stop propagation so row click doesn't fire */}
                            <td className="px-6 py-5 text-right">
                              <div className="flex items-center justify-end gap-4">
                                {/* View details button — Task #276 */}
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setSelectedUser(user); }}
                                  className="text-sm font-bold text-primary transition hover:opacity-70"
                                >
                                  View
                                </button>
                                {/* Suspend / Activate */}
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleUserStatus(user._id, user.status); }}
                                  className={`text-sm font-bold transition ${user.status === "active"
                                    ? "text-red-500 hover:text-red-600"
                                    : "text-emerald-600 hover:text-emerald-700"
                                    }`}
                                >
                                  {user.status === "active" ? "Suspend" : "Activate"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-sm text-text-muted">
                            No users found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination footer */}
                <div className="flex flex-col gap-3 border-t border-neutral-light px-6 py-5 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-text-muted">
                    Showing {total === 0 ? 0 : (page - 1) * LIMIT + 1} to{" "}
                    {Math.min(page * LIMIT, total)} of {total} results
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-light bg-white text-text-muted transition hover:bg-neutral-light/40 disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold transition ${p === page
                          ? "bg-primary text-text-main"
                          : "border border-neutral-light bg-white text-text-muted hover:bg-neutral-light/40"
                          }`}
                      >
                        {p}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page >= totalPages}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-light bg-white text-text-muted transition hover:bg-neutral-light/40 disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </button>
                  </div>
                </div>
              </section>

            </div>
          </main>
        </div>
      </div>
    </div>
  );
}