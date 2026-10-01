-- Stop Actions before rollback. Deleted data must not be restored. Legacy snapshot alerts stay scrubbed.
revoke execute on function public.nova_erase_subscription(jsonb) from service_role;
create or replace function public.nova_worker_maintenance() returns jsonb
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
