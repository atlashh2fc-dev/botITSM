-- Production history compatibility marker.
--
-- supabase-crimson-village records this logical migration as 20260810180030,
-- while an earlier repository clone recorded the identical SQL under
-- 20260810175405. The original statements were 5,571 bytes with MD5
-- 0dad664af03fca3ae7d609cf784554c7 in both locations.
--
-- The legacy migration remains present and is idempotent. This marker lets new,
-- legacy, and production histories converge without re-creating the tables.
do $migration$
begin
  if to_regclass('public.telephony_calls') is null
     or to_regclass('public.telephony_events') is null then
    raise exception using
      message = 'telephony schema missing before history reconciliation',
      hint = 'Apply 20260810175405_telephony_call_ingestion.sql first.';
  end if;
end
$migration$;
