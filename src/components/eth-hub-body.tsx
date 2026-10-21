// Dedicated body for /eth.
//
// /eth used to render through the shared asset-hub-body.tsx: a ranking table,
// a stat strip and a few paragraphs of definitions, no answer anywhere in the
// prose and no FAQ markup. Search Console says the page is already being
// surfaced for full-sentence questions, most of them scoped to a network:
//
//   where can i earn yield on eth on base?               pos 2.4
//   which protocols pay the highest eth yield on an l2?  pos 3.0
//   which eth yield options on base are the safest?      pos 4.8
//   what can i do with wrapped eth on base to earn yield? pos 5.3
//   what are the best options for eth yield with cheap gas? pos 4.0
//
// and earning almost no clicks from them, because the page had no sentence an
// answer engine could lift. This body is built around those questions: each
// one gets a section whose heading reads like the query and whose first
// sentence is the answer, with the figure, the scope and the date in it.
//
// Same house style and the same shared pieces as /usdc (Block shell, HubTable,
// calculator, schema helpers), so the two long-form hubs read as one site.
import { Fragment } from "react";
import Link from "next/link";
import { getAllSparklines } from "@/lib/data";
import { AssetIcon, ChainIcon } from "@/components/token-icons";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { assetHubCrumbs } from "@/lib/seo";
import {
  breadcrumbSchema,
  itemListSchema,
  faqPageSchema,
  reportDatasetSchema,
} from "@/lib/jsonld";
import { HubTable } from "@/components/hub-table";
import { HomeCrumb } from "@/components/home-crumb";
import { RankingDataNote } from "@/components/ranking-data-note";
import { UsdcCalculator, type CalcProduct } from "@/components/usdc-calculator";
import { EthLoopFigure } from "@/components/eth-loop-figure";
import { harvestAppUrl } from "@/lib/harvest-app";
import { proseName, listOf, plural, apy, tvl } from "@/lib/usdc-hub";
import { strategyTypeOf, isL2 } from "@/lib/eth-hub";
import {
  ethPageModel,
  networkSentence,
  safetyFraming,
  stakingReferenceText,
  stakingSourceUrl,
  bare,
  SINGULAR,
  PLURAL,
  TYPE_BLURB,
  HARVEST_FEE_TEXT,
  ETH_HUB_H1,
  ETH_RISKS,
  ETH_RISKS_LEAD,
  STAKING_LEAD,
  venueLead,
  venueLine,
  type Faq,
  type FaqSpot,
} from "@/lib/eth-hub-copy";

const HUB_URL = `${SITE_URL}/eth`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);


/** Stable anchor for a question, so the index at the foot can link to it. */
const qid = (q: string) =>
  "q-" +
  q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

// Bold the figures in a generated sentence. Rates, dollar sizes and counts of
// strategies are what a skimming reader's eye is hunting for, so they carry
// the weight; the words around them stay regular. Wrapping in <strong> leaves
// the extracted text identical, so nothing an answer engine lifts changes.
const FIGURE =
  /(\$[\d.,]+[KMB]?|\d+(?:\.\d+)?%(?: APY)?|\b\d+ of (?:the )?\d+\b|\b\d+ (?:ETH |WETH )?strateg(?:y|ies)\b)/g;
function Em({ text }: { text: string }) {
  const parts = text.split(FIGURE);
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
    </>
  );
}

/**
 * The questions a reader tends to have at this point in the page, answered in
 * place. Same <details> pattern as the FAQ on /usdc, so every answer is in the
 * HTML whether or not it is open, and the FAQPage schema still lists them all.
 */
function Ask({ items }: { items: Faq[] }) {
  if (!items.length) return null;
  return (
    <aside className="eh-ask" aria-label="Questions on this section">
      <p className="eh-ask-h">Questions readers ask here</p>
      <div className="uh-faq">
        {items.map((f, i) => (
          <details className="uh-faq-item" key={f.q} id={qid(f.q)} open={i === 0}>
            <summary className="uh-faq-q">
              <span>{f.q}</span>
              <Chevron />
            </summary>
            <p className="uh-faq-a">
              <Em text={f.a} />
            </p>
          </details>
        ))}
      </div>
    </aside>
  );
}



