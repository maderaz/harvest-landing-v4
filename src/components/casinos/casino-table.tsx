"use client";

// The listing on /crypto-casinos.
//
// Four columns, in the order a reader asks the questions: which casino, what
// is the offer, what does it cost to take, and where does the button go. The
// research-completion fraction that used to sit in the fifth column is gone:
// how much of a venue we have read is a fact about our work, not a difference
// between two offers. What survives is the provenance itself, next to the
// value it belongs to, inside the expansion.
//
// Claim chips are the venue's own wording and are labelled as advertised; the
// verified block inside a row is ours.

import { useMemo, useState } from "react";
import { OutboundLink } from "@/components/report/outbound-link";
import {
  LEAVE_SITE_BODY,
  OFFERS,
  OFFER_FILTERS,
  rowNote,
  keyDetails,
  offerKinds,
  type OfferKind,
} from "@/lib/crypto-casinos-copy";
import { CASINO_LOGOS } from "@/lib/casino-logos";
import {
  COMPLAINT_LABEL,
  UNCONFIRMED,
  KYC_LABEL,
  parseBonus,
  type Casino,
  type CasinoClaims,
  type FieldSource,
} from "@/lib/crypto-casinos";

const UNIT_PREFIX: Record<string, string> = { USD: "$", EUR: "€" };

/**
 * The badges a row may carry, most differentiating first, and worded as the
 * claims they are.
 *
 * Two per row. Seven chips on one line stopped being a difference between
 * venues and became a texture every row shared, and the numbers that actually
 * separate two offers are in the key-details column as ordinary text.
 */
const BADGES: { key: keyof CasinoClaims; label: string }[] = [
  { key: "noWagering", label: "Advertised no wagering" },
  { key: "noKyc", label: "Advertised no KYC" },
  { key: "rakeback", label: "Rakeback" },
  { key: "cashback", label: "Cashback" },
  { key: "instantWithdrawal", label: "Advertised instant withdrawal" },
  { key: "provablyFair", label: "Provably fair games" },
  { key: "vpnFriendly", label: "VPN friendly" },
];

const BADGE_LIMIT = 2;

/** The headline figure, for venues with no written offer copy. */
function fallbackHeadline(c: Casino): string | null {
  const terms = c.verified.capUsd;
  if (terms != null) return `Up to $${terms.toLocaleString("en-US")}`;
  const p = parseBonus(c.bonusClaim);
  if (p.cap != null && p.unit) {
    const n = p.cap.toLocaleString("en-US");
    return UNIT_PREFIX[p.unit]
      ? `Up to ${UNIT_PREFIX[p.unit]}${n}`
      : `Up to ${n} ${p.unit}`;
  }
  return p.pct != null ? `${p.pct}%` : null;
}

