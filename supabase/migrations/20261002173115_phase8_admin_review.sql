begin;
grant select(id,raw_app_meta_data) on auth.users to service_role;
create table nova_private.admin_actions (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete set null,
 offer_id bigint references nova_private.offers(id) on delete set null,
 source_id bigint references nova_private.sources(id) on delete set null,
 action text not null check(action in ('approve','reject','edit','source')),
 reason text not null check(length(reason) between 10 and 500),
 details jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index admin_actions_actor on nova_private.admin_actions(actor_id);
create index admin_actions_offer on nova_private.admin_actions(offer_id);
create index admin_actions_source on nova_private.admin_actions(source_id);
create index admin_actions_created on nova_private.admin_actions(created_at);
alter table nova_private.admin_actions enable row level security;
revoke all on nova_private.admin_actions from public,anon,authenticated;
grant select,insert,delete on nova_private.admin_actions to service_role;
grant usage,select on sequence nova_private.admin_actions_id_seq to service_role;
create policy backend_access on nova_private.admin_actions for all to service_role using(true) with check(true);
create trigger touch_updated_at before update on nova_private.admin_actions for each row execute function nova_private.touch_updated_at();
-- Canonical URL retains meaningful plan/country query parameters. Additional shared
-- JavaScript identity checks run before approval; this guard runs inside the lock.
create function nova_private.review_url(value text) returns text
language sql immutable strict set search_path='' as $$
 with parts as(select regexp_match(value,'^(https?://)([^/?#]+)([^?#]*)(?:\?([^#]*))?(?:#.*)?$') p),
 parsed as(select lower(p[1])||regexp_replace(lower(p[2]),'^www\.','')||coalesce(nullif(regexp_replace(p[3],'/+$',''),''),'/') base,p[4] query from parts)
 select base||coalesce((select '?'||string_agg(q,'&' order by split_part(q,'=',1),q) from unnest(string_to_array(query,'&')) q
 where split_part(q,'=',1) !~* '^(utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid)$' and q<>''),'') from parsed;
$$;
create function nova_private.review_fold(value text) returns text
language sql immutable set search_path='' as $$select trim(regexp_replace(nova_private.search_text(coalesce(value,'')),'\s+',' ','g'));$$;
create function nova_private.review_item(offer_key bigint) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('offer',to_jsonb(o),'check',to_jsonb(c),'version',to_jsonb(v),'approved',
 (select extraction from nova_private.offer_versions a where a.offer_id=o.id and a.approved order by a.updated_at desc,a.id desc limit 1))
 from nova_private.offers o left join lateral(select * from nova_private.checks where offer_id=o.id order by checked_at desc,id desc limit 1)c on true
 left join nova_private.offer_versions v on v.id=c.offer_version_id where o.id=offer_key;
$$;
create function public.nova_admin_review(op text,input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=(input->>'user_id')::uuid; o nova_private.offers; s nova_private.sources; c nova_private.checks;
 v nova_private.offer_versions; x jsonb; previous jsonb; target bigint:=(input->>'id')::bigint; cursor_key bigint:=coalesce((input->>'after')::bigint,0); items jsonb;
 new_countries text[]; candidate_url text; material jsonb; item jsonb;
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
   (select id from nova_private.offers where id>cursor_key and (status<>'active' or not(official or reviewed) or liveness_status is distinct from 'active' or
    coalesce(liveness_verified_at,verified_at,discovered_at)<now()-interval '7 days') order by id limit 50) q;
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
  select * into v from nova_private.offer_versions where id=c.offer_version_id and offer_id=target;x:=v.extraction;material:=c.signals->'material';
  if c.id is distinct from (input->>'check_id')::bigint or input->'confirm_source' is distinct from 'true'::jsonb or c.checked_at<now()-interval '7 days' or c.checked_at>now()+interval '1 minute' or
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
   (x->>'expires_at')::timestamptz<=now() then return jsonb_build_object('error','evidence');end if;
  if exists(select 1 from jsonb_array_elements_text(material) m where m not in ('value_changed','benefit_changed','verification_changed','countries_changed')) or
   jsonb_array_length(x->'requirements')>20 or jsonb_array_length(x->'countries') not between 1 and 250 or
   exists(select 1 from jsonb_array_elements(x->'requirements')r where jsonb_typeof(r)<>'string' or length(r#>>'{}') not between 1 and 500) or
   exists(select 1 from jsonb_array_elements_text(x->'countries')k where k <> all(string_to_array('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW GLOBAL',' '))) then return jsonb_build_object('error','evidence');end if;
  select array_agg(distinct k order by k) into new_countries from jsonb_array_elements_text(x->'countries')k;
  candidate_url:=nova_private.review_url(o.source_url);
  if exists(select 1 from public.public_offers p where p.id<>o.id and
   (select array_agg(distinct k order by k) from unnest(p.countries)k)=new_countries and
   nova_private.review_fold(p.benefit)=nova_private.review_fold(x->>'benefit') and
   nova_private.review_fold(p.offer_type)=nova_private.review_fold(o.offer_type) and
   nova_private.review_fold(p.verification)=nova_private.review_fold(x->>'verification') and
   (nova_private.review_url(p.source_url)=candidate_url or (nova_private.review_fold(p.brand)=nova_private.review_fold(o.brand) and
    nova_private.review_fold(p.title)=nova_private.review_fold(o.title) and split_part(nova_private.review_url(p.source_url),'?',2)=split_part(candidate_url,'?',2)))) then return jsonb_build_object('error','duplicate');end if;
  update nova_private.offer_versions set approved=false where offer_id=target and approved;
  update nova_private.offer_versions set approved=true where id=v.id;
  update nova_private.offers set reviewed=true,status='active',benefit=x->>'benefit',requirements=array(select jsonb_array_elements_text(x->'requirements')),
   verification=x->>'verification',countries=new_countries,expires_at=(x->>'expires_at')::timestamptz,
   verified_at=c.checked_at,liveness_verified_at=c.checked_at,liveness_score=c.score,liveness_status='active',consecutive_failures=0,
   source_excerpt=v.evidence,extra=extra||jsonb_build_object('value',x->'value') where id=target;
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
revoke all on function nova_private.review_url(text),nova_private.review_fold(text),nova_private.review_item(bigint),public.nova_admin_review(text,jsonb) from public,anon,authenticated;
grant execute on function nova_private.review_url(text),nova_private.review_fold(text),nova_private.review_item(bigint),public.nova_admin_review(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
