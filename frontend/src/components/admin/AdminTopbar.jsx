export default function AdminTopbar({ title = "Admin" }) {
  return (
    <header className="border-b border-neutral-light bg-white px-6 py-4 md:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-text-muted">
            receipt_long
          </span>
          <h1 className="text-lg font-bold text-text-main md:text-xl">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-light text-text-muted transition hover:bg-primary/15"
          >
            <span className="material-symbols-outlined">notifications</span>
          </button>

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-light text-text-muted transition hover:bg-primary/15"
          >
            <span className="material-symbols-outlined">help</span>
          </button>

          <button
            type="button"
            className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-text-main transition hover:opacity-90"
          >
            Save Changes
          </button>
        </div>
      </div>
    </header>
  );
}