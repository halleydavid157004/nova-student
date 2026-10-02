begin;
insert into auth.users(id) values('33333333-3333-4333-8333-333333333333');
insert into auth.sessions(id,user_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333');
insert into public.user_profiles(user_id,career) values('33333333-3333-4333-8333-333333333333','Private career');
insert into public.user_favorites(user_id,offer_id) values('33333333-3333-4333-8333-333333333333',12);
insert into public.user_saved_searches(user_id,query) values('33333333-3333-4333-8333-333333333333','Private query');
insert into nova_private.subscribers(email,user_id) values('erase-account@example.invalid','33333333-3333-4333-8333-333333333333');
insert into nova_private.alerts(id,subscriber_id) select 91001,id from nova_private.subscribers where email='erase-account@example.invalid';
insert into nova_private.digest_deliveries(key,alert_id,status) values(repeat('7',64),91001,'reserved');
set local role service_role;
do $$ declare result jsonb; claimed jsonb; budget integer; before_other bigint; begin
 select coalesce(sum(used),0) into budget from nova_private.budget_usage;
 select count(*) into before_other from public.user_saved_searches where user_id='22222222-2222-4222-8222-222222222222';
 begin perform public.nova_account_deletion('begin','{"user_id":"33333333-3333-4333-8333-333333333333","email":"erase-account@example.invalid","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}');raise exception 'Missing session accepted';exception when raise_exception then if SQLERRM<>'Live account session required' then raise;end if;end;
 result:=public.nova_account_deletion('begin','{"user_id":"33333333-3333-4333-8333-333333333333","email":"erase-account@example.invalid","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
 perform public.nova_account_deletion('begin','{"user_id":"33333333-3333-4333-8333-333333333333","email":"erase-account@example.invalid","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}');
 if (select count(*) from public.account_deletions)<>1 then raise exception 'Duplicate deletion marker';end if;
 if exists(select 1 from public.user_profiles where user_id='33333333-3333-4333-8333-333333333333') or exists(select 1 from public.user_favorites where user_id='33333333-3333-4333-8333-333333333333') or exists(select 1 from public.user_saved_searches where user_id='33333333-3333-4333-8333-333333333333') then raise exception 'Account data retained';end if;
 if exists(select 1 from nova_private.alerts where id=91001) or exists(select 1 from nova_private.digest_deliveries where key=repeat('7',64)) or exists(select 1 from nova_private.subscribers where email='erase-account@example.invalid') then raise exception 'Account email data retained';end if;
 if before_other<>(select count(*) from public.user_saved_searches where user_id='22222222-2222-4222-8222-222222222222') or budget<>(select coalesce(sum(used),0) from nova_private.budget_usage) then raise exception 'Other data or budget changed';end if;
 claimed:=public.nova_account_deletion('claim',jsonb_build_object('hash',result->>'hash'));
 if claimed->>'user_id'<>'33333333-3333-4333-8333-333333333333' then raise exception 'Wrong queued identity';end if;
 if public.nova_account_deletion('claim',jsonb_build_object('hash',result->>'hash'))->>'skipped'<>'backoff' then raise exception 'Claim repeated without backoff';end if;
 if public.nova_account_deletion('queue','{}')<>'[]'::jsonb then raise exception 'Backoff ignored by queue';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
do $$ begin
 -- Auth user still exists and JWT remains valid, but no private data can be recreated.
 begin insert into public.user_profiles(user_id) values(auth.uid());raise exception 'Old JWT recreated profile';exception when insufficient_privilege then null;end;
 begin insert into public.user_favorites(user_id,offer_id) values(auth.uid(),12);raise exception 'Old JWT recreated favorites';exception when insufficient_privilege then null;end;
 begin insert into public.user_saved_searches(user_id,query) values(auth.uid(),'restore');raise exception 'Old JWT recreated search';exception when insufficient_privilege then null;end;
 begin perform public.nova_account_deletion('begin','{}');raise exception 'Public deletion RPC';exception when insufficient_privilege then null;end;
 begin perform user_id from public.account_deletions;raise exception 'Pending identity exposed';exception when insufficient_privilege then null;end;
 if (select count(user_hash) from public.account_deletions)<>1 then raise exception 'Own marker not visible';end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if (select count(user_hash) from public.account_deletions)<>0 then raise exception 'Other marker visible';end if;
 if (select count(*) from public.user_profiles)<>1 then raise exception 'Other account blocked';end if;
end $$;
reset role;
-- Simulate the hard deletion/cascade performed by Auth Admin, not direct production SQL.
delete from auth.users where id='33333333-3333-4333-8333-333333333333';
do $$ begin if exists(select 1 from auth.sessions where user_id='33333333-3333-4333-8333-333333333333') then raise exception 'Sessions retained after hard delete';end if;end $$;
set local role service_role;
select public.nova_account_deletion('finish',jsonb_build_object('hash',encode(sha256(convert_to('33333333-3333-4333-8333-333333333333','UTF8')),'hex'),'user_id','33333333-3333-4333-8333-333333333333'));
do $$ begin if exists(select 1 from public.account_deletions where user_id is not null or completed_at is null) then raise exception 'Completed marker retains identity';end if;end $$;
update public.account_deletions set completed_at=now()-interval '15 days';
select public.nova_account_deletion('queue','{}');
do $$ begin if exists(select 1 from public.account_deletions) then raise exception 'Completed marker not purged';end if;end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin
 begin insert into public.user_profiles(user_id) values(auth.uid());raise exception 'Deleted Auth parent recreated';exception when foreign_key_violation then null;end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.nova_account_deletion(text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.nova_account_deletion(text,jsonb)','EXECUTE') then raise exception 'Deletion RPC exposed';end if;
 if not (select relrowsecurity from pg_class where oid='public.account_deletions'::regclass) then raise exception 'Deletion RLS missing';end if;
end $$;
rollback;
