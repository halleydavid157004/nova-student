-- Stop validation writers and deploy Phase 1 (a88daf3) before reverting public freshness.
-- Preserve checks, evidence, reports and liveness fields. No historical data is dropped.
begin;
drop policy published_offer_read on nova_private.offers;
create policy published_offer_read on nova_private.offers for select to anon,authenticated
using(status='active' and (official or reviewed) and (expires_at is null or expires_at>now()));
create or replace view public.public_offers with(security_invoker=true,security_barrier=true) as
select id,slug,brand,title,summary,benefit,category,offer_type,verification,source_url,source_domain,
 countries,requirements,steps,tags,official,reviewed,status,confidence,requires_card,commercial_use,
 discovered_at,verified_at,expires_at,liveness_score,liveness_status,created_at,updated_at,liveness_verified_at
from nova_private.offers where status='active' and (official or reviewed) and (expires_at is null or expires_at>now());
-- Offers withdrawn after two checks are NOT automatically reapproved by rollback.
notify pgrst,'reload schema';
commit;
