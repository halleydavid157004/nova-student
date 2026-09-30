import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('HTTP API boots from normalized RPCs, preserves public gating and saves alert rows',()=>{
  const program=`
    import assert from 'node:assert/strict';
    import {readFileSync} from 'node:fs';
    import {createServer} from 'node:net';
    const fixture=JSON.parse(readFileSync('test/fixtures/legacy-state.json','utf8'));
    let remote=structuredClone(fixture);
    const requests=[];
    const nativeFetch=globalThis.fetch;
    globalThis.fetch=async(url,options={})=>{
      const parsed=new URL(url);
      if(parsed.hostname==='127.0.0.1')return nativeFetch(url,options);
      assert.equal(parsed.hostname,'sample.supabase.co');
      assert.ok(parsed.pathname.startsWith('/rest/v1/rpc/'),'never writes a full nova_state snapshot');
      assert.equal(options.headers.apikey,'sb_secret_fixture');
      const name=parsed.pathname.split('/').pop();requests.push(name);
      const args=JSON.parse(options.body||'{}');
      if(name==='nova_activate_rows'||name==='nova_load_rows')return Response.json(remote);
      if(name==='nova_reserve_ids')return Response.json(Object.fromEntries(['offers','sources','events','alerts'].map(k=>[k,{next:1000,last:1999}])));
      if(name==='nova_create_alert'){
        remote.alerts.push(args.input);
        return Response.json(args.input);
      }
      throw new Error('Unexpected RPC '+name);
    };
    const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));
    const port=listener.address().port;await new Promise(r=>listener.close(r));
    process.env.PORT=String(port);
    await import('./server.js');
    const base='http://127.0.0.1:'+port;
    let health;
    for(let i=0;i<60;i++){
      try{health=await (await fetch(base+'/api/health')).json();if(health.ok)break}catch{}
      await new Promise(r=>setTimeout(r,20));
    }
    assert.equal(health.storage.schema,'normalized');assert.equal(health.storage.synced,true);
    const offers=await (await fetch(base+'/api/offers')).json();
    assert.deepEqual(offers.offers.map(o=>o.id).sort(),[12,14]);
    assert.equal((await fetch(base+'/api/offers/13')).status,404);
    assert.equal((await fetch(base+'/api/worker-status')).status,200);
    const response=await fetch(base+'/api/alerts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'api-fixture@example.invalid',frequency:'daily'})});
    assert.equal(response.status,200);assert.equal((await response.json()).id,1000);
    assert.ok(remote.alerts.some(a=>a.email==='api-fixture@example.invalid'));
    assert.ok(requests.includes('nova_create_alert'));
    assert.ok(!requests.includes('nova_apply_changes'),'alert creation leaves catalog rows untouched');
    process.kill(process.pid,'SIGTERM');
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',program],{
    encoding:'utf8',timeout:15000,
    env:{...process.env,SUPABASE_URL:'https://sample.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture',
      SUPABASE_STORAGE_MODE:'normalized',WORKER_ENABLED:'false',ADMIN_TOKEN:'',GROQ_API_KEY:'',
      BRAVE_SEARCH_API_KEY:'',RESEND_API_KEY:'',SMTP_USER:'',SMTP_PASS:'',SEED_DATABASE_PATH:''},
  });
  assert.equal(result.status,0,result.stderr);
});
