import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { loadCasinos } from "@/lib/crypto-casinos-data";
import { casinoScore, isVerified } from "@/lib/crypto-casinos";
import { AssetIcon } from "@/components/token-icons";
import { ReportToc, type TocItem } from "@/components/report/report-toc";
import { CasinoTable } from "@/components/casinos/casino-table";
import { WageringCalculator } from "@/components/casinos/wagering-calculator";
import { breadcrumbSchema, faqPageSchema } from "@/lib/jsonld";
import "../_styles/home.css";
import "../_styles/report.css";
import "../_styles/crypto-casinos.css";

const PAGE_URL = `${SITE_URL}/crypto-casinos`;

const HERO_COINS = ["BTC", "ETH", "USDT"];

const TOC_ITEMS: TocItem[] = [
  { id: "ranking", label: "The listing" },
  { id: "bonus-calculator", label: "Bonus calculator" },
  { id: "methodology", label: "How it is ranked" },
  { id: "faq", label: "FAQ" },
  { id: "disclosure", label: "Disclosure" },
];

// Build-time, so the stamp cannot drift from the deploy that produced it.
const UPDATED = new Date().toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

// noindex until at least one venue has been checked AND has a link. A list of
// welcome-bonus copy with nothing verified is the same page as every other
// listicle, and there is no reason for it to be indexed as a third one. The
// flag clears itself when the first row is real.
export function generateMetadata(): Metadata {
  const ready = loadCasinos().casinos.some((c) => c.url && isVerified(c));
  return {
  title: "Crypto Casinos: TOP20 Ranked by Welcome Bonus",
  description:
    "The 20 largest advertised crypto casino welcome bonuses, ranked by the size of the offer, with the playthrough priced so you can see what each one is actually worth.",
  alternates: { canonical: PAGE_URL },
  robots: ready ? undefined : { index: false, follow: true },
  openGraph: {
    title: "Crypto Casinos: TOP20 Ranked by Welcome Bonus",
    description:
      "The 20 largest advertised crypto casino welcome bonuses, ranked by offer size, with the playthrough priced.",
    url: PAGE_URL,
    siteName: SITE_NAME,
    type: "website",
  },
  };
}

const FAQS = [
  {
    q: "What is a crypto casino?",
    a: "An online casino that takes wagers in cryptocurrency rather than in bank-processed currency. Balances are funded by an on-chain transfer and withdrawals are paid back to a wallet address. The games are the same ones a currency casino runs; what changes is the payment rail, and with it the speed of a withdrawal and how much identity checking sits in front of it.",
  },
  {
    q: "Are crypto casinos legal?",
    a: "It depends entirely on where you are. Online gambling is licensed and regulated in some jurisdictions, restricted to state operators in others, and prohibited in several. Most crypto casinos hold an offshore licence and block a list of countries at sign-up. Check the law where you live before you play, and check that list before you register.",
  },
  {
    q: "What does provably fair mean?",
    a: "A scheme where the casino commits to a hashed server seed before a round, combines it with a seed you control, and publishes both afterwards so the outcome can be recomputed. It proves the result was not changed after the bet was placed. It does not remove the house edge, and it says nothing about whether the operator will pay a withdrawal.",
  },
  {
    q: "Which crypto casinos do not require KYC?",
    a: "Some venues take no identity documents at sign-up and ask only above a withdrawal threshold; others ask for nothing at all. The policy is the operator's choice and it changes without notice, which is why each row here records the threshold and the date the terms were read. A venue advertising no KYC can still request documents on a large withdrawal.",
  },
  {
    q: "Why does a bonus with a high wagering requirement cost money?",
    a: "A playthrough requirement obliges a multiple of the bonus to be wagered before any of it can be withdrawn, and every one of those wagers meets the game's house edge, so the turnover has an expected cost. A 200% bonus at 60x playthrough can be worth less than a 50% bonus at 20x once that cost is priced, which is what the calculator on this page works out.",
  },
  {
    q: "How fast are crypto casino withdrawals?",
    a: "Faster than bank rails when nothing is flagged, because payment is an on-chain transfer rather than a card refund. The variable is not the chain but the operator: whether a withdrawal is auto-approved or queued for manual review, and at what size that review starts. That is what the withdrawal column records.",
  },
];

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="uni-home-hero-stat">
      <span className="uni-home-hero-stat-label">{label}</span>
      <span className="uni-home-hero-stat-value">{value}</span>
    </div>
  );
}

