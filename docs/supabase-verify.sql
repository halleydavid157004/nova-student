-- Run in SQL Editor before starting the server. All test writes are rolled back.
begin;
set local role service_role;
insert into public.nova_state (id, state)
values (1, '{"_nova_storage_probe":1}'::jsonb)
on conflict (id) do update
set state = public.nova_state.state || '{"_nova_storage_probe":1}'::jsonb;
update public.nova_state
set state = state || '{"_nova_storage_probe":2}'::jsonb
where id = 1;
do $$ begin
  if not exists (select 1 from public.nova_state where id = 1 and state->>'_nova_storage_probe' = '2') then
    raise exception 'Server storage read/write verification failed';
  end if;
end $$;
rollback;

select check_name, passed from (values
  ('Server read/write test rolled back', not exists (select 1 from public.nova_state where state ? '_nova_storage_probe')),
  ('RLS enabled', (select relrowsecurity from pg_class where oid = 'public.nova_state'::regclass)),
  ('Anonymous access blocked', not has_table_privilege('anon', 'public.nova_state', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  ('Authenticated client access blocked', not has_table_privilege('authenticated', 'public.nova_state', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  ('Server read allowed', has_table_privilege('service_role', 'public.nova_state', 'SELECT')),
  ('Server insert allowed', has_table_privilege('service_role', 'public.nova_state', 'INSERT')),
  ('Server update allowed', has_table_privilege('service_role', 'public.nova_state', 'UPDATE')),
  ('Server deletion blocked', not has_table_privilege('service_role', 'public.nova_state', 'DELETE'))
) as checks(check_name, passed);
