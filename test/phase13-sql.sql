begin;
insert into nova_private.offers(id,slug,brand,title,benefit,offer_type,verification,source_url,countries,status,official,verified_at,liveness_verified_at) values
 (99300,'report-a','Report Fixture','Plan reportado','Plan gratis','Free','Academic email','https://report.example.invalid/a',array['CO'],'active',true,now(),now()),
 (99301,'report-b','Report Fixture','Plan defendido','Plan gratis','Free','Academic email','https://report.example.invalid/b',array['CO'],'active',true,now(),now());
set local role service_role;
do $$ declare r1 text:=repeat('a',64); r2 text:=repeat('b',64); r3 text:=repeat('c',64); r4 text:=repeat('d',64); answer jsonb; begin
 answer:=public.nova_submit_report(99300,r1,'expired');
 if answer ? 'hidden' or not exists(select 1 from public.public_offers where id=99300) then raise exception 'One report hid an offer';end if;
 if public.nova_submit_report(99300,r1,'broken')->>'duplicate' is distinct from 'true' then raise exception 'Same person counted twice';end if;
 if exists(select 1 from nova_private.offers where id=99300 and status<>'active') then raise exception 'Duplicate reporter hid an offer';end if;
 answer:=public.nova_submit_report(99300,r2,'broken');
 if answer->>'hidden' is distinct from 'true' then raise exception 'Two reports did not hide: %',answer;end if;
 if exists(select 1 from public.public_offers where id=99300) then raise exception 'Reported offer still public';end if;
 if not exists(select 1 from nova_private.offers where id=99300 and status='pending' and liveness_status='needs_review') then raise exception 'Reported offer not queued for review';end if;
 if not exists(select 1 from nova_private.events where offer_id=99300 and type='offer_reported_hidden') then raise exception 'Missing review event';end if;
 -- Confirmations that it worked outweigh the same number of negative reports.
 perform public.nova_submit_report(99301,r1,'worked');perform public.nova_submit_report(99301,r2,'worked');
 perform public.nova_submit_report(99301,r3,'expired');answer:=public.nova_submit_report(99301,r4,'changed');
 if answer ? 'hidden' or not exists(select 1 from public.public_offers where id=99301) then raise exception 'Confirmed offer hidden';end if;
end $$;
reset role;
rollback;
