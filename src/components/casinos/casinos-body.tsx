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
import type { Casino } from "@/lib/crypto-casinos";
import {
  BONUS_STAGES,
  BONUS_TERMS,
  BYLINE,
  CALC_INTRO,
  CALC_NOTE,
  DISCLOSURE_SHORT,
  APY_NOTE,
  HARVEST_INTRO,
  HARVEST_RISK,
  HARVEST_SELECTION,
  FAQS,
  LEAD,
  LEAVE_SITE_BODY,
  LEGAL_SHORT,
  PAYMENTS_INTRO,
  PAYMENT_CHECKS,
  PAYMENT_SOURCES,
  RANKING_INTRO,
  WITHDRAWAL_TIMES,
  VENUE_REVIEWS,
  type VenueReview,
  RG_TOOLS,
  SCAM_SIGNALS,
  SORT_RULE,
  WAGERING_AFTER,
  WAGERING_INTRO,
  money,
  spellOut,
  turnoverRows,
} from "@/lib/crypto-casinos-copy";

/**
 * The rail and the jump nav. A function because the ranking's label carries
 * its length, and that length is a property of the data rather than of a
 * constant somebody has to remember to update.
 */
export const tocItems = (ranked: number): TocItem[] => [
  { id: "ranking", label: `Compare ${ranked} offers` },
  { id: "turnover", label: "How much to wager" },
  { id: "bonus-calculator", label: "Bonus calculator" },
  { id: "bankroll", label: "Put your crypto to work" },
  { id: "reviews", label: "Lucky Rollers review" },
  { id: "payments", label: "Crypto payments" },
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
 * One venue, reviewed.
 *
 * Not a card of fields with a completion score on it. A short introduction,
 * the published offer as a table, two or three sections that each explain one
 * feature, and an editorial view that carries the one material unknown. The
 * scope of the reading is stated once, at the foot, in a full sentence.
 */
function VenueReviewBody({
  review,
  casino,
  readOn,
}: {
  review: VenueReview;
  casino: Casino | undefined;
  readOn: string;
}) {
  return (
    <>
      <p>{review.intro}</p>
      <div className="rp-dtable-wrap">
        <table className="rp-dtable cc-feat">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Published offer</th>
            </tr>
          </thead>
          <tbody>
            {review.features.map((f) => (
              <tr key={f.label}>
                <td className="strong">{f.label}</td>
                <td>{f.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {review.sections.map((sec) => (
        <div key={sec.h}>
          <h3>{sec.h}</h3>
          {sec.body.map((para) => (
            <p key={para.slice(0, 24)}>{para}</p>
          ))}
        </div>
      ))}
      <p className="cc-ctas">
        {casino?.url ? (
          <OutboundLink
            className="cc-open cc-play"
            href={casino.url}
            rel="sponsored nofollow noopener noreferrer"
            keepHref
            platform={casino.name}
            source="crypto-casinos-review"
            rank={1}
            ariaLabel={`Play Now at ${casino.name}`}
            body={LEAVE_SITE_BODY(casino.name)}
          >
            Play Now at {casino.name}
          </OutboundLink>
        ) : null}
        <a href={review.termsUrl} rel="nofollow noopener noreferrer" target="_blank">
          Read the casino&rsquo;s terms
        </a>
      </p>
      <p className="cc-scope">
        <em>{review.scope(readOn)}</em>
      </p>
    </>
  );
}

export function CasinosBody({
  harvest = [],
  dataUpdated = "",
}: {
  harvest?: HarvestRow[];
  dataUpdated?: string;
}) {
  const { casinos } = loadCasinos();
  // The wordmark set is the membership list. See lib/casino-logos.
  const ranked = casinos.filter(isRanked);
  // Every derived table is scoped to the ranking, not to the 38 venues in the
  // file. A venue that is not listed has no row, no wordmark and no button, so
  // a reader meeting its name in the turnover table or the calculator has
  // nowhere to go with it.
  const turnover = turnoverRows(ranked);

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
          {/* One expression, not text either side of an interpolation. JSX
              drops the space at that boundary and the H1 rendered as
              "16Bonuses", which is the same defect the review caught in
              "38venues". */}
          <h1 className="cc-h1">{`Crypto Casinos: ${ranked.length} Bonuses & Offers Compared`}</h1>
          <p className="cc-intro">{LEAD(ranked.length)}</p>
          <p className="cc-meta">
            <span>By Harvest</span>
            <span>{BYLINE(ranked.length)}</span>
            <span>Updated {UPDATED}</span>
          </p>
        </div>
      </section>

      <main className="uni-home-shell">
        <div className="rp-doc">
          <div className="rp-doc-main">
            <Section
              id="ranking"
              eyebrow="Ranking"
              title="Compare welcome bonuses, cashback and rakeback"
            >
              <p>{RANKING_INTRO}</p>
              {/* Said here and nowhere else. The sort rule used to appear
                  four times: the lead, above the table, a Ground rules
                  section and the disclosure. */}
              <p>{SORT_RULE}</p>
              <p>{DISCLOSURE_SHORT}</p>
              {/* What has to precede a sponsored click sits directly above
                  it. The full legal and responsible-gambling blocks keep
                  their sections further down. */}
              <p className="cc-brief">
                {LEGAL_SHORT}{" "}
                <a href="#responsible">
                  Responsible gambling information and support
                </a>
                .
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

            <Section id="turnover" eyebrow="Bonus comparison" title="How much do you need to wager?">
              {WAGERING_INTRO.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
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
              <p>{WAGERING_AFTER[0]}</p>
              {/* Trimmed. The first half used to explain that Wild.io's
                  350% and its $1,000 cap are not a contradiction, which was a
                  correction of a claim this page made and no longer makes:
                  the row prints "Up to $1,000 per deposit" against "350%
                  across the first three deposits" and the reader can see it.
                  What is left is the part no template writes. */}
              <div className="rp-tip">
                <div className="rp-callout-head">
                  <span className="rp-callout-ico" aria-hidden="true">!</span>
                  <span className="rp-callout-title">A bonus is not clearable on every game</span>
                </div>
                <p className="rp-tip-body">
                  Wild.io&rsquo;s bonus terms 2.4:{" "}
                  <q cite="https://wild.io/bonus-terms">
                    Wagering can only be done in Slots. Jackpot Games,
                    Accumulator/Progressive Games, Table Games, Live Games,
                    Sportsbook, or any other games can not be used to wager the
                    bonus or while the bonus is active
                  </q>
                  . Table games are not discounted to 20% here, they are barred
                  outright, and 2.5 puts their contribution at nothing. A
                  playthrough you cannot attempt on the game you wanted is
                  worth more attention than the size of the cap.
                </p>
              </div>
              <p>{WAGERING_AFTER[1]}</p>
            </Section>

            <Section id="bonus-calculator" eyebrow="Bonus calculator" title="Explore the numbers behind your bonus">
              <p>{CALC_INTRO}</p>
              {/* Deposit-match offers only. A cashback or rakeback rate has no
                  deposit match to model, and the amount the playthrough
                  multiplies is one leg of a ladder offer rather than the
                  banner total, so the preset carries which stage it is. */}
              <WageringCalculator
                presets={turnover
                  .filter((r) => !r.cashback)
                  .map((r) => ({
                    slug: r.slug,
                    name: r.name,
                    bonus: r.basis,
                    wagering: r.wagering,
                    stage: BONUS_STAGES[r.slug] ?? null,
                  }))}
              />
              <p className="rp-fineprint">{CALC_NOTE}</p>
            </Section>

            {/* Starts after the withdrawal has landed. Everything above this
                point is about money still inside a casino account, and none
                of it applies until the balance has left one. */}
            <Section
              id="bankroll"
              eyebrow="Harvest"
              title="Put your crypto to work with Harvest"
            >
              {HARVEST_INTRO.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
              {harvest.length > 0 && (
                <>
                  <p>{HARVEST_SELECTION(money(LOW_LIQUIDITY_TVL_THRESHOLD))}</p>
                  <div className="rp-dtable-wrap">
                    <table className="rp-dtable cc-vaults">
                      <thead>
                        <tr>
                          <th>Strategy</th>
                          <th>Asset</th>
                          <th>Network</th>
                          {/* The window is on the column, not in a footnote:
                              a rate labelled "24h" reads as one day's return,
                              and this figure is annualised. */}
                          <th className="num">
                            <abbr title={APY_NOTE}>APY</abbr>
                          </th>
                          <th className="num">Total deposits</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {harvest.map((r) => (
                          <tr key={r.slug}>
                            <td className="strong">{r.name}</td>
                            <td>{r.asset}</td>
                            <td>{r.chain}</td>
                            <td className="num">{r.apy.toFixed(2)}%</td>
                            <td className="num">{money(r.tvl)}</td>
                            <td className="num">
                              <Link className="cc-viewlink" href={`/${r.slug}`}>
                                View strategy
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="rp-fineprint">
                    {APY_NOTE} Data updated {dataUpdated}.
                  </p>
                </>
              )}
              <p>{HARVEST_RISK}</p>
              <p className="cc-ctas">
                <Link className="cc-cta" href="/usdc">
                  Explore USDC yields
                </Link>
                <Link href="/risk-framework">Understand the risks</Link>
              </p>
            </Section>

            {VENUE_REVIEWS.map((r) => (
              <Section
                key={r.slug}
                id="reviews"
                eyebrow="Casino review"
                title={r.title}
              >
                <VenueReviewBody
                  review={r}
                  casino={ranked.find((c) => c.slug === r.slug)}
                  readOn={UPDATED}
                />
              </Section>
            ))}

            {/* Four sections became one.
                The side-by-side table repeated the bonus, the playthrough and
                the minimum deposit the ranking already carries, and counted
                coins, which tells a reader nothing about whether their coin is
                accepted. Its one useful column, the published withdrawal time,
                is in each row's key details and expansion. What a crypto
                casino is, and how provably fair works, are FAQ answers. What
                is left is the question the page could not otherwise answer:
                how to get money in and out without losing it. */}
            <Section id="payments" eyebrow="Crypto payments" title="Choosing a coin for deposits and withdrawals">
              {PAYMENTS_INTRO.map((para) => (
                <p key={para.slice(0, 24)}>{para}</p>
              ))}
              <div className="rp-dtable-wrap">
                <table className="rp-dtable cc-pay">
                  <thead>
                    <tr>
                      <th>Payment option</th>
                      <th>What to check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PAYMENT_CHECKS.map((r) => (
                      <tr key={r.option}>
                        <td className="strong">{r.option}</td>
                        <td>{r.check}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>Understanding withdrawal times</h3>
              {WITHDRAWAL_TIMES.map((para) => (
                <p key={para.slice(0, 24)}>{para}</p>
              ))}
              {/* Kept from the network section it absorbs. This is the one
                  mistake on the page that cannot be undone by anybody. */}
              <div className="rp-tip">
                <div className="rp-callout-head">
                  <span className="rp-callout-ico" aria-hidden="true">!</span>
                  <span className="rp-callout-title">Send on the wrong network and the money is gone</span>
                </div>
                <p className="rp-tip-body">
                  USDT and USDC each exist as separate tokens on several
                  networks, and the versions cannot see each other. Send the
                  Ethereum version to a Tron address and it lands somewhere
                  neither you nor the casino can reach, and there is no support
                  ticket for it. An XRP deposit to a shared address usually
                  needs a destination tag, and a transfer that arrives without
                  one is not credited automatically. Which networks a given
                  casino accepts is a question for its cashier, not for this
                  page.
                </p>
              </div>
              <p className="rp-fineprint">
                Read on {UPDATED} from{" "}
                {PAYMENT_SOURCES.map((src, i) => (
                  <span key={src.url}>
                    {i > 0 ? ", " : ""}
                    <a href={src.url} rel="nofollow noopener noreferrer" target="_blank">
                      {src.label}
                    </a>
                  </span>
                ))}
                .
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

