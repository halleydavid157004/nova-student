-- Optional index-only rollback; does not delete rows or alter permissions.
begin;
drop index if exists nova_private.job_leases_run_idx;
drop index if exists nova_private.digest_deliveries_alert_idx;
commit;
