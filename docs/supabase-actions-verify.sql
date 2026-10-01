-- Read-only aggregate verification; do not query/export subscribers for public logs.
select version,name from supabase_migrations.schema_migrations where name='phase3_actions_radar';
select count(*) as runs,count(*) filter(where status='completed') as completed,
 count(*) filter(where status='failed') as failed,max(finished_at) as last_finished_at from nova_private.worker_runs where job_key like 'radar:%' or job_key like 'validate:%';
select count(*) as active_leases from nova_private.job_leases where leased_until>now();
select provider,month,used,daily_used,usage_day from nova_private.budget_usage order by provider,month desc limit 5;
select count(*) as public_offers from public.public_offers;
select has_table_privilege('anon','nova_private.job_leases','SELECT') as anon_leases,
 has_table_privilege('anon','nova_private.digest_deliveries','SELECT') as anon_mail,
 has_function_privilege('anon','public.nova_claim_worker(text,bigint,uuid)','EXECUTE') as anon_claim,
 has_function_privilege('authenticated','public.nova_claim_digest(bigint,text)','EXECUTE') as authenticated_mail;
