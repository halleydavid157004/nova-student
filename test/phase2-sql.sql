-- Runs only inside the disposable normalized SQL integration test.
begin;
set role service_role;
select public.nova_configure_validation(30);
do $$ begin
 if (select max_age_days from nova_private.validation_settings where id=1)<>30 then raise exception 'Age configuration'; end if;
 if has_function_privilege('anon','public.nova_record_check(jsonb)','EXECUTE') or has_function_privilege('anon','public.nova_submit_report(bigint,text,text)','EXECUTE') then raise exception 'Validation RPC exposed'; end if;
end $$;
select public.nova_configure_validation(14);
reset role;
commit;
begin;
set local role anon;
do $$ begin
 if (select count(*) from public.public_offers)<>2 then raise exception 'Invoker freshness permissions'; end if;
end $$;
rollback;
begin;
set role service_role;
do $$ declare input jsonb; first_result jsonb; duplicate jsonb; report jsonb; context jsonb; begin
 context:=public.nova_validation_context(14);
 if context->'approved_extraction' is null then raise exception 'Approved baseline missing'; end if;
 input:=jsonb_build_object('key','00000000-0000-4000-8000-000000000001','offer_id',14,'expected',jsonb_build_object('status','active','consecutive_failures',0),
 'check',jsonb_build_object('score',0,'state','expired','success',false,'signals',jsonb_build_object('http',404,'material',jsonb_build_array('ended')),
 'section_hash','fixture-section','extraction',null,'checked_at',now(),
 'patch',jsonb_build_object('status','active','liveness_score',0,'liveness_status','expired','consecutive_failures',1,'liveness_verified_at',null,'source_hash','fixture-section','source_excerpt',null)));
 first_result:=public.nova_record_check(input);
 duplicate:=public.nova_record_check(input);
 if first_result->>'check_id'<>duplicate->>'check_id' or (select count(*) from nova_private.checks)<>1 then raise exception 'Check not idempotent'; end if;
 if (select status from nova_private.offers where id=14)<>'active' then raise exception 'Single failure withdrew reviewed offer'; end if;
 input:=jsonb_set(input,'{key}','"00000000-0000-4000-8000-000000000002"');
 input:=jsonb_set(input,'{expected,consecutive_failures}','1');
 input:=jsonb_set(input,'{check,patch,consecutive_failures}','2');input:=jsonb_set(input,'{check,patch,status}','"inactive"');
 perform public.nova_record_check(input);
 if (select status from nova_private.offers where id=14)<>'inactive' then raise exception 'Second failure retained offer'; end if;
 input:=jsonb_set(input,'{key}','"00000000-0000-4000-8000-000000000003"');
 input:=jsonb_set(input,'{expected,status}','"inactive"');input:=jsonb_set(input,'{expected,consecutive_failures}','2');input:=jsonb_set(input,'{check,patch,status}','"active"');
 begin perform public.nova_record_check(input);raise exception 'Expected publication denial';exception when raise_exception then
  if sqlerrm not like 'Validation cannot publish%' then raise;end if;end;
 report:=public.nova_submit_report(12,repeat('a',64),'broken');
 if report->>'ok'<>'true' then raise exception 'Report failed'; end if;
 report:=public.nova_submit_report(12,repeat('a',64),'broken');
 if report->>'duplicate'<>'true' or (select count(*) from nova_private.reports)<>1 then raise exception 'Report not deduplicated'; end if;
 if (public.nova_validation_context(12)->>'report_weight')::integer<>1 then raise exception 'Report weight'; end if;
 perform public.nova_apply_changes(jsonb_build_array(
 jsonb_build_object('collection','offers','patch',jsonb_build_object('id',16,'slug','report-16','brand','Fixture','title','Report fixture','source_url','https://example.invalid/16','status','active','official',true,'verified_at',now())),
 jsonb_build_object('collection','offers','patch',jsonb_build_object('id',17,'slug','report-17','brand','Fixture','title','Report fixture','source_url','https://example.invalid/17','status','active','official',true,'verified_at',now())),
 jsonb_build_object('collection','offers','patch',jsonb_build_object('id',18,'slug','report-18','brand','Fixture','title','Report fixture','source_url','https://example.invalid/18','status','active','official',true,'verified_at',now()))));
 perform public.nova_submit_report(16,repeat('a',64),'changed');perform public.nova_submit_report(17,repeat('a',64),'expired');
 if public.nova_submit_report(18,repeat('a',64),'broken')->>'limited'<>'true' then raise exception 'Report daily cap';end if;
 perform public.nova_apply_changes('[{"collection":"offers","patch":{"id":16},"operation":"delete","expected":{}},{"collection":"offers","patch":{"id":17},"operation":"delete","expected":{}},{"collection":"offers","patch":{"id":18},"operation":"delete","expected":{}}]');
end $$;
-- Time decay is enforced by both view and RLS; success history is not renewed.
update nova_private.offers set verified_at=now()-interval '15 days' where id=12;
reset role;
commit;
begin;
set local role anon;
do $$ begin if (select count(*) from public.public_offers)<>0 then raise exception 'Stale offer still public';end if;end $$;
rollback;
begin;
set role service_role;
select public.nova_configure_validation(30);
reset role;
commit;
begin;
set local role anon;
do $$ begin if (select count(*) from public.public_offers)<>1 then raise exception 'Configured age not public';end if;end $$;
rollback;
