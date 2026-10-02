begin;
-- Disable panel writes first; keep evidence and audit history. Never republish rejected offers.
revoke execute on function public.nova_admin_review(text,jsonb) from service_role;
revoke select(raw_app_meta_data) on auth.users from service_role;
notify pgrst,'reload schema';
commit;
