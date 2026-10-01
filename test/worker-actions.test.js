import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
const dir=mkdtempSync(path.join(tmpdir(),'nova-actions-'));
Object.assign(process.env,{DATABASE_PATH:path.join(dir,'state.json'),SUPABASE_URL:'',SUPABASE_SECRET_KEY:'',RADAR_ENGINE:'actions',WORKER_ENABLED:'false',BRAVE_SEARCH_API_KEY:'fixture-only',GROQ_API_KEY:'',RESEND_API_KEY:'',SMTP_USER:'',SMTP_PASS:'',STUDENTOFFERS_DISCOVERY:'false'});
const {db}=await import('../src/db.js');
const {runDiscoveryAndScan,getWorkerStatus}=await import('../src/worker.js');
after(()=>rmSync(dir,{recursive:true,force:true}));
test('full Actions cycle does not call Render, preserves publication and emits public-only output',async t=>{
 db.sources.push({id:1,name:'Fixture',url:'https://fixture.example/student',enabled:true});
 db.offers.push({id:1,title:'Fixture benefit',benefit:'Free plan',status:'active',reviewed:true,source_url:'https://fixture.example/student',verified_at:new Date().toISOString(),email:'private-subscriber@example.invalid'});
 let calls=0;let exported;
 t.mock.method(globalThis,'fetch',async url=>{assert.match(String(url),/^https:\/\/api\.search\.brave\.com\//);calls++;return Response.json({web:{results:[]}})});
 const client={fetch:async url=>({status:String(url).includes('education.github.com')?200:403,body:'No partner entries',url,redirects:[]})};
 assert.equal((await runDiscoveryAndScan()).skipped,'external_runner');
 const cycle=runDiscoveryAndScan({actionRunner:true,sourceOptions:{client,prioritize:true},onCatalog:catalog=>exported=catalog});
 assert.equal(runDiscoveryAndScan({actionRunner:true}),cycle);
 const result=await cycle;
 assert.equal(calls,4);assert.equal(result.summary.scan.total,1);assert.equal(result.summary.scan.errors,1);
 assert.equal(result.summary.catalog.offers,1);assert.equal(db.offers[0].status,'active');
 assert.ok(!JSON.stringify(exported).includes('private-subscriber'));assert.ok(!JSON.stringify(result.summary).includes('fixture-only'));
 assert.equal(getWorkerStatus().engine,'actions');assert.equal(getWorkerStatus().localEnabled,false);
});

test('worker status reflects the external lease without freezing Render refreshes',()=>{
 db.runtime._workerExecution={status:'started',leased_until:new Date(Date.now()+60000).toISOString()};
 assert.equal(getWorkerStatus().scanning,true);assert.equal(getWorkerStatus().localScanning,false);
 db.runtime._workerExecution.leased_until='2000-01-01';assert.equal(getWorkerStatus().scanning,false);
});
