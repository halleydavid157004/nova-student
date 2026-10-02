begin;
-- Stop automatic publication first; keep the audit history and already approved offers
-- (reject them from the panel if needed). The shared approve_offer gate stays because the
-- Phase 8 panel function now uses it.
update nova_private.auto_approval_settings set enabled=false where id=1;
revoke execute on function public.nova_auto_approve(jsonb) from service_role;
notify pgrst,'reload schema';
commit;
