-- Backend reads only session identity columns for sensitive-action verification.
grant select(id,user_id) on auth.sessions to service_role;
-- Deny account data immediately, even while an old JWT remains cryptographically valid.
create table public.account_deletions (
 user_hash text primary key check(user_hash ~ '^[a-f0-9]{64}$'),
 updated_at timestamptz not null default now(),
 user_id uuid,requested_at timestamptz not null default now(),completed_at timestamptz,
 attempts integer not null default 0 check(attempts>=0),next_attempt_at timestamptz not null default now(),
 check(user_id is null or user_hash=encode(sha256(convert_to(user_id::text,'UTF8')),'hex')),
 check((completed_at is null and user_id is not null) or (completed_at is not null and user_id is null))
);
create index account_deletions_queue_idx on public.account_deletions(next_attempt_at) where completed_at is null;
create index account_deletions_completed_idx on public.account_deletions(completed_at) where completed_at is not null;
create trigger account_deletions_touch before update on public.account_deletions for each row execute function public.nova_account_touch();
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from public,anon,authenticated,service_role;
grant select(user_hash) on public.account_deletions to authenticated;
grant select,insert,update,delete on public.account_deletions to service_role;
create policy own_marker on public.account_deletions for select to authenticated
 using(user_hash=encode(sha256(convert_to((select auth.uid())::text,'UTF8')),'hex'));
create policy backend_access on public.account_deletions for all to service_role using(true) with check(true);

create policy deletion_gate on public.user_profiles as restrictive for all to authenticated
 using(not exists(select 1 from public.account_deletions where user_hash=encode(sha256(convert_to((select auth.uid())::text,'UTF8')),'hex')))
 with check(not exists(select 1 from public.account_deletions where user_hash=encode(sha256(convert_to((select auth.uid())::text,'UTF8')),'hex')));
create policy deletion_gate on public.user_favorites as restrictive for all to authenticated
 using(not exists(select 1 from public.account_deletions where user_hash=encode(sha256(convert_to((select auth.uid())::text,'UTF8')),'hex')))
 with check(not exists(select 1 from public.account_deletions where user_hash=encode(sha256(convert_to((select auth.uid())::text,'UTF8')),'hex')));
create policy deletion_gate on public.user_saved_searches as restrictive for all to authenticated
 using(not exists(select 1 from public.account_deletions where user_hash=encode(sha256(convert_to((select auth.uid())::text,'UTF8')),'hex')))
 with check(not exists(select 1 from public.account_deletions where user_hash=encode(sha256(convert_to((select auth.uid())::text,'UTF8')),'hex')));

create function public.nova_account_deletion(op text,input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid; marker public.account_deletions; hashed text; removed jsonb;
begin
 if (select mode from nova_private.storage_control where id=1) is distinct from 'normalized' then raise exception 'Normalized storage required';end if;
 if op='queue' then
  -- A completed hard deletion has no Auth parent; FK prevents old JWT inserts.
  delete from public.account_deletions where completed_at<now()-interval '14 days';
  return coalesce((select jsonb_agg(jsonb_build_object('hash',q.user_hash)) from
   (select user_hash from public.account_deletions where completed_at is null and next_attempt_at<=now() order by next_attempt_at,user_hash limit 5) q),'[]');
 elsif op='begin' then
  uid:=(input->>'user_id')::uuid;
  if uid is null or input->>'email' is null or length(input->>'email')>254 or input->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Verified account required';end if;
  if not exists(select 1 from auth.sessions where id=(input->>'session_id')::uuid and user_id=uid) then raise exception 'Live account session required';end if;
  perform pg_advisory_xact_lock(71005);
  perform pg_advisory_xact_lock(hashtextextended(uid::text,6));
  hashed:=encode(sha256(convert_to(uid::text,'UTF8')),'hex');
  insert into public.account_deletions(user_hash,user_id) values(hashed,uid) on conflict do nothing;
  delete from public.user_favorites where user_id=uid;
  delete from public.user_saved_searches where user_id=uid;
  delete from public.user_profiles where user_id=uid;
  select coalesce(jsonb_agg(a.id),'[]') into removed from nova_private.alerts a join nova_private.subscribers s on s.id=a.subscriber_id
   where s.user_id=uid or s.email=lower(trim(input->>'email'));
  delete from nova_private.subscribers where user_id=uid or email=lower(trim(input->>'email'));
  return jsonb_build_object('hash',hashed,'removed_alert_ids',removed);
 end if;
 if input->>'hash' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid deletion request';end if;
 select * into marker from public.account_deletions where user_hash=input->>'hash' for update;
 if not found or marker.completed_at is not null then return jsonb_build_object('skipped','unavailable');end if;
 if op='claim' then
  if marker.next_attempt_at>now() then return jsonb_build_object('skipped','backoff');end if;
  update public.account_deletions set attempts=attempts+1,next_attempt_at=now()+make_interval(hours=>least(24,power(2,least(attempts,5))::int)) where user_hash=marker.user_hash;
  return jsonb_build_object('hash',marker.user_hash,'user_id',marker.user_id);
 elsif op='finish' then
  -- Backend only: called after Admin GET proves the Auth user no longer exists.
  if marker.user_id is distinct from (input->>'user_id')::uuid then raise exception 'Deletion identity mismatch';end if;
  delete from public.user_profiles where user_id=marker.user_id;
  delete from public.user_favorites where user_id=marker.user_id;
  delete from public.user_saved_searches where user_id=marker.user_id;
  update public.account_deletions set user_id=null,completed_at=now() where user_hash=marker.user_hash;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Invalid deletion operation';
end $$;
revoke all on function public.nova_account_deletion(text,jsonb) from public,anon,authenticated;
grant execute on function public.nova_account_deletion(text,jsonb) to service_role;
notify pgrst,'reload schema';
