import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import { useMemo, useState } from "react";

const mockUsers = [
  {
    id: "U-1001",
    name: "Sarah Jenkins",
    role: "Customer",
    email: "sarah.j@example.com",
    status: "Active",
    avatar: "https://i.pravatar.cc/100?img=32",
  },
  {
    id: "U-1002",
    name: "Michael Ross",
    role: "Supplier",
    email: "m.ross@logistics.net",
    status: "Active",
    avatar: "https://i.pravatar.cc/100?img=15",
  },
  {
    id: "U-1003",
    name: "Alicia Gomez",
    role: "Customer",
    email: "alicia.gomez@email.com",
    status: "Suspended",
    avatar: "https://i.pravatar.cc/100?img=48",
  },
  {
    id: "U-1004",
    name: "Daniel Reed",
    role: "Supplier",
    email: "daniel@reedwholesale.com",
    status: "Active",
    avatar: "https://i.pravatar.cc/100?img=12",
  },
];

const filters = ["All", "Customers", "Suppliers", "Suspended"];

export default function AdminUserManagementPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [users, setUsers] = useState(mockUsers);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesFilter =
        activeFilter === "All" ||
        (activeFilter === "Customers" && user.role === "Customer") ||
        (activeFilter === "Suppliers" && user.role === "Supplier") ||
        (activeFilter === "Suspended" && user.status === "Suspended");

      return matchesSearch && matchesFilter;
    });
  }, [users, searchTerm, activeFilter]);

  const toggleUserStatus = (id) => {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === id
          ? {
              ...user,
              status: user.status === "Active" ? "Suspended" : "Active",
            }
          : user
      )
    );
  };

  return (
    <div className="min-h-screen bg-background-light text-text-main">
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

              {/* Filters */}
              <section className="flex flex-wrap gap-3">
                {filters.map((filter) => {
                  const isActive = activeFilter === filter;

                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setActiveFilter(filter)}
                      className={`rounded-full px-5 py-2.5 text-sm font-bold transition ${
                        isActive
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
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Name
                        </th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Role
                        </th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Email
                        </th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Status
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-neutral-light">
                      {filteredUsers.length > 0 ? (
                        filteredUsers.map((user) => (
                          <tr
                            key={user.id}
                            className="transition hover:bg-neutral-light/40"
                          >
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <img
                                  src={user.avatar}
                                  alt={user.name}
                                  className="h-12 w-12 rounded-full object-cover"
                                />
                                <div>
                                  <p className="text-sm font-semibold text-text-main">
                                    {user.name}
                                  </p>
                                  <p className="mt-0.5 text-xs text-text-muted">
                                    {user.id}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-5 text-sm font-medium text-text-main">
                              {user.role}
                            </td>

                            <td className="px-6 py-5 text-sm text-text-muted">
                              {user.email}
                            </td>

                            <td className="px-6 py-5">
                              <span
                                className={`inline-flex rounded-lg px-3 py-1 text-xs font-bold ${
                                  user.status === "Active"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-red-100 text-red-600"
                                }`}
                              >
                                {user.status}
                              </span>
                            </td>

                            <td className="px-6 py-5 text-right">
                              <button
                                type="button"
                                onClick={() => toggleUserStatus(user.id)}
                                className={`text-sm font-bold transition ${
                                  user.status === "Active"
                                    ? "text-red-500 hover:text-red-600"
                                    : "text-emerald-600 hover:text-emerald-700"
                                }`}
                              >
                                {user.status === "Active"
                                  ? "Suspend"
                                  : "Activate"}
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-6 py-10 text-center text-sm text-text-muted"
                          >
                            No users found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div className="flex flex-col gap-3 border-t border-neutral-light px-6 py-5 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-text-muted">
                    Showing 1 to {filteredUsers.length} of {users.length} results
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-light bg-white text-text-muted transition hover:bg-neutral-light/40"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        chevron_left
                      </span>
                    </button>

                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-text-main"
                    >
                      1
                    </button>

                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-light bg-white text-sm font-bold text-text-muted transition hover:bg-neutral-light/40"
                    >
                      2
                    </button>

                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-light bg-white text-text-muted transition hover:bg-neutral-light/40"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        chevron_right
                      </span>
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