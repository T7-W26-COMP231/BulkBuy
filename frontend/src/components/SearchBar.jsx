// src/components/SearchBar.jsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

export default function SearchBar({ onSearch }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (location.pathname === "/marketplace") {
      const q = searchParams.get("q") || "";
      setQuery(q);
    }
  }, [location.pathname, searchParams]);

  const handleChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    if (typeof onSearch === "function") {
      onSearch(value);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const trimmed = query.trim();

    if (location.pathname !== "/marketplace") {
      navigate(`/marketplace?q=${encodeURIComponent(trimmed)}`);
      return;
    }

    navigate(`/marketplace?q=${encodeURIComponent(trimmed)}`);

    if (typeof onSearch === "function") {
      onSearch(trimmed);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-10 w-full items-stretch rounded-lg bg-neutral-light px-3"
    >
      <span className="material-symbols-outlined self-center text-text-muted">
        search
      </span>

      <input
        className="w-full border-none bg-transparent text-sm placeholder:text-text-muted focus:ring-0 focus:outline-none"
        placeholder="Search bulk deals..."
        type="text"
        value={query}
        onChange={handleChange}
      />
    </form>
  );
}