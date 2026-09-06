// Everything visible on /crypto-casinos.
//
// Split out of page.tsx the way usdc-hub-body.tsx is split out of
// src/app/usdc/page.tsx: the route file keeps metadata and schemas, the body
// keeps JSX, and lib/crypto-casinos-copy.ts keeps every figure so the same
// number cannot differ between a table, a bullet and an FAQ answer.

import Link from "next/link";
import { ReportToc, type TocItem } from "@/components/report/report-toc";
import type { HarvestRow } from "@/app/crypto-casinos/page";
import { LOW_LIQUIDITY_TVL_THRESHOLD } from "@/lib/admin-rules";
import { CasinoTable } from "@/components/casinos/casino-table";
import { OutboundLink } from "@/components/report/outbound-link";
import { WageringCalculator } from "@/components/casinos/wagering-calculator";
import { isRanked, loadCasinos } from "@/lib/crypto-casinos-data";
import { CASINO_LOGOS, LOGO_RATIO } from "@/lib/casino-logos";
import {
  CHECK_TOTAL,
  casinoScore,
  checkedCount,
  isVerified,
  type Casino,
} from "@/lib/crypto-casinos";
import {
  BONUS_TERMS,
  DISCLOSURE_SHORT,
  HARVEST_STEPS,
  EVIDENCE_NOTE,
  BONUS_TYPES,
  COINS,
  CRYPTO_VS_FIAT,
  DEPOSIT_STEPS,
  FAQS,
  LEAVE_SITE_BODY,
  LEGAL_SHORT,
  NETWORKS,
  rankLabel,
  VENUE_REVIEWS,
  type VenueReview,
  RG_TOOLS,
  SCAM_SIGNALS,
  SORT_RULE,
  WALLET_STEPS,
  compareRows,
  leadSentences,
  money,
  spellOut,
  reviewFacts,
  turnoverRows,
} from "@/lib/crypto-casinos-copy";

/**
 * The rail and the jump nav. A function because the ranking's label carries
 * its length, and that length is a property of the data rather than of a
 * constant somebody has to remember to update.
 */
export const tocItems = (ranked: number): TocItem[] => [
  { id: "ranking", label: `The ${rankLabel(ranked)}` },
  { id: "turnover", label: "What a bonus is worth" },
  { id: "bonus-calculator", label: "Bonus calculator" },
  { id: "bankroll", label: "Bonus to work on Harvest" },
  { id: "reviews", label: "Number one, reviewed" },
  { id: "compare", label: "Side by side" },
  { id: "how-they-work", label: "How they work" },
  { id: "provably-fair", label: "Provably fair" },
  { id: "coins", label: "Coins and fees" },
  { id: "networks", label: "Picking the network" },
  { id: "bonuses", label: "Bonus terms" },
  { id: "legality", label: "Where this is legal" },
  { id: "scams", label: "Spotting a scam" },
  { id: "responsible", label: "Staying in control" },
  { id: "faq", label: "FAQ" },
  { id: "disclosure", label: "Disclosure" },
];

const UPDATED = new Date().toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** The same date, short enough to sit inside a stat tile on one line. */
const UPDATED_SHORT = new Date().toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Section shell. The dateline on the eyebrow is what satisfies rule 1 of
 * check-atomicity per section instead of per sentence; the helper it copies
 * lives in usdc-hub-body.tsx.
 */
