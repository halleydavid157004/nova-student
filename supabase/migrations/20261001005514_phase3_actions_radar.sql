begin;
alter table nova_private.worker_runs add column attempt integer not null default 1 check(attempt>0);
create table nova_private.job_leases (
 name text primary key, token uuid not null, run_id bigint references nova_private.worker_runs(id) on delete set null,
 leased_until timestamptz not null, created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table nova_private.job_leases enable row level security;
revoke all on nova_private.job_leases from public,anon,authenticated;
grant select,insert,update,delete on nova_private.job_leases to service_role;
create policy backend_access on nova_private.job_leases for all to service_role using(true) with check(true);
create trigger touch_updated_at before update on nova_private.job_leases for each row execute function nova_private.touch_updated_at();

create function public.nova_claim_worker(request_key text,window_key bigint,owner_token uuid) returns jsonb
language plpgsql set search_path='' as $$
declare lease nova_private.job_leases; run nova_private.worker_runs;
begin
 if request_key !~ '^(radar|validate):[a-zA-Z0-9:_-]{1,160}$' or window_key<0 or owner_token is null then raise exception 'Invalid worker claim';end if;
 perform pg_advisory_xact_lock(71003);
 select * into lease from nova_private.job_leases where name='radar' for update;
 if lease.leased_until>now() then return jsonb_build_object('skipped','busy');end if;
 if lease.run_id is not null then
  update nova_private.worker_runs set status='failed',finished_at=now(),summary=jsonb_build_object('error','lease_expired') where id=lease.run_id and status='started';
 end if;
 select * into run from nova_private.worker_runs w where w.job_key=request_key for update;
 if run.status='completed' then return jsonb_build_object('skipped','already_completed');end if;
 insert into nova_private.worker_runs(job_key,window_id,status,started_at,summary)
 values(request_key,window_key,'started',now(),'{}')
 on conflict(job_key) do update set status='started',started_at=now(),finished_at=null,summary='{}',attempt=worker_runs.attempt+1
 returning * into run;
 insert into nova_private.job_leases(name,token,run_id,leased_until) values('radar',owner_token,run.id,now()+interval '30 minutes')
 on conflict(name) do update set token=excluded.token,run_id=excluded.run_id,leased_until=excluded.leased_until;
 return jsonb_build_object('run_id',run.id,'token',owner_token,'attempt',run.attempt,'leased_until',now()+interval '30 minutes');
end $$;
create function public.nova_assert_worker(owner_token uuid) returns void
language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from nova_private.job_leases where name='radar' and token=owner_token and leased_until>now()) then raise exception 'Worker lease lost';end if;
end $$;
create function public.nova_finish_worker(owner_token uuid,result_status text,result_summary jsonb) returns void
language plpgsql set search_path='' as $$
declare lease nova_private.job_leases;
begin
 if result_status not in ('completed','failed') or jsonb_typeof(result_summary)<>'object' or octet_length(result_summary::text)>16384 then raise exception 'Invalid worker result';end if;
 perform pg_advisory_xact_lock(71003);
 select * into lease from nova_private.job_leases where name='radar' and token=owner_token for update;
 if not found then raise exception 'Worker lease lost';end if;
 if lease.leased_until<=now() and result_status='completed' then raise exception 'Worker lease expired';end if;
 update nova_private.worker_runs set status=result_status,finished_at=now(),summary=result_summary where id=lease.run_id;
 delete from nova_private.job_leases where name='radar' and token=owner_token;
end $$;

