-- Read-only post-migration verification; never returns subscriber data or secrets.
select version,name from supabase_migrations.schema_migrations where name='phase2_liveness';
select (select mode from nova_private.storage_control where id=1) as mode,
 (select count(*) from nova_private.offers) as offers,
 (select count(*) from public.public_offers) as published,
 (select max_age_days from nova_private.validation_settings where id=1) as max_age_days,
 (select count(*) from nova_private.checks) as checks,
 (select count(*) from nova_private.reports) as reports;
select has_schema_privilege('anon','nova_private','USAGE') as anon_private_schema,
 has_table_privilege('anon','nova_private.subscribers','SELECT') as anon_subscribers,
 has_table_privilege('anon','nova_private.alerts','SELECT') as anon_alerts,
 has_function_privilege('anon','public.nova_record_check(jsonb)','EXECUTE') as anon_check,
 has_function_privilege('authenticated','public.nova_submit_report(bigint,text,text)','EXECUTE') as authenticated_report;
begin read only;
set local role anon;
select count(*) as public_offers_readable from public.public_offers;
rollback;
