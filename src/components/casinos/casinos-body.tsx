// Everything visible on /best-crypto-casino-bonus.
//
// Split out of page.tsx the way usdc-hub-body.tsx is split out of
// src/app/usdc/page.tsx: the route file keeps metadata and schemas, the body
// keeps JSX, and lib/crypto-casinos-copy.ts keeps every figure so the same
// number cannot differ between a table, a bullet and an FAQ answer.

import Image from "next/image";
import Link from "next/link";
import casinosHeader from "@/assets/icons/CryptoCasinos-Header.png";
import type { HarvestRow } from "@/app/best-crypto-casino-bonus/page";
import { LOW_LIQUIDITY_TVL_THRESHOLD } from "@/lib/admin-rules";
import { CasinoTable } from "@/components/casinos/casino-table";
import { OutboundLink } from "@/components/report/outbound-link";
import { BonusCalculator } from "@/components/casinos/bonus-calculator";
import { isRanked, loadCasinos } from "@/lib/crypto-casinos-data";
import type { Casino } from "@/lib/crypto-casinos";
import {
  AVAILABILITY,
  BASIS_LABEL,
  BONUS_EXAMPLES,
  BONUS_EXAMPLES_CLOSE,
  BONUS_EXAMPLES_INTRO,
  BONUS_TERMS,
  BONUS_TERMS_INTRO,
  bestTermsSlug,
  BYLINE,
  CALC_DEFAULT_DEPOSIT,
  calcOffers,
  CHOOSING,
  CHOOSING_CLOSE,
  CHOOSING_INTRO,
  CALC_INTRO,
  DISCLOSURE,
  DISCLOSURE_SHORT,
  APY_NOTE,
  HARVEST_INTRO,
  HARVEST_RISK,
  HARVEST_SELECTION,
  FAQS,
  GAMES_CLOSE,
  GAMES_INTRO,
  GAME_SOURCES,
  GAME_TYPES,
  LEAD,
  LEAVE_SITE_BODY,
  LEGAL_SHORT,
  NETWORK_CHOICE,
  PARTNER_EMAIL,
  PARTNER_LINE,
  PAYMENTS_INTRO,
  PAYMENT_CHECKS,
  PAYMENT_SOURCES,
  RANKING_INTRO,
  WITHDRAWAL_TIMES,
  VENUE_REVIEWS,
  type VenueReview,
  REGISTER_SOURCE,
  RG_CHECKED,
  RG_INTRO,
  RG_SOURCES,
  RG_SUPPORT,
  RG_TOOLS,
  SORT_RULE,
  summaryPoints,
  WAGERING_AFTER,
  WAGERING_INTRO,
  amount,
  money,
  turnoverRows,
} from "@/lib/crypto-casinos-copy";

/**
 * The rail and the jump nav. A function because the ranking's label carries
 * its length, and that length is a property of the data rather than of a
 * constant somebody has to remember to update.
 */
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

/**
 * A labelled list.
 *
 * `flow` drops the full stop after the label, for entries written as one
 * sentence that runs through it: "Deposit and loss limits help cap how much
 * you can add", not "Deposit and loss limits. help cap how much you can add".
 */
