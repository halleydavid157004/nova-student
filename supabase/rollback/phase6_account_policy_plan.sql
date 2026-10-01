-- Restore the previous equivalent policy expressions without changing access.
begin;
alter policy own_select on public.user_profiles using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
alter policy own_insert on public.user_profiles with check (((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false'));
alter policy own_update on public.user_profiles using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false') with check ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
alter policy own_delete on public.user_profiles using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
alter policy own_select on public.user_favorites using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
alter policy own_insert on public.user_favorites with check (((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false') and exists(select 1 from public.public_offers o where o.id=offer_id));
alter policy own_delete on public.user_favorites using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
alter policy own_select on public.user_saved_searches using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
alter policy own_insert on public.user_saved_searches with check (((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false'));
alter policy own_update on public.user_saved_searches using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false') with check ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
alter policy own_delete on public.user_saved_searches using ((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
notify pgrst,'reload schema';
commit;
