// src/components/MessageTree/SearchFilterBar.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import theme from "./MessageTree.styles";

/* Layout */
const Bar = styled.form`
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 0;
  flex-wrap: wrap;
`;

/* Search input */
const SearchInput = styled.input`
  flex: 1 1 320px;
  min-width: 160px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid ${theme.colors.border};
  background: ${theme.colors.inputBg};
  color: ${theme.colors.onSurface};
  font-size: 14px;
  &:focus {
    outline: 2px solid ${theme.colors.focus};
  }
`;

/* Select */
const Select = styled.select`
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid ${theme.colors.border};
  background: ${theme.colors.inputBg};
  color: ${theme.colors.onSurface};
  font-size: 14px;
`;

/* Small button */
const IconButton = styled.button`
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  color: ${theme.colors.onSurface};
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  &:focus {
    outline: 2px solid ${theme.colors.focus};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/* Group wrapper for compactness */
const Group = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

/* Helper text */
const Helper = styled.span`
  font-size: 12px;
  color: ${theme.colors.muted};
`;

/* Responsive tweaks (use class selectors to avoid Emotion component selectors) */
const responsive = css`
  @media (max-width: 640px) {
    .sf-search-input {
      flex-basis: 100%;
    }
    .sf-group {
      flex-basis: 48%;
    }
  }
`;

/* Default options */
const DEFAULT_TYPES = [
  { value: "all", label: "All types" },
  { value: "issue_wall", label: "Issue Wall" },
  { value: "email", label: "Email" },
  { value: "notification", label: "Notification" },
  { value: "order", label: "Order" },
  { value: "review", label: "Review" },
];

const DEFAULT_STATUS = [
  { value: "all", label: "All status" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "deleted", label: "Deleted" },
  { value: "read", label: "Read" },
  { value: "unread", label: "Unread" },
];

/* Utility: simple debounce hook inline */
function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function SearchFilterBar({
  initialQuery = "",
  initialFilters = { type: "all", status: "all", ops_region: "all" },
  onSearch,
  onFilterChange,
  typeOptions = DEFAULT_TYPES,
  statusOptions = DEFAULT_STATUS,
  opsRegions = ["all"],
  debounceMs = 300,
}) {
  const [query, setQuery] = useState(initialQuery || "");
  const [filters, setFilters] = useState({
    type: initialFilters.type || "all",
    status: initialFilters.status || "all",
    ops_region: initialFilters.ops_region || "all",
  });

  const debouncedQuery = useDebouncedValue(query, debounceMs);

  // Emit debounced search
  useEffect(() => {
    if (typeof onSearch === "function") onSearch(debouncedQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  // Emit filter changes
  useEffect(() => {
    if (typeof onFilterChange === "function") onFilterChange(filters);
  }, [filters, onFilterChange]);

  const handleReset = useCallback(
    (e) => {
      e && e.preventDefault();
      setQuery("");
      setFilters({ type: "all", status: "all", ops_region: "all" });
      if (typeof onSearch === "function") onSearch("");
      if (typeof onFilterChange === "function")
        onFilterChange({ type: "all", status: "all", ops_region: "all" });
    },
    [onSearch, onFilterChange]
  );

  const handleSubmit = useCallback((e) => {
    // prevent form submit; search is debounced
    e.preventDefault();
  }, []);

  const opsRegionOptions = useMemo(() => {
    const uniq = Array.from(new Set(["all", ...(opsRegions || [])]));
    return uniq.map((r) => ({ value: r, label: r === "all" ? "All regions" : r }));
  }, [opsRegions]);

  return (
    <Bar onSubmit={handleSubmit} css={responsive} role="search" aria-label="Search and filter messages">
      <SearchInput
        className="sf-search-input"
        type="search"
        placeholder="Search messages by subject, details, metadata..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search messages"
      />

      <Group className="sf-group">
        <Select
          aria-label="Filter by type"
          value={filters.type}
          onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}
        >
          {typeOptions.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filter by status"
          value={filters.status}
          onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
        >
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Group>

      <Group className="sf-group">
        <Select
          aria-label="Filter by ops region"
          value={filters.ops_region}
          onChange={(e) => setFilters((p) => ({ ...p, ops_region: e.target.value }))}
        >
          {opsRegionOptions.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>

        <IconButton type="button" onClick={handleReset} aria-label="Reset search and filters" title="Reset">
          Reset
        </IconButton>
      </Group>

      <Helper aria-hidden="true">Tip: press Enter to focus results</Helper>
    </Bar>
  );
}

SearchFilterBar.propTypes = {
  initialQuery: PropTypes.string,
  initialFilters: PropTypes.shape({
    type: PropTypes.string,
    status: PropTypes.string,
    ops_region: PropTypes.string,
  }),
  onSearch: PropTypes.func,
  onFilterChange: PropTypes.func,
  typeOptions: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string.isRequired, label: PropTypes.string.isRequired })),
  statusOptions: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string.isRequired, label: PropTypes.string.isRequired })),
  opsRegions: PropTypes.arrayOf(PropTypes.string),
  debounceMs: PropTypes.number,
};

SearchFilterBar.defaultProps = {
  initialQuery: "",
  initialFilters: { type: "all", status: "all", ops_region: "all" },
  onSearch: null,
  onFilterChange: null,
  typeOptions: DEFAULT_TYPES,
  statusOptions: DEFAULT_STATUS,
  opsRegions: ["all"],
  debounceMs: 300,
};
