-- AI traffic audit over frontpage_visits and outbound_clicks.
--
-- Read-only: every block is a single SELECT. Run each block on its own in the
-- Supabase SQL editor (the editor shows the last result only). Window: 180 days.
--
-- Scope. frontpage_visits is written by browser JavaScript, so it sees:
--   * people who clicked through from an AI assistant's answer (blocks 1-4, 6)
--   * agents that drive a real browser, if their user agent says so (block 5)
-- It does NOT see agents that fetch pages without running JavaScript, which is
-- how ChatGPT, Perplexity and Claude read pages, llms.txt and /data/*.json while
-- answering. Those requests exist only in Vercel's edge logs.
--
-- Assistant classification is broader than the control room's AI channel
-- (src/lib/channels.ts knows ChatGPT, Perplexity, Claude, Gemini and Minara).
-- Block 2's `stored_source` shows where the control room currently files each.


-- 1. AI-referred human sessions per week, by assistant ------------------------
with v as (
  select session_id, created_at, page_path, referrer, utm_source, source, is_bot,
         lower(substring(referrer from '^[a-z]+://([^/?#:]+)')) as ref_host
  from frontpage_visits
  where created_at > now() - interval '180 days' and session_id is not null
),
s as (
  select distinct on (session_id) * from v order by session_id, created_at
),
a as (
  select s.*, case
    when ref_host ~ '(^|\.)(chatgpt\.com|openai\.com)$' or utm_source ~* 'chatgpt|openai' then 'ChatGPT'
    when ref_host ~ '(^|\.)perplexity\.ai$' or utm_source ~* 'perplexity' then 'Perplexity'
    when ref_host ~ '(^|\.)(claude\.ai|anthropic\.com)$' or utm_source ~* 'claude' then 'Claude'
    when ref_host ~ '^(gemini|bard)\.google\.com$' or utm_source ~* 'gemini' then 'Gemini'
    when ref_host in ('copilot.microsoft.com', 'copilot.cloud.microsoft') or utm_source ~* 'copilot' then 'Copilot'
    when ref_host ~ '(^|\.)(grok\.com|x\.ai)$' or utm_source ~* 'grok' then 'Grok'
    when ref_host ~ '(^|\.)deepseek\.com$' or utm_source ~* 'deepseek' then 'DeepSeek'
    when ref_host ~ '(^|\.)meta\.ai$' then 'Meta AI'
    when ref_host ~ '(^|\.)mistral\.ai$' then 'Mistral'
    when ref_host ~ '(^|\.)you\.com$' then 'You.com'
    when ref_host ~ '(^|\.)phind\.com$' then 'Phind'
    when ref_host ~ '(^|\.)poe\.com$' then 'Poe'
    when ref_host ~ 'minara' or utm_source ~* 'minara' then 'Minara'
  end as assistant
  from s
)
select date_trunc('week', created_at)::date as week, assistant, count(*) as sessions
from a
where assistant is not null and not coalesce(is_bot, false)
group by 1, 2
order by 1 desc, 3 desc;


-- 2. Totals per assistant, share of all human sessions, and where the
--    control room files them today ----------------------------------------------
with v as (
  select session_id, created_at, page_path, referrer, utm_source, source, is_bot,
         lower(substring(referrer from '^[a-z]+://([^/?#:]+)')) as ref_host
  from frontpage_visits
  where created_at > now() - interval '180 days' and session_id is not null
),
s as (
  select distinct on (session_id) * from v order by session_id, created_at
),
a as (
  select s.*, case
    when ref_host ~ '(^|\.)(chatgpt\.com|openai\.com)$' or utm_source ~* 'chatgpt|openai' then 'ChatGPT'
    when ref_host ~ '(^|\.)perplexity\.ai$' or utm_source ~* 'perplexity' then 'Perplexity'
    when ref_host ~ '(^|\.)(claude\.ai|anthropic\.com)$' or utm_source ~* 'claude' then 'Claude'
    when ref_host ~ '^(gemini|bard)\.google\.com$' or utm_source ~* 'gemini' then 'Gemini'
    when ref_host in ('copilot.microsoft.com', 'copilot.cloud.microsoft') or utm_source ~* 'copilot' then 'Copilot'
    when ref_host ~ '(^|\.)(grok\.com|x\.ai)$' or utm_source ~* 'grok' then 'Grok'
    when ref_host ~ '(^|\.)deepseek\.com$' or utm_source ~* 'deepseek' then 'DeepSeek'
    when ref_host ~ '(^|\.)meta\.ai$' then 'Meta AI'
    when ref_host ~ '(^|\.)mistral\.ai$' then 'Mistral'
    when ref_host ~ '(^|\.)you\.com$' then 'You.com'
    when ref_host ~ '(^|\.)phind\.com$' then 'Phind'
    when ref_host ~ '(^|\.)poe\.com$' then 'Poe'
    when ref_host ~ 'minara' or utm_source ~* 'minara' then 'Minara'
  end as assistant
  from s
),
humans as (select * from a where not coalesce(is_bot, false))
select assistant,
       count(*) as sessions,
       round(100.0 * count(*) / nullif((select count(*) from humans), 0), 2) as pct_of_human_sessions,
       min(created_at)::date as first_seen,
       max(created_at)::date as last_seen,
       mode() within group (order by source) as stored_source
from humans
where assistant is not null
group by 1
order by 2 desc;


-- 3. Where AI-referred people land --------------------------------------------
with v as (
  select session_id, created_at, page_path, referrer, utm_source, is_bot,
         lower(substring(referrer from '^[a-z]+://([^/?#:]+)')) as ref_host
  from frontpage_visits
  where created_at > now() - interval '180 days' and session_id is not null
),
s as (
  select distinct on (session_id) * from v order by session_id, created_at
),
a as (
  select s.*, (
    ref_host ~ '(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|anthropic\.com|grok\.com|x\.ai|deepseek\.com|meta\.ai|mistral\.ai|you\.com|phind\.com|poe\.com)$'
    or ref_host ~ '^(gemini|bard)\.google\.com$'
    or ref_host in ('copilot.microsoft.com', 'copilot.cloud.microsoft')
    or ref_host ~ 'minara'
    or utm_source ~* 'chatgpt|openai|perplexity|claude|gemini|copilot|grok|deepseek|minara'
  ) as from_ai
  from s
)
select page_path as landing_page, count(*) as ai_sessions
from a
where from_ai and not coalesce(is_bot, false)
group by 1
order by 2 desc
limit 40;


-- 4. Do AI-referred people click into the app, compared with everyone else ----
with v as (
  select session_id, created_at, referrer, utm_source, is_bot,
         lower(substring(referrer from '^[a-z]+://([^/?#:]+)')) as ref_host
  from frontpage_visits
  where created_at > now() - interval '180 days' and session_id is not null
),
s as (
  select distinct on (session_id) * from v order by session_id, created_at
),
a as (
  select s.*, coalesce((
    ref_host ~ '(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|anthropic\.com|grok\.com|x\.ai|deepseek\.com|meta\.ai|mistral\.ai|you\.com|phind\.com|poe\.com)$'
    or ref_host ~ '^(gemini|bard)\.google\.com$'
    or ref_host in ('copilot.microsoft.com', 'copilot.cloud.microsoft')
    or ref_host ~ 'minara'
    or utm_source ~* 'chatgpt|openai|perplexity|claude|gemini|copilot|grok|deepseek|minara'
  ), false) as from_ai
  from s
  where not coalesce(is_bot, false)
),
clicked as (
  select distinct session_id from outbound_clicks
  where created_at > now() - interval '180 days' and session_id is not null
)
select case when from_ai then 'AI-referred' else 'everyone else' end as cohort,
       count(*) as sessions,
       count(c.session_id) as sessions_clicking_into_app,
       round(100.0 * count(c.session_id) / nullif(count(*), 0), 2) as click_rate_pct
from a
left join clicked c using (session_id)
group by 1
order by 1;


-- 5. Agents and crawlers that ran our JavaScript ------------------------------
--    Every row here executed the tracker, so plain fetchers are absent by
--    construction. Not limited to is_bot: an agent browser may not be flagged.
select * from (
select case
         when user_agent ~* 'ChatGPT-User'      then 'ChatGPT-User (answer-time fetch)'
         when user_agent ~* 'OAI-SearchBot'     then 'OAI-SearchBot'
         when user_agent ~* 'GPTBot'            then 'GPTBot (training)'
         when user_agent ~* 'Perplexity-User'   then 'Perplexity-User'
         when user_agent ~* 'PerplexityBot'     then 'PerplexityBot'
         when user_agent ~* 'Claude-User'       then 'Claude-User'
         when user_agent ~* 'Claude-SearchBot'  then 'Claude-SearchBot'
         when user_agent ~* 'ClaudeBot|anthropic' then 'ClaudeBot'
         when user_agent ~* 'MistralAI-User'    then 'MistralAI-User'
         when user_agent ~* 'DuckAssistBot'     then 'DuckAssistBot'
         when user_agent ~* 'meta-externalagent|meta-externalfetcher' then 'Meta AI agent'
         when user_agent ~* 'Bytespider'        then 'Bytespider'
         when user_agent ~* 'CCBot'             then 'CCBot'
         when user_agent ~* 'Amazonbot'         then 'Amazonbot'
         when user_agent ~* 'Applebot'          then 'Applebot'
         when user_agent ~* 'Googlebot|Google-InspectionTool' then 'Googlebot'
         when user_agent ~* 'bingbot'           then 'Bingbot'
         when user_agent ~* 'HeadlessChrome'    then 'HeadlessChrome (unnamed automation)'
         when is_bot                            then 'other flagged bot'
       end as agent,
       count(*) as page_views,
       count(distinct page_path) as distinct_pages,
       min(created_at)::date as first_seen,
       max(created_at)::date as last_seen
from frontpage_visits
where created_at > now() - interval '180 days'
group by 1
) agents
where agent is not null
order by page_views desc;


-- 6. Gap finder: top referrer hosts not classified as AI above ----------------
--    Scan this for assistants the list misses.
with v as (
  select session_id, created_at, referrer, source, is_bot,
         lower(substring(referrer from '^[a-z]+://([^/?#:]+)')) as ref_host
  from frontpage_visits
  where created_at > now() - interval '180 days' and session_id is not null
),
s as (
  select distinct on (session_id) * from v order by session_id, created_at
)
select ref_host, count(*) as sessions, mode() within group (order by source) as stored_source
from s
where ref_host is not null
  and ref_host !~ '(^|\.)harvest\.finance$'
  and not coalesce(is_bot, false)
  and not (
    ref_host ~ '(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|anthropic\.com|grok\.com|x\.ai|deepseek\.com|meta\.ai|mistral\.ai|you\.com|phind\.com|poe\.com)$'
    or ref_host ~ '^(gemini|bard)\.google\.com$'
    or ref_host in ('copilot.microsoft.com', 'copilot.cloud.microsoft')
    or ref_host ~ 'minara'
  )
group by 1
order by 2 desc
limit 60;


-- 7. utm_source values seen (ChatGPT tags its links utm_source=chatgpt.com) ---
select utm_source, count(distinct session_id) as sessions
from frontpage_visits
where created_at > now() - interval '180 days' and utm_source is not null
group by 1
order by 2 desc
limit 40;
