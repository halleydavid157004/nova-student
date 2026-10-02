begin;
insert into auth.users(id,raw_app_meta_data) values('44444444-4444-4444-8444-444444444444','{"nova_role":"admin"}');
insert into auth.sessions(id,user_id) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','44444444-4444-4444-8444-444444444444');
insert into nova_private.offers(id,slug,brand,title,benefit,offer_type,verification,source_url,countries,status) values
 (99000,'admin-test-a','Review Fixture','Plan educativo','Plan gratis','Free','Academic email','https://review.example.invalid/student',array['CO'],'pending'),
 (99001,'admin-test-b','Review Fixture','Plan educativo','Plan gratis','Free','Academic email','https://review.example.invalid/student?utm_source=radar',array['CO'],'pending'),
 (99002,'admin-test-c','Review Fixture','Plan educativo','Plan gratis','Free','Academic email','https://review.example.invalid/student',array['MX'],'pending');
insert into nova_private.offer_versions(offer_id,content_hash,extraction,evidence)
 select id,'review-fixture-'||id,jsonb_build_object('benefit','Plan gratis','value',null,'requirements',jsonb_build_array('Matrícula vigente'),'verification','Academic email','countries',countries,'expires_at',null,'evidence','Students can claim a free education plan.','available',true),'Students can claim a free education plan.'
 from nova_private.offers where id between 99000 and 99002;
insert into nova_private.checks(offer_id,offer_version_id,result,signals,score,checked_at)
 select o.id,v.id,'needs_review',jsonb_build_object('http',200,'final_url',o.source_url,'material','[]'::jsonb),100,now()
 from nova_private.offers o join nova_private.offer_versions v on v.offer_id=o.id where o.id between 99000 and 99002;
set local role service_role;
do $$ declare actor jsonb:='{"user_id":"44444444-4444-4444-8444-444444444444","session_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}'; input jsonb; answer jsonb; stamp timestamptz;begin
 if has_function_privilege('anon','public.nova_admin_review(text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.nova_admin_review(text,jsonb)','EXECUTE') or has_table_privilege('authenticated','nova_private.admin_actions','SELECT') then raise exception 'Admin data exposed';end if;
 if has_table_privilege('service_role','auth.users','SELECT') then raise exception 'Whole Auth users table exposed';end if;
 begin perform public.nova_admin_review('queue',actor||'{"session_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}');raise exception 'Revoked session accepted';exception when raise_exception then if SQLERRM<>'Live admin session required' then raise;end if;end;
 answer:=public.nova_admin_review('queue',actor||'{"after":98999}');if jsonb_array_length(answer->'items')<>3 then raise exception 'Missing queue';end if;
 select updated_at into stamp from nova_private.offers where id=99000;
 input:=actor||jsonb_build_object('id',99000,'expected_updated_at',stamp,'check_id',(select id from nova_private.checks where offer_id=99000),'confirm_source',true,'reason','Verifiqué la fuente oficial y requisitos.');
 update nova_private.checks set signals=signals||'{"blocked":"robots"}' where offer_id=99000;
 if public.nova_admin_review('approve',input)->>'error' is distinct from 'evidence' then raise exception 'Blocked offer approved';end if;
 update nova_private.checks set signals=signals-'blocked',checked_at=now()-interval '8 days' where offer_id=99000;
 if public.nova_admin_review('approve',input)->>'error' is distinct from 'evidence' then raise exception 'Stale offer approved';end if;
 update nova_private.checks set checked_at=now(),signals=signals||'{"material":["ended"]}' where offer_id=99000;
 if public.nova_admin_review('approve',input)->>'error' is distinct from 'evidence' then raise exception 'Ended offer approved';end if;
 update nova_private.checks set signals=signals||'{"material":[]}' where offer_id=99000;
 if public.nova_admin_review('approve',input)->>'ok' is distinct from 'true' then raise exception 'Valid human review rejected';end if;
 if not exists(select 1 from nova_private.offers where id=99000 and reviewed and not official and status='active' and verified_at=(select checked_at from nova_private.checks where offer_id=99000)) then raise exception 'Fabricated official status or verification timestamp';end if;
 if public.nova_admin_review('reject',input)->>'error' is distinct from 'conflict' then raise exception 'Stale edit overwrote approval';end if;
 select updated_at into stamp from nova_private.offers where id=99001;
 input:=actor||jsonb_build_object('id',99001,'expected_updated_at',stamp,'check_id',(select id from nova_private.checks where offer_id=99001),'confirm_source',true,'reason','Verifiqué la fuente oficial y requisitos.');
 if public.nova_admin_review('approve',input)->>'error' is distinct from 'duplicate' then raise exception 'Tracking duplicate published';end if;
 select updated_at into stamp from nova_private.offers where id=99002;
 input:=actor||jsonb_build_object('id',99002,'expected_updated_at',stamp,'check_id',(select id from nova_private.checks where offer_id=99002),'confirm_source',true,'reason','Verifiqué los requisitos para México.');
 if public.nova_admin_review('approve',input)->>'ok' is distinct from 'true' then raise exception 'Regional variant lost';end if;
 select updated_at into stamp from nova_private.offers where id=99002;
 input:=input||jsonb_build_object('expected_updated_at',stamp,'title','Título revisado','steps',jsonb_build_array('Consultar fuente'));
 if public.nova_admin_review('edit',input)->>'ok' is distinct from 'true' then raise exception 'Metadata edit failed';end if;
 if not exists(select 1 from nova_private.offers where id=99002 and benefit='Plan gratis' and status='active') then raise exception 'Edit altered validated benefit';end if;
 if (select count(*) from nova_private.admin_actions)<>3 then raise exception 'Missing audit or failed action logged';end if;
 if (public.nova_admin_review('audit',actor)->'items'->0) ? 'actor_id' then raise exception 'Actor identity exposed by panel';end if;
end $$;
reset role;
update auth.users set raw_app_meta_data='{}' where id='44444444-4444-4444-8444-444444444444';
set local role service_role;
do $$ begin
 begin perform public.nova_admin_review('queue','{"user_id":"44444444-4444-4444-8444-444444444444","session_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}');raise exception 'Revoked admin role accepted';exception when raise_exception then if SQLERRM<>'Live admin session required' then raise;end if;end;
end $$;
reset role;
rollback;
