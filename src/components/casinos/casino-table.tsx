"use client";

// The ranking on /crypto-casinos.
//
// Filters and expandable rows rather than a static list: both keep the reader
// on the page, and the filters are the query modifiers people actually search
// (no KYC, instant withdrawal, a given chain).

import { useMemo, useState } from "react";
import { OutboundLink } from "@/components/report/outbound-link";
import {
  casinoScore,
  KYC_LABEL,
  type Casino,
} from "@/lib/crypto-casinos";

type SortKey = "score" | "wagering" | "withdrawal";

const SPEED_ORDER = ["instant", "under 1 hour", "1-24 hours", "over 24 hours"];

export function CasinoTable({ casinos }: { casinos: Casino[] }) {
  const [chain, setChain] = useState<string>("");
  const [noKyc, setNoKyc] = useState(false);
  const [fast, setFast] = useState(false);
  const [fair, setFair] = useState(false);
  const [sort, setSort] = useState<SortKey>("score");
  const [open, setOpen] = useState<string | null>(null);

  const chains = useMemo(() => {
    const s = new Set<string>();
    for (const c of casinos) for (const x of c.chains) s.add(x);
    return [...s].sort();
  }, [casinos]);

  const rows = useMemo(() => {
    let out = casinos.filter(
      (c) =>
        (!chain || c.chains.includes(chain)) &&
        (!noKyc || c.kyc === "none") &&
        (!fast ||
          c.withdrawal.median === "instant" ||
          c.withdrawal.median === "under 1 hour") &&
        (!fair || c.provablyFair),
    );
    if (sort === "wagering") {
      out = [...out].sort(
        (a, b) => (a.bonus?.wagering ?? 999) - (b.bonus?.wagering ?? 999),
      );
    } else if (sort === "withdrawal") {
      out = [...out].sort(
        (a, b) =>
          SPEED_ORDER.indexOf(a.withdrawal.median) -
          SPEED_ORDER.indexOf(b.withdrawal.median),
      );
    }
    return out;
  }, [casinos, chain, noKyc, fast, fair, sort]);

  if (!casinos.length) {
    return (
      <p className="cc-empty">
        No venues are listed yet. Entries are added to
        {" "}<code>data/crypto-casinos.json</code>{" "}
        once their licence, withdrawal policy and bonus terms have been read
        off the venue itself.
      </p>
    );
  }

  return (
    <div className="cc-rank">
      <div className="cc-filters" role="group" aria-label="Filter venues">
        <select
          className="cc-select"
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          aria-label="Filter by coin or chain"
        >
          <option value="">All coins</option>
          {chains.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <Toggle on={noKyc} set={setNoKyc} label="No KYC" />
        <Toggle on={fast} set={setFast} label="Fast withdrawal" />
        <Toggle on={fair} set={setFair} label="Provably fair" />
        <select
          className="cc-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort"
        >
          <option value="score">Sort: score</option>
          <option value="withdrawal">Sort: withdrawal speed</option>
          <option value="wagering">Sort: lowest wagering</option>
        </select>
        <span className="cc-count">
          {rows.length} of {casinos.length}
        </span>
      </div>

      <div className="hub-table-wrap">
        <div className="hub-table cc-table">
          <div className="hub-thead">
            <span className="hub-th">#</span>
            <span className="hub-th">Venue</span>
            <span className="hub-th cc-col-licence">Licence</span>
            <span className="hub-th cc-col-wd">Withdrawal</span>
            <span className="hub-th cc-col-kyc">KYC</span>
            <span className="hub-th hub-th-right">Score</span>
            <span className="hub-th" />
          </div>
          {rows.map((c, i) => (
            <div key={c.slug} className="cc-rowgroup">
              <div className="hub-row">
                <span className="hub-cell hub-rank">{i + 1}</span>
                <span className="hub-cell">
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
                  <span className="cc-sub">
                    {c.chains.slice(0, 4).join(" · ")}
                    {c.chains.length > 4 ? ` +${c.chains.length - 4}` : ""}
                  </span>
                  {/* Licence, withdrawal and KYC get their own columns on a
                      wide screen and this line on a phone. */}
                  <span className="cc-submob">
                    {c.withdrawal.median} · {KYC_LABEL[c.kyc]} ·{" "}
                    {c.licence ? c.licence.authority.split(" ")[0] : "Unlicensed"}
                  </span>
                </span>
                <span className="hub-cell cc-dim cc-col-licence" title={c.licence ? c.licence.authority : "Unlicensed"}>
                  {c.licence ? c.licence.authority : "Unlicensed"}
                </span>
                <span className="hub-cell cc-col-wd">{c.withdrawal.median}</span>
                <span className="hub-cell cc-dim cc-col-kyc">{KYC_LABEL[c.kyc]}</span>
                <span className="hub-cell hub-num">{casinoScore(c)}</span>
                <span className="hub-cell cc-action">
                  <OutboundLink
                    className="cc-open"
                    href={c.url}
                    platform={c.name}
                    source="crypto-casinos"
                    rank={i + 1}
                    ariaLabel={`Open ${c.name}`}
                  >
                    Open
                  </OutboundLink>
                </span>
              </div>

              {open === c.slug && (
                <div className="cc-detail">
                  <dl className="cc-facts">
                    <Fact k="Licence">
                      {c.licence
                        ? `${c.licence.authority}${c.licence.number ? ` · ${c.licence.number}` : ""}`
                        : "None published"}
                    </Fact>
                    <Fact k="Bonus">
                      {c.bonus
                        ? `${c.bonus.headline}${c.bonus.wagering ? ` · ${c.bonus.wagering}x wagering` : ""}`
                        : "None"}
                    </Fact>
                    <Fact k="Rakeback">{c.rakeback ?? "None published"}</Fact>
                    <Fact k="Provably fair">{c.provablyFair ? "Yes" : "Not published"}</Fact>
                    <Fact k="Games">{c.games ? c.games.toLocaleString("en-US") : "Not published"}</Fact>
                    <Fact k="Live dealer">{c.liveDealer ? "Yes" : "No"}</Fact>
                    <Fact k="Sportsbook">{c.sportsbook ? "Yes" : "No"}</Fact>
                    <Fact k="Established">{c.established ?? "Not published"}</Fact>
                    <Fact k="Restricted">
                      {c.restricted.length ? c.restricted.join(", ") : "Not published"}
                    </Fact>
                    <Fact k="Coins">{c.chains.join(", ")}</Fact>
                  </dl>
                  {c.withdrawal.note ? <p className="cc-note">{c.withdrawal.note}</p> : null}
                  {c.kycNote ? <p className="cc-note">{c.kycNote}</p> : null}
                  {c.notes ? <p className="cc-note">{c.notes}</p> : null}
                  <p className="cc-checked">Terms last read {c.lastChecked}.</p>
                </div>
              )}
            </div>
          ))}
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

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="cc-fact">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}
