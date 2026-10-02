begin;
-- Fase 12: aprobación automática de ofertas con evidencia fuerte de su fuente oficial.
-- Toda aprobación automática queda en admin_actions (actor nulo) y en la cola del panel
-- durante 14 días para poder rechazarla. Se apaga con:
--   update nova_private.auto_approval_settings set enabled=false where id=1;
alter table nova_private.admin_actions drop constraint admin_actions_action_check;
alter table nova_private.admin_actions add constraint admin_actions_action_check check(action in ('approve','reject','edit','source','auto_approve'));
create table nova_private.auto_approval_settings (
 id integer primary key check(id=1),
 enabled boolean not null default true,
 min_score integer not null default 80 check(min_score between 70 and 100),
 max_per_run integer not null default 25 check(max_per_run between 1 and 100),
 max_check_age interval not null default interval '24 hours' check(max_check_age between interval '1 hour' and interval '7 days'),
 updated_at timestamptz not null default now()
);
insert into nova_private.auto_approval_settings(id) values(1);
alter table nova_private.auto_approval_settings enable row level security;
revoke all on nova_private.auto_approval_settings from public,anon,authenticated;
grant select on nova_private.auto_approval_settings to service_role;
create policy backend_read on nova_private.auto_approval_settings for select to service_role using(true);
create trigger touch_updated_at before update on nova_private.auto_approval_settings for each row execute function nova_private.touch_updated_at();
create function nova_private.url_host(value text) returns text
language sql immutable strict set search_path='' as $$select nullif(split_part(regexp_replace(lower(value),'^https?://(www\.)?',''),'/',1),'');$$;

-- The panel marks automatic approvals that no person has acted on yet.
create or replace function nova_private.review_item(offer_key bigint) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('offer',to_jsonb(o),'check',to_jsonb(c),'version',to_jsonb(v),'auto_approved',exists(select 1 from nova_private.admin_actions a where a.offer_id=o.id and a.action='auto_approve' and not exists(select 1 from nova_private.admin_actions h where h.offer_id=o.id and h.id>a.id)),'approved',
 (select extraction from nova_private.offer_versions a where a.offer_id=o.id and a.approved order by a.updated_at desc,a.id desc limit 1))
 from nova_private.offers o left join lateral(select * from nova_private.checks where offer_id=o.id order by checked_at desc,id desc limit 1)c on true
 left join nova_private.offer_versions v on v.id=c.offer_version_id where o.id=offer_key;
