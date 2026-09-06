"use client";

// The listing on /crypto-casinos.
//
// Filters and in-place row expansion, so a follow-up question never costs a
// navigation. Claim chips are the venue's own wording; the verified block
// inside a row is ours, and reads "not checked" until it is.

import { useMemo, useState } from "react";
import { OutboundLink } from "@/components/report/outbound-link";
import { LEAVE_SITE_BODY, VENUE_REVIEWS } from "@/lib/crypto-casinos-copy";
import { CASINO_LOGOS } from "@/lib/casino-logos";
import {
  CHECK_TOTAL,
  checkedCount,
  CLAIM_LABELS,
  COMPLAINT_LABEL,
  UNCONFIRMED,
  KYC_LABEL,
  capOf,
  parseBonus,
  type Casino,
  type FieldSource,
} from "@/lib/crypto-casinos";

const UNIT_PREFIX: Record<string, string> = { USD: "$", EUR: "\u20ac" };

/**
 * The three facts worth showing before a reader expands a row.
 *
 * Licence, KYC and playthrough, because those are the questions the queries
 * ask. An unread field is left out rather than printed as a dash: a line of
 * dashes tells a reader nothing and takes a row's worth of height to do it.
 */
function glance(c: Casino): string[] {
  const out: string[] = [];
  if (c.verified.licence) out.push(c.verified.licence.authority);
  if (c.verified.kyc) out.push(KYC_LABEL[c.verified.kyc]);
  // Skipped when a claim chip already carries it, which is how Hyper Lucky
  // printed "No wagering" twice in one row.
  if (c.verified.wagering != null && !(c.verified.wagering === 0 && c.claimed.noWagering)) {
    out.push(c.verified.wagering === 0 ? "No wagering" : `${c.verified.wagering}x wagering`);
  }
  return out;
}

/** Venues with a review card of their own, so the cell can point at it. */
const REVIEWED = new Set(VENUE_REVIEWS.map((r) => r.slug));

/**
 * The figure pulled to the front of the bonus cell, and the figure the row is
 * ranked on. Same function both places, so the eye and the sort agree.
 *
 * A cap read off the terms wins over the headline. Wild.io advertises "up to
 * 350%" and caps the bonus at $1,000, and leading with the 350 would put this
 * page in the business of repeating a number its own data contradicts.
 */
function bonusLead(c: Casino): { text: string; fromTerms: boolean } | null {
  const terms = c.verified.capUsd;
  if (terms != null) {
    return { text: `$${terms.toLocaleString("en-US")}`, fromTerms: true };
  }
  const p = parseBonus(c.bonusClaim);
  if (p.cap != null && p.unit) {
    const n = p.cap.toLocaleString("en-US");
    return {
      text: UNIT_PREFIX[p.unit] ? `${UNIT_PREFIX[p.unit]}${n}` : `${n} ${p.unit}`,
      fromTerms: false,
    };
  }
  return p.pct != null ? { text: `${p.pct}%`, fromTerms: false } : null;
}

