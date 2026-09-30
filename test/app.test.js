import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function freePort() {
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}

test('HTTP API: arranque, búsqueda, alertas, seguridad y estado de IA', async t => {
  const dir=mkdtempSync(path.join(tmpdir(),'nova-test-'));
  const database=path.join(dir,'db.json');
  const port=await freePort();
  const server=spawn(process.execPath,['server.js'],{
    env:{...process.env,PORT:String(port),DATABASE_PATH:database,WORKER_ENABLED:'false',GROQ_API_KEY:'',ADMIN_TOKEN:'',RESEND_API_KEY:'',RESEND_FROM:'',SMTP_USER:'',SMTP_PASS:'',SUPABASE_URL:'',SUPABASE_SECRET_KEY:''},
    stdio:['ignore','pipe','pipe']
  });
  const base=`http://127.0.0.1:${port}`;
  const request=(route,options)=>fetch(base+route,options);
  try {
    let ready=false;
    for(let i=0;i<60;i++){
      if(server.exitCode!==null) throw new Error('Server exited during startup');
      try {const r=await request('/api/health');ready=r.ok; if(ready)break;}catch{}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(ready,'server starts and responds');
    await t.test('public pages and catalogs',async()=>{
      const home=await request('/'); assert.equal(home.status,200);assert.match(await home.text(),/Nova Student/);
      const css=await request('/styles.css'); assert.equal(css.status,200);
      const js=await request('/app.js'); assert.equal(js.status,200);
      const offers=await (await request('/api/offers?limit=500')).json(); assert.ok(offers.offers.length>20);
      assert.ok(offers.offers.every(o=>o.official||o.reviewed),'unreviewed crawler leads stay off the public catalog');
      const bypass=await (await request('/api/offers?status=active&limit=500')).json();
      assert.equal(bypass.offers.length,offers.offers.length);
      const sources=await (await request('/api/sources?limit=1000')).json(); assert.ok(sources.sources.length>=40);
      const stats=await (await request('/api/stats')).json(); assert.equal(stats.total,offers.offers.length);
      const worker=await (await request('/api/worker-status')).json();assert.equal(worker.worker.intervalHours,6);assert.ok(worker.worker.brave.budget.limit<=600);
      assert.equal(worker.worker.brave.enabled,Boolean(process.env.BRAVE_SEARCH_API_KEY));
      const categories=await (await request('/api/categories')).json();assert.ok(categories.categories.length>5);
      const domain=await (await request('/api/domain-offers?domain=notion.com')).json(); assert.ok(domain.offers.length>0);
      const search=await (await request('/api/offers?q=notion')).json();assert.ok(search.offers.some(x=>/notion/i.test(x.brand)));
      assert.equal((await request('/api/offers/99999999')).status,404);
    });
    await t.test('AI returns a clear configuration error',async()=>{
      const status=await (await request('/api/ai/status')).json();assert.equal(status.enabled,false);
      const r=await request('/api/ai/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'Hola'})});
      assert.equal(r.status,503);assert.match((await r.json()).error,/configurad/);
      const invalid=await request('/api/ai/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:''})});assert.equal(invalid.status,400);
    });
    await t.test('admin endpoints reject the example token',async()=>{
      const headers={authorization:'Bearer change-me-now'};
      assert.equal((await request('/api/alerts',{headers})).status,401);
      assert.equal((await request('/api/admin/scan',{method:'POST',headers})).status,401);
    });
    await t.test('alert validation and isolated persistence',async()=>{
      const headers={'content-type':'application/json'};
      const bad=await request('/api/alerts',{method:'POST',headers,body:JSON.stringify({email:'invalid'})});assert.equal(bad.status,400);
      const good=await request('/api/alerts',{method:'POST',headers,body:JSON.stringify({email:'test@example.invalid',frequency:'daily'})});assert.equal(good.status,200);
    });
    await t.test('favorites are no longer shared on the server',async()=>{
      assert.equal((await request('/api/favorites')).status,404);
    });
    await t.test('invalid JSON shapes and filters return 400; alert bursts return 429',async()=>{
      const headers={'content-type':'application/json'};
      for(const payload of [null,[],{email:'test@example.invalid',country:{}}]){
        assert.equal((await request('/api/alerts',{method:'POST',headers,body:JSON.stringify(payload)})).status,400);
      }
      const responses=[];
      for(let i=0;i<21;i++)responses.push(await request('/api/alerts',{method:'POST',headers,body:JSON.stringify({email:'test@example.invalid',frequency:'daily'})}));
      const limited=responses.find(r=>r.status===429);
      assert.ok(limited,'a burst cannot write unlimited subscriptions');
      assert.ok(Number(limited.headers.get('retry-after'))>0);
      const accepted=responses.find(r=>r.status===200);
      assert.equal((await accepted.json()).deliveryConfigured,false,'missing mail setup is reported honestly');
    });
  } finally {
    server.kill('SIGTERM');
    await new Promise(resolve=>server.once('exit',resolve));
    rmSync(dir,{recursive:true,force:true});
  }
});
