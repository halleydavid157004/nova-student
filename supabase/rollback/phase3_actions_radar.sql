-- First disable RADAR_ACTIONS_ENABLED and stop all running Actions and Render writers.
-- Retain schema, checks, budgets and history. Deploy Phase 2 with WORKER_ENABLED=false.
begin;
update nova_private.worker_runs set status='failed',finished_at=now(),summary=jsonb_build_object('error','operator_rollback')
where status='started' and id in(select run_id from nova_private.job_leases);
delete from nova_private.job_leases;
notify pgrst,'reload schema';
commit;
