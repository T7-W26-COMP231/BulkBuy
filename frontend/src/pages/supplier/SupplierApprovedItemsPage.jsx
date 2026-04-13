import { useNavigate } from "react-router-dom";
import SupplierLayout from "../../components/supplier/SupplierLayout";
import { fetchApprovedItems } from "../../api/supplyApi";
import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";


const CATEGORIES = ["All", "Produce", "Pantry", "Dairy"];

const quoteStatusConfig = {
  no_quote: {
    label: "No Quote",
    classes: "bg-red-50 text-red-600",
    dot: "bg-red-500",
  },
  draft: {
    label: "Draft",
    classes: "bg-yellow-50 text-yellow-600",
    dot: "bg-yellow-500",
  },
  approved: {
    label: "Approved",
    classes: "bg-emerald-50 text-emerald-600",
    dot: "bg-emerald-500",
  },
  reviewing: {
    label: "Reviewing",
    classes: "bg-blue-50 text-blue-600",
    dot: "bg-blue-500",
  },
};

function QuoteStatusBadge({ status }) {
  const config = quoteStatusConfig[status] ?? {
    label: status,
    classes: "bg-slate-50 text-slate-600",
    dot: "bg-slate-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold ${config.classes}`}>
      <span className={`size-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function ActionButton({ status, onCreateQuote, onResumeQuote, onViewDetails }) {
  // #111 disabled state — active quote exists
  if (status === "approved") {
    return (
      <button
        type="button"
        disabled
        title="An active quote already exists for this item"
        className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-light px-4 py-2 text-sm font-semibold text-text-muted cursor-not-allowed opacity-60"
      >
        <span className="material-symbols-outlined text-[16px]">lock</span>
        Quote Active
      </button>
    );
  }
  if (status === "draft") {
    return (
      <button
        type="button"
        onClick={onResumeQuote}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-primary transition hover:opacity-75"
      >
        Resume Quote
        <span className="material-symbols-outlined text-[16px]">edit</span>
      </button>
    );
  }
  if (status === "reviewing") {
    return (
      <button
        type="button"
        onClick={onViewDetails}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-text-main transition hover:opacity-75"
      >
        View Details
        <span className="material-symbols-outlined text-[16px]">visibility</span>
      </button>
    );
  }
  // no_quote
  return (
    <button
      type="button"
      onClick={onCreateQuote}
      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-text-main transition hover:opacity-90"
    >
      <span className="material-symbols-outlined text-[16px]">add</span>
      Create Quote
    </button>
  );
}

export default function SupplierApprovedItemsPage() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const { accessToken, user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadItems = async () => {
      try {
        const res = await fetchApprovedItems();
        setItems(res?.data || []);

      } catch (err) {
        console.error("Failed to load approved items:", err);
      } finally {
        setLoading(false);
      }
    };

    if (accessToken && user?.role === "supplier") {
      loadItems();
    }
  }, [accessToken, user]);
  console.log(items)

  const filtered = items.filter((item) => {
    const matchesCategory =
      activeCategory === "All" ||
      item.tags?.includes(activeCategory.toLowerCase()) ||
      item.shipping?.class === activeCategory.toLowerCase();
    const matchesSearch =
      search === "" ||
      item.title?.toLowerCase().includes(search.toLowerCase()) ||
      item.sku?.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categoryIcons = {
    All: "apps",
    Produce: "nutrition",
    Pantry: "grocery",
    Dairy: "water_drop",
  };

  return (
    <SupplierLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">

        {/* Header */}
        <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-main">Approved Items</h1>
            <p className="mt-1 text-sm text-text-muted">
              Manage the inventory you are approved to supply and track quote statuses.
            </p>
          </div>
          <button
  type="button"
  onClick={() => navigate("/supplier/approved-items/request")}
  className="relative z-20 inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-text-main transition hover:opacity-90"
>
  <span className="material-symbols-outlined text-[18px]">add</span>
  Request New Item
</button>
        </div>

        {/* Filters + Search */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Category tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${activeCategory === cat
                  ? "bg-primary text-text-main shadow-sm"
                  : "bg-white border border-neutral-light text-text-muted hover:bg-neutral-light"
                  }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {categoryIcons[cat]}
                </span>
                {cat}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full max-w-xs">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
              search
            </span>
            <input
              type="text"
              placeholder="Search by item name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-neutral-light bg-white py-2.5 pl-10 pr-4 text-sm text-text-main outline-none transition placeholder:text-text-muted focus:border-primary"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-neutral-light bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead className="border-b border-neutral-light bg-neutral-light/40">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                    Item Name
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                    Category
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                    Quote Status
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-light">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-sm text-text-muted">
                      No items found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item._id} className="transition hover:bg-neutral-light/40">
                      {/* Item Name */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-xl bg-neutral-light overflow-hidden">
                            {item.images?.[0] ? (
                              <img src={item.images[0]} alt={item.title} className="size-10 object-cover" />
                            ) : (
                              <span className="material-symbols-outlined text-[20px] text-text-muted">inventory_2</span>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-text-main">{item.title}</p>
                            <p className="mt-0.5 text-xs text-text-muted">#{item.sku}</p>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-lg px-3 py-1 text-xs font-semibold bg-neutral-light text-text-muted">
                          {item.tags?.[0] || "General"}
                        </span>
                      </td>

                      {/* Quote Status */}
                      <td className="px-6 py-4">
                        <QuoteStatusBadge status={item.quoteStatus} />
                      </td>

                      {/* Action */}
                      <td className="px-6 py-4 text-right">
                        <ActionButton
                          status={item.quoteStatus}
                          onCreateQuote={() => navigate(`/supplier/quotes/create?itemId=${item._id}`)}
                          onResumeQuote={() => navigate(`/supplier/quotes/create?itemId=${item._id}&resume=true`)}
                          onViewDetails={() => navigate(`/supplier/quotes?itemId=${item._id}`)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-neutral-light px-6 py-4">
            <p className="text-sm text-text-muted">
              Showing <span className="font-semibold text-text-main">1</span> to{" "}
              <span className="font-semibold text-text-main">{filtered.length}</span> of{" "}
              <span className="font-semibold text-text-main">{filtered.length}</span> results
            </p>
            <div className="flex items-center gap-1">
              <button type="button" className="flex size-8 items-center justify-center rounded-lg border border-neutral-light text-text-muted hover:bg-neutral-light transition">
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
              <button type="button" className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-text-main">
                1
              </button>
              <button type="button" className="flex size-8 items-center justify-center rounded-lg border border-neutral-light text-sm text-text-muted hover:bg-neutral-light transition">
                2
              </button>
              <button type="button" className="flex size-8 items-center justify-center rounded-lg border border-neutral-light text-sm text-text-muted hover:bg-neutral-light transition">
                3
              </button>
              <button type="button" className="flex size-8 items-center justify-center rounded-lg border border-neutral-light text-text-muted hover:bg-neutral-light transition">
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </SupplierLayout>
  );
}