$$;
-- Shared evidence gate and publication step: the human panel and the automatic
-- approver run exactly the same checks. human=false never sets reviewed=true.
create function nova_private.approve_offer(o nova_private.offers,c nova_private.checks,v nova_private.offer_versions,human boolean) returns text
language plpgsql set search_path='' as $$
declare target bigint:=o.id; x jsonb:=v.extraction; material jsonb:=c.signals->'material'; new_countries text[]; candidate_url text;
begin
  if c.id is null or v.id is null or c.checked_at<now()-interval '7 days' or c.checked_at>now()+interval '1 minute' or
   c.result not in ('active','needs_review') or c.score<55 or c.score is null or coalesce((c.signals->>'http')::integer,0) not between 200 and 299 or
   c.signals ?| array['blocked','network','soft_404','extraction','user_reports'] or
   o.source_url !~ '^https://' or nova_private.review_url(o.source_url) is distinct from nova_private.review_url(c.signals->>'final_url') or
   jsonb_typeof(material) is distinct from 'array' or
   x is null or x->'available' is distinct from 'true'::jsonb or jsonb_typeof(x->'benefit') is distinct from 'string' or length(trim(x->>'benefit')) not between 1 and 1000 or
   jsonb_typeof(x->'evidence') is distinct from 'string' or length(x->>'evidence') not between 10 and 400 or (x->>'evidence') is distinct from v.evidence or
   jsonb_typeof(x->'requirements') is distinct from 'array' or jsonb_typeof(x->'countries') is distinct from 'array' or
   (x->>'expires_at') is not null and (x->>'expires_at') !~ '^\d{4}-\d{2}-\d{2}T' or
   jsonb_typeof(x->'expires_at') is null or jsonb_typeof(x->'expires_at') not in ('null','string') or
   jsonb_typeof(x->'verification') is null or jsonb_typeof(x->'verification') not in ('null','string') or length(x->>'verification')>254 or
   jsonb_typeof(x->'value') is null or jsonb_typeof(x->'value') not in ('null','string') or length(x->>'value')>254 or
   (select count(*) from jsonb_object_keys(x))<>8 or
   not(x ?& array['benefit','value','requirements','verification','countries','expires_at','evidence','available']) or
   (x->>'expires_at')::timestamptz<=now() then return 'evidence';end if;
  if exists(select 1 from jsonb_array_elements_text(material) m where m not in ('value_changed','benefit_changed','verification_changed','countries_changed')) or
   jsonb_array_length(x->'requirements')>20 or jsonb_array_length(x->'countries') not between 1 and 250 or
   exists(select 1 from jsonb_array_elements(x->'requirements')r where jsonb_typeof(r)<>'string' or length(r#>>'{}') not between 1 and 500) or
   exists(select 1 from jsonb_array_elements_text(x->'countries')k where k <> all(string_to_array('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW GLOBAL',' '))) then return 'evidence';end if;
  select array_agg(distinct k order by k) into new_countries from jsonb_array_elements_text(x->'countries')k;
  candidate_url:=nova_private.review_url(o.source_url);
  if exists(select 1 from public.public_offers p where p.id<>o.id and
   (select array_agg(distinct k order by k) from unnest(p.countries)k)=new_countries and
   nova_private.review_fold(p.benefit)=nova_private.review_fold(x->>'benefit') and
   nova_private.review_fold(p.offer_type)=nova_private.review_fold(o.offer_type) and
   nova_private.review_fold(p.verification)=nova_private.review_fold(x->>'verification') and
   (nova_private.review_url(p.source_url)=candidate_url or (nova_private.review_fold(p.brand)=nova_private.review_fold(o.brand) and
    nova_private.review_fold(p.title)=nova_private.review_fold(o.title) and split_part(nova_private.review_url(p.source_url),'?',2)=split_part(candidate_url,'?',2)))) then return 'duplicate';end if;
  update nova_private.offer_versions set approved=false where offer_id=target and approved;
  update nova_private.offer_versions set approved=true where id=v.id;
  update nova_private.offers set reviewed=(reviewed or human),official=(official or not human),status='active',benefit=x->>'benefit',requirements=array(select jsonb_array_elements_text(x->'requirements')),
   verification=x->>'verification',countries=new_countries,expires_at=(x->>'expires_at')::timestamptz,
   verified_at=c.checked_at,liveness_verified_at=c.checked_at,liveness_score=c.score,liveness_status='active',consecutive_failures=0,
   source_excerpt=v.evidence,extra=extra||jsonb_build_object('value',x->'value') where id=target;

  return null;
end $$;

create or replace function public.nova_admin_review(op text,input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=(input->>'user_id')::uuid; o nova_private.offers; s nova_private.sources; c nova_private.checks;
 v nova_private.offer_versions; previous jsonb; target bigint:=(input->>'id')::bigint; cursor_key bigint:=coalesce((input->>'after')::bigint,0); items jsonb;
 item jsonb; err text;
begin
 if (select mode from nova_private.storage_control where id=1) is distinct from 'normalized' then raise exception 'Normalized storage required';end if;
 if not exists(select 1 from auth.users where id=uid and raw_app_meta_data->>'nova_role'='admin') or
 not exists(select 1 from auth.sessions where id=(input->>'session_id')::uuid and user_id=uid) or
 exists(select 1 from public.account_deletions where user_hash=encode(sha256(convert_to(uid::text,'UTF8')),'hex')) then raise exception 'Live admin session required';end if;
 if cursor_key<0 then raise exception 'Invalid cursor';end if;
 -- Audit retention occurs on the next administrative request; no new paid cron.
 delete from nova_private.admin_actions where created_at<now()-interval '90 days';
 if op='queue' then
  select coalesce(jsonb_agg(nova_private.review_item(q.id) order by q.id),'[]') into items from
   (select id from nova_private.offers qo where id>cursor_key and (status<>'active' or not(official or reviewed) or liveness_status is distinct from 'active' or
    coalesce(liveness_verified_at,verified_at,discovered_at)<now()-interval '7 days' or
    -- Automatic approvals stay in the queue for 14 days (or until a person acts) so they can be undone.
    exists(select 1 from nova_private.admin_actions a where a.offer_id=qo.id and a.action='auto_approve' and a.created_at>now()-interval '14 days'
     and not exists(select 1 from nova_private.admin_actions h where h.offer_id=qo.id and h.id>a.id))) order by id limit 50) q;
  return jsonb_build_object('items',items,'published',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.public_offers p));
 elsif op='context' then
  item:=nova_private.review_item(target);if item is null then raise exception 'Offer not found';end if;
  return item||jsonb_build_object('published',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.public_offers p));
 elsif op='sources' then
  return jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]') from
   (select id,name,url,enabled,official,last_checked_at,last_status,updated_at from nova_private.sources where id>cursor_key order by id limit 50)q));
 elsif op='audit' then
  return jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]') from
   (select id,offer_id,source_id,action,reason,details,created_at from nova_private.admin_actions where id>cursor_key order by id limit 50)q));
 end if;
 if op not in ('approve','reject','edit','source') or length(trim(input->>'reason')) not between 10 and 500 or input->>'reason' is null then raise exception 'Invalid admin action';end if;
 perform pg_advisory_xact_lock(71006); -- serializes duplicate approvals by different admins
 if op='source' then
  select * into s from nova_private.sources where id=target for update;
  if not found or s.updated_at is distinct from (input->>'expected_updated_at')::timestamptz then return jsonb_build_object('error','conflict');end if;
  if jsonb_typeof(input->'enabled') is distinct from 'boolean' then raise exception 'Invalid source status';end if;
  update nova_private.sources set enabled=(input->>'enabled')::boolean where id=target;
  insert into nova_private.admin_actions(actor_id,source_id,action,reason,details) values(uid,target,op,input->>'reason',jsonb_build_object('before',s.enabled,'after',input->'enabled'));
  return jsonb_build_object('ok',true,'source',(select nova_private.legacy_row('sources',to_jsonb(row)) from nova_private.sources row where id=target));
 end if;
 select * into o from nova_private.offers where id=target for update;
 if not found or o.updated_at is distinct from (input->>'expected_updated_at')::timestamptz then return jsonb_build_object('error','conflict');end if;
 previous:=jsonb_build_object('status',o.status,'title',o.title,'steps',o.steps,'benefit',o.benefit,'countries',o.countries,'verification',o.verification);
 if op='approve' then
  select * into c from nova_private.checks where offer_id=target order by checked_at desc,id desc limit 1;
  select * into v from nova_private.offer_versions where id=c.offer_version_id and offer_id=target;
  if c.id is distinct from (input->>'check_id')::bigint or input->'confirm_source' is distinct from 'true'::jsonb then return jsonb_build_object('error','evidence');end if;
  err:=nova_private.approve_offer(o,c,v,true);
  if err is not null then return jsonb_build_object('error',err);end if;
 elsif op='reject' then
  update nova_private.offers set status='inactive' where id=target;
 elsif op='edit' then
  if jsonb_typeof(input->'title') is distinct from 'string' or length(trim(input->>'title')) not between 1 and 200 or jsonb_typeof(input->'steps') is distinct from 'array' then raise exception 'Invalid edit';end if;
  if jsonb_array_length(input->'steps')>20 or exists(select 1 from jsonb_array_elements(input->'steps')k where jsonb_typeof(k)<>'string' or length(trim(k#>>'{}')) not between 1 and 500) then raise exception 'Invalid steps';end if;
  -- Only display metadata is editable here. Benefit/price/country need new worker evidence.
  update nova_private.offers set title=input->>'title',steps=array(select jsonb_array_elements_text(input->'steps')) where id=target;
 end if;
 insert into nova_private.admin_actions(actor_id,offer_id,action,reason,details) values(uid,target,op,input->>'reason',
  jsonb_build_object('before',previous,'after',(select jsonb_build_object('status',status,'title',title,'steps',steps,'benefit',benefit,'countries',countries,'verification',verification) from nova_private.offers where id=target),'check_id',case when op='approve' then c.id else null end));
 return jsonb_build_object('ok',true,'offer',(select nova_private.legacy_row('offers',to_jsonb(row)) from nova_private.offers row where id=target));
end $$;

-- Called by the radar worker after validation. Publishes only offers that:
-- come from an enabled official source on the same domain; have a fresh 'active' check
-- (score >= min_score, no material changes); pass the same evidence and duplicate gate as
-- the panel; have no pending user reports; and were never rejected (same page) or auto-approved before.
create function public.nova_auto_approve(input jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare cfg nova_private.auto_approval_settings; candidate record; o nova_private.offers; c nova_private.checks; v nova_private.offer_versions;
 err text; approved bigint[]:='{}'; skipped jsonb:='{}'; previous jsonb;
begin
 perform public.nova_assert_worker((input->>'worker_token')::uuid);
 if not exists(select 1 from nova_private.job_leases where token=(input->>'worker_token')::uuid and run_id=(input->>'worker_run_id')::bigint) then raise exception 'Worker run mismatch';end if;
 if (select mode from nova_private.storage_control where id=1) is distinct from 'normalized' then raise exception 'Normalized storage required';end if;
 select * into cfg from nova_private.auto_approval_settings where id=1;
 if not found or not cfg.enabled then return jsonb_build_object('enabled',false,'approved','[]'::jsonb,'offers','[]'::jsonb);end if;
 perform pg_advisory_xact_lock(71006); -- same lock as human approvals
 for candidate in
  select q.id,s.id source_key from nova_private.offers q
  join nova_private.sources s on s.id=q.source_id or (q.source_id is null and nova_private.review_url(s.url)=nova_private.review_url(q.source_url))
  where q.status='pending' and not q.reviewed and s.official and s.enabled and q.source_url ~ '^https://' and
   (nova_private.url_host(q.source_url)=nova_private.url_host(s.url) or nova_private.url_host(q.source_url) like '%.'||nova_private.url_host(s.url)) and
   not exists(select 1 from nova_private.reports r where r.offer_id=q.id and r.status='pending') and
   not exists(select 1 from nova_private.admin_actions a where a.offer_id=q.id and a.action in ('reject','auto_approve')) and
   -- A person's rejection also covers other rows pointing at the same page (tracking variants).
   not exists(select 1 from nova_private.admin_actions a join nova_private.offers r on r.id=a.offer_id
    where a.action='reject' and nova_private.review_url(r.source_url)=nova_private.review_url(q.source_url))
  order by q.id limit 500
 loop
  exit when cardinality(approved)>=cfg.max_per_run;
  select * into o from nova_private.offers where id=candidate.id for update;
  select * into c from nova_private.checks where offer_id=o.id order by checked_at desc,id desc limit 1;
  if c.id is null or c.result is distinct from 'active' or c.score is null or c.score<cfg.min_score or c.checked_at<now()-cfg.max_check_age or
   jsonb_typeof(c.signals->'material') is distinct from 'array' or jsonb_array_length(c.signals->'material')>0 then
   skipped:=jsonb_set(skipped,'{weak_check}',to_jsonb(coalesce((skipped->>'weak_check')::integer,0)+1));continue;
  end if;
  select * into v from nova_private.offer_versions where id=c.offer_version_id and offer_id=o.id;
  previous:=jsonb_build_object('status',o.status,'title',o.title,'steps',o.steps,'benefit',o.benefit,'countries',o.countries,'verification',o.verification);
  err:=nova_private.approve_offer(o,c,v,false);
  if err is not null then skipped:=jsonb_set(skipped,array[err],to_jsonb(coalesce((skipped->>err)::integer,0)+1));continue;end if;
  insert into nova_private.admin_actions(actor_id,offer_id,source_id,action,reason,details) values(null,o.id,candidate.source_key,'auto_approve',
   'Aprobación automática: fuente oficial, evidencia fuerte, sin reportes ni duplicados.',
   jsonb_build_object('before',previous,'after',(select jsonb_build_object('status',status,'title',title,'steps',steps,'benefit',benefit,'countries',countries,'verification',verification) from nova_private.offers where id=o.id),
    'check_id',c.id,'score',c.score,'min_score',cfg.min_score,'worker_run_id',(input->>'worker_run_id')::bigint));
  approved:=approved||o.id;
 end loop;
 return jsonb_build_object('enabled',true,'approved',to_jsonb(approved),'skipped',skipped,
  'offers',(select coalesce(jsonb_agg(nova_private.legacy_row('offers',to_jsonb(row)) order by id),'[]') from nova_private.offers row where id=any(approved)));
end $$;
revoke all on function nova_private.approve_offer(nova_private.offers,nova_private.checks,nova_private.offer_versions,boolean),nova_private.url_host(text),public.nova_auto_approve(jsonb) from public,anon,authenticated;
grant execute on function nova_private.approve_offer(nova_private.offers,nova_private.checks,nova_private.offer_versions,boolean),nova_private.url_host(text),public.nova_auto_approve(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
