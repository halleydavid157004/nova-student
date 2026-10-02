begin;
-- Restore the Phase 2 report function (reports no longer hide offers).
create or replace function public.nova_submit_report(offer_id bigint,reporter text,report_reason text) returns jsonb
language plpgsql set search_path='' as $$
declare existing bigint;
begin
 if reporter !~ '^[a-f0-9]{64}$' or report_reason not in ('expired','changed','broken','worked') then raise exception 'Invalid report'; end if;
 if not exists(select 1 from nova_private.offers o where o.id=offer_id and o.status='active' and (o.official or o.reviewed) and (o.expires_at is null or o.expires_at>now()) and coalesce(o.liveness_verified_at,o.verified_at,o.discovered_at)>now()-make_interval(days=>(select max_age_days from nova_private.validation_settings where id=1))) then raise exception 'Offer not published'; end if;
 perform pg_advisory_xact_lock(hashtextextended(reporter,71002));
 select id into existing from nova_private.reports r where r.reporter_hash=reporter and r.offer_id=nova_submit_report.offer_id and created_at>now()-interval '24 hours' limit 1;
 if existing is not null then return jsonb_build_object('ok',true,'duplicate',true); end if;
 if (select count(*) from nova_private.reports where reporter_hash=reporter and created_at>now()-interval '24 hours')>=3 then return jsonb_build_object('limited',true); end if;
 insert into nova_private.reports(offer_id,reporter_hash,reason,weight) values(offer_id,reporter,report_reason,1);
 return jsonb_build_object('ok',true);
end $$;
notify pgrst,'reload schema';
commit;
