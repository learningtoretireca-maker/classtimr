-- Timr's events for the suite's daily tallies (Tom 2026-10-26). Applied by
-- hand through the Supabase MCP to the classhelpr project
-- (wngamnvtotzuyiohtakc); this repo has no Supabase CLI setup.
--
-- suite_usage_daily and bump_suite_usage came with ClassMapr
-- (classmapr: supabase/migrations/20261026120000_suite_usage_daily.sql), which
-- left Timr's branch with an empty list. This fills it in and changes nothing
-- else: Mapr's branch, the Origin check and the insert are copied as they
-- stand live. Whoever replaces this function next copies both lists.
--
-- The same list sits in TIMR_EVENTS in index.html (section 0). A theme counts
-- only once it is named here, so a new monthly theme needs a migration too.

create or replace function public.bump_suite_usage(p_app text, p_event text)
returns boolean
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_origin text := coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'origin',
    ''
  );
  v_local boolean := v_origin ~ '^http://localhost(:[0-9]{1,5})?$';
begin
  if p_app = 'mapr' then
    if not (v_local or v_origin = 'https://mapr.classhelpr.com') then
      return false;
    end if;
    if p_event is null or not (p_event = any (array[
      'active-day-free', 'active-day-pro',
      'active-week-free', 'active-week-pro',
      'active-month-free', 'active-month-pro',
      'landing-shown', 'first-room-created', 'room-opened',
      'groups-made', 'jobs-assigned',
      'full-screen-groups', 'full-screen-jobs',
      'export', 'shuffle', 'auto-fill', 'bulk-shuffle',
      'seating-rule-added', 'pick-a-name'
    ])) then
      return false;
    end if;
  elsif p_app = 'timr' then
    if not (v_local or v_origin = 'https://timr.classhelpr.com') then
      return false;
    end if;
    if p_event is null or not (p_event = any (array[
      'active-day', 'active-week', 'active-month',
      'timer-started-preset', 'timer-started-custom', 'timer-finished',
      'stopwatch-started', 'clock-shown',
      'noise-meter-on', 'voice-bar-on',
      'full-screen', 'pop-out',
      'theme-leaves', 'theme-candles', 'theme-space', 'theme-ocean',
      'theme-cyber', 'theme-biolum', 'theme-kelp', 'theme-dna', 'theme-koi',
      'theme-magnetic', 'theme-neural', 'theme-hadron', 'theme-quantum'
    ])) then
      return false;
    end if;
  else
    return false;
  end if;

  insert into public.suite_usage_daily as u (day, app, event, count)
  values ((now() at time zone 'America/Edmonton')::date, p_app, p_event, 1)
  on conflict (day, app, event) do update set count = u.count + 1;

  return true;
end
$$;

-- create or replace keeps the existing grants; restated so this file alone
-- says who may call it.
revoke all on function public.bump_suite_usage(text, text) from public, anon, authenticated;
grant execute on function public.bump_suite_usage(text, text) to anon, authenticated;
