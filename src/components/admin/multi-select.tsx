"use client";

// A compact searchable MULTI-select for the control room. Sibling of
// SearchSelect (components/admin/search-select.tsx) and deliberately a
// separate component rather than a `multiple` flag on that one: the
// selection model differs (string[] vs string), and the panel must stay
// open across clicks so several options can be toggled in one pass.
// Everything visual is shared - the same .adm-combo* rules in admin.css
// dress both - so the two read as one control family.
//
// An empty `values` array means "no filter applied" and renders as
// `allLabel`, matching SearchSelect's convention where "" is the reset row.

import { useEffect, useMemo, useRef, useState } from "react";

export interface MultiOption {
  value: string;
  label: string;
  // Optional occurrence count, shown right-aligned so the operator can see
  // which options are worth filtering to before clicking.
  count?: number;
}

export function MultiSelect({
  values,
  onChange,
  options,
  allLabel = "All",
  searchPlaceholder = "Search…",
  ariaLabel,
  // Noun used in the "N <unit> selected" trigger summary.
  unit = "selected",
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiOption[];
  allLabel?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
  unit?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selectedSet = useMemo(() => new Set(values), [values]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  // Trigger summary: the single label when exactly one is picked (the common
  // case, e.g. "Poland"), otherwise a count so the chip never overflows.
  const summary = useMemo(() => {
    if (values.length === 0) return allLabel;
    if (values.length === 1) {
      return options.find((o) => o.value === values[0])?.label ?? values[0];
    }
    return `${values.length} ${unit}`;
  }, [values, options, allLabel, unit]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // Toggle rather than replace, and keep the panel open so a run of
  // countries can be picked without reopening between each.
  const toggle = (value: string) => {
    onChange(
      selectedSet.has(value)
        ? values.filter((v) => v !== value)
        : [...values, value],
    );
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[active];
      if (o) toggle(o.value);
    }
  };

  return (
    <div className="adm-combo" ref={rootRef}>
      <button
        type="button"
        className="lf-select adm-combo-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="adm-combo-value">{summary}</span>
        <svg
          className="adm-combo-caret"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="adm-combo-panel">
          <input
            ref={inputRef}
            type="text"
            className="adm-combo-search"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={ariaLabel ? `${ariaLabel} search` : "Search"}
          />
          <div
            className="adm-combo-list"
            role="listbox"
            aria-multiselectable="true"
            ref={listRef}
          >
            {filtered.length === 0 ? (
              <div className="adm-combo-empty">No matches.</div>
            ) : (
              filtered.map((o, i) => {
                const on = selectedSet.has(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`adm-combo-option adm-combo-multi${
                      on ? " selected" : ""
                    }${i === active ? " active" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => toggle(o.value)}
                  >
                    <span className="adm-combo-check" aria-hidden="true">
                      {on ? (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="adm-combo-multi-label">{o.label}</span>
                    {o.count != null && (
                      <span className="adm-combo-count">{o.count}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          {values.length > 0 && (
            <button
              type="button"
              className="adm-combo-clear"
              onClick={() => onChange([])}
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
