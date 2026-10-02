-- Stop account deletions and Actions first. Preserve markers and all deletion gates.
-- Removing the gates could allow a queued user's old JWT to restore account data.
revoke execute on function public.nova_account_deletion(text,jsonb) from service_role;
-- Deleted data and Auth accounts must never be restored by rollback.
revoke select(id,user_id) on auth.sessions from service_role;