export default function CryptoCasinosPage() {
  const { casinos } = loadCasinos();
  const listed = casinos.length;
  const checked = casinos.filter((c) => casinoScore(c) != null).length;
  const linked = casinos.filter((c) => c.url).length;
  const claimNoKyc = casinos.filter((c) => c.claimed.noKyc).length;
  const claimInstant = casinos.filter((c) => c.claimed.instantWithdrawal).length;
  // TOP20 is the promise in the title, so it is what the table renders. The
  // rest stay in the data file rather than on the page.
  const ranked = casinos.slice(0, 20);

  const jsonLd: object[] = [
    breadcrumbSchema([
      { name: "Home", url: SITE_URL },
      { name: "Crypto Casinos", url: PAGE_URL },
    ]),
    faqPageSchema(FAQS),
  ];
  if (listed > 0) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Crypto casinos ranked by payout terms",
      numberOfItems: listed,
      itemListElement: casinos.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        url: c.url,
      })),
    });
  }

  return (
    <div className="uni-home-test rp-page cc-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="uni-home-hero rp-hero">
        <div className="uni-home-hero-inner">
          <div className="rp-hero-tokens" aria-hidden="true">
            {HERO_COINS.map((t, i) => (
              <span
                key={t}
                className="rp-hero-tok"
                style={{ marginLeft: i ? -4 : 0, zIndex: HERO_COINS.length - i }}
              >
                <AssetIcon asset={t} size={13} />
              </span>
            ))}
          </div>
          <h1 className="uni-home-h1">
            Crypto Casinos: TOP20 Ranked by Welcome Bonus
          </h1>
          <p className="uni-home-sub">
            The twenty largest welcome bonuses advertised by crypto casinos,
            ordered by the size of the offer. A headline figure is not the same
            as money, so the calculator below prices each one against its
            playthrough, and every row says which of its terms have been read
            and which are still the venue&rsquo;s own wording.
          </p>
          {/* .uni-home-hero-stat is a designed card in home.css that nothing
              had used yet: translucent white, which is what it wants on the
              gold hero. The fourth number is the point of the page, and it
              says zero until the checking is done. */}
          {listed > 0 && (
            <div className="uni-home-hero-stats">
              <HeroStat label="Bonuses ranked" value={ranked.length} />
              <HeroStat label="Venues tracked" value={listed} />
              <HeroStat label="Advertise no KYC" value={claimNoKyc} />
              <HeroStat label="Independently checked" value={checked} />
            </div>
          )}
          <p className="rp-updated">Last updated {UPDATED}</p>
          <div className="uni-home-hero-actions">
            <a href="#ranking" className="uni-home-cta-primary">
              See the ranking
              <span aria-hidden="true">↓</span>
            </a>
            <a href="#bonus-calculator" className="uni-home-cta-secondary">
              Bonus calculator
              <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
      </section>

      <main className="uni-home-shell">
        <div className="rp-doc">
          <div className="rp-doc-main">
            {/* The jump nav lives here rather than in the hero: its link
                styling is scoped to .uni-home-content, and below 1080px the
                sticky rail is hidden so this is the only nav on the page. */}
            <div className="uni-home-content cc-navwrap">
              <nav className="rp-toc" aria-label="On this page">
                <span className="rp-toc-label">On this page</span>
                {TOC_ITEMS.map((t) => (
                  <a key={t.id} href={`#${t.id}`}>
                    {t.label}
                  </a>
                ))}
              </nav>
            </div>

            {/* Above the ranking, not in the footer. */}
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
                <a
                  href="https://www.begambleaware.org/"
                  rel="nofollow noopener noreferrer"
                  target="_blank"
                >
                  BeGambleAware
                </a>
                ,{" "}
                <a
                  href="https://www.gamblersanonymous.org/"
                  rel="nofollow noopener noreferrer"
                  target="_blank"
                >
                  Gamblers Anonymous
                </a>
                . In the US, call or text 1-800-GAMBLER.
              </p>
              <p>
                Online gambling is restricted or prohibited in many
                jurisdictions. Checking the law where you live is your
                responsibility, before registering anywhere on this page.
              </p>
            </aside>

            <section className="uni-home-content" aria-labelledby="ranking">
              <p className="rp-eyebrow">Ranking</p>
              <h2 id="ranking">The 20 biggest crypto casino welcome bonuses</h2>
              <p>
                {listed === 0
                  ? "No venues are listed yet."
                  : `Ordered by the size of the advertised welcome bonus, largest first: ${ranked.length} of the ${listed} venues tracked. Offers capped in dollars rank on the cap; offers capped in BTC or ETH, or with no cap stated, rank below them on the match percentage, because converting a crypto cap needs a rate this page has no feed for.`}
              </p>
              {listed > 0 && checked < listed ? (
                <p className="cc-state">
                  The chips and the bullets on each row are the venue&rsquo;s
                  own wording, reproduced as claims. &ldquo;Instant
                  withdrawals&rdquo; and &ldquo;no KYC&rdquo; are advertising
                  until somebody reads the terms, and the verified block inside
                  each row says &ldquo;not checked&rdquo; until they have been.
                  {linked === 0 ? " No outbound links are live yet." : null}
                  {" "}A bigger headline is not a better offer: the calculator
                  below is what tells the two apart.
                </p>
              ) : null}
              <CasinoTable casinos={ranked} />
            </section>

            <section className="uni-home-content" aria-labelledby="bonus-calculator">
              <p className="rp-eyebrow">Calculator</p>
              <h2 id="bonus-calculator">What a bonus actually costs</h2>
              <p>
                A welcome bonus is not money until it has been wagered through
                its playthrough requirement, and every one of those wagers meets
                the house edge. This prices that.
              </p>
              <WageringCalculator />
            </section>

            <section className="uni-home-content" aria-labelledby="methodology">
              <p className="rp-eyebrow">Method</p>
              <h2 id="methodology">How the order and the score are built</h2>
              <p>
                <strong>The order is the bonus.</strong> Rows are sorted by the
                largest welcome bonus the venue advertises, read from its own
                headline. Where a headline bundles several offers, the cap is
                taken from the percentage that introduces it rather than from
                the first figure in the line, so a prize pool or a cashback
                rate is not mistaken for the welcome bonus. USDT is treated as
                a dollar and EUR as near enough to one. A cap in BTC or ETH is
                not converted, because this page has no price feed behind it,
                so those offers sort below the dollar-capped ones on their
                match percentage instead.
              </p>
              <p>
                <strong>The score is something else, and it is not the sort.</strong>{" "}
                Two kinds of information sit on this page and they are never
                mixed. What a venue advertises is reproduced as a claim, in its
                own words. What the score runs on is read off the venue&rsquo;s
                terms or its regulator, and a venue nobody has read scores
                nothing rather than scoring well on its own marketing. It
                appears as its own column once there is anything in it.
              </p>
              <p>
                A bigger headline is not a better offer. A 350% bonus behind a
                60x playthrough can be worth less than a 100% bonus at 20x, and
                the calculator above is the only thing on this page that tells
                the two apart. Out of 100, from checked facts only, so any
                scored row can be recomputed from the table.
              </p>
              <ul className="cc-method">
                <li>
                  <strong>Licence, up to 25.</strong> A named authority with a
                  published licence number scores full marks; an authority named
                  without a number scores 18; nothing published scores zero.
                </li>
                <li>
                  <strong>KYC threshold, up to 20.</strong> No documents scores
                  20, documents on withdrawal scores 12, documents at sign-up
                  scores 4.
                </li>
                <li>
                  <strong>Withdrawal speed, up to 25.</strong> Instant scores 25,
                  under an hour 20, same day 12, longer 4.
                </li>
                <li>
                  <strong>Provable fairness, 15.</strong> Awarded when the venue
                  publishes a verifiable seed scheme.
                </li>
                <li>
                  <strong>Playthrough, up to 15.</strong> A requirement of 20x or
                  under scores 15, up to 35x scores 11, up to 50x scores 6, above
                  that scores nothing. No bonus at all scores 7, because no bonus
                  beats a bonus that cannot be cleared.
                </li>
              </ul>
              <p>
                Bonus size is deliberately not scored. A headline figure behind a
                60x playthrough is worth less than a small one at 20x, and
                sorting on the headline is what every competing list does.
              </p>
              <p>
                Terms change without notice. Each row carries the date its terms
                were last read, and that date is the only claim made about how
                current it is.
              </p>
            </section>

            <section className="uni-home-content" aria-labelledby="faq">
              <p className="rp-eyebrow">FAQ</p>
              <h2 id="faq">Crypto casino questions</h2>
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
            </section>

            <section className="uni-home-content" aria-labelledby="disclosure">
              <p className="rp-eyebrow">Disclosure</p>
              <h2 id="disclosure">How this page is funded</h2>
              <p>
                Links to the venues on this page are commercial. {SITE_NAME} may
                be paid when a reader registers through one, and that payment
                does not change the score: the score runs on the published facts
                in the table, and its formula is above in full.
              </p>
              <p>
                Nothing here is a recommendation to gamble, and none of it is
                financial advice. For what {SITE_NAME} otherwise does, see the{" "}
                <Link href="/methodology">methodology</Link> behind the yield
                rankings and the{" "}
                <Link href="/risk-framework">risk framework</Link>.
              </p>
            </section>
          </div>

          <aside className="rp-doc-aside" aria-label="On this page">
            <ReportToc items={TOC_ITEMS} />
          </aside>
        </div>
      </main>
    </div>
  );
}
