import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const database = process.env.NOVA_TEST_DATABASE_URL;
const pglitePath = process.env.NOVA_TEST_PGLITE_PATH;
test('normalized SQL: import, RLS, CAS, IDs, budget, legacy bridge and rollback', {
  skip: !database && !pglitePath, timeout: 60000,
}, async () => {
  // Never point the destructive test bootstrap at a remotely managed database.
  if (database) assert.ok(['127.0.0.1','localhost'].includes(new URL(database).hostname));
  const fixture = JSON.parse(readFileSync('test/fixtures/legacy-state.json','utf8'));
  fixture.runtime.brave.month = new Date().toISOString().slice(0,7);
  const literal = JSON.stringify(fixture).replaceAll("'","''");
  const migration = readFileSync('supabase/migrations/20260930144911_phase1_normalized_storage.sql','utf8');
  const rollback = readFileSync('supabase/rollback/phase1_normalized_storage.sql','utf8');
  const sql = `
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.nova_state(id integer primary key,state jsonb not null,updated_at timestamptz default now());
    grant select,insert,update on public.nova_state to service_role;
    ${migration}
    begin;
    insert into public.nova_state(id,state) values(1,'${literal}'::jsonb);
    select public.nova_import_snapshot();
    select public.nova_import_snapshot();
    do $$ begin
      if (select count(*) from nova_private.offers)<>4 or (select count(*) from nova_private.offer_versions)<>4 then raise exception 'Non-idempotent import'; end if;
      if (select count(*) from nova_private.alerts)<>2 or (select count(*) from nova_private.subscribers)<>1 then raise exception 'Subscriber normalization'; end if;
      if (select used from nova_private.budget_usage where provider='brave')<>16 then raise exception 'Budget import'; end if;
      if not exists(select 1 from nova_private.events where extra->>'legacy_source_id'='999') then raise exception 'Orphan evidence lost'; end if;
      if (select count(*) from nova_private.worker_runs)<>1 then raise exception 'Worker history duplicated'; end if;
      if not exists(select 1 from nova_private.offers where search_document @@ plainto_tsquery('spanish','educacion')) then raise exception 'Spanish unaccented FTS'; end if;
      if not exists(select 1 from nova_private.offers where search_document @@ plainto_tsquery('english','cloud')) then raise exception 'English FTS'; end if;
      if has_table_privilege('anon','nova_private.subscribers','SELECT') or has_table_privilege('anon','nova_private.alerts','SELECT') then raise exception 'Private data exposed'; end if;
      if has_function_privilege('anon','public.nova_load_rows()','EXECUTE') or has_function_privilege('authenticated','public.nova_apply_changes(jsonb)','EXECUTE') then raise exception 'Privileged RPC exposed'; end if;
      if not has_schema_privilege('service_role','extensions','USAGE') then raise exception 'Backend cannot generate search document'; end if;
    end $$;
    commit;
    begin;
    set local role anon;
    do $$ begin
      if (select count(*) from public.public_offers)<>2 then raise exception 'Public publication rule'; end if;
      begin perform 1 from nova_private.subscribers; raise exception 'Expected denial'; exception when insufficient_privilege then null; end;
      begin perform public.nova_load_rows(); raise exception 'Expected denial'; exception when insufficient_privilege then null; end;
    end $$;
    rollback;
    set role service_role;
    select public.nova_activate_rows();
    -- Disjoint fields on one row can be updated without overwriting each other.
    select public.nova_apply_changes('[{"collection":"offers","patch":{"id":12,"title":"Edited"},"expected":{"title":"Educación cloud"}}]');
    select public.nova_apply_changes('[{"collection":"offers","patch":{"id":12,"benefit":"Updated benefit"},"expected":{"benefit":"Plan gratuito"}}]');
    select public.nova_apply_changes('[{"collection":"runtime","patch":{"key":"new_key","value":{"cursor":1}},"expected":{"value":null}}]');
    do $$ declare first jsonb; second jsonb; before_time timestamptz; reservation jsonb; generated_id bigint; first_alert jsonb; duplicate_alert jsonb; begin
      begin
        perform public.nova_apply_changes('[{"collection":"offers","patch":{"id":12,"title":"Lost edit"},"expected":{"title":"Educación cloud"}}]');
        raise exception 'Expected concurrency conflict';
      exception when serialization_failure then null; end;
      begin
        perform public.nova_apply_changes('[{"collection":"runtime","patch":{"key":"new_key","value":{"cursor":2}},"expected":{"value":null}}]');
        raise exception 'Expected runtime conflict';
      exception when serialization_failure then null; end;
      if not exists(select 1 from nova_private.offers where id=12 and title='Edited' and benefit='Updated benefit') then raise exception 'Lost concurrent change'; end if;
      select updated_at into before_time from nova_private.offers where id=12;
      perform pg_sleep(0.01);
      perform public.nova_apply_changes('[{"collection":"offers","patch":{"id":12,"summary":"New summary"},"expected":{"summary":null}}]');
      if (select updated_at from nova_private.offers where id=12)<=before_time then raise exception 'Missing timestamp trigger'; end if;
      first:=public.nova_reserve_ids(10); second:=public.nova_reserve_ids(10);
      if (second->'offers'->>'next')::bigint <= (first->'offers'->>'last')::bigint then raise exception 'ID collision'; end if;
      generated_id:=(first->'alerts'->>'next')::bigint;
      first_alert:=public.nova_create_alert(jsonb_build_object('id',generated_id,'email','new-fixture@example.invalid','frequency','daily'));
      duplicate_alert:=public.nova_create_alert(jsonb_build_object('id',(second->'alerts'->>'next')::bigint,'email','new-fixture@example.invalid','frequency','daily'));
      if first_alert->>'id'<>duplicate_alert->>'id' or (select count(*) from nova_private.alerts)<>3 then raise exception 'Duplicate concurrent alert'; end if;
      reservation:=public.nova_reserve_brave(to_char(now() at time zone 'UTC','YYYY-MM'),'lookup',17);
      if (reservation->>'used')::integer<>17 or (reservation->>'lookupUsed')::integer<>5 then raise exception 'Atomic budget reservation'; end if;
      reservation:=public.nova_reserve_brave(to_char(now() at time zone 'UTC','YYYY-MM'),'discovery',17);
      if reservation->>'skipped'<>'monthly_limit' then raise exception 'Quota exceeded'; end if;
      begin update public.nova_state set state=state; raise exception 'Expected legacy writer denial'; exception when raise_exception then
        if sqlerrm not like 'Legacy snapshot writes disabled%' then raise; end if;
      end;
    end $$;
    reset role;
    ${rollback}
    do $$ begin
      if (select mode from nova_private.storage_control where id=1)<>'legacy' then raise exception 'Rollback mode'; end if;
      if not exists(select 1 from public.nova_state,jsonb_array_elements(state->'alerts') a where a->>'email'='new-fixture@example.invalid') then raise exception 'Rollback lost new subscriber'; end if;
      if (select (state->'runtime'->'brave'->>'used')::integer from public.nova_state where id=1)<>17 then raise exception 'Rollback lost budget'; end if;
      if (select count(*) from nova_private.offers)<>4 then raise exception 'Rollback dropped rows'; end if;
    end $$;
  `;
  if (pglitePath) {
    const load = relative => import(pathToFileURL(`${pglitePath}/dist/${relative}`).href);
    const [{PGlite},{unaccent},{pg_trgm}] = await Promise.all([load('index.js'),load('contrib/unaccent.js'),load('contrib/pg_trgm.js')]);
    const db = new PGlite({extensions:{unaccent,pg_trgm}});
    try { await db.exec(sql); } finally { await db.close(); }
  } else {
    const result=spawnSync('psql',[database,'-X','-v','ON_ERROR_STOP=1','--quiet'],{input:sql,encoding:'utf8',timeout:55000});
    assert.equal(result.status,0,result.stderr);
  }
});
