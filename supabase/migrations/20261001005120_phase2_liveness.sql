begin;
alter table nova_private.offers add column liveness_verified_at timestamptz;
alter table nova_private.checks add column idempotency_key uuid unique;
create table nova_private.validation_settings (
 id integer primary key check(id=1), max_age_days integer not null default 14 check(max_age_days between 1 and 90),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
insert into nova_private.validation_settings(id) values(1);
alter table nova_private.validation_settings enable row level security;
revoke all on nova_private.validation_settings from public,anon,authenticated;
grant select,update on nova_private.validation_settings to service_role;
create policy backend_access on nova_private.validation_settings for all to service_role using(true) with check(true);
create trigger touch_updated_at before update on nova_private.validation_settings for each row execute function nova_private.touch_updated_at();
-- Column grants are usable only through parsed invoker views/RLS: anon has
-- no USAGE on nova_private and it is not exposed in the Data API.
grant select(id,max_age_days) on nova_private.validation_settings to anon,authenticated;
create policy public_age_read on nova_private.validation_settings for select to anon,authenticated using(true);
create function public.nova_configure_validation(days integer) returns void
language plpgsql set search_path='' as $$ begin
 if days not between 1 and 90 then raise exception 'Invalid maximum age'; end if;
 update nova_private.validation_settings set max_age_days=days where id=1 and max_age_days<>days;
end $$;
revoke all on function public.nova_configure_validation(integer) from public,anon,authenticated;
grant execute on function public.nova_configure_validation(integer) to service_role;
drop policy published_offer_read on nova_private.offers;
create policy published_offer_read on nova_private.offers for select to anon,authenticated
using(status='active' and (official or reviewed) and (expires_at is null or expires_at>now())
 and coalesce(liveness_verified_at,verified_at,discovered_at)>now()-make_interval(days=>(select max_age_days from nova_private.validation_settings where id=1)));
grant select(liveness_verified_at) on nova_private.offers to anon,authenticated;
create or replace view public.public_offers with(security_invoker=true,security_barrier=true) as
select id,slug,brand,title,summary,benefit,category,offer_type,verification,source_url,source_domain,
 countries,requirements,steps,tags,official,reviewed,status,confidence,requires_card,commercial_use,
 discovered_at,verified_at,expires_at,liveness_score,liveness_status,created_at,updated_at,liveness_verified_at
from nova_private.offers where status='active' and (official or reviewed) and (expires_at is null or expires_at>now())
and coalesce(liveness_verified_at,verified_at,discovered_at)>now()-make_interval(days=>(select max_age_days from nova_private.validation_settings where id=1));

create function public.nova_validation_context(offer_id bigint) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('offer',nova_private.legacy_row('offers',to_jsonb(o)),
 'approved_extraction',(select extraction from nova_private.offer_versions v where v.offer_id=o.id and approved order by created_at desc,id desc limit 1),
 'report_weight',greatest(0,least(3,coalesce((select sum(case when reason='worked' then -weight else weight end) from nova_private.reports r
 where r.offer_id=o.id and status in ('pending','accepted') and created_at>now()-interval '7 days'),0))))
 from nova_private.offers o where o.id=offer_id;
$$;

create function public.nova_record_check(input jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare o nova_private.offers; c nova_private.checks; version_id bigint; k text; canonical jsonb; p jsonb:=input->'check'->'patch';
begin
 if (select mode from nova_private.storage_control where id=1)<>'normalized' then raise exception 'Normalized storage required'; end if;
 select * into o from nova_private.offers where id=(input->>'offer_id')::bigint for update;
 if not found then raise exception 'Offer not found'; end if;
 select * into c from nova_private.checks where idempotency_key=(input->>'key')::uuid;
 if found then
   if c.offer_id<>o.id then raise exception 'Idempotency key belongs to another offer'; end if;
   return jsonb_build_object('offer',nova_private.legacy_row('offers',to_jsonb(o)),'check_id',c.id);
 end if;
 canonical:=nova_private.legacy_row('offers',to_jsonb(o));
 for k in select jsonb_object_keys(input->'expected') loop
  if coalesce(canonical->k,'null'::jsonb) is distinct from coalesce(input->'expected'->k,'null'::jsonb) then
   raise exception using errcode='40001',message='Concurrent validation edit';
  end if;
 end loop;
 if p->>'status'='active' and o.status<>'active' then raise exception 'Validation cannot publish'; end if;
 if p->>'status'='inactive' and o.status='active' and (p->>'consecutive_failures')::integer<2 then raise exception 'Two failures required'; end if;
 if input->'check'->'extraction' <> 'null'::jsonb then
  insert into nova_private.offer_versions(offer_id,content_hash,extraction,approved,evidence)
  values(o.id,md5((input->'check'->>'section_hash')||((input->'check'->'extraction')::text)),input->'check'->'extraction',false,left(input->'check'->'extraction'->>'evidence',400))
  on conflict(offer_id,content_hash) do update set evidence=excluded.evidence returning id into version_id;
 end if;
 update nova_private.offers set status=p->>'status',liveness_score=(p->>'liveness_score')::integer,
 liveness_status=p->>'liveness_status',consecutive_failures=(p->>'consecutive_failures')::integer,
 liveness_verified_at=(p->>'liveness_verified_at')::timestamptz,
 verified_at=case when (input->'check'->>'success')::boolean then (input->'check'->>'checked_at')::timestamptz else verified_at end,
 source_hash=p->>'source_hash',source_excerpt=p->>'source_excerpt' where id=o.id returning * into o;
 insert into nova_private.checks(offer_id,source_id,offer_version_id,result,signals,score,checked_at,idempotency_key)
 values(o.id,o.source_id,version_id,input->'check'->>'state',input->'check'->'signals',(input->'check'->>'score')::integer,(input->'check'->>'checked_at')::timestamptz,(input->>'key')::uuid)
 returning * into c;
 if jsonb_array_length(coalesce(input->'check'->'signals'->'material','[]'))>0 or o.status='inactive' or o.liveness_status in ('blocked','possibly_expired','expired') then
  perform pg_advisory_xact_lock(71001);
  insert into nova_private.events(offer_id,source_id,type,title,details)
  values(o.id,o.source_id,'offer_validation_review','Revisión de vigencia: '||o.title,jsonb_build_object('check_id',c.id,'state',o.liveness_status,'score',o.liveness_score,'material',input->'check'->'signals'->'material'));
 end if;
 return jsonb_build_object('offer',nova_private.legacy_row('offers',to_jsonb(o)),'check_id',c.id);
end $$;

create function public.nova_submit_report(offer_id bigint,reporter text,report_reason text) returns jsonb
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
revoke all on function public.nova_validation_context(bigint),public.nova_record_check(jsonb),public.nova_submit_report(bigint,text,text) from public,anon,authenticated;
grant execute on function public.nova_validation_context(bigint),public.nova_record_check(jsonb),public.nova_submit_report(bigint,text,text) to service_role;
-- Preserve orphan evidence when normalized JSON exports nullable foreign keys.
create or replace function nova_private.import_state(payload jsonb) returns void
language plpgsql set search_path='' as $$
declare r jsonb; k text; v jsonb; seq_name text; maximum bigint; seq_value bigint;
begin
  if jsonb_typeof(payload)<>'object' then raise exception 'Invalid legacy snapshot'; end if;
  perform pg_advisory_xact_lock(71001);
  for r in select value from jsonb_array_elements(coalesce(payload->'sources','[]')) loop
    perform nova_private.write_row('sources',r,null,'import');
  end loop;
  for r in select value from jsonb_array_elements(coalesce(payload->'offers','[]')) loop
    if not(r ? 'source_id') then
      r := r || jsonb_build_object('source_id',(select id from nova_private.sources where url=r->>'source_url'));
    end if;
    perform nova_private.write_row('offers',r,null,'import');
  end loop;
  for r in select value from jsonb_array_elements(coalesce(payload->'events','[]')) loop
    if r->>'source_id' is not null and not exists(select 1 from nova_private.sources where id=(r->>'source_id')::bigint) then
      r := (r-'source_id') || jsonb_build_object('legacy_source_id',r->'source_id');
    end if;
    if r->>'offer_id' is not null and not exists(select 1 from nova_private.offers where id=(r->>'offer_id')::bigint) then
      r := (r-'offer_id') || jsonb_build_object('legacy_offer_id',r->'offer_id');
    end if;
    perform nova_private.write_row('events',r,null,'import');
  end loop;
  for r in select value from jsonb_array_elements(coalesce(payload->'alerts','[]')) loop
    perform nova_private.write_row('alerts',r,null,'import');
  end loop;
  -- Match deletions performed by the legacy owner before cutover; never run in normalized mode.
  delete from nova_private.alerts where id not in (select (value->>'id')::bigint from jsonb_array_elements(coalesce(payload->'alerts','[]')));
  for k,v in select key,value from jsonb_each(coalesce(payload->'runtime','{}')) loop
    if k='brave' then
      if v ? 'month' then
        insert into nova_private.budget_usage(provider,month,used,lookup_used)
        values('brave',v->>'month',greatest(coalesce((v->>'used')::integer,0),0),greatest(coalesce((v->>'lookupUsed')::integer,0),0))
        on conflict(provider,month) do update set used=greatest(budget_usage.used,excluded.used),lookup_used=greatest(budget_usage.lookup_used,excluded.lookup_used);
      end if;
      v := v - array['month','used','lookupUsed'];
    end if;
    insert into nova_private.app_runtime(key,value) values(k,v) on conflict(key) do update set value=excluded.value where app_runtime.value is distinct from excluded.value;
  end loop;
  insert into nova_private.app_runtime(key,value) values('_legacy_favorites',coalesce(payload->'favorites','[]'))
  on conflict(key) do update set value=excluded.value where app_runtime.value is distinct from excluded.value;
  v := payload->'runtime'->'worker';
  if v ? 'lastWindow' then
    insert into nova_private.worker_runs(job_key,window_id,status,started_at,finished_at,summary)
    values('legacy:' || (v->>'lastWindow'),(v->>'lastWindow')::bigint,
      case when v->>'lastError' is not null then 'failed' when v->>'lastCompletedAt' is not null then 'completed' else 'started' end,
      (v->>'lastStartedAt')::timestamptz,(v->>'lastCompletedAt')::timestamptz,coalesce(v->'lastScanResult','{}'))
    on conflict(job_key) do update set status=excluded.status,finished_at=excluded.finished_at,summary=excluded.summary;
  end if;
  foreach k in array array['offers','sources','events','alerts'] loop
    seq_name := pg_get_serial_sequence(format('nova_private.%I',k),'id');
    execute format('select coalesce(max(id),0) from nova_private.%I',k) into maximum;
    execute format('select last_value from %s',seq_name) into seq_value;
    perform setval(seq_name::regclass,greatest(maximum,seq_value,1),true);
  end loop;
end $$;

notify pgrst,'reload schema';
commit;
