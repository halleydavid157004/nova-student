begin;
create index job_leases_run_idx on nova_private.job_leases(run_id);
create index digest_deliveries_alert_idx on nova_private.digest_deliveries(alert_id);
commit;
