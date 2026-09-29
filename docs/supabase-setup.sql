-- Bootstrap the private snapshot table. This does not replace stored state.
begin;
create table if not exists public.nova_state (
  id integer primary key check (id = 1),
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.nova_state enable row level security;
revoke all on public.nova_state from public, anon, authenticated, service_role;
grant select, insert, update on public.nova_state to service_role;
commit;

select check_name, passed from (values
  ('RLS enabled', (select relrowsecurity from pg_class where oid = 'public.nova_state'::regclass)),
  ('Anonymous access blocked', not has_table_privilege('anon', 'public.nova_state', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  ('Authenticated client access blocked', not has_table_privilege('authenticated', 'public.nova_state', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  ('Server read allowed', has_table_privilege('service_role', 'public.nova_state', 'SELECT')),
  ('Server insert allowed', has_table_privilege('service_role', 'public.nova_state', 'INSERT')),
  ('Server update allowed', has_table_privilege('service_role', 'public.nova_state', 'UPDATE')),
  ('Server deletion blocked', not has_table_privilege('service_role', 'public.nova_state', 'DELETE'))
) as checks(check_name, passed);