function Section({
  id,
  eyebrow,
  title,
  dated,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  dated?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="uni-home-content" aria-labelledby={id}>
      <p className="rp-eyebrow" {...(dated ? { "data-dateline": "" } : {})}>
        {eyebrow}
        {dated ? (
          <>
            <span className="cc-eyebrow-sep"> · </span>
            <span className="cc-eyebrow-date">{UPDATED}</span>
          </>
        ) : null}
      </p>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

function Steps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ul className="meth-limit-list">
      {items.map((s, i) => (
        <li className="meth-limit-item" key={s.title}>
          <span className="meth-limit-num">{i + 1}</span>
          <div className="meth-limit-body">
            <p className="meth-limit-title">{s.title}</p>
            <p className="meth-limit-desc">{s.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function NamedList({ items }: { items: { name: string; body: string }[] }) {
  return (
    <ul className="cc-risks">
      {items.map((r) => (
        <li key={r.name}>
          <strong>{r.name}.</strong> {r.body}
        </li>
      ))}
    </ul>
  );
}

/**
 * One review card.
 *
 * The .rp-venue family comes from the report page, unchanged. What is local
 * is the shape inside it: a subhead per question, then the caveats as
 * labelled bullets, then the facts grid. A reader after one answer should be
 * able to find it without reading the other three.
 */
function VenueReviewCard({
  review,
  rank,
  casino,
}: {
  review: VenueReview;
  rank: number;
  casino: Casino | undefined;
}) {
  const logo = CASINO_LOGOS[review.slug];
  return (
    <article className="rp-venue cc-review" id={review.slug}>
      <div className="rp-venue-head">
        {logo ? (
          <span className="cc-review-logo">
            <img
              src={logo.src}
              alt=""
              width={112}
              height={Math.round(112 / LOGO_RATIO)}
              loading="lazy"
              decoding="async"
            />
          </span>
        ) : null}
        <span className="rp-venue-title">
          <span className="rp-venue-name">{casino?.name}</span>
          <span className="rp-venue-plat">{review.operator}</span>
        </span>
        <span className="rp-badges">
          <span className="rp-badge">Rank {rank} by bonus size</span>
          <span className="rp-badge rp-badge-chain">
            {casino ? checkedCount(casino) : 0} of {CHECK_TOTAL} checked
          </span>
        </span>
        {/* The same control as the table row, so a reader convinced by the
            card does not have to scroll back up to act on it. */}
        {casino?.url ? (
          <span className="rp-visit-wrap">
            <OutboundLink
              className="cc-open cc-play"
              href={casino.url}
              rel="sponsored nofollow noopener noreferrer"
              keepHref
              platform={casino.name}
              source="crypto-casinos-review"
              rank={rank}
              ariaLabel={`Play now at ${casino.name}`}
              body={LEAVE_SITE_BODY(casino.name)}
            >
              Play now
            </OutboundLink>
          </span>
        ) : null}
      </div>
      <div className="rp-venue-body">
        <div className="rp-venue-prose">
          <p className="cc-review-caveat">
            {review.caveat.replace(
              "{CHECKED}",
              `${casino ? checkedCount(casino) : 0} of ${CHECK_TOTAL}`,
            )}
          </p>
          <p className="cc-review-lead">{review.standfirst}</p>
          {review.sections.map((sec) => (
            <div key={sec.h}>
              <h3>{sec.h}</h3>
              <p>{sec.body}</p>
            </div>
          ))}
          <h3>Keep in mind</h3>
          <NamedList items={review.keepInMind} />
        </div>
        <div className="rp-facts">
          {reviewFacts(review, casino).map((f) => (
            <div className="rp-fact" key={f.label}>
              <span className="rp-fact-k">{f.label}</span>
              <span className="rp-fact-v">{f.value}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="cc-sources">
        Read on {UPDATED} from{" "}
        {review.sources.map((src, i) => (
          <span key={src.url}>
            {i > 0 ? ", " : ""}
            <a href={src.url} rel="nofollow noopener noreferrer" target="_blank">
              {src.label}
            </a>
          </span>
        ))}
        .
      </p>
    </article>
  );
}

export function CasinosBody({ harvest = [] }: { harvest?: HarvestRow[] }) {
  const { casinos } = loadCasinos();
  const listed = casinos.length;
  const checked = casinos.filter((c) => casinoScore(c) != null).length;
  const linked = casinos.filter((c) => c.url).length;
  // The wordmark set is the membership list. See lib/casino-logos.
  const ranked = casinos.filter(isRanked);
  // Every derived table is scoped to the ranking, not to the 38 venues in the
  // file. A venue that is not listed has no row, no wordmark and no button, so
  // a reader meeting its name in the turnover table or the calculator has
  // nowhere to go with it.
  const turnover = turnoverRows(ranked);
  const compare = compareRows(ranked);
  const readTerms = ranked.filter(isVerified).length;

  return (
    <div className="uni-home-test rp-page cc-page">
      {/* A plain page head, not the site's gold hero.
          The first ranking row used to sit 1681px down on a desktop and
          2550px down on a phone, behind a 595px hero, three stat tiles and
          three notice boxes. Nobody arrives at a ranking page to read 422
          words first. The counts survive as one line, the warnings as one
          line, and everything they used to say in full now sits under the
          table where it can be as long as it needs to be. */}
      <section className="cc-head">
        <div className="cc-head-inner">
          <h1 className="cc-h1">
            Crypto Casinos: {rankLabel(ranked.length)} Ranked by Welcome Bonus
          </h1>
          <p className="cc-intro">{leadSentences(ranked.length, turnover.length)}</p>
          <p className="cc-meta">
            <span>
              <strong>{ranked.length}</strong> ranked
            </span>
            <span>
              <strong>{readTerms}</strong> read in depth
            </span>
            <span>Updated {UPDATED_SHORT}</span>
          </p>
        </div>
      </section>

      <main className="uni-home-shell">
        <div className="rp-doc">
          <div className="rp-doc-main">
            <Section
              id="ranking"
              eyebrow="Ranking"
              title={`The ${ranked.length} biggest crypto casino welcome bonuses`}
            >
              {/* One line, because the reader came for the table. The 18+
                  block, the commercial disclosure and the US position each
                  keep a full block under the ranking; what has to precede a
                  sponsored click is here. */}
              <p className="cc-brief">
                <strong>18+.</strong> Play now links are commercial and may pay
                us; no venue has paid for a position. Most of these venues do
                not accept players in the United States.{" "}
                <a href="#responsible">Limits and help lines are at the foot of the page</a>.
              </p>
              {/* Said here and nowhere else. The sort rule used to appear
                  four times: the lead, above the table, a Ground rules
                  section and the disclosure. */}
              <p>
                {spellOut(ranked.length, true)} of the {listed} venues
                tracked, the ones we hold a wordmark and a link for. Dollar caps sort
                first, then offers capped in BTC or ETH on their match
                percentage. Position tracks the size of the advertising, not
                the quality of the venue. The chips are the venue&rsquo;s own
                claims. {EVIDENCE_NOTE}
              </p>
              <CasinoTable casinos={ranked} />
            </Section>

            <div className="uni-home-content cc-navwrap">
              <nav className="rp-toc" aria-label="On this page">
                <span className="rp-toc-label">On this page</span>
                {tocItems(ranked.length).map((t) => (
                  <a key={t.id} href={`#${t.id}`}>
                    {t.label}
                  </a>
                ))}
              </nav>
            </div>

            <Section id="turnover" eyebrow="The real number" title="What each bonus asks you to wager">
              <p>
                Cap multiplied by playthrough is what the terms oblige you to
                stake before any of the bonus can leave. The cap is the figure
                every ranking prints; the multiplier is the one that decides
                what it costs.
              </p>
              <p>
                We have both figures for {turnover.length} venues, so the
                sum can be done. Sorted by what they ask, smallest first.
              </p>
              <div className="rp-dtable-wrap">
                <table className="rp-dtable">
                  <thead>
                    <tr>
                      <th>Venue</th>
                      <th className="num">Advertised</th>
                      <th className="num">Playthrough</th>
                      <th className="num">You must wager</th>
                      <th className="num">Min deposit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {turnover.map((r) => (
                      <tr key={r.slug}>
                        <td className="strong">{r.name}</td>
                        <td className="num">{money(r.cap)}</td>
                        {/* The basis is printed whenever it is not the
                            headline cap, otherwise the row's arithmetic does
                            not work in front of the reader: a ladder offer
                            advertises a running total while its playthrough
                            applies to one leg of it. */}
                        <td className="num">
                          {r.wagering === 0
                            ? "None"
                            : r.basis !== r.cap
                              ? `${r.wagering}x on ${money(r.basis)}`
                              : `${r.wagering}x`}
                        </td>
                        <td className="num">{r.turnover === 0 ? "Nothing" : money(r.turnover)}</td>
                        <td className="num">{r.minDeposit ?? "Not stated"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rp-tip">
                <div className="rp-callout-head">
                  <span className="rp-callout-ico" aria-hidden="true">!</span>
                  <span className="rp-callout-title">A cap is per deposit, and a bonus is not clearable on every game</span>
                </div>
                <p className="rp-tip-body">
                  Wild.io advertises up to 350% across a three-deposit package.
                  Each stage carries its own ceiling, and the site shows
                  &ldquo;Receive 120% bonus up to $1,000&rdquo; and
                  &ldquo;Receive 100% bonus up to $1,000&rdquo; on separate
                  stages, so the dollar figure limits one deposit and not
                  the package. The percentage and the cap describe different
                  things and do not contradict each other.
                </p>
                <p className="rp-tip-body">
                  The clause worth reading is 2.4:{" "}
                  <q cite="https://wild.io/bonus-terms">
                    Wagering can only be done in Slots. Jackpot Games,
                    Accumulator/Progressive Games, Table Games, Live Games,
                    Sportsbook, or any other games can not be used to wager the
                    bonus or while the bonus is active
                  </q>
                  . Table games are not discounted to 20% here, they are barred
                  outright, and 2.5 puts their contribution at nothing. A
                  playthrough you cannot legally attempt on the game you wanted
                  is worth more attention than the size of the cap.
                </p>
              </div>
              <p className="rp-fineprint">
                Turnover is what the terms oblige, and not a forecast of what
                anyone loses. What it costs depends on the game and on which
                games the bonus permits, which is the calculator below.
              </p>
            </Section>

            <Section id="bonus-calculator" eyebrow="Calculator" title="What a bonus actually costs">
              <p>
                Every wager you make clearing a playthrough meets the house
                edge. This prices that, for the venues that publish both
                numbers.
              </p>
              {/* Opens on the row the page ranks first, so the intent the
                  headline set is not lost between the table and the tool. The
                  cap loaded is the figure the playthrough multiplies, which
                  for a ladder offer is one leg and not the banner total. */}
              <WageringCalculator
                defaultSlug={ranked[0]?.slug}
                presets={turnover.map((r) => ({
                  slug: r.slug,
                  name: r.name,
                  cap: r.basis,
                  wagering: r.wagering,
                }))}
              />
            </Section>

            <Section
              id="bankroll"
              eyebrow="Harvest"
              title="Put Your Welcome Bonus to Work on Harvest"
            >
              <p>
                Winnings that clear a playthrough and reach your own wallet are
                usually a stablecoin. Sitting in a casino account, that balance
                earns nothing and keeps the operator&rsquo;s risk for as long as
                it stays there: every caveat on this page about licences,
                withdrawal review and no-KYC exceptions applies to an idle
                balance exactly as it applies to one in play.
              </p>
              <p>
                Harvest indexes onchain strategies for the same two tokens.
                What that involves:
              </p>
              <Steps items={HARVEST_STEPS} />
              {harvest.length > 0 && (
                <>
                  <p>
                    The USDC and USDT strategies in the index today, the ones
                    holding at least {money(LOW_LIQUIDITY_TVL_THRESHOLD)} in
                    deposits, ordered by their 24-hour rate.
                  </p>
                  <div className="rp-dtable-wrap">
                    <table className="rp-dtable">
                      <thead>
                        <tr>
                          <th>Strategy</th>
                          <th>Network</th>
                          <th className="num">24h rate</th>
                          <th className="num">Deposits</th>
                        </tr>
                      </thead>
                      <tbody>
                        {harvest.map((r) => (
                          <tr key={`${r.name}-${r.chain}`}>
                            <td className="strong">
                              {r.name} <span className="rp-dtag">{r.asset}</span>
                            </td>
                            <td>{r.chain}</td>
                            <td className="num">{r.apy.toFixed(2)}%</td>
                            <td className="num">{money(r.tvl)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {/* One labelled block rather than a caveat per paragraph. The
                  page was already told that hedging sprinkled through prose
                  reads as its own kind of tell. */}
              <aside className="cc-note" aria-label="What this section is not">
                <p>
                  <strong>What this is not.</strong> It is not advice, not an
                  offer, and not a recommendation to use any strategy listed
                  above. Nothing here is insured and there is no deposit
                  protection. A rate is a 24-hour reading that moves, and past
                  rates do not predict future ones. These strategies carry
                  smart-contract and market risk that a casino balance does
                  not, in exchange for the operator risk it does. What you do
                  with a balance, and any tax on it, is yours to decide.
                </p>
              </aside>
              <p className="rp-fineprint">
                None of this reaches a bonus you have not cleared. Bonus funds
                are locked to the playthrough until it is met, which is what
                the terms on every row above are for. Rates, history and the
                things that can go wrong are on the{" "}
                <Link href="/usdc">USDC hub</Link> and in the{" "}
                <Link href="/risk-framework">risk framework</Link>.
              </p>
            </Section>

            <Section
              id="reviews"
              eyebrow="Reviewed"
              title={
                VENUE_REVIEWS.length > 1
                  ? "The top two, reviewed"
                  : "Number one, reviewed"
              }
            >
              <p>
                We read its own terms and promotion pages. We have not
                deposited, and the public complaint boards were unreachable
                from here, so nothing below rests on them.
              </p>
              <div className="rp-venues">
                {VENUE_REVIEWS.map((r, i) => (
                  <VenueReviewCard
                    key={r.slug}
                    review={r}
                    rank={i + 1}
                    casino={ranked.find((c) => c.slug === r.slug)}
                  />
                ))}
              </div>
            </Section>


            {compare.length > 0 && (
              <Section id="compare" eyebrow="Compare" title="The venues we have read, side by side">
                <p>
                  Only venues whose terms we have read. The ranking table above
                  is larger and includes unread rows.
                </p>
                <p>
                  Coins, minimum deposit, payout window and playthrough for the{" "}
                  {compare.length} of them. Every payout window here is the one
                  written in the terms, not the one on the banner, which is why
                  a venue advertising instant can show a window measured in
                  hours.
                </p>
                <div className="rp-dtable-wrap">
                  <table className="rp-dtable cc-cmp">
                    <thead>
                      <tr>
                        <th>Venue</th>
                        <th>Welcome bonus</th>
                        <th className="num">Playthrough</th>
                        <th className="num">Min deposit</th>
                        <th>Payout</th>
                        <th className="num">Coins</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compare.map((r) => (
                        <tr key={r.slug}>
                          <td className="strong cc-cmp-name">{r.name}</td>
                          <td data-label="Welcome bonus">{r.bonus}</td>
                          <td className="num" data-label="Playthrough">
                            {r.wagering == null ? "Not stated" : r.wagering === 0 ? "None" : `${r.wagering}x`}
                          </td>
                          <td className="num" data-label="Min deposit">{r.minDeposit ?? "Not stated"}</td>
                          <td data-label="Payout">{r.withdrawal}</td>
                          <td className="num" data-label="Coins accepted">{r.coins.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            <Section id="how-they-work" eyebrow="Basics" title="What a crypto casino is, and how it works">
              <div className="rp-article">
                <p>
                  Coins go from your wallet to an address the site generates,
                  and withdrawals come back the same way, costing a few cents on
                  Tron or Solana. Payouts are advertised in minutes. Of the four
                  venues whose terms we have read, three say instant and one
                  says one to twenty-four hours.
                </p>
                <p>
                  The two things that card buys you are the ones you give up
                  here. A card payment can be charged back; an onchain transfer
                  cannot be reversed by anyone, in either direction. And in a
                  dispute with the operator there is no bank in the middle, only
                  whatever the licence in its footer is worth.
                </p>
              </div>
            </Section>

            <Section id="provably-fair" eyebrow="Fairness" title="Provably fair, and what it does not prove">
              <div className="rp-article">
                <p>
                  The casino publishes a hash of its server seed before the
                  round. You add a seed of your own. When the round ends the
                  server seed is revealed, so you can hash it, match it against
                  what was published, and recompute the result.
                </p>
                <p>
                  It proves one narrow thing: the casino fixed its half before
                  your bet and could not change it after. We have not run a seed
                  verification on any venue on this page, so no row claims one.
                </p>
              </div>
              <div className="rp-info">
                <div className="rp-callout-head">
                  <span className="rp-callout-ico" aria-hidden="true">i</span>
                  <span className="rp-callout-title">Three things it does not prove</span>
                </div>
                <p className="rp-info-body">
                  It does not lower the house edge, which is a property of the
                  game and not of the shuffle. It says nothing about whether the
                  operator is solvent or willing to pay a withdrawal. And it
                  covers only the originals, not the thousands of third-party
                  slots sitting beside them.
                </p>
              </div>
            </Section>

            <Section id="coins" eyebrow="Payments" title="Which coin to play with">
              <p>
                Fees and settlement times differ by an order of magnitude across
                the coins these venues accept. If the balance is going to sit
                for a while, a stablecoin holds its value between the deposit
                and the withdrawal. If you move money often, the cheap fast
                chains save more than the bonus does.
              </p>
              <div className="rp-dtable-wrap">
                <table className="rp-dtable">
                  <thead>
                    <tr>
                      <th>Coin</th>
                      <th className="num">Fee</th>
                      <th className="num">To your wallet</th>
                      <th className="num">Price swing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COINS.map((c) => (
                      <tr key={c.sym}>
                        <td className="strong">{c.name} <span className="rp-dtag">{c.sym}</span></td>
                        <td className="num">{c.fee}</td>
                        <td className="num">{c.toWallet}</td>
                        <td className="num">{c.volatility}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section id="networks" eyebrow="Payments" title="Picking the network, and why it matters more than the coin">
              <div className="rp-tip">
                <div className="rp-callout-head">
                  <span className="rp-callout-ico" aria-hidden="true">!</span>
                  <span className="rp-callout-title">Send on the wrong chain and the money is gone</span>
                </div>
                <p className="rp-tip-body">
                  USDT is not one token. It exists separately on Ethereum, Tron,
                  BSC, Solana and Polygon, and the versions cannot see each
                  other. Send the Ethereum version to a Tron address and it
                  lands somewhere neither you nor the casino can reach. There is
                  no support ticket for this. Check the network on both sides,
                  every single time.
                </p>
              </div>
              <div className="rp-dtable-wrap">
                <table className="rp-dtable">
                  <thead>
                    <tr>
                      <th>Coin</th>
                      <th>Networks you will be offered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {NETWORKS.map((n) => (
                      <tr key={n.coin}>
                        <td className="strong">{n.coin}</td>
                        <td>{n.chains}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                The risk sits in the two stablecoins, and it is the same
                mistake that loses money depositing into a vault: the token
                exists on several chains, and the address you were given lives
                on one of them. Single-chain coins remove that particular
                choice without removing every one. XRP deposits at a shared
                address usually need a destination tag, and a transfer that
                arrives without it is not credited automatically.
              </p>
            </Section>


            <Section id="bonuses" eyebrow="Bonuses" title="The offers, and the terms underneath them">
              <h3>The terms that decide what an offer is worth</h3>
              <NamedList items={BONUS_TERMS} />
            </Section>



            <Section id="legality" eyebrow="Legal" title="Where this is legal">
              <div className="rp-article">
                <p>
                  The question is whether online casino gambling is legal where
                  you live. The coin does not change the answer, and neither
                  does the licence in the footer: Anjouan and Curaçao are not
                  the UK Gambling Commission and not a US state regulator.
                  Almost none of the venues on this page accept US players in
                  the first place.
                </p>
              </div>
              <div className="rp-info">
                <div className="rp-callout-head">
                  <span className="rp-callout-ico" aria-hidden="true">i</span>
                  <span className="rp-callout-title">What an offshore site does not give you</span>
                </div>
                <p className="rp-info-body">
                  No complaints channel with any force behind it when a
                  withdrawal is refused, and no link to a national
                  self-exclusion register, so a block you set with one operator
                  does not follow you anywhere else. Whether player funds are
                  held separately is a per-operator question, and not one any
                  venue on this page answers.
                </p>
              </div>
            </Section>

            <Section
              id="scams"
              eyebrow="Risk"
              title={`${spellOut(SCAM_SIGNALS.length, true)} signals that a venue is not worth the deposit`}
            >
              <p>
                An onchain transfer cannot be clawed back, so the checking has
                to happen before the money moves. These are the signals that
                cost nothing to look for.
              </p>
              <NamedList items={SCAM_SIGNALS} />
              <p>
                Applied honestly, the first of those disqualifies the venue at
                the top of this table. Lucky Rollers names no operator and no
                licence number. It sorts first because its advertised bonus is
                the largest, and that is all a first position on this page has
                ever meant.
              </p>
            </Section>

            <Section id="responsible" eyebrow="Control" title="Staying in control">
              <p>
                Every game on this page carries a house edge, so continued play
                loses money on average. Every venue worth using ships the tools
                below. Set them on the day you register.
              </p>
              <NamedList items={RG_TOOLS} />
              <p>
                Free and confidential help:{" "}
                <a href="https://www.begambleaware.org/" rel="nofollow noopener noreferrer" target="_blank">BeGambleAware</a>,{" "}
                <a href="https://www.ncpgambling.org/help-treatment/about-the-national-problem-gambling-helpline/" rel="nofollow noopener noreferrer" target="_blank">the National Problem Gambling Helpline</a>{" "}
                on 1-800-GAMBLER.
              </p>
            </Section>

            <Section id="faq" eyebrow="FAQ" title="Crypto casino questions">
              <div className="rp-faq">
                {FAQS.map((f, i) => (
                  <details className="rp-faq-item" key={f.q} open={i === 0}>
                    <summary className="rp-faq-q">
                      {f.q}
                      <span className="rp-faq-mark" aria-hidden="true" />
                    </summary>
                    <p className="rp-faq-a">{f.a}</p>
                  </details>
                ))}
              </div>
            </Section>

            <Section id="disclosure" eyebrow="Disclosure" title="How this page is funded and how it is built">
              <p>
                Links to the venues on this page are commercial. What that pays
                for is the link, never a position: see{" "}
                <a href="#faq">Does Harvest get paid?</a> for the long answer.
              </p>
              <p>
                <strong>Where the numbers come from.</strong> Every figure in
                the checked column is read off a venue&rsquo;s own terms page
                or its regulator, and carries the date it was read. Where a
                venue has not been read, the row says so instead of guessing.
                Playthrough, minimum deposit and payout windows are quoted from
                the published terms and not estimated.
              </p>
              <p>
                <strong>Who is responsible for this page.</strong> It is
                researched and edited by the Harvest research team, which also
                writes the yield rankings elsewhere on this site. Every checked
                figure carries the page it was read from and the date, in the
                expanded row. If a figure here is wrong or out of date, tell us
                and we will correct it and re-date the row.
              </p>
              <p>
                Terms change without notice, and a date is the only claim this
                page makes about how current a row is. Nothing here is a
                recommendation to gamble or financial advice. For what Harvest
                otherwise does, see the{" "}
                <Link href="/methodology">methodology</Link> behind the yield
                rankings and the <Link href="/risk-framework">risk framework</Link>.
              </p>
            </Section>
          </div>

          <aside className="rp-doc-aside" aria-label="On this page">
            <ReportToc items={tocItems(ranked.length)} />
          </aside>
        </div>
      </main>
    </div>
  );
}

