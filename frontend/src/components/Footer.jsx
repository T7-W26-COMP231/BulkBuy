import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-neutral-light bg-white px-6 py-10 md:px-40">
      <div className="flex flex-col justify-between gap-10 md:flex-row">
        <div className="flex max-w-xs flex-col gap-4">
          <div className="flex items-center gap-2 text-text-main">
            <div className="flex size-6 items-center justify-center rounded bg-primary">
              <span className="material-symbols-outlined text-sm">layers</span>
            </div>
            <h2 className="text-lg font-bold">BulkBuy</h2>
          </div>
          <p className="text-sm leading-relaxed text-text-muted">
            Lowering the cost of living through community-driven wholesale
            purchasing. Join your neighbors today.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-bold">Company</h4>
            <Link className="text-sm text-text-muted hover:text-primary" to="/about">
              About Us
            </Link>
            <Link className="text-sm text-text-muted hover:text-primary" to="/careers">
              Careers
            </Link>
            <Link className="text-sm text-text-muted hover:text-primary" to="/partner-login">
              Partner Login
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-bold">Resources</h4>
            <Link className="text-sm text-text-muted hover:text-primary" to="/how-it-works">
              How it works
            </Link>
            <Link className="text-sm text-text-muted hover:text-primary" to="/help-center">
              Help Center
            </Link>
            <Link className="text-sm text-text-muted hover:text-primary" to="/safety">
              Safety
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-bold">Legal</h4>
            <Link className="text-sm text-text-muted hover:text-primary" to="/privacy-policy">
              Privacy Policy
            </Link>
            <Link className="text-sm text-text-muted hover:text-primary" to="/terms-of-service">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-10 border-t border-neutral-light pt-8 text-center text-xs text-text-muted">
        © {new Date().getFullYear()} BulkBuy Technologies. Currently serving Toronto, Vancouver,
        and Montreal.
      </div>
    </footer>
  );
}