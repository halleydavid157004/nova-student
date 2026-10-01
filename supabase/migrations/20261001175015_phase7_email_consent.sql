-- Consent is per alert: knowing a confirmed subscriber email cannot authorize a new search.
alter table nova_private.subscribers add column email_nonce uuid not null default gen_random_uuid(),
 add column last_confirmation_requested_at timestamptz;
alter table nova_private.alerts add column consent_nonce uuid not null default gen_random_uuid(),
 add column consent_requested_at timestamptz, add column consent_confirmed_at timestamptz,
 add column consent_version text, add column confirmation_reserved_at timestamptz,
 add column confirmation_sent_at timestamptz;
create index alerts_confirmation_queue_idx on nova_private.alerts(consent_requested_at)
 where consent_requested_at is not null and consent_confirmed_at is null and confirmation_reserved_at is null;

create function public.nova_email_consent(op text,input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a nova_private.alerts; s nova_private.subscribers; usage nova_private.budget_usage;
 today date:=(now() at time zone 'UTC')::date; month_key text:=to_char(today,'YYYY-MM'); delivery_key text;
begin
 perform pg_advisory_xact_lock(71005);
 if op='queue' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',q.id)) from
   (select id from nova_private.alerts where enabled and consent_requested_at>now()-interval '72 hours'
    and consent_confirmed_at is null and confirmation_reserved_at is null order by consent_requested_at limit 30) q),'[]');
 end if;
 if op in ('request','claim','finish','context','confirm','preview') then
  select * into a from nova_private.alerts where id=(input->>'id')::bigint for update;
  if not found then return jsonb_build_object('skipped','unavailable');end if;
  select * into s from nova_private.subscribers where id=a.subscriber_id for update;
 else
  select * into s from nova_private.subscribers where id=(input->>'id')::bigint for update;
  if not found or s.email_nonce::text is distinct from input->>'nonce' then raise exception 'Invalid subscription link';end if;
 end if;
 if op='request' then
  if input->>'version' is distinct from '2026-10-01' then raise exception 'Invalid consent version';end if;
  if a.consent_confirmed_at is not null and s.consent_status='confirmed' then return jsonb_build_object('status','confirmed');end if;
  if s.last_confirmation_requested_at>now()-interval '24 hours' then return jsonb_build_object('status','pending');end if;
  update nova_private.subscribers set last_confirmation_requested_at=now() where id=s.id;
  update nova_private.alerts set consent_nonce=gen_random_uuid(),consent_requested_at=now(),consent_confirmed_at=null,
   consent_version=input->>'version',confirmation_reserved_at=null,confirmation_sent_at=null where id=a.id;
  return jsonb_build_object('status','pending');
 elsif op='claim' then
  if not a.enabled or a.consent_requested_at is null or a.consent_requested_at<=now()-interval '72 hours' or a.consent_confirmed_at is not null or a.confirmation_reserved_at is not null then return jsonb_build_object('skipped','unavailable');end if;
  delivery_key:=input->>'key';if delivery_key !~ '^[a-f0-9]{64}$' then raise exception 'Invalid delivery key';end if;
  perform pg_advisory_xact_lock(71004);
  if exists(select 1 from nova_private.digest_deliveries where key=delivery_key) then return jsonb_build_object('skipped','already_reserved');end if;
  insert into nova_private.budget_usage(provider,month,usage_day) values('resend',month_key,today) on conflict do nothing;
  select * into usage from nova_private.budget_usage where provider='resend' and month=month_key for update;
  if usage.usage_day is distinct from today then usage.daily_used:=0;end if;
  if usage.used>=2700 or usage.daily_used>=90 then return jsonb_build_object('skipped','quota');end if;
  update nova_private.budget_usage set used=used+1,usage_day=today,daily_used=usage.daily_used+1 where provider='resend' and month=month_key;
  insert into nova_private.digest_deliveries(key,alert_id,status) values(delivery_key,a.id,'reserved');
  update nova_private.alerts set confirmation_reserved_at=now() where id=a.id;
  return jsonb_build_object('id',a.id,'nonce',a.consent_nonce,'email',s.email,'expires',floor(extract(epoch from a.consent_requested_at+interval '72 hours')));
 elsif op='finish' then
  if input->>'status' not in ('sent','uncertain') then raise exception 'Invalid delivery result';end if;
  update nova_private.digest_deliveries set status=input->>'status' where key=input->>'key' and alert_id=a.id and status='reserved';
  if found and input->>'status'='sent' then update nova_private.alerts set confirmation_sent_at=now() where id=a.id;end if;
  return jsonb_build_object('ok',true);
 elsif op in ('confirm','preview') then
  if a.consent_nonce::text is distinct from input->>'nonce' or a.consent_requested_at is null or a.consent_requested_at<=now()-interval '72 hours' then raise exception 'Invalid confirmation';end if;
  if not a.enabled then raise exception 'Confirmation cancelled';end if;
  if op='preview' then return jsonb_build_object('query',a.query,'country',a.country,'frequency',a.frequency,'confirmed',a.consent_confirmed_at is not null);end if;
  update nova_private.alerts set consent_confirmed_at=coalesce(consent_confirmed_at,now()) where id=a.id;
  update nova_private.subscribers set consent_status='confirmed',confirmed_at=coalesce(confirmed_at,now()) where id=s.id;
  return jsonb_build_object('ok',true);
 elsif op='context' then
  if not a.enabled or a.consent_confirmed_at is null or s.consent_status<>'confirmed' then return null;end if;
  return jsonb_build_object('id',s.id,'nonce',s.email_nonce,'email',s.email);
 elsif op='unsubscribe' then
  update nova_private.subscribers set consent_status='withdrawn' where id=s.id;
  update nova_private.alerts set enabled=false,consent_nonce=gen_random_uuid(),consent_confirmed_at=null where subscriber_id=s.id;
  return jsonb_build_object('ok',true);
 elsif op='preferences' then
  return jsonb_build_object('status',s.consent_status,'alerts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'query',query,'country',country,'frequency',frequency,'enabled',enabled,'confirmed',consent_confirmed_at is not null) order by id) from nova_private.alerts where subscriber_id=s.id),'[]'));
 elsif op='update' then
  if jsonb_typeof(input->'enabled') is distinct from 'boolean' or input->>'frequency' not in ('instant','daily','weekly') then raise exception 'Invalid preferences';end if;
  update nova_private.alerts set enabled=(input->>'enabled')::boolean,frequency=input->>'frequency'
   where id=(input->>'alert_id')::bigint and subscriber_id=s.id
   and (not (input->>'enabled')::boolean or (consent_confirmed_at is not null and s.consent_status='confirmed'));
  if not found then raise exception 'Alert unavailable';end if;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Invalid email operation';
end $$;
revoke all on function public.nova_email_consent(text,jsonb) from public,anon,authenticated;
grant execute on function public.nova_email_consent(text,jsonb) to service_role;

create or replace function public.nova_claim_digest(alert_key bigint,delivery_key text) returns jsonb
language plpgsql set search_path='' as $$
declare usage nova_private.budget_usage; today date:=(now() at time zone 'UTC')::date; month_key text:=to_char(today,'YYYY-MM');
begin
 if delivery_key !~ '^[a-f0-9]{64}$' then raise exception 'Invalid delivery key';end if;
 perform pg_advisory_xact_lock(71004);
 if exists(select 1 from nova_private.digest_deliveries where key=delivery_key) then return jsonb_build_object('skipped','already_reserved');end if;
 if not exists(select 1 from nova_private.alerts a join nova_private.subscribers s on s.id=a.subscriber_id where a.id=alert_key and a.enabled and a.consent_confirmed_at is not null and s.consent_status='confirmed') then return jsonb_build_object('skipped','unconfirmed');end if;
 insert into nova_private.budget_usage(provider,month,usage_day) values('resend',month_key,today) on conflict do nothing;
 select * into usage from nova_private.budget_usage where provider='resend' and month=month_key for update;
 if usage.usage_day is distinct from today then usage.daily_used:=0;end if;
 if usage.used>=2700 or usage.daily_used>=90 then return jsonb_build_object('skipped','quota');end if;
 update nova_private.budget_usage set used=used+1,usage_day=today,daily_used=usage.daily_used+1 where provider='resend' and month=month_key;
 insert into nova_private.digest_deliveries(key,alert_id,status) values(delivery_key,alert_key,'reserved');
 return jsonb_build_object('key',delivery_key,'used',usage.used+1,'daily_used',usage.daily_used+1);
end $$;