export function CasinoTable({ casinos }: { casinos: Casino[] }) {
  const [noKyc, setNoKyc] = useState(false);
  const [fast, setFast] = useState(false);
  const [noWager, setNoWager] = useState(false);
  const [rake, setRake] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // The column counts documented fields now. A composite number invited the
  // reading that it scored the offer, and it ranked a venue with no named
  // operator above the only two whose licences carry a source.
  const anyScored = useMemo(
    () => casinos.some((c) => checkedCount(c) > 0),
    [casinos],
  );

  const rows = useMemo(
    () =>
      casinos.filter(
        (c) =>
          (!noKyc || c.claimed.noKyc) &&
          (!fast || c.claimed.instantWithdrawal) &&
          (!noWager || c.claimed.noWagering) &&
          (!rake || c.claimed.rakeback),
      ),
    [casinos, noKyc, fast, noWager, rake],
  );

  if (!casinos.length) {
    return (
      <p className="cc-empty">
        No venues are listed yet.
      </p>
    );
  }

  return (
    <div className={`cc-rank${anyScored ? " has-score" : ""}`}>
      <div className="cc-filters" role="group" aria-label="Filter venues">
        <Toggle on={noKyc} set={setNoKyc} label="No KYC" />
        <Toggle on={fast} set={setFast} label="Instant withdrawal" />
        <Toggle on={noWager} set={setNoWager} label="No wagering" />
        <Toggle on={rake} set={setRake} label="Rakeback" />
        <span className="cc-count">
          {rows.length} of {casinos.length}
        </span>
      </div>

      <div className="hub-table-wrap" data-voice-skip="">
        <div className="hub-table cc-table">
          <div className="hub-thead">
            <span className="hub-th">#</span>
            <span className="hub-th">Venue</span>
            <span className="hub-th cc-col-bonus">Welcome bonus, as advertised</span>
            {anyScored ? (
              <span className="hub-th hub-th-right cc-col-score">Documented</span>
            ) : null}
            <span className="hub-th" />
          </div>
          {rows.map((c, i) => {
            const documented = checkedCount(c);
            const chips = CLAIM_LABELS.filter((l) => c.claimed[l.key]);
            const lead = bonusLead(c);
            const logo = CASINO_LOGOS[c.slug];
            return (
              <div key={c.slug} className="cc-rowgroup">
                <div className="hub-row">
                  <span className="hub-cell hub-rank">{i + 1}</span>
                  <span className="hub-cell cc-venue">
                    {logo ? (
                      <img
                        className="cc-logo"
                        src={logo.src}
                        alt=""
                        width={84}
                        height={36}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                    <span className="cc-venue-txt">
                    <button
                      type="button"
                      className="cc-name"
                      aria-expanded={open === c.slug}
                      onClick={() => setOpen(open === c.slug ? null : c.slug)}
                    >
                      {c.name}
                      <span className="cc-chev" aria-hidden="true">
                        {open === c.slug ? "−" : "+"}
                      </span>
                    </button>
                    {!c.verified.licence && (
                      <span className="cc-flag" title="No operator or licence found in the documents we could read">
                        Operator not identified
                      </span>
                    )}
                    {glance(c).length > 0 && (
                      <span className="cc-glance">{glance(c).join(" · ")}</span>
                    )}
                    {chips.length > 0 && (
                      <span className="cc-chips">
                        {chips.map((l) => (
                          <span key={l.key} className="cc-chip">{l.label}</span>
                        ))}
                      </span>
                    )}
                    <span className="cc-submob">
                      {lead ? <strong>{lead.text}</strong> : null} {c.bonusClaim}
                    </span>
                    </span>
                  </span>
                  {/* The figure first, then the offer in the venue's own
                      words underneath. The column the page is ranked on
                      should be the one the eye lands on. */}
                  <span className="hub-cell cc-col-bonus cc-bonus">
                    {lead ? (
                      <span className="cc-bonus-lead">
                        {lead.text}
                        {lead.fromTerms ? (
                          <span className="cc-bonus-src">from the terms</span>
                        ) : null}
                      </span>
                    ) : null}
                    <span className="cc-bonus-full">{c.bonusClaim ?? "—"}</span>
                  </span>
                  {anyScored ? (
                    <span className="hub-cell hub-num cc-col-score">
                      {documented > 0 ? `${documented}/${CHECK_TOTAL}` : "—"}
                    </span>
                  ) : null}
                  <span className="hub-cell cc-action">
                    {/* An empty action cell on a ranked row reads either as
                        a broken page or as a link somebody is hiding. Until a
                        venue has a link, the cell says what the page can
                        honestly offer instead: where the reading came from. */}
                    {c.url ? (
                      <OutboundLink
                        className="cc-open cc-play"
                        href={c.url}
                        // Sponsored on every venue link, including the ones
                        // whose deal is still pending. They are commercial
                        // destinations on a page that will be paid for them,
                        // and marking them anything else would be wrong the
                        // week a deal closes.
                        rel="sponsored nofollow noopener noreferrer"
                        // Untouched. Four of these carry an affiliate token
                        // and ref=harvest.finance attributes nothing on the
                        // rest. See dealStatus in the data.
                        keepHref
                        platform={c.name}
                        source="crypto-casinos"
                        rank={i + 1}
                        ariaLabel={`Play now at ${c.name}`}
                        body={LEAVE_SITE_BODY(c.name)}
                      >
                        Play now
                      </OutboundLink>
                    ) : (
                      <a
                        className="cc-open cc-open-quiet"
                        href={REVIEWED.has(c.slug) ? `#${c.slug}` : "#disclosure"}
                      >
                        How we checked
                      </a>
                    )}
                  </span>
                </div>

                {open === c.slug && (
                  <div className="cc-detail">
                    {c.claims.length > 0 && (
                      <>
                        <p className="cc-detail-h">{c.name} advertises</p>
                        <ul className="cc-claimlist">
                          {c.claims.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    <p className="cc-detail-h">Checked against the venue</p>
                    {/* Seven repetitions of "Not checked" read as a broken
                        component rather than as an honest gap. One sentence
                        says the same thing. A row with partial coverage keeps
                        the grid, because there the dashes are doing real work:
                        they mark which fields are missing next to the ones
                        that are not. */}
                    {checkedCount(c) === 0 ? (
                      <p className="cc-nothing">
                        Nothing here has been read off this venue yet.
                        Everything above is its own wording.
                      </p>
                    ) : (
                    <dl className="cc-facts">
                      <Fact k="Licence" src={c.sources?.licence}>
                        {c.verified.licence
                          ? `${c.verified.licence.authority}${c.verified.licence.number ? ` · ${c.verified.licence.number}` : ""}`
                          : "Not checked"}
                      </Fact>
                      <Fact k="KYC" src={c.sources?.kyc}>
                        {c.verified.kyc ? KYC_LABEL[c.verified.kyc] : "Not checked"}
                      </Fact>
                      <Fact k="Withdrawal" src={c.sources?.withdrawal}>
                        {c.verified.withdrawal ?? "Not checked"}
                      </Fact>
                      <Fact k="Wagering" src={c.sources?.wagering}>
                        {c.verified.wagering != null
                          ? `${c.verified.wagering}x`
                          : "Not checked"}
                      </Fact>
                      <Fact k="Provably fair" src={c.sources?.provablyFair}>
                        {c.verified.provablyFair == null
                          ? "Not checked"
                          : c.verified.provablyFair
                            ? "Yes"
                            : "No"}
                      </Fact>
                      <Fact k="Coins" src={c.sources?.chains}>
                        {c.verified.chains?.length
                          ? c.verified.chains.join(", ")
                          : "Not checked"}
                      </Fact>
                      {/* "Not searched" and "searched, nothing there" are
                          different claims, and only the second one is worth
                          anything to a reader. */}
                      <Fact k="Complaints" src={c.sources?.complaints}>
                        {c.verified.complaints
                          ? COMPLAINT_LABEL[c.verified.complaints]
                          : "Not searched"}
                      </Fact>
                    </dl>
                    )}
                    <p className="cc-checked">
                      {c.lastChecked
                        ? `Terms last read ${c.lastChecked}.`
                        : "Nothing above the line has been independently checked. The bullets are the venue's own wording."}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  on,
  set,
  label,
}: {
  on: boolean;
  set: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`cc-toggle${on ? " is-on" : ""}`}
      aria-pressed={on}
      onClick={() => set(!on)}
    >
      {label}
    </button>
  );
}

/**
 * One checked fact, and where it came from.
 *
 * A value with no source is not presented as read: it says so, because the
 * difference between a figure off a venue's terms and a figure off a supplied
 * list is the difference this column exists to make.
 */
function Fact({
  k,
  src,
  children,
}: {
  k: string;
  src?: FieldSource | typeof UNCONFIRMED;
  children: React.ReactNode;
}) {
  return (
    <div className="cc-fact">
      <dt>{k}</dt>
      <dd>
        {children}
        {src === UNCONFIRMED ? (
          <span className="cc-fact-src cc-fact-unconf">
            From the supplied list, not confirmed at the venue
          </span>
        ) : src ? (
          <span className="cc-fact-src">
            <a href={src.url} rel="nofollow noopener noreferrer" target="_blank">
              {new URL(src.url).hostname.replace(/^www\./, "")}
            </a>
            , read {src.readOn}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