function NamedList({
  items,
  flow = false,
}: {
  items: { name: string; body: string }[];
  flow?: boolean;
}) {
  return (
    <ul className="cc-risks">
      {items.map((r) => (
        <li key={r.name}>
          <strong>
            {r.name}
            {flow ? "" : "."}
          </strong>{" "}
          {r.body}
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
      {/* No width or height: the file is off-site and unmeasured here, and
          asserting a ratio would either letterbox it or crop it. It sizes
          naturally and the figure reserves nothing it cannot be sure of. */}
      {review.image ? (
        <figure className="cc-review-img">
          <img
            src={review.image.src}
            alt={review.image.alt}
            loading="lazy"
            decoding="async"
          />
        </figure>
      ) : null}
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
        <div className="cc-review-body" key={sec.h}>
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
          {review.termsLabel ?? "Read the casino’s terms"}
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
  // Deposit matches only, for the comparison and the calculator presets.
  const wagering = turnover.filter((r) => !r.cashback);
  // The calculator's offers and the one it opens on, in ranking order. The
  // default is the offer with the best terms, not the biggest headline.
  const calcOfferList = calcOffers(ranked);
  const bestSlug = bestTermsSlug(calcOfferList, CALC_DEFAULT_DEPOSIT);

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
          <h1 className="cc-h1">Best Crypto Casino Bonuses, Ranked by Offer Size</h1>
          <p className="cc-intro">{LEAD(ranked.length)}</p>
          <p className="cc-meta">
            <span>By Harvest</span>
            <span>{BYLINE(ranked.length)}</span>
            <span>Updated {UPDATED}</span>
          </p>
          {/* Static import, so Next emits the intrinsic size and the slot
              reserves its height before the file loads. priority because it
              is the largest thing above the fold and is what LCP measures
              here. Inside the head column, not outside it: at the section's
              full width it ran 1256px against the H1's 780 and the ranking
              table's 944, overshooting both.

              Empty alt on purpose, the same call /xrp-rich-list makes. The
              image repeats the headline in pixels and shows wordmarks the
              summary underneath names in text, so a described alt would read
              the page twice to anyone using a screen reader. */}
          <Image
            src={casinosHeader}
            // Not decorative. The image is the page's subject and it carries
            // every venue's wordmark, so it says what it shows.
            alt={`Wordmarks of the ${ranked.length} crypto casinos compared on this page, with the combined size of their advertised welcome bonuses`}
            className="cc-figure"
            sizes="(max-width: 820px) 100vw, 780px"
            priority
          />
          <h2 className="cc-summary-h">Summary</h2>
          <ul className="cc-keyfind">
            {summaryPoints(ranked).map((p) => (
              <li key={p.lead}>
                <strong>{p.lead}</strong> {p.rest}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Centred, the way /xrp-rich-list is laid out: the sections are direct
          children of the shell and the shell is the reading measure. The
          report's two-column grid put a persistent "On this page" rail in the
          margin, which suits a sixteen-section report and not a comparison
          somebody scrolls once. */}
      <main className="uni-home-shell">
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

        <Section id="bonus-calculator" eyebrow="Bonus calculator" title="What is your deposit worth?">
          <p>{CALC_INTRO}</p>
          {/* Deposit-match offers only, in ranking order, so the tool opens
              on the page's own top row. calcOffers explains what it takes
              to qualify. */}
          <BonusCalculator offers={calcOfferList} defaultSlug={bestSlug} />
        </Section>

        <Section id="turnover" eyebrow="Bonus comparison" title="How much do you need to wager?">
          {WAGERING_INTRO.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
          {/* Deposit-match offers only. A cashback cap is not a bonus
              you wager down, and printing Hyper Lucky's $10,000 with
              "Nothing" to wager put a cashback rate in a deposit-bonus
              comparison as if the two were the same product. */}
          <div className="rp-dtable-wrap">
            <table className="rp-dtable">
              <thead>
                <tr>
                  <th>Casino</th>
                  <th className="num">Bonus compared</th>
                  <th className="num">Wagering</th>
                  <th className="num">Calculated wagering</th>
                  <th className="num">Minimum deposit</th>
                </tr>
              </thead>
              <tbody>
                {wagering.map((r) => (
                  <tr key={r.slug}>
                    <td className="strong">{r.name}</td>
                    <td className="num">
                      {amount(r.cap, r.unit)}
                      {r.stageOne != null ? (
                        <span className="cc-basis">
                          package total across its stages
                        </span>
                      ) : null}
                    </td>
                    <td className="num">{r.wagering}×</td>
                    <td className="num">
                      {amount(r.turnover, r.unit)}
                      <span className="cc-basis">{BASIS_LABEL[r.basis]}</span>
                    </td>
                    <td className="num">{r.minDeposit ?? "Not published"}</td>
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
          <p>{WAGERING_AFTER[1]}</p>
        </Section>


        {/* Starts after the withdrawal has landed. Everything above this
            point is about money still inside a casino account, and none
            of it applies until the balance has left one. */}
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
        <Section id="games" eyebrow="Games" title="Which games can you play at crypto casinos?">
          <p>{GAMES_INTRO}</p>
          <div className="rp-dtable-wrap">
            <table className="rp-dtable cc-pay">
              <thead>
                <tr>
                  <th>Game type</th>
                  <th>What you&rsquo;ll find</th>
                </tr>
              </thead>
              <tbody>
                {GAME_TYPES.map((g) => (
                  <tr key={g.type}>
                    <td className="strong">{g.type}</td>
                    <td>{g.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{GAMES_CLOSE}</p>
          {/* The formats are documented. Which of them a given casino
              actually runs is a question for its lobby, and no lobby here
              has been read, so no row claims a category. */}
          <p className="rp-fineprint">
            The categories above follow{" "}
            {GAME_SOURCES.map((src, i) => (
              <span key={src.url}>
                {i > 0 ? " and " : ""}
                <a href={src.url} rel="nofollow noopener noreferrer" target="_blank">
                  {src.label}
                </a>
              </span>
            ))}
            . Availability at any particular casino is a separate check,
            and none of the {ranked.length} here has had its lobby read.
          </p>
        </Section>

        <Section id="bonuses" eyebrow="Bonus terms" title="What to check in a crypto casino bonus">
          <p>{BONUS_TERMS_INTRO}</p>
          <NamedList items={BONUS_TERMS} />
          <h3>What different casino bonuses look like in practice</h3>
          <p>{BONUS_EXAMPLES_INTRO}</p>
          <div className="rp-dtable-wrap">
            <table className="rp-dtable cc-pay">
              <thead>
                <tr>
                  <th>Bonus type</th>
                  <th>Example</th>
                </tr>
              </thead>
              <tbody>
                {BONUS_EXAMPLES.map((b) => (
                  <tr key={b.type}>
                    <td className="strong">{b.type}</td>
                    <td>{b.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{BONUS_EXAMPLES_CLOSE}</p>
        </Section>

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
          <h3>Choosing the right network</h3>
          {NETWORK_CHOICE.map((para) => (
            <p key={para.slice(0, 24)}>{para}</p>
          ))}
          <h3>Understanding withdrawal times</h3>
          <p>{WITHDRAWAL_TIMES[0]}</p>
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

        <Section id="legality" eyebrow="Availability" title="Can you use a crypto casino where you live?">
          {AVAILABILITY.map((para) => (
            <p key={para.slice(0, 24)}>{para}</p>
          ))}
        </Section>

        {/* General guidance, applied to every venue the same way. The
            finding about the venue at the top of the ranking lives in its
            row and its review, where it informs that decision, and not in
            a section that is supposed to read the same for all sixteen. */}
        <Section id="choosing" eyebrow="Choosing a casino" title="What to look for before you register">
          <p>{CHOOSING_INTRO}</p>
          <NamedList items={CHOOSING} />
          <p>{CHOOSING_CLOSE}</p>
          <p className="rp-fineprint">
            A public register carries more than a footer badge does. The UK
            Gambling Commission&rsquo;s register lists licence status,
            trading names and domains:{" "}
            <a href={REGISTER_SOURCE.url} rel="nofollow noopener noreferrer" target="_blank">
              {REGISTER_SOURCE.label}
            </a>
            .
          </p>
        </Section>

        {/* The anchor is load-bearing: the line above the ranking, which
            has to precede a sponsored click, links to it. */}
        <Section id="responsible" eyebrow="Responsible gambling" title="Set your limits before you play">
          {RG_INTRO.map((para) => (
            <p key={para.slice(0, 24)}>{para}</p>
          ))}
          <NamedList items={RG_TOOLS} flow />
          <p>{RG_SUPPORT}</p>
          <p>
            <strong>Great Britain:</strong>{" "}
            <a href="https://www.gambleaware.org/" rel="nofollow noopener noreferrer" target="_blank">
              GambleAware
            </a>{" "}
            provides information and routes to local support.
          </p>
          <p>
            <strong>United States:</strong> Call or text 1-800-MY-RESET, or
            visit the{" "}
            <a href="https://www.ncpgambling.org/help-treatment/" rel="nofollow noopener noreferrer" target="_blank">
              National Problem Gambling Helpline
            </a>{" "}
            for support options.
          </p>
          <p>
            For other locations, your local health service or gambling
            regulator may list specialist support.
          </p>
          <p className="rp-fineprint">
            Support links and the helpline number checked {RG_CHECKED}. The
            guidance above follows{" "}
            {RG_SOURCES.map((src, i) => (
              <span key={src.url}>
                {i > 0 ? " and " : ""}
                <a href={src.url} rel="nofollow noopener noreferrer" target="_blank">
                  {src.label}
                </a>
              </span>
            ))}
            .
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

        <Section id="disclosure" eyebrow="Disclosure" title="Our research and commercial links">
          {DISCLOSURE.map((para) => (
            <p key={para.slice(0, 24)}>{para}</p>
          ))}
          <p>
            If a figure here is wrong or out of date,{" "}
            <Link href="/contact">tell us</Link> and we will correct it and
            re-date the offer. For what Harvest otherwise does, see the{" "}
            <Link href="/methodology">methodology</Link> behind the yield
            rankings and the <Link href="/risk-framework">risk framework</Link>.
          </p>
          <p>
            The comparison is published as data as well as a table:{" "}
            <a href="/data/crypto-casinos/index.json">index.json</a> carries
            every venue with the source URL and read date behind each figure,
            and <a href="/data/crypto-casinos/offers.csv">offers.csv</a> is the
            same rows flat. Both are CC BY 4.0.
          </p>
          <p className="cc-partner">
            {PARTNER_LINE}{" "}
            <a href={`mailto:${PARTNER_EMAIL}`}>{PARTNER_EMAIL}</a>
          </p>
        </Section>
      </main>
    </div>
  );
}

