-- Non-destructive stop: preserve evidence and private data; no return to consent bypass.
revoke execute on function public.nova_email_consent(text,jsonb) from service_role;
revoke execute on function public.nova_claim_digest(bigint,text) from service_role;
-- Restore these grants only after restoring the compatible code and configuration.
