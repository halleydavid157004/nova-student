begin;
-- Fase 13: two different people reporting a published offer as expired, changed or broken
-- (more than those who say it worked, last 14 days) take it off the catalog at once. It goes
-- back to 'pending' with a review event: a person approves it again from the panel after a
-- fresh check. Automatic approval skips offers with pending reports.
create or replace function public.nova_submit_report(offer_id bigint,reporter text,report_reason text) returns jsonb
language plpgsql set search_path='' as $$
declare existing bigint; negative integer; positive integer; hidden nova_private.offers;
begin
 if reporter !~ '^[a-f0-9]{64}$' or report_reason not in ('expired','changed','broken','worked') then raise exception 'Invalid report'; end if;
 if not exists(select 1 from nova_private.offers o where o.id=offer_id and o.status='active' and (o.official or o.reviewed) and (o.expires_at is null or o.expires_at>now()) and coalesce(o.liveness_verified_at,o.verified_at,o.discovered_at)>now()-make_interval(days=>(select max_age_days from nova_private.validation_settings where id=1))) then raise exception 'Offer not published'; end if;
 perform pg_advisory_xact_lock(hashtextextended(reporter,71002));
 select id into existing from nova_private.reports r where r.reporter_hash=reporter and r.offer_id=nova_submit_report.offer_id and created_at>now()-interval '24 hours' limit 1;
 if existing is not null then return jsonb_build_object('ok',true,'duplicate',true); end if;
 if (select count(*) from nova_private.reports where reporter_hash=reporter and created_at>now()-interval '24 hours')>=3 then return jsonb_build_object('limited',true); end if;
 insert into nova_private.reports(offer_id,reporter_hash,reason,weight) values(offer_id,reporter,report_reason,1);
 if report_reason='worked' then return jsonb_build_object('ok',true); end if;
 perform pg_advisory_xact_lock(71001);
 select count(distinct reporter_hash) into negative from nova_private.reports r where r.offer_id=nova_submit_report.offer_id and r.status='pending' and r.reason in ('expired','changed','broken') and r.created_at>now()-interval '14 days';
 select count(distinct reporter_hash) into positive from nova_private.reports r where r.offer_id=nova_submit_report.offer_id and r.reason='worked' and r.created_at>now()-interval '14 days';
 if negative>=2 and negative>positive then
  update nova_private.offers o set status='pending',liveness_status='needs_review' where o.id=nova_submit_report.offer_id and o.status='active' returning * into hidden;
  if hidden.id is not null then
   insert into nova_private.events(offer_id,source_id,type,title,details)
   values(hidden.id,hidden.source_id,'offer_reported_hidden','Retirada por reportes: '||hidden.title,jsonb_build_object('negative',negative,'worked',positive));
   return jsonb_build_object('ok',true,'hidden',true);
  end if;
 end if;
 return jsonb_build_object('ok',true);
end $$;
notify pgrst,'reload schema';
commit;