export function CasinoTable({ casinos }: { casinos: Casino[] }) {
  const [kind, setKind] = useState<OfferKind | "all">("all");
  const [noKyc, setNoKyc] = useState(false);
  const [fast, setFast] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      casinos.filter(
        (c) =>
          (kind === "all" || offerKinds(c).includes(kind)) &&
          (!noKyc || c.claimed.noKyc) &&
          (!fast || c.claimed.instantWithdrawal),
      ),
    [casinos, kind, noKyc, fast],
  );

  if (!casinos.length) {
    return <p className="cc-empty">No venues are listed yet.</p>;
  }

  return (
    <div className="cc-rank">
      <div className="cc-types" role="group" aria-label="Filter by offer type">
        {OFFER_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`cc-type${kind === f.key ? " is-on" : ""}`}
            aria-pressed={kind === f.key}
            onClick={() => setKind(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="cc-filters" role="group" aria-label="Filter by advertised feature">
        <Toggle on={noKyc} set={setNoKyc} label="Advertised no KYC" />
        <Toggle on={fast} set={setFast} label="Advertised instant withdrawal" />
        <span className="cc-count">
          Showing {rows.length} of {casinos.length}
        </span>
      </div>

      <div className="hub-table-wrap" data-voice-skip="">
        <div className="hub-table cc-table">
          <div className="hub-thead">
            <span className="hub-th">#</span>
            <span className="hub-th">Casino</span>
            <span className="hub-th cc-col-offer">Offer</span>
            <span className="hub-th cc-col-keys">Key details</span>
            <span className="hub-th cc-col-act">Action</span>
          </div>
          {rows.map((c, i) => {
            const offer = OFFERS[c.slug];
            const headline = offer?.headline ?? fallbackHeadline(c);
            const support = offer?.support ?? c.bonusClaim;
            const details = keyDetails(c);
            const note = rowNote(c);
            const badges = BADGES.filter((b) => c.claimed[b.key]).slice(0, BADGE_LIMIT);
            const logo = CASINO_LOGOS[c.slug];
            const isOpen = open === c.slug;
            return (
              <div key={c.slug} className="cc-rowgroup" id={c.slug}>
                <div className="hub-row">
                  <span className="hub-cell hub-rank">{i + 1}</span>

                  <span className="hub-cell cc-venue">
                    {logo ? (
                      <span className="cc-logo-box">
                        <img
                          className="cc-logo"
                          src={logo.src}
                          alt=""
                          width={84}
                          height={36}
                          loading="lazy"
                          decoding="async"
                        />
                      </span>
                    ) : null}
                    <span className="cc-venue-txt">
                      <span className="cc-name">{c.name}</span>
                      {offer ? (
                        <span className="cc-summary">{offer.summary}</span>
                      ) : null}
                    </span>
                  </span>

                  <span className="hub-cell cc-col-offer cc-offer">
                    {headline ? (
                      <span className="cc-offer-lead">{headline}</span>
                    ) : null}
                    {support ? (
                      <span className="cc-offer-sub">{support}</span>
                    ) : null}
                  </span>

                  <span className="hub-cell cc-col-keys cc-keys">
                    {details.length > 0 && (
                      <span className="cc-keys-list">{details.join(" · ")}</span>
                    )}
                    {note ? <span className="cc-keys-note">{note}</span> : null}
                  </span>

                  <span className="hub-cell cc-col-act cc-action">
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
                        source="crypto-casinos-row"
                        rank={i + 1}
                        ariaLabel={`Play Now at ${c.name}`}
                        body={LEAVE_SITE_BODY(c.name)}
                      >
                        Play Now
                      </OutboundLink>
                    ) : null}
                    <button
                      type="button"
                      className="cc-details-btn"
                      aria-expanded={isOpen}
                      aria-controls={`cc-d-${c.slug}`}
                      onClick={() => setOpen(isOpen ? null : c.slug)}
                    >
                      {isOpen ? "Hide details" : "Offer details"}
                    </button>
                  </span>

                  {/* One line at the foot of the row rather than two chips
                      stacked under the venue name, which broke the row into
                      an uneven block wherever a label was long. */}
                  {badges.length > 0 && (
                    <span className="hub-cell cc-chips">
                      {badges.map((b) => (
                        <span key={b.key} className="cc-chip">
                          {b.label}
                        </span>
                      ))}
                    </span>
                  )}
                </div>

                {isOpen && <OfferDetails c={c} id={`cc-d-${c.slug}`} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The expansion.
 *
 * Structured by what a reader is deciding, and every block that has nothing
 * behind it is left out. The previous version printed seven rows of "Not
 * checked" and a paragraph explaining why, which spent a screen telling
 * somebody about our reading instead of about the offer.
 */
function OfferDetails({ c, id }: { c: Casino; id: string }) {
  const v = c.verified;
  const offer = OFFERS[c.slug];

  const wagering =
    v.wagering === 0
      ? "No playthrough on this offer."
      : v.wagering != null
        ? `${v.wagering}× the bonus before it can be withdrawn.`
        : null;

  return (
    <div className="cc-detail" id={id}>
      {(offer || c.claims.length > 0) && (
        <Block title="How the offer works">
          {offer ? <p>{offer.summary}. {offer.support}.</p> : null}
          {c.claims.length > 0 && (
            <ul className="cc-claimlist">
              {c.claims.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <p className="cc-detail-src">
            The wording above is {c.name}&rsquo;s own.
          </p>
        </Block>
      )}

      {c.minDeposit && (
        <Block title="Qualifying deposit">
          <p>{c.minDeposit} to trigger the offer, as published.</p>
        </Block>
      )}

      {(wagering || c.termsNote) && (
        <Block title="Wagering basis and eligible games">
          {wagering ? <p>{wagering}</p> : null}
          {c.termsNote ? <p>{c.termsNote}</p> : null}
          <Src src={c.sources?.wagering} />
        </Block>
      )}

      {v.withdrawal && (
        <Block title="Withdrawal">
          <p>Published payout window: {v.withdrawal}.</p>
          {v.kyc ? <p>Identity checks: {KYC_LABEL[v.kyc]}.</p> : null}
          <Src src={c.sources?.withdrawal} />
        </Block>
      )}

      <Block title="Operator and sources">
        {c.operator ? <p>Operating company: {c.operator}.</p> : null}
        <p>
          {v.licence
            ? `Licence: ${v.licence.authority}${v.licence.number ? ` · ${v.licence.number}` : ""}.`
            : c.operator
              ? "No gambling licence number has been confirmed for this venue yet."
              : "No operating company or licence number has been confirmed for this venue yet."}
        </p>
        <Src src={c.sources?.licence} />
        {v.chains?.length ? <p>Coins accepted: {v.chains.join(", ")}.</p> : null}
        {v.complaints ? <p>Complaints: {COMPLAINT_LABEL[v.complaints]}.</p> : null}
        {c.lastChecked ? (
          <p className="cc-detail-src">Terms last read {c.lastChecked}.</p>
        ) : null}
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cc-block">
      <p className="cc-detail-h">{title}</p>
      {children}
    </div>
  );
}

/** Where a value was read, and when. */
function Src({ src }: { src?: FieldSource | typeof UNCONFIRMED }) {
  if (!src) return null;
  if (src === UNCONFIRMED) {
    return (
      <p className="cc-detail-src">
        From the supplied list, not confirmed at the venue.
      </p>
    );
  }
  return (
    <p className="cc-detail-src">
      <a href={src.url} rel="nofollow noopener noreferrer" target="_blank">
        {new URL(src.url).hostname.replace(/^www\./, "")}
      </a>
      , read {src.readOn}
    </p>
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