function Block({
  id,
  eyebrow,
  title,
  lead,
  asOf,
  asOfIso,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  asOf?: string;
  asOfIso?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="uh-block" aria-labelledby={id} data-asof={asOfIso}>
      <p className="rp-eyebrow" data-dateline={asOf ? "" : undefined}>
        {eyebrow}
        {asOf && (
          <>
            <span className="uh-eyebrow-sep" aria-hidden="true"> · </span>
            <span className="uh-eyebrow-date">{asOf}</span>
          </>
        )}
      </p>
      <h2 id={id}>{title}</h2>
      {lead && (
        <p className="uh-lead">
          <Em text={lead} />
        </p>
      )}
      {children}
    </section>
  );
}

function Chevron() {
  return (
    <svg
      className="uh-faq-chev"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}


export async function EthHubBody() {
  const [m, sparklines] = await Promise.all([ethPageModel(), getAllSparklines()]);

  if (!m) {
    return (
      <div className="uni-hub-test">
        <h1 className="uni-hub-h1">{ETH_HUB_H1}</h1>
        <p className="uni-hub-sub">ETH yield strategies are populating, check back shortly.</p>
      </div>
    );
  }

  const { c, best, nets, types, evidence, staking, faqs, venues, l2Count } = m;
  const crumbs = assetHubCrumbs("ETH");
  const asOfTime = new Date(c.asOfIso).toISOString().slice(11, 16);
  // 0xFE09…573e is the fWETH vault Harvest launched on Ethereum in October 2020;
  // its history is real and long, and the strategy behind it is newer.
  const hasOriginalVault = evidence.some(
    (r) => r.vault.contractAddress.toLowerCase() === "0xfe09e53a81fe2808bc493ea64319109b5baa573e",
  );
  const mmFunded = c.funded.filter((v) => strategyTypeOf(v) === "money-market").length;
  const asks = (at: FaqSpot) => faqs.filter((f) => f.at === at);
  const base = nets.find((n) => n.chain === "Base");
  const visibleChains = [...c.chains].sort();

  const calcProducts: CalcProduct[] = c.all.map((v) => ({
    slug: v.slug,
    name: v.productName,
    apy: v.apy24h,
    chain: v.chain,
    appUrl: harvestAppUrl(v.chain, v.contractAddress),
  }));

  // The questions the page answers, as a short jump list under the top 10.
  // Kept to four so the top of the page is the answer and the table; the
  // full index of questions sits at the foot of the page.
  const jumps: { href: string; label: string }[] = [
    { href: "#by-network", label: "ETH yield on Base" },
    { href: "#safest", label: "Risk and safety" },
    { href: "#vs-staking", label: "Yield vs staking" },
    { href: "#calculator", label: "Earnings calculator" },
  ];
  const topRaw = c.bestRaw && c.bestRaw.slug !== best.slug ? c.bestRaw : null;

  return (
    <div className="uni-hub-test uh-page eh-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema(crumbs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            ...itemListSchema(c.all, HUB_URL, "24h"),
            name: "ETH yield strategies ranked by 24-hour APY",
            numberOfItems: c.count,
            dateModified: c.asOfIso,
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema(faqs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "@id": HUB_URL,
            url: HUB_URL,
            name: "Best ETH yield: live ranking of ETH lending and vault rates",
            dateModified: c.asOfIso,
            inLanguage: "en",
            isBasedOn: `${SITE_URL}/methodology`,
            author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
            publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            reportDatasetSchema({
              name: "ETH yield strategies tracked by Harvest",
              description:
                `Live 24-hour APY, 30-day mean APY and tracked value for the ${c.count} ETH and ` +
                `WETH yield strategies Harvest indexes across ${c.chainCount} networks, measured ` +
                `from first-party vault contract readings and refreshed several times a day.`,
              url: HUB_URL,
              dateModified: c.asOfIso,
              temporalCoverage: c.asOfIso,
              keywords: ["ETH", "WETH", "Ethereum", "yield", "APY", "Base", "Arbitrum", "DeFi"],
              sources: [`${SITE_URL}/methodology`],
              distribution: [{ format: "application/json", url: `${SITE_URL}/data/index.json` }],
            }),
          ),
        }}
      />

      <nav className="uni-hub-crumbs" aria-label="Breadcrumb">
        <HomeCrumb />
        <span className="uni-hub-crumbs-sep" aria-hidden="true">›</span>
        <span className="uni-hub-crumbs-current">ETH Ranking</span>
      </nav>

      <div className="uni-hub-hero uh-hero">
        <div className="uh-titlerow">
          <span className="uni-hub-hero-icon" aria-hidden="true">
            <AssetIcon asset="ETH" size={44} priority />
          </span>
          <h1 className="uni-hub-h1">{ETH_HUB_H1}</h1>
        </div>
        <p className="uh-answer">
          <Em text={m.heroAnswer} />
        </p>
        {/* Three figures as text, not a chart: each tile is a label and a
            value an extractor can read, dated by the line under them. */}
        <dl className="eh-tiles" data-asof={c.asOfIso}>
          <div className="eh-tile">
            <dt>Best above {tvl(c.fundedFloor)}</dt>
            <dd className="eh-tile-v">{apy(best.apy24h)}</dd>
            <dd className="eh-tile-s">
              {bare(best)} · {best.chain}
            </dd>
          </div>
          {topRaw ? (
            <div className="eh-tile">
              <dt>Top rate overall</dt>
              <dd className="eh-tile-v">{apy(topRaw.apy24h)}</dd>
              <dd className="eh-tile-s">
                {bare(topRaw)} · {SINGULAR[strategyTypeOf(topRaw)]}, {tvl(topRaw.tvl)}
              </dd>
            </div>
          ) : null}
          <div className="eh-tile">
            <dt>Tracked</dt>
            <dd className="eh-tile-v">{tvl(c.totalTvl)}</dd>
            <dd className="eh-tile-s">
              {c.count} strategies on {c.chainCount} networks
            </dd>
          </div>
        </dl>
        <p className="uh-updated eh-meta" data-dateline="">
          Updated {c.asOf}, {asOfTime} UTC · Rates after Harvest&rsquo;s fee ·{" "}
          <Link href="/methodology">Methodology</Link>
        </p>
      </div>

      <Block
        id="top-ten"
        eyebrow="Live ranking"
        title="Top 10 ETH yields by 24-hour APY"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          `The ten highest-paying ETH strategies in this index ran from ` +
          `${apy(c.top10[c.top10.length - 1].apy24h)} to ${apy(c.maxApy)}, across ` +
          `${listOf([...new Set(c.top10.map((v) => v.chain))])}.`
        }
      >
        <HubTable
          vaults={c.top10}
          sparklines={sparklines}
          scopeLabel="ETH strategies"
          openLinks
          metrics
          venueLabel="Protocol"
        />
        <p className="uh-note">
          {`Sorted on the 24-hour rate with no floor applied, so a row near the top can sit on a ` +
            `few hundred dollars of ETH. The headline figure uses a ${tvl(c.fundedFloor)} floor ` +
            `for that reason, and ${c.fundedCount} of the ${c.count} strategies cleared it.`}
        </p>
        {/* A <nav>, since it is navigation: the labels are link text, not
            claims, and the atomicity gate strips <nav> like any other chrome. */}
        <nav aria-label="Jump to an answer">
          <ul className="eh-jumps">
            {jumps.map((j) => (
              <li key={j.label}>
                <a href={j.href}>{j.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <Ask items={asks("top")} />
      </Block>

      <Block
        id="by-network"
        eyebrow="By network"
        title="Where to earn ETH yield on Base, Arbitrum and Ethereum"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={base ? networkSentence(base, c) : undefined}
      >
        <div className="eh-nets">
          {nets.map((n) => (
            <article className="eh-net" key={n.chain} aria-labelledby={`net-${n.chain}`}>
              <header className="eh-net-head">
                <ChainIcon chain={n.chain} size={22} />
                <h3 id={`net-${n.chain}`}>{`ETH yield on ${n.chain}`}</h3>
                <span className="eh-net-tag">{isL2(n.chain) ? "Layer 2" : "Mainnet"}</span>
              </header>
              <p className="eh-net-meta">
                {`${n.count} ${plural(n.count, "strategy", "strategies")}, ${tvl(n.tvl)} tracked`}
              </p>
              {n.picks.length ? (
                // ARIA list roles rather than <ol>/<li>: each pick is a
                // name, a rate and a size, a data row rather than a sentence,
                // and the bullet-fragment rule rightly reserves <li> for prose.
                <div className="eh-picks" role="list">
                  {n.picks.map((v) => (
                    <div role="listitem" className="eh-pick" key={v.slug}>
                      <Link href={`/${v.slug}`} className="eh-pick-name">
                        {v.productName.replace(/\s*\([^)]*\)$/, "")}
                      </Link>
                      <span className="eh-pick-apy">{apy(v.apy24h)}</span>
                      <span className="eh-pick-sub">
                        {`${cap(SINGULAR[strategyTypeOf(v)])} · ${tvl(v.tvl)}`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="eh-net-empty">{networkSentence(n, c)}</p>
              )}
              <Link className="eh-net-more" href={`/${n.chain.toLowerCase()}`}>
                {`All ${n.chain} strategies`}
                <span aria-hidden="true"> →</span>
              </Link>
            </article>
          ))}
        </div>
        <p>
          <strong>Gas decides more than the rate on a small position.</strong>{" "}
          {`Base and Arbitrum settle a transaction for cents, while Ethereum mainnet can cost ` +
            `several dollars when it is busy. On a position of a few ETH, that difference decides ` +
            `whether entering and leaving is worth it at all.`}
        </p>
        <p>
          <Em
            text={
              `Of the ${c.count} ETH strategies tracked, ${l2Count} run on a layer 2. Each card ` +
              `links to its network page, which cuts the full ranking down to that chain.`
            }
          />
        </p>
        <Ask items={asks("network")} />
      </Block>

      <Block
        id="strategy-types"
        eyebrow="Strategy types"
        title="What you can do with ETH or WETH to earn yield"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          `ETH in this index earns yield in four ways, by lending it into a pooled market, ` +
          `handing it to a curated vault, letting an allocator move it, or looping it with ` +
          `leverage, and as of ${c.asOf} the index held ` +
          `${listOf(types.map((t) => `${t.count} ${t.count === 1 ? SINGULAR[t.type] : PLURAL[t.type]}`))}.`
        }
      >
        <div className="eh-types">
          {types.map((t) => (
            <article className="eh-type" key={t.type} aria-labelledby={`type-${t.type}`}>
              <h3 id={`type-${t.type}`}>{t.label}</h3>
              <p className="eh-type-blurb">{TYPE_BLURB[t.type]}</p>
              <dl className="eh-type-stats">
                <div>
                  <dt>Strategies</dt>
                  <dd>{t.count}</dd>
                </div>
                <div>
                  <dt>Median APY</dt>
                  <dd>{apy(t.medianApy)}</dd>
                </div>
                <div>
                  <dt>Tracked value</dt>
                  <dd>{tvl(t.tvl)}</dd>
                </div>
              </dl>
              {t.bestFunded ? (
                <p className="eh-type-best">
                  {`Best funded: `}
                  <Link href={`/${t.bestFunded.slug}`}>{proseName(t.bestFunded)}</Link>
                  {` at ${apy(t.bestFunded.apy24h)}.`}
                </p>
              ) : (
                <p className="eh-type-best">
                  {`No ${SINGULAR[t.type]} held ${tvl(c.fundedFloor)} or more.`}
                </p>
              )}
            </article>
          ))}
        </div>
        <p>
          <strong>WETH and ETH are the same asset in every row.</strong>{" "}
          {`Wrapped ETH is ETH locked one-to-one in a contract that issues an ERC-20 token, ` +
            `because lending contracts can hold ERC-20 tokens and cannot hold native ETH. It ` +
            `unwraps back to ETH at any time, and on Base every strategy takes it, so wrapping is ` +
            `the first step and a single transaction.`}
        </p>
        <p>
          <strong>A money market has the fewest layers, and every step up adds one.</strong> A
          money market is one protocol and one rate curve. A curated vault adds the curator&rsquo;s choice of markets. An allocator
          adds a contract that moves the position between venues.
        </p>
        <p>
          <strong>Looping adds leverage</strong>, the only one of the four with a liquidation
          path. Building the loop costs fees, so it charges an entry cost the app shows before a
          position opens.
        </p>
        <EthLoopFigure />
        <Ask items={asks("types")} />
      </Block>

      <Block
        id="safest"
        eyebrow="Safety evidence"
        title="Which ETH yield options are the safest?"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          safetyFraming(c)
        }
      >
        <div className="eh-evidence-wrap" data-nosnippet="">
          <table className="eh-evidence">
            <thead>
              <tr>
                <th scope="col">Strategy</th>
                <th scope="col">Type</th>
                <th scope="col">Tracked value</th>
                <th scope="col">Vault history</th>
                <th scope="col">30-day swing</th>
                <th scope="col">24h APY</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((r) => (
                <tr key={r.vault.slug}>
                  <th scope="row">
                    <Link href={`/${r.vault.slug}`}>{bare(r.vault)}</Link>
                    <span className="eh-net">{r.vault.chain}</span>
                  </th>
                  <td>{cap(SINGULAR[r.type])}</td>
                  <td>{tvl(r.vault.tvl)}</td>
                  <td>{r.trackedDays ? r.ageLabel : "–"}</td>
                  <td>{r.stdev == null ? "–" : `±${r.stdev.toFixed(2)} pts`}</td>
                  <td>{apy(r.vault.apy24h)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {evidence[0] ? (
          <p>
            {`The largest funded ETH strategy was ${proseName(evidence[0].vault)}, holding ` +
              `${tvl(evidence[0].vault.tvl)} and tracked for ` +
              `${evidence[0].ageLabel}. A strategy that size has had its rate ` +
              `tested by real withdrawals, and it is also a larger target for attackers.`}
          </p>
        ) : null}
        <dl className="eh-defs">
          <dt>Vault history</dt>
          <dd>
            {`Counts the time since the vault contract’s first reading. Harvest vaults are ` +
              `upgradeable, so an older vault can run a newer strategy`}
            {hasOriginalVault
              ? ": ETH KPK Yield V2 is Harvest’s original ETH vault from October 2020, which now lends through KPK’s Morpho vault."
              : "."}
          </dd>
          <dt>30-day swing</dt>
          <dd>
            Measures the standard deviation of the daily rate. Under one point means the rate held
            steady all month; several points means the headline figure is a spike.
          </dd>
          <dt>Type</dt>
          <dd>
            {`Shows how many contracts sit between the ETH and the borrower. A plain money ` +
              `market has the fewest` +
              (mmFunded === 0
                ? `, though every money market in this index held under the liquidity floor, ` +
                  `so the fewest layers here also come with the least size`
                : "") +
              `, and the `}
            <Link href="/risk-framework">risk framework page</Link> covers every exposure.
          </dd>
        </dl>
        <Ask items={asks("safety")} />
      </Block>

      <Block
        id="calculator"
        eyebrow="Calculator"
        title="ETH yield calculator"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          `Pick an amount of ETH and any of the ${c.count} tracked ETH strategies, and the ` +
          `calculator works out a year of earnings in ETH from the rate on record.`
        }
      >
        <UsdcCalculator products={calcProducts} asOf={c.asOf} asset="ETH" defaultAmount={1} />
        <table className="eh-earn">
          <caption>
            A year of earnings, in ETH, before any rate change
          </caption>
          <thead>
            <tr>
              <th scope="col">Amount</th>
              <th scope="col">{`At ${apy(best.apy24h)} (${bare(best)})`}</th>
              <th scope="col">{`At the ${apy(c.medianApy)} median`}</th>
            </tr>
          </thead>
          <tbody>
            {[1, 10, 32].map((n) => (
              <tr key={n}>
                <th scope="row">{`${n} ETH`}</th>
                <td>{`${((n * best.apy24h) / 100).toFixed(4)} ETH`}</td>
                <td>{`${((n * c.medianApy) / 100).toFixed(4)} ETH`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Ask items={asks("calc")} />
      </Block>

      <Block
        id="how-to-start"
        eyebrow="Getting started"
        title="How to start earning yield on ETH"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          `Starting takes a handful of transactions, and on Base, where ${base?.count ?? 0} of ` +
          `the ${c.count} ETH strategies run, each one costs a few cents.`
        }
      >
        <ol className="eh-steps">
          <li>
            <strong>Choosing a network comes first.</strong> Base holds most of the funded ETH
            strategies; Ethereum mainnet costs more per transaction.
          </li>
          <li>
            <strong>Wrapping ETH into WETH takes one transaction</strong>, and it unwraps back to
            ETH at any time.
          </li>
          <li>
            <strong>Picking a strategy sets the rate and the risk.</strong> The safety table above
            shows each funded strategy&rsquo;s size, history and 30-day swing.
          </li>
          <li>
            <strong>Entering the position is one transaction in the Harvest app</strong>, which
            issues vault shares that grow as the strategy compounds.
          </li>
          <li>
            <strong>Withdrawing is open at any time</strong> the market underneath has unborrowed
            ETH to pay out, with no lockup or exit queue.
          </li>
        </ol>
        <p>
          <strong>What it costs.</strong>{" "}
          {`Harvest keeps a share of the yield each strategy harvests, ${HARVEST_FEE_TEXT}, ` +
            `split between a profit share and a platform fee set in each strategy contract. ` +
            `Every rate on this page is after it, so the APY ` +
            `shown is what the position earns. There is no fee to enter or leave a vault. Gas is ` +
            `paid on each transaction, and the looping strategy charges an entry cost the app ` +
            `shows before a position opens.`}
        </p>
      </Block>

      <Block
        id="vs-staking"
        eyebrow="Mechanism"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        title="ETH yield versus ETH staking"
        lead={STAKING_LEAD}
      >
        <p>
          A staked position earns from the protocol itself: new ETH issued to validators plus the
          fees and tips they collect. Getting out goes through Ethereum&rsquo;s validator exit
          queue, which can take days when many validators leave at once. Liquid staking tokens
          such as stETH skip the wait by letting the position trade, at whatever price the market
          offers that day.
        </p>
        <p>
          A lending position earns from borrowers. People borrow ETH to sell it short, to pay for
          a leveraged staking position, or to fund a trade, and the rate they pay rises when ETH
          is in demand and falls when it is not.{" "}
          <strong>Nothing here is staked, so nothing waits in the exit queue.</strong> A withdrawal waits only if the market underneath has lent out all of its ETH,
          which happens rarely and briefly, and the rate climbs until supply returns.
        </p>
        {staking ? (
          <p>
            <strong>The staking reference.</strong>{" "}
            {`${stakingReferenceText(c, staking)} Source: `}
            <a
              href={stakingSourceUrl(staking)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Lido stETH TokenRebased events
            </a>
            .
          </p>
        ) : null}
        <p>
          The two sources move independently, so a lending rate can sit above or below the
          staking rate on any given day. When the lending rate is higher, it is usually because
          leveraged traders are paying up for ETH, and that demand can disappear quickly.
        </p>
        <Ask items={asks("staking")} />
      </Block>

      <Block
        id="rate-stability"
        eyebrow="Stability"
        title="How steady ETH rates have been"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          c.stability.measuredCount
            ? `Across the ${c.stability.measuredCount} ETH strategies with a month of readings ` +
              `behind them, ${c.stability.steadyCount} had a 30-day swing (the standard deviation ` +
              `of the daily rate) under one point in the 30 days to ${c.asOf}.`
            : undefined
        }
      >
        {c.stability.steadiest && c.stability.mostVolatile ? (
          <p>
            {`Among strategies holding at least ${tvl(c.fundedFloor)}, the steadiest over the ` +
              `trailing 30 days was ${c.stability.steadiest.name}, with a standard deviation of ` +
              `${c.stability.steadiest.stdev.toFixed(2)} points around a mean of ` +
              `${apy(c.stability.steadiest.mean)}. The least steady was ` +
              `${c.stability.mostVolatile.name}, with a standard deviation of ` +
              `${c.stability.mostVolatile.stdev.toFixed(2)} points around a mean of ` +
              `${apy(c.stability.mostVolatile.mean)}.`}
          </p>
        ) : null}
        <p>
          ETH lending rates swing harder than stablecoin rates because ETH borrowing demand is
          tied to market direction: when traders want to short ETH or lever up staked ETH, they
          borrow at once, and the rate jumps. A steady rate is the more useful property for a
          position meant to sit, and the 30-day column in the table shows it at a glance.
        </p>
      </Block>

      <Block
        id="by-venue"
        eyebrow="By venue"
        title="ETH yield by protocol"
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={venueLead(venues)}
      >
        <ul className="uh-venues">
          {venues.map((v) => (
            <li key={`${v.venue}${v.loop ? "-loop" : ""}`}>
              {venueLine(v)}
            </li>
          ))}
        </ul>
        <p>
          Pooled markets such as <Link href="/aave">Aave</Link> and Compound set one rate for
          every lender from one utilisation curve, so their ETH rates sit close together and move
          slowly. Isolated markets on <Link href="/morpho">Morpho</Link> and Euler price each
          collateral separately, which spreads rates wider and keeps a bad collateral asset
          contained to the market that accepted it.
        </p>
      </Block>

      <Block
        id="risk-surfaces"
        eyebrow="Risk"
        title="Risks on every ETH yield strategy"
        lead={ETH_RISKS_LEAD}
      >
        <ul className="uh-risks">
          {ETH_RISKS.map((r) => (
            <li key={r.title}>
              <strong>{r.title}</strong>
              {r.parts.map((part, i) =>
                typeof part === "string" ? (
                  <Fragment key={i}>{part}</Fragment>
                ) : (
                  <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
                    {part.text}
                  </a>
                ),
              )}
            </li>
          ))}
        </ul>
        <p>
          Bridge, operator and governance risk, along with the tiers and exclusions, are on the{" "}
          <Link href="/risk-framework">risk framework page</Link>. The vault page for any row names
          the contracts a position touches.
        </p>
        <Ask items={asks("risk")} />
      </Block>

      {/* The questions are answered in the sections they belong to, where a
          reader meets them. This is the index: one list a reader can scan, each
          link opening its answer in place. A <nav>, because it is navigation and
          the answers already sit in the page once. */}
      <section className="uh-block eh-qindex" aria-labelledby="faq">
        <p className="rp-eyebrow">Questions</p>
        <h2 id="faq">Every ETH yield question on this page</h2>
        <nav aria-label="Questions answered on this page">
          <ol className="eh-qlist">
            {faqs.map((f) => (
              <li key={f.q}>
                <a href={`#${qid(f.q)}`}>{f.q}</a>
              </li>
            ))}
          </ol>
        </nav>
        {/* Opens the <details> a question link points at; without it the page
            scrolls to a closed answer. Plain script, no client bundle. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){function o(){var h=location.hash.slice(1);if(!h)return;" +
              "var d=document.getElementById(h);if(d&&d.tagName==='DETAILS')d.open=true;}" +
              "addEventListener('hashchange',o);o();})();",
          }}
        />
      </section>

      <Block
        id="full-index"
        eyebrow="Full index"
        title={`Full ETH index: all ${c.count} strategies`}
        asOf={c.asOf}
        asOfIso={c.asOfIso}
        lead={
          `All ${c.count} ETH strategies tracked here are listed below, sorted by 24-hour APY. ` +
          `The network and protocol filters narrow rows already on the page.`
        }
      >
        <HubTable
          vaults={c.all}
          sparklines={sparklines}
          scopeLabel="ETH strategies"
          metrics
          venueLabel="Protocol"
        />
      </Block>

      <Block
        id="scope"
        eyebrow="Scope"
        title="Which strategies this ranking includes"
        lead="The ranking covers the ETH yield strategies Harvest has vetted and integrated, which is a subset of the places ETH can earn yield."
      >
        <p>
          Strategies are added as they are vetted and integrated, and dropped when the product
          behind them retires or fails the risk framework. Solo staking, liquid staking tokens
          held on their own and centralised exchange products are outside it. The inclusion rules
          are on the <Link href="/methodology">methodology page</Link>.
        </p>
        <p className="eh-whose">
          {`Every rate here is the APY of a Harvest vault built on the named protocol, after ` +
            `Harvest's fee on harvested yield, which as of ${c.asOf} was ${HARVEST_FEE_TEXT}, so ` +
            `it can differ from the rate ` +
            `in that protocol's own app. `}
          <strong>Autopilot is Harvest&rsquo;s own allocator</strong>, which moves ETH between
          lending venues as their rates change. Liquid staking tokens such as stETH and rETH are
          not ranked here.
        </p>
      </Block>

      <section className="uni-hub-cta-row">
        <p className="uni-hub-cta-meta">
          Looking for a specific chain? Network ranking pages cut the same data by network.
        </p>
        <div className="uni-hub-cta-links">
          {visibleChains.slice(0, 6).map((chain) => (
            <Link key={chain} href={`/${chain.toLowerCase()}`} className="uni-hub-cta-pill">
              <ChainIcon chain={chain} size={14} />
              {chain}
            </Link>
          ))}
        </div>
      </section>

      <RankingDataNote sortedBy="24-hour APY, highest first" />
    </div>
  );
}
