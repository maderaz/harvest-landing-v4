"use client";

// Five-segment timeframe picker used in the top-right of each
// Acquisition chart header. Same flagship treatment as the active
// funnel tab + sidebar item: gold pill on the active segment,
// muted ink on the rest. Mono labels so the row reads as a
// numeric chip rather than a copy element.

export type Timeframe = "7d" | "30d" | "90d" | "180d" | "all";

const OPTIONS: { value: Timeframe; label: string }[] = [
  { value: "all", label: "All" },
  { value: "180d", label: "180d" },
  { value: "90d", label: "90d" },
  { value: "30d", label: "30d" },
  { value: "7d", label: "7d" },
];

// Number of days the timeframe represents. For "all" we compute the
// span from the data and cap at maxDays so the bar count stays
// readable.
export function timeframeFixedDays(tf: Timeframe): number | null {
  if (tf === "7d") return 7;
  if (tf === "30d") return 30;
  if (tf === "90d") return 90;
  if (tf === "180d") return 180;
  return null;
}

export function resolveDays(
  tf: Timeframe,
  oldestTimestampMs: number | null,
  maxDays = 365,
  fallback = 30,
): number {
  const fixed = timeframeFixedDays(tf);
  if (fixed !== null) return fixed;
  if (!oldestTimestampMs) return fallback;
  const span = Math.ceil((Date.now() - oldestTimestampMs) / 86_400_000);
  return Math.min(Math.max(7, span), maxDays);
}

/**
 * Milliseconds for a `created_at` coming back from PostgREST.
 *
 * A `timestamptz` column serialises with an offset and `new Date` reads it
 * correctly. A plain `timestamp` column does not, and `new Date` then reads
 * the string as LOCAL time, so a row written at 12:00 UTC is understood as
 * 12:00 in the viewer's zone. West of UTC that lands in the future, which is
 * how a chart can quietly disagree with the stat tiles above it: a tile
 * counting "the last 30 days" has no upper bound and keeps the row, while a
 * chart bucketing by days-ago computes a negative bucket and drops it. Seen on
 * the calculator page as 484 events in the tiles and a peak of 4 a day in the
 * chart beside them.
 *
 * Appending Z when no zone is present makes both readings agree and is correct
 * either way, because every writer here stamps UTC.
 */
export function eventTimeMs(value: string | null | undefined): number {
  if (!value) return NaN;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value.trim());
  return new Date(hasZone ? value : `${value.trim()}Z`).getTime();
}

export function TimeframeSelector({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
}) {
  return (
    <div className="aq-timeframe" role="tablist" aria-label="Chart timeframe">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          className={`aq-timeframe-tab${value === opt.value ? " active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
