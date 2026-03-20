import { useMemo, useState } from "react";
//this needs to be changed in future
export default function SavingsSummaryCard({
  saved = 412.5,
  goal = 600,
  city = "Toronto",
  monthLabel = "this month",
}) {
  const [expanded, setExpanded] = useState(false);

  const progress = useMemo(() => {
    if (!goal) return 0;
    return Math.min((saved / goal) * 100, 100);
  }, [saved, goal]);

  const remaining = useMemo(() => {
    return Math.max(goal - saved, 0);
  }, [saved, goal]);

  return (
    <button
      type="button"
      onClick={() => setExpanded((prev) => !prev)}
      className={`w-full rounded-2xl p-5 text-left shadow-lg transition-all duration-300 ${expanded
        ? "border border-neutral-light bg-white text-text-main"
        : "bg-gradient-to-br from-primary to-teal-500 text-text-main"
        }`}
    >
      {!expanded ? (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold">Total Savings</h3>
            <span className="material-symbols-outlined">
              account_balance_wallet
            </span>
          </div>

          <div className="mb-1 text-3xl font-bold">${saved.toFixed(2)}</div>

          <div className="text-xs opacity-80">
            Saved {monthLabel} in {city}
          </div>
        </>
      ) : (
        <>
          <p className="mb-4 text-sm font-medium text-text-main">Savings Summary</p>

          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-text-main">
                Total Saved
              </p>
              <p className="text-4xl font-bold text-teal-400">
                ${Math.floor(saved)}
              </p>
              <p className="text-sm text-text-main">${goal} monthly goal</p>
            </div>

            <div className="flex h-20 w-20 items-center justify-center rounded-full border-[6px] border-teal-400 text-center">
              <div>
                <div className="text-lg font-bold">{Math.round(progress)}%</div>
                <div className="text-[10px] text-text-main">to goal</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/15 px-4 py-3 text-sm text-white/90">
            ${remaining.toFixed(2)} left to reach your goal
          </div>
        </>
      )}
    </button>
  );
}