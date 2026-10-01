begin;
set local role service_role;
do $$ declare first jsonb; second jsonb; begin
 first:=public.nova_claim_worker('radar:fixture',10,'00000000-0000-0000-0000-000000000001');
 if first->>'run_id' is null then raise exception 'Worker not claimed';end if;
 second:=public.nova_claim_worker('validate:fixture',10,'00000000-0000-0000-0000-000000000002');
 if second->>'skipped'<>'busy' then raise exception 'Overlapping worker allowed';end if;
 perform public.nova_assert_worker('00000000-0000-0000-0000-000000000001');
 perform public.nova_record_check(jsonb_build_object('offer_id',12,'key','00000000-0000-0000-0000-000000000099','expected','{}'::jsonb,'worker_run_id',(first->>'run_id')::bigint,'worker_token','00000000-0000-0000-0000-000000000001',
 'check',jsonb_build_object('patch',jsonb_build_object('status','active','liveness_score',50,'liveness_status','needs_review','consecutive_failures',0,'liveness_verified_at',null,'source_hash','fixture','source_excerpt',null),'state','needs_review','score',50,'signals','{}'::jsonb,'extraction',null,'checked_at',now(),'success',false)));
 if not exists(select 1 from nova_private.checks where idempotency_key='00000000-0000-0000-0000-000000000099' and worker_run_id=(first->>'run_id')::bigint) then raise exception 'Check lost run provenance';end if;

 begin perform public.nova_assert_worker('00000000-0000-0000-0000-000000000002');raise exception 'Expected token denial';exception when raise_exception then if sqlerrm='Expected token denial' then raise;end if;end;
 perform public.nova_finish_worker('00000000-0000-0000-0000-000000000001','completed','{"scan":{"total":1}}');
 second:=public.nova_claim_worker('radar:fixture',10,'00000000-0000-0000-0000-000000000002');
 if second->>'skipped'<>'already_completed' then raise exception 'Completed window repeated';end if;
 first:=public.nova_claim_worker('radar:retry',11,'00000000-0000-0000-0000-000000000003');
 perform public.nova_finish_worker('00000000-0000-0000-0000-000000000003','failed','{"error":"fixture"}');
 second:=public.nova_claim_worker('radar:retry',11,'00000000-0000-0000-0000-000000000004');
 if (second->>'attempt')::int<>2 then raise exception 'Failed attempt not resumable';end if;
 update nova_private.job_leases set leased_until=now()-interval '1 second';
 first:=public.nova_claim_worker('radar:after-abandon',12,'00000000-0000-0000-0000-000000000005');
 if not exists(select 1 from nova_private.worker_runs where job_key='radar:retry' and summary->>'error'='lease_expired') then raise exception 'Abandonment not recorded';end if;
 perform public.nova_finish_worker('00000000-0000-0000-0000-000000000005','completed','{}');
 if has_function_privilege('anon','public.nova_claim_worker(text,bigint,uuid)','EXECUTE') or has_table_privilege('anon','nova_private.job_leases','SELECT') then raise exception 'Worker controls exposed';end if;
 -- No consent, no reservation and no provider cost.
 first:=public.nova_claim_digest(21,repeat('a',64));
 if first->>'skipped'<>'unconfirmed' then raise exception 'Unconfirmed mail allowed';end if;
 update nova_private.subscribers set consent_status='confirmed' where email='fixture@example.invalid';
 first:=public.nova_claim_digest(21,repeat('a',64));
 if first->>'key' is null then raise exception 'Digest reservation failed';end if;
 second:=public.nova_claim_digest(21,repeat('a',64));
 if second->>'skipped'<>'already_reserved' then raise exception 'Duplicate mail reserved';end if;
 perform public.nova_finish_digest(repeat('a',64),'sent','fixture-provider-id');
 if (select last_sent_at from nova_private.alerts where id=21) is null then raise exception 'Receipt not persisted';end if;
 update nova_private.budget_usage set daily_used=90 where provider='resend';
 first:=public.nova_claim_digest(21,repeat('b',64));if first->>'skipped'<>'quota' then raise exception 'Daily mail cap exceeded';end if;
 update nova_private.budget_usage set used=2700,daily_used=0 where provider='resend';
 first:=public.nova_claim_digest(21,repeat('c',64));if first->>'skipped'<>'quota' then raise exception 'Monthly mail cap exceeded';end if;
 update nova_private.budget_usage set used=1,daily_used=90,usage_day=current_date-1 where provider='resend';
 first:=public.nova_claim_digest(21,repeat('d',64));if (first->>'daily_used')::int<>1 then raise exception 'Daily reset failed';end if;
 perform public.nova_finish_digest(repeat('d',64),'uncertain',null);
 if has_function_privilege('authenticated','public.nova_claim_digest(bigint,text)','EXECUTE') or has_table_privilege('anon','nova_private.digest_deliveries','SELECT') then raise exception 'Recipient metadata exposed';end if;
 -- Maintenance retains approvals and current budgets.
 perform public.nova_worker_maintenance();
 if not exists(select 1 from nova_private.offer_versions where approved) or not exists(select 1 from nova_private.budget_usage where provider='brave') then raise exception 'Maintenance erased retained state';end if;
end $$;
commit;
