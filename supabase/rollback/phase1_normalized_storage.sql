-- MAINTENANCE REQUIRED: stop Actions and all app writers before executing.
-- This restores CURRENT rows, not the old frozen JSON, so new alerts/events survive.
-- Roll back app to 517e7f0 (or use SUPABASE_STORAGE_MODE=snapshot) afterwards.
-- Tables/history are deliberately retained. No public/anonymous access is added.
begin;
lock table public.nova_state in exclusive mode;
select pg_advisory_xact_lock(71000);
update nova_private.storage_control set mode='legacy' where id=1;
insert into public.nova_state(id,state,updated_at)
values(1,public.nova_export_rollback(),now())
on conflict(id) do update set state=excluded.state,updated_at=excluded.updated_at;
commit;
