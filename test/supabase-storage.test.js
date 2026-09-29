import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

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
