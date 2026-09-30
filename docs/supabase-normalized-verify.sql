-- Read-only aggregate checks. Never prints subscribers or snapshot contents.
select check_name, passed from (values
  ('All private tables have RLS', not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='nova_private' and c.relkind='r' and not c.relrowsecurity)),
  ('Private schema not usable by anon', not has_schema_privilege('anon','nova_private','USAGE')),
  ('Subscribers private', not has_table_privilege('anon','nova_private.subscribers','SELECT')),
  ('Alerts private', not has_table_privilege('authenticated','nova_private.alerts','SELECT')),
  ('Public view readable', has_table_privilege('anon','public.public_offers','SELECT')),
  ('Public view not writable', not has_table_privilege('anon','public.public_offers','INSERT,UPDATE,DELETE')),
  ('Load RPC private', not has_function_privilege('anon','public.nova_load_rows()','EXECUTE')),
  ('Writes RPC private', not has_function_privilege('authenticated','public.nova_apply_changes(jsonb)','EXECUTE')),
  ('Backend can use extensions', has_schema_privilege('service_role','extensions','USAGE')),
  ('Known storage mode', (select mode in ('legacy','normalized') from nova_private.storage_control where id=1))
) as checks(check_name,passed);

begin;
set local role anon;
select count(*) as published_offers from public.public_offers;
rollback;
