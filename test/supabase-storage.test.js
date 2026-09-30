import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('Supabase storage persists ordered snapshots and loads them again',()=>{
  const program=`
    import assert from 'node:assert/strict';
    let state;
    const calls=[];
    globalThis.fetch=async (url,options={})=>{
      assert.match(url,/^https:\\/\\/sample\\.supabase\\.co\\/rest\\/v1\\/nova_state/);
      assert.equal(options.headers.apikey,'sb_secret_test');
      assert.equal(options.headers.Authorization,undefined);
      if(!options.method)return new Response(JSON.stringify(state?[{state}]:[]),{status:200});
      const row=JSON.parse(options.body);
      calls.push(row.state.alerts.length);
      await new Promise(resolve=>setTimeout(resolve,10));
      state=row.state;
      return new Response(null,{status:201});
    };
    const storage=await import('./src/db.js');
    await storage.migrate();
    storage.db.alerts.push({id:1,email:'first@example.invalid'});storage.save();
    const first=storage.flushSave();
    storage.db.alerts.push({id:2,email:'second@example.invalid'});storage.save();
    await Promise.all([first,storage.flushSave()]);
    assert.deepEqual(calls,[1,2]);
    assert.equal(storage.storageStatus().synced,true);
    await storage.migrate();
    assert.equal(storage.db.alerts.length,2);
    assert.equal(storage.db.alerts[1].email,'second@example.invalid');
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',program],{
    cwd:process.cwd(),encoding:'utf8',env:{...process.env,SUPABASE_URL:'https://sample.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',SEED_DATABASE_PATH:''},
  });
  assert.equal(result.status,0,result.stderr);
});

test('configured remote storage fails closed when it is unavailable',()=>{
  const program=`
    globalThis.fetch=async()=>{throw new Error('offline')};
    const {migrate}=await import('./src/db.js');
    await migrate();
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',program],{
    cwd:process.cwd(),encoding:'utf8',env:{...process.env,SUPABASE_URL:'https://sample.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test'},
  });
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/offline/);
});

test('failed remote writes remain unsynced and can be retried without losing data',()=>{
  const program=`
    import assert from 'node:assert/strict';
    let offline=true, stored;
    globalThis.fetch=async(_url,options)=>{
      if(!options.method)return Response.json([]);
      if(offline)return new Response(null,{status:503});
      stored=JSON.parse(options.body).state;
      return new Response(null,{status:201});
    };
    const storage=await import('./src/db.js');await storage.migrate();
    storage.db.alerts.push({id:1,email:'retry@example.invalid'});storage.save();
    await assert.rejects(storage.flushSave(),/HTTP 503/);
    assert.equal(storage.storageStatus().synced,false);assert.equal(storage.storageStatus().error,true);
    offline=false;await storage.flushSave();
    assert.equal(stored.alerts[0].email,'retry@example.invalid');
    assert.equal(storage.storageStatus().synced,true);assert.equal(storage.storageStatus().error,false);
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',program],{
    cwd:process.cwd(),encoding:'utf8',timeout:5000,env:{...process.env,SUPABASE_URL:'https://sample.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',SEED_DATABASE_PATH:''},
  });
  assert.equal(result.status,0,result.stderr);
});

test('Brave cannot send a paid request until its budget reservation is durable',()=>{
  const program=`
    import assert from 'node:assert/strict';
    let offline=true, providerCalls=0;
    globalThis.fetch=async(url,options={})=>{
      if(String(url).includes('api.search.brave.com')){providerCalls++;return Response.json({web:{results:[]}})}
      if(!options.method)return Response.json([]);
      return new Response(null,{status:offline?503:201});
    };
    const storage=await import('./src/db.js');await storage.migrate();
    const {braveSearch,braveStatus}=await import('./src/services/brave.js');
    assert.equal((await braveSearch('student offers')).error,'storage');
    assert.equal(providerCalls,0);
    assert.equal(braveStatus().budget.used,1);
    offline=false;await storage.flushSave();
    await braveSearch('student offers');
    assert.equal(providerCalls,1);
    assert.equal(braveStatus().budget.used,2);
    assert.equal(storage.storageStatus().synced,true);
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',program],{
    cwd:process.cwd(),encoding:'utf8',timeout:10000,env:{...process.env,SUPABASE_URL:'https://sample.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',SEED_DATABASE_PATH:'',BRAVE_SEARCH_API_KEY:'test-private-key',BRAVE_MONTHLY_LIMIT:'600'},
  });
  assert.equal(result.status,0,result.stderr);
});

test('shutdown waits for a remote write taking longer than eight seconds',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'nova-shutdown-'));
  const marker=path.join(dir,'saved');
  const program=`
    import {writeFileSync} from 'node:fs';
    globalThis.fetch=async(_url,options)=>{
      if(!options.method)return Response.json([]);
      await new Promise(resolve=>setTimeout(resolve,9000));
      writeFileSync(process.env.SHUTDOWN_TEST_MARKER,'persisted');return new Response(null,{status:201});
    };
    const storage=await import('./src/db.js');await storage.migrate();
    storage.db.alerts.push({id:1,email:'shutdown@example.invalid'});storage.save();
    process.kill(process.pid,'SIGTERM');
  `;
  try {
    const result=spawnSync(process.execPath,['--input-type=module','-e',program],{
      cwd:process.cwd(),encoding:'utf8',timeout:20000,env:{...process.env,SUPABASE_URL:'https://sample.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',SEED_DATABASE_PATH:'',SHUTDOWN_TEST_MARKER:marker},
    });
    assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(marker,'utf8'),'persisted');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
