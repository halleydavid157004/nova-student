-- Phase 6 foundation: each authenticated permanent user owns their account rows.
begin;
create table public.user_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 country text check(country is null or country=any(array['AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW']::text[])),
 career varchar(80) not null default '',
 email_type text not null default 'unknown' check(email_type in ('educational','personal','unknown')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.user_favorites (
 user_id uuid not null references auth.users(id) on delete cascade,
 offer_id bigint not null references nova_private.offers(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,offer_id)
);
create index user_favorites_offer_id_idx on public.user_favorites(offer_id);
create table public.user_saved_searches (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 query varchar(200) not null default '',
 country text not null default 'ALL' check(country='ALL' or country=any(array['AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW']::text[])),
 category varchar(80) not null default 'ALL',verification varchar(80) not null default 'ALL',
 email_filter text not null default 'ALL' check(email_filter in ('ALL','educational','any','none','unknown')),
 verified_week boolean not null default false,
 frequency text not null default 'daily' check(frequency in ('instant','daily','weekly')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index user_saved_searches_user_id_idx on public.user_saved_searches(user_id);
create function public.nova_account_touch() returns trigger
language plpgsql security invoker set search_path='' as $$
begin new.updated_at=clock_timestamp();return new;end $$;
revoke all on function public.nova_account_touch() from public,anon,authenticated;
create trigger user_profiles_touch before update on public.user_profiles for each row execute function public.nova_account_touch();
create trigger user_saved_searches_touch before update on public.user_saved_searches for each row execute function public.nova_account_touch();

-- A per-user advisory lock makes quotas safe across concurrent devices.
create function public.nova_account_quota() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user='authenticated' and ((select auth.uid()) is distinct from new.user_id or coalesce((select auth.jwt()->>'is_anonymous'),'false')<>'false') then raise exception 'Account ownership required' using errcode='42501';end if;
 if pg_catalog.pg_database_size(pg_catalog.current_database())>400*1024*1024 then raise exception 'Free storage safety limit' using errcode='23514';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,6));
 if tg_table_name='user_favorites' then
  if not exists(select 1 from public.user_favorites where user_id=new.user_id and offer_id=new.offer_id)
   and (select count(*) from public.user_favorites where user_id=new.user_id)>=1000 then raise exception 'Favorite quota reached' using errcode='23514';end if;
 else
  if not exists(select 1 from public.user_saved_searches where id=new.id and user_id=new.user_id)
   and (select count(*) from public.user_saved_searches where user_id=new.user_id)>=50 then raise exception 'Saved search quota reached' using errcode='23514';end if;
 end if;
 return new;
end $$;
revoke all on function public.nova_account_quota() from public,anon,authenticated;
create trigger user_favorites_quota before insert on public.user_favorites for each row execute function public.nova_account_quota();
create trigger user_saved_searches_quota before insert on public.user_saved_searches for each row execute function public.nova_account_quota();

alter table public.user_profiles enable row level security;
alter table public.user_favorites enable row level security;
alter table public.user_saved_searches enable row level security;
revoke all on public.user_profiles,public.user_favorites,public.user_saved_searches from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.user_profiles,public.user_saved_searches to authenticated;
grant select,insert,delete on public.user_favorites to authenticated;
grant select,insert,update,delete on public.user_profiles,public.user_favorites,public.user_saved_searches to service_role;
create policy own_select on public.user_profiles for select to authenticated using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy own_insert on public.user_profiles for insert to authenticated with check (((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false'));
create policy own_update on public.user_profiles for update to authenticated using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false') with check ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy own_delete on public.user_profiles for delete to authenticated using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy backend_access on public.user_profiles for all to service_role using(true) with check(true);
create policy own_select on public.user_favorites for select to authenticated using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy own_insert on public.user_favorites for insert to authenticated with check (((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false') and exists(select 1 from public.public_offers o where o.id=offer_id));
create policy own_delete on public.user_favorites for delete to authenticated using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy backend_access on public.user_favorites for all to service_role using(true) with check(true);
create policy own_select on public.user_saved_searches for select to authenticated using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy own_insert on public.user_saved_searches for insert to authenticated with check (((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false'));
create policy own_update on public.user_saved_searches for update to authenticated using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false') with check ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy own_delete on public.user_saved_searches for delete to authenticated using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy backend_access on public.user_saved_searches for all to service_role using(true) with check(true);
notify pgrst,'reload schema';
commit;
