// Everything visible on /crypto-casinos.
//
// Split out of page.tsx the way usdc-hub-body.tsx is split out of
// src/app/usdc/page.tsx: the route file keeps metadata and schemas, the body
// keeps JSX, and lib/crypto-casinos-copy.ts keeps every figure so the same
// number cannot differ between a table, a bullet and an FAQ answer.

import Link from "next/link";
import { ReportToc, type TocItem } from "@/components/report/report-toc";
import { CasinoTable } from "@/components/casinos/casino-table";
import { OutboundLink } from "@/components/report/outbound-link";
import { WageringCalculator } from "@/components/casinos/wagering-calculator";
import { isRanked, loadCasinos } from "@/lib/crypto-casinos-data";
import { CASINO_LOGOS, LOGO_RATIO } from "@/lib/casino-logos";
import { CHECK_TOTAL, casinoScore, checkedCount, type Casino } from "@/lib/crypto-casinos";
import {
  BONUS_TERMS,
  DISCLOSURE_SHORT,
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
  { id: "ground-rules", label: "Ground rules" },
  { id: "turnover", label: "What a bonus is worth" },
  { id: "bonus-calculator", label: "Bonus calculator" },
  { id: "bankroll", label: "Between sessions" },
  { id: "reviews", label: "Number one, reviewed" },
  { id: "compare", label: "Side by side" },
  { id: "how-they-work", label: "How they work" },
  { id: "provably-fair", label: "Provably fair" },
  { id: "coins", label: "Coins and fees" },
  { id: "networks", label: "Picking the network" },
  { id: "getting-started", label: "Wallet and first deposit" },
  { id: "bonuses", label: "Bonus terms" },
  { id: "games", label: "The games" },
  { id: "crypto-vs-fiat", label: "Against a fiat casino" },
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

export function CasinosBody() {
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
  const readTerms = ranked.filter((c) => checkedCount(c) > 0).length;

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
              <strong>{readTerms}</strong> with terms read
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
              dated
            >
              {/* One line, because the reader came for the table. The 18+
                  block, the commercial disclosure and the US position each
                  keep a full block under the ranking; what has to precede a
                  sponsored click is here. */}
              <p className="cc-brief">
                <strong>18+, and 21+ where the law says so.</strong> Every game
                here has a house edge, so the expected result of continued play
                is a loss. Play now links are commercial and may pay us, which
                does not change the order. Most of these venues do not accept
                players in the United States.{" "}
                <a href="#ground-rules">The full notices are under the table.</a>
              </p>
              {/* The sort is already in the intro. What is not is which of
                  the tracked venues make the list and how ties break. */}
              <p>
                {spellOut(ranked.length, true)} of the {listed} venues tracked,
                the ones whose wordmark we hold and have a link for. Dollar
                caps rank first; offers capped in BTC or ETH rank below them on
                the match percentage. A higher row is a larger headline, not a
                better venue.
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

            <Section
              id="ground-rules"
              eyebrow="Ground rules"
              title="How to read this table, and what to know before you use it"
            >
              <p className="cc-rule">{SORT_RULE}</p>
              <p className="cc-state">
                The chips and the bullets on each row are{" "}
                <strong>venue claims</strong>, reproduced in the venue&rsquo;s
                own wording. The Evidence column is ours: it counts how much of
                a venue we have read off its own terms or its regulator, then
                adjusts on what those readings say. It scores research, not the
                offer, and it never moves a row.
              </p>
              <p>
                The {ranked.length} listed are the venues whose brand we hold a
                wordmark for and have a link to. It is a plain rule and it cuts
                both ways: a venue that belongs here by bonus size stays out
                until its mark arrives, and a name we could not confirm as a
                real brand never gets in. Wolf.io was one of those and is not
                on the page.
              </p>
              <aside className="cc-guard" aria-label="Age and risk notice">
              <p>
                <strong>18+ only, and 21+ where the law says so.</strong>{" "}
                Gambling carries a real risk of losing money and can be
                addictive. Every game listed here has a house edge, which means
                the expected result of continued play is a loss. Play only what
                you can afford to lose, and never with borrowed money.
              </p>
              <p>
                Free, confidential help:{" "}
                <a href="https://www.begambleaware.org/" rel="nofollow noopener noreferrer" target="_blank">BeGambleAware</a>,{" "}
                <a href="https://www.gamblersanonymous.org/" rel="nofollow noopener noreferrer" target="_blank">Gamblers Anonymous</a>.
                In the US, call or text 1-800-GAMBLER.
              </p>
              <p>
                Online gambling is restricted or prohibited in many
                jurisdictions. Checking the law where you live is your
                responsibility, before registering anywhere on this page.
              </p>
              </aside>

            {/* Both of these used to live at the foot of the page. A reader
                deciding whether to trust the sort order has to be told how
                the page is paid before they read it, not after. The
                #disclosure section at the end repeats this rather than
                replacing it. */}
              <aside className="cc-note" aria-label="Commercial disclosure">
              <p>
                <strong>How this page is paid.</strong> {DISCLOSURE_SHORT}
              </p>
              </aside>

              <aside className="cc-note" aria-label="Where this is legal">
              <p>
                <strong>Where this is legal.</strong> {LEGAL_SHORT}
              </p>
              </aside>

            </Section>


            <Section id="turnover" eyebrow="The real number" title="What each bonus asks you to wager" dated>
              <p>
                A welcome bonus is not money. It is an obligation to wager,
                and the size of that obligation is the cap multiplied by the
                playthrough. Every competing list prints the first number and
                leaves out the second.
              </p>
              <p>
                {turnover.length} of the {listed} venues publish both, so the
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
                  <span className="rp-callout-title">Read the cap, not the percentage</span>
                </div>
                <p className="rp-tip-body">
                  Wild.io advertises up to 350%. Its terms cap the bonus at
                  $1,000. The headline and the money are two different numbers
                  at a lot of these venues, and the terms are where the second
                  one lives.
                </p>
              </div>
              <p className="rp-fineprint">
                Turnover is what the terms oblige, and not a forecast of what
                anyone loses. What it costs depends on the game and on which
                games the bonus permits, which is the calculator below.
              </p>
              {turnover.some((r) => r.note) && (
                <>
                  <h3>Terms worth knowing</h3>
                  <NamedList
                    items={turnover
                      .filter((r) => r.note)
                      .map((r) => ({ name: r.name, body: r.note as string }))}
                  />
                </>
              )}
            </Section>

            <Section id="bonus-calculator" eyebrow="Calculator" title="What a bonus actually costs">
              <p>
                A welcome bonus is not money until it has been wagered through
                its playthrough requirement, and every one of those wagers meets
                the house edge. This prices that.
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
              eyebrow="Between sessions"
              title="Between sessions, the balance still sits somewhere"
            >
              <p>
                A bonus and a session are one decision. What happens to the
                balance afterwards is a different one, and it is the part
                nobody writes about.
              </p>
              <p>
                Money left in a casino account earns nothing and carries the
                operator&rsquo;s risk for as long as it sits there. Every
                caveat on this page about licences, withdrawal review and
                no-KYC exceptions applies to an idle balance exactly as it
                applies to an active one. Moving it back to a wallet ends that
                exposure and starts a different set of questions.
              </p>
              <p>
                Harvest indexes onchain yield on stablecoins, USDC and USDT
                included, with the rates and the risks written down. It is not
                a bank, nothing there is insured, and it is not a bonus. See
                the <Link href="/usdc">USDC hub</Link> for what the rates
                currently are and the{" "}
                <Link href="/risk-framework">risk framework</Link> for what can
                go wrong.
              </p>
              <p>
                Parking yield is a separate decision from claiming a welcome
                offer. Neither one makes the other safer.
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
              dated
            >
              <p>
                The ranking orders on advertised bonus, which is a fact about
                the advertising. Here is what the public record says about the
                venue that ordering puts first. Nobody here has played there,
                and the card opens with what it does not know.
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
              <Section id="compare" eyebrow="Compare" title="The venues we have read, side by side" dated>
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
                  A crypto casino takes wagers in cryptocurrency. You send coins
                  from your own wallet to an address the site generates, the
                  balance appears, and a withdrawal goes back to a wallet
                  address you give it. No card, no bank, no payment processor
                  sitting in the middle deciding whether the transaction is
                  allowed.
                </p>
                <p>
                  That single change is what produces most of the differences.
                  Withdrawals clear in minutes because a blockchain confirms
                  them and a bank does not. Fees are the network fee, which on
                  Tron or Solana is a few cents. Identity checks are often
                  lighter, because there is no card issuer requiring them.
                </p>
                <p>
                  The games are largely the same slots and tables a currency
                  casino runs, from the same studios. What crypto sites add is a
                  category of their own originals, built on verifiable random
                  outcomes, which the section below explains.
                </p>
                <p>
                  What you give up is the party standing behind the operator. A
                  card payment can be disputed. An onchain transfer cannot be
                  reversed by anyone, in either direction.
                </p>
              </div>
            </Section>

            <Section id="provably-fair" eyebrow="Fairness" title="Provably fair, and what it does not prove">
              <div className="rp-article">
                <p>
                  Before a round starts the casino publishes a hash of its
                  server seed. You supply a seed of your own, or accept one the
                  client generates. The outcome is computed from both. When the
                  round ends the server seed is revealed, and you can hash it,
                  check it matches what was published, and recompute the result
                  yourself.
                </p>
                <p>
                  What that proves is narrow and real: the casino fixed its half
                  of the outcome before your bet and could not change it
                  afterwards. Any venue offering this should also give you the
                  verification tool and an explanation of how to use it.
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
              <NamedList items={COINS.map((c) => ({ name: `${c.name} (${c.sym})`, body: c.note }))} />
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
                Solana, XRP, Litecoin, Dogecoin and Bitcoin Cash each run on one
                chain only, so there is nothing to get wrong. The risk is
                concentrated in the two stablecoins, which is also where most of
                the volume sits.
              </p>
            </Section>

            <Section id="getting-started" eyebrow="Getting started" title="A wallet, then a first deposit">
              <h3>Setting up a wallet</h3>
              <Steps items={WALLET_STEPS} />
              <p>
                Most non-custodial wallets need no identity verification to
                create. Buying the coin does: a centralised exchange will
                verify you before it sells you anything, even when the casino
                never asks.
              </p>
              <h3>Making the deposit</h3>
              <Steps items={DEPOSIT_STEPS} />
            </Section>

            <Section id="bonuses" eyebrow="Bonuses" title="The offers, and the terms underneath them">
              <div className="rp-dtable-wrap">
                <table className="rp-dtable">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>How it works</th>
                      <th>Typical</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BONUS_TYPES.map((b) => (
                      <tr key={b.type}>
                        <td className="strong">{b.type}</td>
                        <td>{b.how}</td>
                        <td>{b.typical}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>The terms that decide what an offer is worth</h3>
              <NamedList items={BONUS_TERMS} />
            </Section>

            <Section id="games" eyebrow="Games" title="What you can actually play">
              <div className="rp-article">
                <p>
                  Slots are the bulk of every library here, five to ten thousand
                  of them, from the same studios that supply regulated casinos.
                  Table games sit beside them, and blackjack at basic strategy
                  carries the lowest house edge on the site at roughly half a
                  percent.
                </p>
                <p>
                  Live dealer tables are streamed from studios, and the game
                  shows built around them have become the biggest draw after
                  slots. Evolution and Pragmatic supply most of what you will
                  see.
                </p>
                <p>
                  The category crypto sites invented is the originals: Crash,
                  Mines, Dice, Plinko, Limbo. They are simple, fast, verifiable
                  round by round, and often run at 98% or better. That last
                  number is why bonus terms usually bar them, and it is also why
                  they are the best value on the site when you are playing your
                  own money.
                </p>
              </div>
            </Section>

            <Section id="crypto-vs-fiat" eyebrow="Comparison" title="Against a card-and-bank casino">
              <dl className="cc-cols">
                {CRYPTO_VS_FIAT.map((r) => (
                  <div key={r.k}>
                    <dt>{r.k}</dt>
                    <dd>
                      <strong>Crypto:</strong> {r.crypto}
                      <br />
                      <strong>Fiat:</strong> {r.fiat}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section id="legality" eyebrow="Legal" title="Where this is legal">
              <div className="rp-article">
                <p>
                  The question is not whether crypto gambling is addressed by
                  law. It is whether online casino gambling is legal where you
                  live. The payment method does not change the answer.
                </p>
                <p>
                  In the United States, no federal law prohibits a player from
                  using an offshore casino. Seven states license online casinos:
                  Connecticut, Delaware, Michigan, New Jersey, Pennsylvania,
                  Rhode Island and West Virginia. None of those licensed
                  operators accepts cryptocurrency. Crypto play therefore means
                  a site outside state regulation, licensed somewhere like
                  Curaçao or Anjouan.
                </p>
                <p>
                  Enforcement has gone after operators and not players, and
                  there is no public record of a player prosecuted for using an
                  offshore site. Washington State is the exception worth
                  knowing: it criminalises taking part in online gambling.
                </p>
              </div>
              <div className="rp-info">
                <div className="rp-callout-head">
                  <span className="rp-callout-ico" aria-hidden="true">i</span>
                  <span className="rp-callout-title">What an offshore site does not give you</span>
                </div>
                <p className="rp-info-body">
                  No state complaint channel when a withdrawal is refused. No
                  segregated player funds. No link to a state self-exclusion
                  register, so a block you set with one operator does not follow
                  you anywhere else. Check your own state law before you
                  register, and not the licence badge in the casino footer.
                </p>
              </div>
            </Section>

            <Section id="scams" eyebrow="Risk" title="Five signals that a venue is not worth the deposit">
              <p>
                An onchain transfer cannot be clawed back, so the checking has
                to happen before the money moves. These are the signals that
                cost nothing to look for.
              </p>
              <NamedList items={SCAM_SIGNALS} />
            </Section>

            <Section id="responsible" eyebrow="Control" title="Staying in control">
              <p>
                Instant payments make it easier to keep going, which is the one
                way the speed works against you. Every venue worth using ships
                the tools below. Set them on the day you register, while the
                decision is still an easy one.
              </p>
              <NamedList items={RG_TOOLS} />
              <p>
                Free and confidential help:{" "}
                <a href="https://www.begambleaware.org/" rel="nofollow noopener noreferrer" target="_blank">BeGambleAware</a>,{" "}
                <a href="https://gamblersanonymous.org/" rel="nofollow noopener noreferrer" target="_blank">Gamblers Anonymous</a>, and the{" "}
                <a href="https://www.ncpgambling.org/help-treatment/about-the-national-problem-gambling-helpline/" rel="nofollow noopener noreferrer" target="_blank">National Problem Gambling Helpline</a>{" "}
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
                Links to the venues on this page are commercial. Harvest may be
                paid when a reader registers through one, and that payment does
                not change the order: rows sort on the advertised bonus, by the
                rule printed above the table.
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

