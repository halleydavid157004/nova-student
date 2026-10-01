begin;
set local role service_role;
do $$ declare owner_id bigint; other_id bigint; nonce text; result jsonb; budget integer; begin
 insert into nova_private.subscribers(email) values('erase-owner@example.invalid') returning id,email_nonce::text into owner_id,nonce;
 insert into nova_private.subscribers(email) values('erase-other@example.invalid') returning id into other_id;
 insert into nova_private.alerts(id,subscriber_id,query) values(90001,owner_id,'private search'),(90002,other_id,'other search');
 insert into nova_private.digest_deliveries(key,alert_id,status) values(repeat('9',64),90001,'reserved');
 select coalesce(sum(used),0) into budget from nova_private.budget_usage;
 begin perform public.nova_erase_subscription(jsonb_build_object('id',other_id,'nonce',nonce));raise exception 'Cross-owner erasure';
 exception when raise_exception then if SQLERRM<>'Invalid subscription link' then raise;end if;end;
 result:=public.nova_erase_subscription(jsonb_build_object('id',owner_id,'nonce',nonce));
 if result->'removed_alert_ids'<>'[90001]'::jsonb or exists(select 1 from nova_private.subscribers where id=owner_id) or exists(select 1 from nova_private.alerts where id=90001) or exists(select 1 from nova_private.digest_deliveries where key=repeat('9',64)) then raise exception 'Erasure did not cascade';end if;
 if not exists(select 1 from nova_private.alerts where id=90002) or budget<>(select coalesce(sum(used),0) from nova_private.budget_usage) then raise exception 'Erasure damaged other data or reset budget';end if;
 begin perform public.nova_email_consent('preferences',jsonb_build_object('id',owner_id,'nonce',nonce));raise exception 'Old link survived';
 exception when raise_exception then if SQLERRM<>'Invalid subscription link' then raise;end if;end;
 begin perform public.nova_apply_changes('[{"collection":"alerts","patch":{"id":90001,"enabled":true},"expected":{"enabled":true}}]');raise exception 'Stale writer resurrected data';exception when serialization_failure then null;end;
 -- Old unconfirmed, recent request, confirmed and unrelated live data.
 insert into nova_private.subscribers(email,created_at) values('retention@example.invalid',now()-interval '31 days') returning id into owner_id;
 insert into nova_private.alerts(id,subscriber_id,created_at) values(90003,owner_id,now()-interval '31 days');
 insert into nova_private.alerts(id,subscriber_id,query,created_at,consent_requested_at) values(90004,other_id,'recent request',now()-interval '31 days',now());
 insert into nova_private.alerts(id,subscriber_id,query,created_at,consent_confirmed_at) values(90005,other_id,'confirmed',now()-interval '31 days',now()-interval '31 days');
 insert into nova_private.digest_deliveries(key,alert_id,status,created_at) values(repeat('8',64),90002,'reserved',now()-interval '91 days');
 result:=public.nova_worker_maintenance();
 if exists(select 1 from nova_private.alerts where id=90003) or exists(select 1 from nova_private.subscribers where id=owner_id) then raise exception 'Abandoned personal data retained';end if;
 if not exists(select 1 from nova_private.alerts where id=90004) or not exists(select 1 from nova_private.alerts where id=90005) or not exists(select 1 from nova_private.alerts where id=90002) then raise exception 'Cleanup deleted recent or confirmed data';end if;
 if exists(select 1 from nova_private.digest_deliveries where key=repeat('8',64)) then raise exception 'Old reserved delivery retained';end if;
 if public.nova_worker_maintenance()->'removed_alert_ids'<>'[]'::jsonb then raise exception 'Cleanup not idempotent';end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.nova_erase_subscription(jsonb)','EXECUTE') or has_function_privilege('authenticated','public.nova_erase_subscription(jsonb)','EXECUTE') then raise exception 'Public erasure RPC';end if;
 if exists(select 1 from public.nova_state where state->'alerts'<>'[]'::jsonb) then raise exception 'Legacy snapshot retains private alerts';end if;
end $$;
rollback;
