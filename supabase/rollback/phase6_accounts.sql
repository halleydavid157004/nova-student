-- Disable account Data API access without deleting any user data.
begin;
revoke all on public.user_profiles,public.user_favorites,public.user_saved_searches from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
-- Restore normal client grants by running the GRANT statements from the migration.
