-- casino_calculator_events
--
-- Usage of the bonus calculator on /best-crypto-casino-bonus. Its own table,
-- for the same reason richlist_calculator_events is separate from the funnels:
-- a tool being used is not a visit and not an outbound click, and folding it
-- into either would move a number somebody reads for a different question.
--
-- Two events: 'view' when the calculator renders, once per page load, and
-- 'calculate' when the reader presses the button. The third step, leaving for
-- the casino, is already in report_outbound_clicks with a venue_ref that says
-- the click came from the calculator.
--
-- WHAT IS NOT RECORDED: the amount typed. There is no column for it and there
-- should not be one. A budget is a fact about a person's money, and a list of
-- them beside a session id and a timestamp is a different kind of data from
-- "somebody used the calculator". The venue slug is here, because which offers
-- people price is a question about the ranking.
--
-- Security model mirrors the other analytics tables: the public site inserts
-- with the anon (publishable) key; the Control Room reads with an
-- authenticated session. Run this once in the Supabase SQL editor.

create table if not exists public.casino_calculator_events (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  session_id   text,
  event        text,              -- 'view' | 'calculate'
  venue        text,              -- casino slug, e.g. lucky-rollers
  source_page  text,              -- /best-crypto-casino-bonus
  source       text,              -- referrer-derived acquisition source
  country      text,
  city         text,
  device_type  text,
  os           text,
  browser      text,
  user_agent   text,
  is_bot       boolean
);

-- The panel reads one page's rows newest-first, so the filter and the sort
-- belong in the same index.
create index if not exists casino_calculator_events_page_created_at_idx
  on public.casino_calculator_events (source_page, created_at desc);

alter table public.casino_calculator_events enable row level security;

-- Anonymous visitors may INSERT only (no read/update/delete).
drop policy if exists "casino_calculator_events anon insert"
  on public.casino_calculator_events;
create policy "casino_calculator_events anon insert"
  on public.casino_calculator_events
  for insert
  to anon
  with check (true);

-- Authenticated Control Room sessions may read.
drop policy if exists "casino_calculator_events authenticated read"
  on public.casino_calculator_events;
create policy "casino_calculator_events authenticated read"
  on public.casino_calculator_events
  for select
  to authenticated
  using (true);
