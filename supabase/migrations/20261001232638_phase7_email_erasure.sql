-- Frozen legacy alerts are not a privacy archive. Rollback exports current rows.
-- No subscribers are deleted by applying the migration; cleanup runs in Actions.
alter table public.nova_state disable trigger sync_normalized_rows;
update public.nova_state set state=jsonb_set(state,'{alerts}','[]'::jsonb),updated_at=now()
 where (select mode from nova_private.storage_control where id=1)='normalized';
alter table public.nova_state enable trigger sync_normalized_rows;

create function public.nova_erase_subscription(input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s nova_private.subscribers; removed jsonb;
begin
 perform pg_advisory_xact_lock(71005);
 if (select mode from nova_private.storage_control where id=1) is distinct from 'normalized' then raise exception 'Normalized storage required';end if;
 select * into s from nova_private.subscribers where id=(input->>'id')::bigint for update;
 if not found or s.email_nonce::text is distinct from input->>'nonce' then raise exception 'Invalid subscription link';end if;
 select coalesce(jsonb_agg(id),'[]') into removed from nova_private.alerts where subscriber_id=s.id;
 -- Cascades remove searches, nonce, confirmation and delivery records; usage stays.
 delete from nova_private.subscribers where id=s.id;
 return jsonb_build_object('ok',true,'removed_alert_ids',removed);
end $$;
revoke all on function public.nova_erase_subscription(jsonb) from public,anon,authenticated;
grant execute on function public.nova_erase_subscription(jsonb) to service_role;

create or replace function public.nova_worker_maintenance() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare bytes bigint; removed jsonb; subscribers_removed integer;
begin
 perform pg_advisory_xact_lock(71005);
 if (select mode from nova_private.storage_control where id=1) is distinct from 'normalized' then raise exception 'Normalized storage required';end if;
 -- Requests expire at 72h; personal data gets a separate, documented 30-day limit.
 -- Batches bound transaction time. Confirmed searches are never aged out here.
 with candidates as (select id from nova_private.alerts
  where consent_confirmed_at is null and coalesce(consent_requested_at,created_at)<now()-interval '30 days'
  order by coalesce(consent_requested_at,created_at),id limit 500 for update),
 deleted as (delete from nova_private.alerts where id in (select id from candidates) returning id)
 select coalesce(jsonb_agg(id),'[]') into removed from deleted;
 with candidates as (select s.id from nova_private.subscribers s
  where s.consent_status='unconfirmed' and s.created_at<now()-interval '30 days'
  and not exists(select 1 from nova_private.alerts a where a.subscriber_id=s.id)
  order by s.created_at,s.id limit 500 for update)
 delete from nova_private.subscribers where id in (select id from candidates);
 get diagnostics subscribers_removed=row_count;
 delete from nova_private.checks where checked_at<now()-interval '90 days';
 delete from nova_private.offer_versions v where not approved and created_at<now()-interval '90 days' and not exists(select 1 from nova_private.checks c where c.offer_version_id=v.id);
 delete from nova_private.reports where created_at<now()-interval '30 days';
 delete from nova_private.events where created_at<now()-interval '90 days';
 delete from nova_private.worker_runs where finished_at<now()-interval '90 days' and not exists(select 1 from nova_private.job_leases l where l.run_id=worker_runs.id);
 delete from nova_private.digest_deliveries where created_at<now()-interval '90 days';
 delete from nova_private.budget_usage where month<to_char(now()-interval '24 months','YYYY-MM');
 bytes:=pg_database_size(current_database());
 return jsonb_build_object('bytes',bytes,'capacity_low',bytes>400000000,
  'removed_alert_ids',removed,'subscribers_removed',subscribers_removed);
end $$;
revoke all on function public.nova_worker_maintenance() from public,anon,authenticated;
grant execute on function public.nova_worker_maintenance() to service_role;