-- Shared Resend reservations leave 10/day and 300/month for future opt-in mail.
alter table nova_private.budget_usage add column usage_day date,add column daily_used integer not null default 0 check(daily_used>=0);
create table nova_private.digest_deliveries (
 key text primary key check(key ~ '^[a-f0-9]{64}$'), alert_id bigint not null references nova_private.alerts(id) on delete cascade,
 status text not null check(status in ('reserved','sent','uncertain','failed')), provider_id text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index digest_deliveries_created_idx on nova_private.digest_deliveries(created_at);
alter table nova_private.digest_deliveries enable row level security;
revoke all on nova_private.digest_deliveries from public,anon,authenticated;
grant select,insert,update,delete on nova_private.digest_deliveries to service_role;
create policy backend_access on nova_private.digest_deliveries for all to service_role using(true) with check(true);
create trigger touch_updated_at before update on nova_private.digest_deliveries for each row execute function nova_private.touch_updated_at();
create function public.nova_claim_digest(alert_key bigint,delivery_key text) returns jsonb
language plpgsql set search_path='' as $$
declare usage nova_private.budget_usage; today date:=(now() at time zone 'UTC')::date; month_key text:=to_char(today,'YYYY-MM');
begin
 if delivery_key !~ '^[a-f0-9]{64}$' then raise exception 'Invalid delivery key';end if;
 perform pg_advisory_xact_lock(71004);
 if exists(select 1 from nova_private.digest_deliveries where key=delivery_key) then return jsonb_build_object('skipped','already_reserved');end if;
 if not exists(select 1 from nova_private.alerts a join nova_private.subscribers s on s.id=a.subscriber_id where a.id=alert_key and a.enabled and s.consent_status='confirmed') then return jsonb_build_object('skipped','unconfirmed');end if;
 insert into nova_private.budget_usage(provider,month,usage_day) values('resend',month_key,today) on conflict do nothing;
 select * into usage from nova_private.budget_usage where provider='resend' and month=month_key for update;
 if usage.usage_day is distinct from today then usage.daily_used:=0;end if;
 if usage.used>=2700 or usage.daily_used>=90 then return jsonb_build_object('skipped','quota');end if;
 update nova_private.budget_usage set used=used+1,usage_day=today,daily_used=usage.daily_used+1 where provider='resend' and month=month_key;
 insert into nova_private.digest_deliveries(key,alert_id,status) values(delivery_key,alert_key,'reserved');
 return jsonb_build_object('key',delivery_key,'used',usage.used+1,'daily_used',usage.daily_used+1);
end $$;
create function public.nova_finish_digest(delivery_key text,result_status text,provider_key text) returns jsonb
language plpgsql set search_path='' as $$
declare delivery nova_private.digest_deliveries; alert nova_private.alerts;
begin
 if result_status not in ('sent','uncertain','failed') or length(coalesce(provider_key,''))>200 then raise exception 'Invalid delivery result';end if;
 select * into delivery from nova_private.digest_deliveries where key=delivery_key for update;
 if not found then raise exception 'Delivery not reserved';end if;
 if delivery.status='reserved' then
  update nova_private.digest_deliveries set status=result_status,provider_id=provider_key where key=delivery_key;
  if result_status='sent' then update nova_private.alerts set last_sent_at=now() where id=delivery.alert_id;end if;
 end if;
 select * into alert from nova_private.alerts where id=delivery.alert_id;
 return nova_private.legacy_row('alerts',to_jsonb(alert)) || jsonb_build_object('email',(select email from nova_private.subscribers where id=alert.subscriber_id));
end $$;

create function public.nova_worker_maintenance() returns jsonb
language plpgsql set search_path='' as $$
declare bytes bigint;
begin
 delete from nova_private.checks where checked_at<now()-interval '90 days';
 delete from nova_private.offer_versions v where not approved and created_at<now()-interval '90 days' and not exists(select 1 from nova_private.checks c where c.offer_version_id=v.id);
 delete from nova_private.reports where created_at<now()-interval '30 days';
 delete from nova_private.events where created_at<now()-interval '90 days';
 delete from nova_private.worker_runs where finished_at<now()-interval '90 days' and not exists(select 1 from nova_private.job_leases l where l.run_id=worker_runs.id);
 delete from nova_private.digest_deliveries where created_at<now()-interval '90 days' and status<>'reserved';
 delete from nova_private.budget_usage where month<to_char(now()-interval '24 months','YYYY-MM');
 bytes:=pg_database_size(current_database());
 return jsonb_build_object('bytes',bytes,'capacity_low',bytes>400000000);
end $$;
revoke all on function public.nova_claim_worker(text,bigint,uuid),public.nova_assert_worker(uuid),public.nova_finish_worker(uuid,text,jsonb),public.nova_claim_digest(bigint,text),public.nova_finish_digest(text,text,text),public.nova_worker_maintenance() from public,anon,authenticated;
grant execute on function public.nova_claim_worker(text,bigint,uuid),public.nova_assert_worker(uuid),public.nova_finish_worker(uuid,text,jsonb),public.nova_claim_digest(bigint,text),public.nova_finish_digest(text,text,text),public.nova_worker_maintenance() to service_role;
create or replace function public.nova_record_check(input jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare o nova_private.offers; c nova_private.checks; version_id bigint; k text; canonical jsonb; p jsonb:=input->'check'->'patch';
begin
 if input ? 'worker_token' then
  perform public.nova_assert_worker((input->>'worker_token')::uuid);
  if not exists(select 1 from nova_private.job_leases where token=(input->>'worker_token')::uuid and run_id=(input->>'worker_run_id')::bigint) then raise exception 'Worker run mismatch';end if;
 end if;
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
 insert into nova_private.checks(offer_id,source_id,offer_version_id,worker_run_id,result,signals,score,checked_at,idempotency_key)
 values(o.id,o.source_id,version_id,(input->>'worker_run_id')::bigint,input->'check'->>'state',input->'check'->'signals',(input->'check'->>'score')::integer,(input->'check'->>'checked_at')::timestamptz,(input->>'key')::uuid)
 returning * into c;
 if jsonb_array_length(coalesce(input->'check'->'signals'->'material','[]'))>0 or o.status='inactive' or o.liveness_status in ('blocked','possibly_expired','expired') then
  perform pg_advisory_xact_lock(71001);
  insert into nova_private.events(offer_id,source_id,type,title,details)
  values(o.id,o.source_id,'offer_validation_review','Revisión de vigencia: '||o.title,jsonb_build_object('check_id',c.id,'state',o.liveness_status,'score',o.liveness_score,'material',input->'check'->'signals'->'material'));
 end if;
 return jsonb_build_object('offer',nova_private.legacy_row('offers',to_jsonb(o)),'check_id',c.id);
end $$;

notify pgrst,'reload schema';
commit;
