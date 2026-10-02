begin;
insert into auth.users(id,raw_app_meta_data) values('55555555-5555-4555-8555-555555555555','{"nova_role":"admin"}');
insert into auth.sessions(id,user_id) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','55555555-5555-4555-8555-555555555555');
insert into nova_private.sources(id,name,url,official,enabled) values
 (99200,'Auto Fixture','https://auto.example.invalid/students',true,true),
 (99201,'Lead Fixture','https://lead.example.invalid/students',false,true),
 (99202,'Other Fixture','https://other.example.invalid/students',true,true);
insert into nova_private.offers(id,source_id,slug,brand,title,benefit,offer_type,verification,source_url,countries,status) values
 (99100,99200,'auto-a','Auto Fixture','Plan estudiante','Plan gratis','Free','Academic email','https://auto.example.invalid/students',array['CO'],'pending'),
 (99101,99201,'auto-b','Lead Fixture','Plan estudiante','Plan gratis','Free','Academic email','https://lead.example.invalid/students',array['CO'],'pending'),
 (99102,99202,'auto-c','Other Fixture','Plan bajo','Plan gratis','Free','Academic email','https://other.example.invalid/students',array['MX'],'pending'),
 (99103,99202,'auto-d','Other Fixture','Plan reportado','Plan gratis','Free','Academic email','https://other.example.invalid/students?plan=d',array['PE'],'pending'),
 (99104,99202,'auto-e','Other Fixture','Plan ajeno','Plan gratis','Free','Academic email','https://elsewhere.example.invalid/students',array['CL'],'pending'),
 (99105,99200,'auto-f','Auto Fixture','Plan estudiante','Plan gratis','Free','Academic email','https://auto.example.invalid/students?utm_source=x',array['CO'],'pending'),
 (99106,99202,'auto-g','Other Fixture','Plan rechazado','Plan gratis','Free','Academic email','https://other.example.invalid/students?plan=g',array['AR'],'pending');
insert into nova_private.offer_versions(offer_id,content_hash,extraction,evidence)
 select id,'auto-fixture-'||id,jsonb_build_object('benefit','Plan gratis','value',null,'requirements',jsonb_build_array('Matrícula vigente'),'verification','Academic email','countries',countries,'expires_at',null,'evidence','Students can claim a free education plan.','available',true),'Students can claim a free education plan.'
 from nova_private.offers where id between 99100 and 99106;
insert into nova_private.checks(offer_id,offer_version_id,result,signals,score,checked_at)
 select o.id,v.id,'active',jsonb_build_object('http',200,'final_url',o.source_url,'material','[]'::jsonb),case when o.id=99102 then 70 else 95 end,now()
 from nova_private.offers o join nova_private.offer_versions v on v.offer_id=o.id where o.id between 99100 and 99106;
insert into nova_private.reports(offer_id,reporter_hash,reason) values(99103,'fixture-reporter','No funciona');
insert into nova_private.admin_actions(offer_id,action,reason) values(99106,'reject','Rechazada por una persona antes.');
update nova_private.job_leases set leased_until=now()-interval '1 second';
set local role service_role;
do $$ declare lease jsonb; worker jsonb; answer jsonb; actor jsonb:='{"user_id":"55555555-5555-4555-8555-555555555555","session_id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}'; stamp timestamptz; begin
 if has_function_privilege('anon','public.nova_auto_approve(jsonb)','EXECUTE') or has_function_privilege('authenticated','public.nova_auto_approve(jsonb)','EXECUTE') then raise exception 'Auto approval exposed';end if;
 begin perform public.nova_auto_approve('{"worker_token":"ffffffff-ffff-4fff-8fff-ffffffffffff","worker_run_id":1}');raise exception 'Unleased worker accepted';
 exception when raise_exception then if SQLERRM<>'Worker lease lost' then raise;end if;end;
 lease:=public.nova_claim_worker('radar:phase12-fixture',999999,'abababab-abab-4bab-8bab-abababababab');
 worker:=jsonb_build_object('worker_token',lease->>'token','worker_run_id',(lease->>'run_id')::bigint);
 answer:=public.nova_auto_approve(worker);
 if answer->'approved' is distinct from '[99100]'::jsonb then raise exception 'Unexpected automatic approvals: %',answer;end if;
 if (answer->'skipped'->>'weak_check')::integer<>1 or (answer->'skipped'->>'duplicate')::integer<>1 then raise exception 'Skips not reported: %',answer;end if;
 if not exists(select 1 from nova_private.offers where id=99100 and status='active' and official and not reviewed and verified_at=(select checked_at from nova_private.checks where offer_id=99100)) then raise exception 'Automatic approval did not publish honestly';end if;
 if exists(select 1 from nova_private.offers where id between 99101 and 99106 and status='active') then raise exception 'Weak, reported, foreign, duplicate or rejected offer published';end if;
 if not exists(select 1 from public.public_offers where id=99100) then raise exception 'Approved offer not public';end if;
 if not exists(select 1 from nova_private.admin_actions where offer_id=99100 and action='auto_approve' and actor_id is null and (details->>'score')::integer=95) then raise exception 'Missing automatic audit';end if;
 if public.nova_auto_approve(worker)->'approved' is distinct from '[]'::jsonb then raise exception 'Automatic approval repeated';end if;
 -- Undo: the automatic approval waits in the human queue and can be rejected there.
 answer:=public.nova_admin_review('queue',actor||'{"after":99099}');
 if not exists(select 1 from jsonb_array_elements(answer->'items') i where (i->'offer'->>'id')::bigint=99100 and i->'auto_approved'='true'::jsonb) then raise exception 'Automatic approval missing from review queue';end if;
 select updated_at into stamp from nova_private.offers where id=99100;
 if public.nova_admin_review('reject',actor||jsonb_build_object('id',99100,'expected_updated_at',stamp,'reason','Revisé la aprobación automática y no aplica.'))->>'ok' is distinct from 'true' then raise exception 'Automatic approval cannot be undone';end if;
 if exists(select 1 from public.public_offers where id=99100) then raise exception 'Rejected offer still public';end if;
 if public.nova_auto_approve(worker)->'approved' is distinct from '[]'::jsonb then raise exception 'Rejected offer republished';end if;
 answer:=public.nova_admin_review('queue',actor||'{"after":99099}');
 if exists(select 1 from jsonb_array_elements(answer->'items') i where (i->'offer'->>'id')::bigint=99100 and i->'offer'->>'status'='active') then raise exception 'Queue state stale';end if;
end $$;
reset role;
update nova_private.auto_approval_settings set enabled=false where id=1;
update nova_private.checks set score=99 where offer_id=99102;
set local role service_role;
do $$ declare worker jsonb:=jsonb_build_object('worker_token','abababab-abab-4bab-8bab-abababababab','worker_run_id',(select run_id from nova_private.job_leases where name='radar')); begin
 if public.nova_auto_approve(worker)->>'enabled' is distinct from 'false' then raise exception 'Kill switch ignored';end if;
 if exists(select 1 from nova_private.offers where id=99102 and status='active') then raise exception 'Disabled approver published';end if;
end $$;
reset role;
rollback;
