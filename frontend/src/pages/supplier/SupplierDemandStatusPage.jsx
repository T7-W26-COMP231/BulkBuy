import SupplierLayout from "../../components/supplier/SupplierLayout";

const mockItems = [
  {
    id: 1,
    name: "Organic Haas Avocado",
    category: "Produce · Bulk Case",
    city: "San Francisco",
    state: "CA",
    region: "WEST",
    demand: 1450,
    tierLabel: "TIER 2 ACTIVE",
    nextTier: "NEXT: TIER 3 (2,000)",
    progress: 72,
    status: "Active",
    icon: "eco",
  },
  {
    id: 2,
    name: "Baby Spinach",
    category: "Produce · 5lb Bags",
    city: "Austin",
    state: "TX",
    region: "SOUTH",
    demand: 3000,
    tierLabel: "MAX TIER REACHED",
    nextTier: "TARGET: 3,000",
    progress: 100,
    status: "Complete",
    icon: "spa",
  },
  {
    id: 3,
    name: "Pasteurized Whole Egg",
    category: "Dairy · Carton Bulk",
    city: "Portland",
    state: "OR",
    region: "NORTHWEST",
    demand: 450,
    tierLabel: "TIER 1 ACTIVE",
    nextTier: "NEXT: TIER 2 (800)",
    progress: 56,
    status: "Active",
    icon: "science",
  },
];

function StatusBadge({ status }) {
  const isComplete = status === "Complete";

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold leading-none ${isComplete
        ? "bg-[#EEF4FF] text-[#4F7CFF]"
        : "bg-[#DDF7E8] text-[#3AA76D]"
        }`}
    >
      {status}
    </span>
  );
}

function TierProgress({ progress, tierLabel, nextTier }) {
  const nodes = [0, 33, 66, 100];

  return (
    <div className="min-w-[230px]">
      <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-semibold tracking-[0.04em]">
        <span className="text-[#49D6B2]">{tierLabel}</span>
        <span className="text-[#A0AEC0]">{nextTier}</span>
      </div>

      <div className="relative h-4 w-full">
        <div className="absolute left-0 right-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-[#D9E2EC]" />
        <div
          className="absolute left-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-[#56E3C6]"
          style={{ width: `${progress}%` }}
        />

        {nodes.map((node) => {
          const active = progress >= node;
          const atEnd = node === 100;

          return (
            <span
              key={node}
              className={`absolute top-1/2 h-[12px] w-[12px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${active
                ? "border-[#56E3C6] bg-white"
                : "border-[#D9E2EC] bg-white"
                } ${atEnd ? "" : ""}`}
              style={{ left: `${node}%` }}
            >
              <span
                className={`absolute left-1/2 top-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full ${active ? "bg-[#56E3C6]" : "bg-[#D9E2EC]"
                  }`}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function SupplierDemandStatusPage() {
  return (
    <SupplierLayout>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-1">

        <div className="rounded-[24px] bg-gradient-to-r from-[#063B3B] to-[#0C4A4A] px-8 py-7 text-white shadow-[0_10px_24px_rgba(6,59,59,0.18)]">
          <h1 className="text-[22px] font-bold leading-tight md:text-[24px]">
            Demand & Tier Progress Monitoring
          </h1>
          <p className="mt-2 max-w-[650px] text-sm leading-6 text-[#C6D7D4]">
            Monitor aggregated demand and active pricing tier progress across all
            regions. Approve pricing changes when thresholds are met.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select className="h-[42px] rounded-[14px] border border-[#E6EDF2] bg-white px-4 text-sm text-[#5B6575] shadow-sm outline-none">
            <option>City: All Cities</option>
            <option>San Francisco, CA</option>
            <option>Austin, TX</option>
            <option>Portland, OR</option>
          </select>

          <select className="h-[42px] rounded-[14px] border border-[#E6EDF2] bg-white px-4 text-sm text-[#5B6575] shadow-sm outline-none">
            <option>Category: All Categories</option>
            <option>Produce</option>
            <option>Dairy</option>
          </select>

          <button
            type="button"
            className="ml-auto inline-flex h-[46px] items-center gap-2 rounded-[14px] bg-[#56E3C6] px-6 text-sm font-semibold text-[#0F2B2E] shadow-[0_8px_18px_rgba(86,227,198,0.35)] transition hover:brightness-95"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
            Apply Filters
          </button>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-[#E8EEF3] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] text-left">
              <thead>
                <tr className="border-b border-[#EDF2F7]">
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                    Item Details
                  </th>
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                    City
                  </th>
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                    Current Demand
                  </th>
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                    Tier Progress
                  </th>
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                    Status
                  </th>
                  <th className="px-5 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {mockItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-[#EDF2F7] last:border-b-0"
                  >
                    <td className="px-5 py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#F4F8FB]">
                          <span className="material-symbols-outlined text-[19px] text-[#8A94A6]">
                            {item.icon}
                          </span>
                        </div>

                        <div>
                          <p className="max-w-[170px] text-[15px] font-semibold leading-5 text-[#1E293B]">
                            {item.name}
                          </p>
                          <p className="mt-1 text-xs text-[#94A3B8]">
                            {item.category}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-5">
                      <p className="text-sm font-semibold leading-5 text-[#334155]">
                        {item.city},
                        <br />
                        {item.state}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#B0BAC8]">
                        Region:
                        <span className="ml-1">{item.region}</span>
                      </p>
                    </td>

                    <td className="px-5 py-5">
                      <p className="text-[31px] font-bold leading-none text-[#1E293B]">
                        {item.demand.toLocaleString()}
                      </p>
                      <p className="mt-2 text-[11px] italic text-[#A0AEC0]">
                        Units
                      </p>
                    </td>

                    <td className="px-5 py-5">
                      <TierProgress
                        progress={item.progress}
                        tierLabel={item.tierLabel}
                        nextTier={item.nextTier}
                      />
                    </td>

                    <td className="px-5 py-5">
                      <StatusBadge status={item.status} />
                    </td>

                    <td className="px-5 py-5 text-center">
                      <button
                        type="button"
                        className="text-sm font-semibold leading-5 text-[#63DFC4] transition hover:opacity-80"
                      >
                        View
                        <br />
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-[#EDF2F7] px-5 py-4">
            <p className="text-sm italic text-[#94A3B8]">
              Showing 3 of 12 active tier monitors
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#E5EAF0] text-[#94A3B8]"
              >
                <span className="material-symbols-outlined text-[16px]">
                  chevron_left
                </span>
              </button>

              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#56E3C6] text-sm font-semibold text-[#0F2B2E]"
              >
                1
              </button>

              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#E5EAF0] text-sm font-medium text-[#64748B]"
              >
                2
              </button>

              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#E5EAF0] text-sm font-medium text-[#64748B]"
              >
                3
              </button>

              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#E5EAF0] text-[#94A3B8]"
              >
                <span className="material-symbols-outlined text-[16px]">
                  chevron_right
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </SupplierLayout>
  );
}