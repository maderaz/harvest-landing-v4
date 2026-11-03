import { FunnelSummary } from "@/components/admin/funnel-summary";

// Admin > Social Summary. The social funnel - the same chart, funnel stats,
// filters and session table as the SEO and AI Summaries, scoped to sessions
// a social network or messenger brought in (X, Reddit, Telegram, Discord,
// Facebook, Instagram, LinkedIn, TikTok...). Links opened inside those apps
// count too: their in-app browsers are decoded from the referrer.

// The rich list draws most of the X traffic, so both language versions keep
// their own legend entry in the landing breakdown.
const SOCIAL_PINNED_LANDINGS = ["/xrp-rich-list", "/ko/xrp-rich-list"];

export default function SocialSummaryPage() {
  return (
    <FunnelSummary
      group="Social"
      botExport
      pinLandings={SOCIAL_PINNED_LANDINGS}
      copy={{
        title: "Social Summary",
        description:
          "The social funnel at a glance: of the people the index acquired from a social network or messenger (X, Reddit, Telegram, Discord, Facebook, Instagram, LinkedIn, TikTok and others), how many crossed into app.harvest.finance and how many deposited. Links opened inside those apps count too. Every stage, the chart, and the table below are scoped to the same social sessions. The table lists one row per session; expand a row to see that session's actions.",
        acquiredLabel: "Acquired via social",
        engineFilterLabel: "Social network filter",
        engineHint:
          "Social network or messenger the session came through (X, Reddit, Telegram, Discord, Facebook, Instagram, LinkedIn, TikTok...). Multi-touch: a session is listed under every network that touched it, so picking one shows all sessions it appeared in - not only the ones it acquired first. Only social-touched sessions appear on this page. X / Twitter covers every link opened inside X: posts, replies, DMs and Grok answers in the X app all arrive the same way.",
        stageHint:
          "Funnel stage in view: Acquired (landed from a social network), Reached app (clicked through to the app), or Deposited. The chart and table follow the chosen stage.",
        isolateHint:
          "Hides social sessions that first landed on the homepage (/), leaving only the ones where a shared link dropped the visitor straight onto a content page - e.g. /xrp-rich-list, /usdc, /usdc-autopilot-base. Those are the pages people are actually passing around. Use it to see which pages get shared and how they convert on their own, separate from people who arrive at the homepage and browse in.",
        sampleEngines: ["X / Twitter", "Reddit", "Telegram", "Discord"],
        sampleDomains: {
          "X / Twitter": "t.co",
          Reddit: "reddit.com",
          Telegram: "t.me",
          Discord: "discord.com",
        },
      }}
    />
  );
}
