export default function AdminSummaryCard({ label, value, extra, badge }) {
  return (
    <div className="rounded-2xl border border-neutral-light bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-text-muted">
        {label}
      </p>

      <div className="mt-4 flex items-end gap-2">
        {value ? (
          <h3 className="text-4xl font-bold tracking-tight text-text-main">
            {value}
          </h3>
        ) : null}

        {extra ? (
          <span className="mb-1 text-sm font-semibold text-primary">{extra}</span>
        ) : null}

        {badge ? (
          <span className="rounded-md bg-neutral-light px-3 py-1 text-sm font-semibold text-text-main">
            {badge}
          </span>
        ) : null}
      </div>
    </div>
  );
}