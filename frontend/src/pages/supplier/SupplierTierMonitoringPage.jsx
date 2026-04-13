import { useEffect, useState } from "react";
import SupplierLayout from "../../components/supplier/SupplierLayout";
import { useAuth } from "../../contexts/AuthContext";
import { fetchSupplierDemandStatus, fetchAggregationById } from "../../api/supplyApi";
import { useOpsContext } from "../../contexts/OpsContext";

const CANADIAN_REGIONS = [
  "north-america:ca-on",
  "north-america:ca-qc",
  "north-america:ca-bc",
  "north-america:ca-ab",
  "north-america:ca-mb",
  "north-america:ca-sk",
  "north-america:ca-ns",
  "north-america:ca-nb",
  "north-america:ca-nl",
  "north-america:ca-pe",
  "north-america:ca-yt",
  "north-america:ca-nt",
  "north-america:ca-nu",
  "north-america:ca",
  "north-america:ca-west",
  "north-america:ca-east",
  "north-america:ca-atlantic",
];

// ─── Sales Window Countdown ───────────────────────────────────────────────────
// WITH THIS:
// ─── Sales Window Countdown ───────────────────────────────────────────────────
function SalesWindowCountdown({ closesAt }) {
  const [state, setState] = useState({ ready: false, timeLeft: null });


  useEffect(() => {
    setState({ ready: false, timeLeft: null });
    if (!closesAt) return;

    const target = new Date(closesAt);
    const tick = () => {
      const diff = target - new Date();
      if (diff <= 0) {
        setState({ ready: true, timeLeft: null });
        return;
      }
      setState({
        ready: true,
        timeLeft: {
          days: Math.floor(diff / 86400000),
          hours: Math.floor((diff % 86400000) / 3600000),
          mins: Math.floor((diff % 3600000) / 60000),
          secs: Math.floor((diff % 60000) / 1000),
          urgent: diff / 3600000 < 24,
        },
      });
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [closesAt]);

  const pad = (n) => String(n).padStart(2, "0");
  const { ready, timeLeft } = state;

  if (!closesAt) return <span className="text-xs text-[#94A3B8]">—</span>;
  if (!ready) return <span className="text-xs text-[#94A3B8]">...</span>;
  if (!timeLeft) return <span className="text-xs font-semibold text-red-400">Closed</span>;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-0.5">
        {[
          { v: pad(timeLeft.days), l: "d" },
          { v: pad(timeLeft.hours), l: "h" },
          { v: pad(timeLeft.mins), l: "m" },
          { v: pad(timeLeft.secs), l: "s" },
        ].map(({ v, l }, i) => (
          <div key={l} className="flex items-center gap-0.5">
            {i > 0 && <span className="text-[#CBD5E1] text-xs mx-0.5">:</span>}
            <span className={`tabular-nums text-sm font-bold ${timeLeft.urgent ? "text-orange-500" : "text-[#1E293B]"}`}>
              {v}
            </span>
            <span className="text-[10px] text-[#94A3B8]">{l}</span>
          </div>
        ))}
      </div>
      {timeLeft.urgent && (
        <span className="text-[10px] font-semibold text-orange-500">Closing soon</span>
      )}
    </div>
  );
}
//Helper function--->
const isNearingTier = (progressPercent, isMaxTier) =>
  !isMaxTier && progressPercent >= 70;


// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const isComplete = status === "Complete";
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold leading-none ${isComplete ? "bg-[#EEF4FF] text-[#4F7CFF]" : "bg-[#DDF7E8] text-[#3AA76D]"
        }`}
    >
      {status}
    </span>
  );
}

// ─── Tier Progress ────────────────────────────────────────────────────────────
function TierProgress({ progress, nearing, tierLabel, nextTier, thresholds = [], maxThreshold = 0 }) {
  const nodes =
    thresholds.length > 0 && maxThreshold > 0
      ? thresholds.map((qty) => Math.min((qty / maxThreshold) * 100, 100))
      : [0, 33, 66, 100];

  return (
    <div className="min-w-[230px]">
      <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-semibold tracking-[0.04em]">
        <span className="text-[#49D6B2]">{tierLabel}</span>
        <div className="flex items-center gap-2">
          {nearing && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <span className="material-symbols-outlined text-[11px]">trending_up</span>
              Nearing tier
            </span>
          )}
          <span className="text-[#A0AEC0]">{nextTier}</span>
        </div>
      </div>
      <div className="relative h-10 w-full">
        <div className="absolute left-0 right-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-[#D9E2EC]" />
        <div
          className="absolute left-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-[#56E3C6]"
          style={{ width: `${progress}%` }}
        />
        {nodes.map((node, index) => {
          const active = progress >= node;
          return (
            <span
              key={node}
              className={`absolute top-1/2 h-[12px] w-[12px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${active ? "border-[#56E3C6] bg-white" : "border-[#D9E2EC] bg-white"
                }`}
              style={{ left: `${node}%` }}
            >
              <span
                className={`absolute left-1/2 top-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full ${active ? "bg-[#56E3C6]" : "bg-[#D9E2EC]"
                  }`}
              />
              <span className="absolute top-4 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-[#94A3B8]">
                {thresholds?.[index]?.toLocaleString?.() || ""}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SupplierTierMonitoringPage() {
  const { accessToken, user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [allItems, setAllItems] = useState([]);
  const [selectedCity, setSelectedCity] = useState("All Cities");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const { socket } = useOpsContext() ?? {}; // ← ADD THIS

  // aggregationId -> closesAt (ms timestamp)
  const [aggCloseDates, setAggCloseDates] = useState({});

  // ── Load demand items ──────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchSupplierDemandStatus();
        const demandItems = res?.data?.data || res?.data?.items || res?.data || [];

        console.log("📦 supplier demand response:", res?.data);
        console.log("📊 parsed demand items:", demandItems);

        const normalized = Array.isArray(demandItems) ? demandItems : [];
        setAllItems(normalized);
        setItems(normalized);
      } catch (err) {
        console.error("Failed to load demand status:", err);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    if (accessToken) load();
    else { setLoading(false); setItems([]); }
  }, [accessToken]);


  // ── Task #236 — Live demand auto-refresh via WebSocket ────────────────────
  // ── Task #236 — Live demand auto-refresh via WebSocket ────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleUiUpdate = (msg) => {
      if (msg?.action !== "demand:updated") return;
      const { aggregationId, currentDemand } = msg.payload || {};
      if (!aggregationId || currentDemand === undefined) return;

      console.log("🔄 [TierMonitor] Live demand update:", { aggregationId, currentDemand });

      const updateItems = (prev) =>
        prev.map((item) => {
          if (String(item.aggregationId) !== String(aggregationId)) return item;
          const nextMinQty = item.nextTier?.minQty || 0;
          const fromQty = item.currentTier?.minQty || 0;
          const progressPercent = nextMinQty > fromQty
            ? Math.min(100, Math.round(
              ((currentDemand - fromQty) / (nextMinQty - fromQty)) * 100
            ))
            : item.progressPercent;
          return { ...item, currentDemand, progressPercent };
        });

      setAllItems(updateItems);
      setItems(updateItems);
    };

    socket.on("ui:update", handleUiUpdate);
    console.log("📡 [TierMonitor] Listening for live demand updates");

    return () => socket.off("ui:update", handleUiUpdate);
  }, [socket]);

  // ── Fetch aggregation close dates once items are loaded ────────────────────
  useEffect(() => {
    if (!allItems.length) return;

    const uniqueIds = [...new Set(allItems.map((i) => i.aggregationId).filter(Boolean))];
    if (!uniqueIds.length) return;

    const supplierId = user?.id;
    console.log("👤 supplierId:", supplierId);
    console.log("👤 user object:", user);
    Promise.all(
      uniqueIds.map((id) =>
        fetchAggregationById(id).catch((err) => {
          console.warn(`Failed to fetch aggregation ${id}:`, err);
          return null;
        })
      )
    ).then((results) => {
      const map = {};
      results.forEach((res, idx) => {
        if (!res) return;
        const agg = res?.data?.data || res?.data;
        if (!agg) return;

        let latestTo = null;
        agg?.itemDtos?.forEach((dto) => {
          dto.salesWindow?.forEach((w) => {
            if (w.to && (!latestTo || w.to > latestTo)) latestTo = w.to;
          });
        });

        map[uniqueIds[idx]] = latestTo;
      });

      console.log("🕒 agg close dates:", map);
      setAggCloseDates(map);
    });
  }, [allItems, user]);

  return (
    <SupplierLayout>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-1">

        {/* Header */}
        <div className="rounded-[24px] bg-gradient-to-r from-[#063B3B] to-[#0C4A4A] px-8 py-7 text-white shadow-[0_10px_24px_rgba(6,59,59,0.18)]">
          <h1 className="text-[22px] font-bold leading-tight md:text-[24px]">
            Demand & Tier Progress Monitoring
          </h1>
          <p className="mt-2 max-w-[650px] text-sm leading-6 text-[#C6D7D4]">
            Monitor aggregated demand and active pricing tier progress across all
            regions. Approve pricing changes when thresholds are met.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="h-[42px] rounded-[14px] border border-[#E6EDF2] bg-white px-4 text-sm text-[#5B6575] shadow-sm outline-none"
          >
            <option value="All Cities">City: All Cities</option>
            {[...new Set([...CANADIAN_REGIONS, ...allItems.map((item) => item.ops_region).filter(Boolean)])].map(
              (region) => <option key={region} value={region}>{region}</option>
            )}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-[42px] rounded-[14px] border border-[#E6EDF2] bg-white px-4 text-sm text-[#5B6575] shadow-sm outline-none"
          >
            <option value="All Categories">Category: All Categories</option>
            {[...new Set(allItems.map((item) => item.category).filter(Boolean))].map(
              (category) => <option key={category} value={category}>{category}</option>
            )}
          </select>

          <button
            type="button"
            onClick={() => {
              setItems(allItems.filter((item) => {
                const cityMatch = selectedCity === "All Cities" || item.ops_region === selectedCity;
                const categoryMatch = selectedCategory === "All Categories" || item.category === selectedCategory;
                return cityMatch && categoryMatch;
              }));
            }}
            className="ml-auto inline-flex h-[46px] items-center gap-2 rounded-[14px] bg-[#56E3C6] px-6 text-sm font-semibold text-[#0F2B2E] shadow-[0_8px_18px_rgba(86,227,198,0.35)] transition hover:brightness-95"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
            Apply Filters
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-[24px] border border-[#E8EEF3] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead>
                <tr className="border-b border-[#EDF2F7]">
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Item Details</th>
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">City</th>
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Current Demand</th>
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Tier Progress</th>
                  {/* Task #234 — Sales Window Countdown */}
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Sales Window</th>
                  <th className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Status</th>
                  <th className="px-5 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-[#94A3B8]">
                      Loading demand data...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-[#94A3B8]">
                      No demand data found.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={`${item.itemId}-${item.aggregationId}-${item.currentDemand}`}
                      className={`border-b border-[#EDF2F7] last:border-b-0 transition-colors ${isNearingTier(item.progressPercent, item.isMaxTier) ? "bg-amber-50" : ""
                        }`}
                    >
                      {/* Item Details */}
                      <td className="px-5 py-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#F4F8FB] overflow-hidden">
                            {item.images?.[0] ? (
                              <img src={item.images[0]} alt={item.title} className="h-10 w-10 object-cover" />
                            ) : (
                              <span className="material-symbols-outlined text-[19px] text-[#8A94A6]">inventory_2</span>
                            )}
                          </div>
                          <div>
                            <p className="max-w-[170px] text-[15px] font-semibold leading-5 text-[#1E293B]">{item.title}</p>
                            <p className="mt-1 text-xs text-[#94A3B8]">{item.category}</p>
                          </div>
                        </div>
                      </td>

                      {/* City */}
                      <td className="px-5 py-5">
                        <p className="text-sm font-semibold leading-5 text-[#334155]">{item.ops_region || "—"}</p>
                      </td>

                      {/* Current Demand */}
                      <td className="px-5 py-5">
                        <p className="text-[31px] font-bold leading-none text-[#1E293B]">
                          {item.currentDemand.toLocaleString()}
                        </p>
                        <p className="mt-2 text-[11px] italic text-[#A0AEC0]">Units</p>
                      </td>

                      {/* Tier Progress */}
                      <td className="px-5 py-5">
                        <TierProgress
                          progress={item.progressPercent}
                          nearing={isNearingTier(item.progressPercent, item.isMaxTier)}
                          tierLabel={
                            item.isMaxTier
                              ? "MAX TIER REACHED"
                              : `TIER ${(() => {
                                const activeTierIndex =
                                  item.currentTier?.tierIndex ??
                                  item.pricingTiers?.filter((tier) => item.currentDemand >= tier.minQty)?.length;
                                return activeTierIndex || 1;
                              })()} ACTIVE`
                          }
                          nextTier={
                            item.isMaxTier
                              ? `TARGET: ${item.currentDemand}`
                              : item.nextTier
                                ? `NEXT: TIER ${item.nextTier.tierIndex} (${item.nextTier.minQty})`
                                : "NEXT TIER PENDING"
                          }
                          thresholds={item.pricingTiers?.map((tier) => tier.minQty) || []}
                          maxThreshold={item.pricingTiers?.[item.pricingTiers.length - 1]?.minQty || 0}
                        />
                        {/* Task #233 — Tier gap */}
                        {!item.isMaxTier && item.nextTier && (
                          <p className="mt-3 text-[11px] text-[#94A3B8]">
                            <span className="font-semibold text-[#1E293B]">
                              {Math.max(0, item.nextTier.minQty - item.currentDemand).toLocaleString()}
                            </span>
                            {" "}units to Tier {item.nextTier.tierIndex}
                          </p>
                        )}
                        {item.isMaxTier && (
                          <p className="mt-3 text-[11px] font-semibold text-[#49D6B2]">
                            ✓ Max tier reached
                          </p>
                        )}
                      </td>

                      {/* Sales Window Countdown — Task #234 */}
                      <td className="px-5 py-5">
                        <SalesWindowCountdown
                          closesAt={aggCloseDates[item.aggregationId]}
                        />
                      </td>

                      {/* Status */}
                      <td className="px-5 py-5">
                        <StatusBadge status={item.isMaxTier ? "Complete" : "Active"} />
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-5 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            console.log("clicked item:", item);
                            setSelectedItem(item);
                          }}
                          className="rounded-lg px-3 py-2 text-sm font-semibold leading-5 text-[#63DFC4] transition-all duration-200 hover:scale-105 hover:bg-[#ECFDF8] hover:text-[#0F766E] hover:shadow-sm"
                        >
                          View<br />Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[#EDF2F7] px-5 py-4">
            <p className="text-sm italic text-[#94A3B8]">
              Showing {items.length} active tier monitor{items.length !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" disabled className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-[10px] border border-[#E5EAF0] text-[#CBD5E1]">
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
              <button type="button" disabled className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-[10px] border border-[#E5EAF0] text-[#CBD5E1]">
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>

          {/* Selected Item Detail Panel */}
          {selectedItem && (
            <div className="m-5 rounded-[24px] border border-[#E8EEF3] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#1E293B]">{selectedItem.title}</h2>
                  <p className="mt-1 text-sm text-[#64748B]">{selectedItem.category}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-semibold text-[#334155]"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-5">
                <div className="rounded-xl bg-[#F8FAFC] p-4">
                  <p className="text-xs text-[#94A3B8]">Current Demand</p>
                  <p className="mt-1 text-lg font-bold text-[#0F172A]">{selectedItem.currentDemand}</p>
                </div>
                <div className="rounded-xl bg-[#F8FAFC] p-4">
                  <p className="text-xs text-[#94A3B8]">Region</p>
                  <p className="mt-1 text-lg font-bold text-[#0F172A]">{selectedItem.ops_region}</p>
                </div>
                <div className="rounded-xl bg-[#F8FAFC] p-4">
                  <p className="text-xs text-[#94A3B8]">Progress</p>
                  <p className="mt-1 text-lg font-bold text-[#0F172A]">{selectedItem.progressPercent}%</p>
                </div>
                <div className="rounded-xl bg-[#F8FAFC] p-4">
                  <p className="text-xs text-[#94A3B8]">Status</p>
                  <p className="mt-1 text-lg font-bold text-[#0F172A]">{selectedItem.isMaxTier ? "Complete" : "Active"}</p>
                </div>
                {/* Task #234 — also show countdown in detail panel */}
                <div className="rounded-xl bg-[#F8FAFC] p-4">
                  <p className="text-xs text-[#94A3B8]">Sales Window Closes</p>
                  <div className="mt-1">
                    <SalesWindowCountdown closesAt={aggCloseDates[selectedItem.aggregationId]} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </SupplierLayout>
  );
}