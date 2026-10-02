import test from 'node:test';
import assert from 'node:assert/strict';
import {changesBetween,createNormalizedStorage} from '../src/storage/normalized.js';

const blank=()=>({offers:[],sources:[],alerts:[],events:[],favorites:[],runtime:{}});

test('row changes preserve unrelated rows and include expected field values',()=>{
  const before={...blank(),offers:[{id:1,title:'Approved',status:'active'},{id:2,title:'Other',status:'pending'}]};
  const after=structuredClone(before);
  after.offers[0].title='Edited';after.offers[0].updated_at='2026-09-30T00:00:00Z';
  const changes=changesBetween(before,after);
  assert.deepEqual(changes,[{collection:'offers',patch:{id:1,title:'Edited'},expected:{title:'Approved'},operation:'upsert'}]);
  assert.ok(!JSON.stringify(changes).includes('Other'));
  assert.equal(changesBetween(before,before).length,0);
});

test('row deletions require expected content and budget counters never enter runtime writes',()=>{
  const before={...blank(),alerts:[{id:4,email:'fixture@example.invalid',enabled:true}],runtime:{brave:{month:'2026-09',used:1,lookupUsed:0,lastError:null}}};
  const after=structuredClone(before);after.alerts=[];after.runtime.brave.used=2;
  const changes=changesBetween(before,after);
  assert.equal(changes.length,1);
  assert.equal(changes[0].operation,'delete');
  assert.equal(changes[0].expected.email,'fixture@example.invalid');
  after.runtime.brave.lastError='network';
  const runtime=changesBetween(before,after).find(c=>c.collection==='runtime');
  assert.deepEqual(runtime.patch.value,{lastError:'network'});
  assert.ok(!JSON.stringify(runtime).includes('lookupUsed'));
});

test('server ID blocks are unique between writers; failures keep changes pending',async()=>{
  let high=10,stored=blank(),fail=true;
  const calls=[];
  const rpc=async(name,args)=>{
    calls.push({name,args});
    if(name==='nova_activate_rows')return structuredClone(stored);
    if(name==='nova_reserve_ids'){
      const next=high;high+=1000;
      return Object.fromEntries(['offers','sources','alerts','events'].map(k=>[k,{next,last:next+999}]));
    }
    if(name==='nova_apply_changes'){
      if(fail)throw new Error('HTTP 503');
      for(const c of args.changes)stored[c.collection].push(c.patch);
      return {applied:args.changes.length};
    }
    throw new Error('Unexpected RPC');
  };
  const first=createNormalizedStorage(rpc),second=createNormalizedStorage(rpc);
  const state=await first.load({activate:true});await second.load({activate:true});
  assert.notEqual(first.nextId('offers'),second.nextId('offers'));
  state.offers.push({id:first.nextId('offers'),title:'Private candidate'});
  await assert.rejects(first.persist(state),/503/);
  fail=false;await first.persist(state);
  assert.equal(stored.offers.length,1);
  assert.ok(calls.filter(c=>c.name==='nova_apply_changes').every(c=>c.args.changes.length===1));
  await first.persist(state);
  assert.equal(stored.offers.length,1);
});

test('concurrent mutations during persistence are retained for a later transaction',async()=>{
  const saved=[];let release;
  const storage=createNormalizedStorage(async(name,args)=>{
    if(name==='nova_activate_rows')return blank();
    if(name==='nova_reserve_ids')return Object.fromEntries(['offers','sources','alerts','events'].map(k=>[k,{next:1,last:1000}]));
    saved.push(args.changes);
    if(saved.length===1)await new Promise(resolve=>{release=resolve});
  });
  const state=await storage.load({activate:true});
  state.sources.push({id:1,name:'First'});
  const first=storage.persist(state);
  state.sources.push({id:2,name:'Second'});release();await first;
  await storage.persist(state);
  assert.deepEqual(saved.map(batch=>batch.map(c=>c.patch.id)),[[1],[2]]);
});

test('a stale refresh is discarded before changing the persistence baseline',async()=>{
  let release, safe=true;const saved=[];
  const storage=createNormalizedStorage(async(name,args)=>{
    if(name==='nova_activate_rows')return blank();
    if(name==='nova_reserve_ids')return Object.fromEntries(['offers','sources','alerts','events'].map(k=>[k,{next:1,last:1000}]));
    if(name==='nova_load_rows')return new Promise(resolve=>{release=()=>resolve({...blank(),offers:[{id:9,title:'Remote'}]})});
    saved.push(args.changes);
  });
  const state=await storage.load({activate:true});
  const read=storage.load({canAdopt:()=>safe});
  state.offers.push({id:1,title:'Local'});safe=false;release();
  assert.equal(await read,null);
  await storage.persist(state);
  assert.deepEqual(saved[0].map(c=>[c.operation,c.patch.id]),[['upsert',1]]);
});

test('an alert committed during a catalog write is preserved in the baseline',async()=>{
  let release;const saved=[];
  const storage=createNormalizedStorage(async(name,args)=>{
    if(name==='nova_activate_rows')return blank();
    if(name==='nova_reserve_ids')return Object.fromEntries(['offers','sources','alerts','events'].map(k=>[k,{next:1,last:1000}]));
    if(name==='nova_create_alert')return {...args.input,created_at:'2026-09-30T00:00:00.000Z'};
    saved.push(args.changes);
    if(saved.length===1)await new Promise(resolve=>{release=resolve});
  });
  const state=await storage.load({activate:true});state.offers.push({id:1,title:'Catalog'});
  const pending=storage.persist(state);
  state.alerts.push(await storage.createAlert({id:1,email:'fixture@example.invalid'}));
  release();await pending;await storage.persist(state);
  assert.equal(saved.length,1,'the next flush must not reinsert an independently committed alert');
});

test('native erasure removes cache baseline without replaying deleted personal rows',async()=>{
 const calls=[],initial={...blank(),alerts:[{id:1,email:'fixture@example.invalid',enabled:true},{id:2,email:'other@example.invalid',enabled:true}]};
 const storage=createNormalizedStorage(async(name,args)=>{if(name==='nova_load_rows')return structuredClone(initial);calls.push({name,args});});
 const state=await storage.load();storage.forgetAlerts([1]);state.alerts=state.alerts.filter(a=>a.id!==1);await storage.persist(state);assert.equal(calls.length,0);
 state.alerts[0].enabled=false;await storage.persist(state);assert.deepEqual(calls[0].args.changes.map(c=>c.patch.id),[2]);
});

test('native admin review updates the baseline; the next unrelated flush cannot replay a rejection',async()=>{
 const initial={...blank(),offers:[{id:1,title:'Fixture',status:'active'}]},calls=[];
 const storage=createNormalizedStorage(async(name,args)=>{if(name==='nova_load_rows')return structuredClone(initial);calls.push({name,args});if(name==='nova_admin_review')return {ok:true,offer:{id:1,title:'Fixture',status:'inactive'}};});
 const state=await storage.load();const result=await storage.adminReview('reject',{id:1});Object.assign(state.offers[0],result.offer);await storage.persist(state);assert.equal(calls.length,1);
 state.offers[0].title='Edited fixture';await storage.persist(state);assert.deepEqual(calls[1].args.changes[0].patch,{id:1,title:'Edited fixture'});assert.equal(calls[1].args.changes[0].expected.status,undefined);
});

test('automatic approval refreshes the baseline with the published rows only',async()=>{
  const stored={...blank(),offers:[{id:7,title:'Plan',status:'pending',official:false},{id:8,title:'Otro',status:'pending',official:false}]};
  const calls=[];
  const rpc=async(name,args)=>{
    calls.push(name);
    if(name==='nova_activate_rows')return structuredClone(stored);
    if(name==='nova_reserve_ids')return Object.fromEntries(['offers','sources','alerts','events'].map(k=>[k,{next:100,last:1099}]));
    if(name==='nova_auto_approve'){
      assert.deepEqual(args,{input:{worker_run_id:3,worker_token:'token'}});
      return {enabled:true,approved:[7],skipped:{weak_check:1},offers:[{...stored.offers[0],status:'active',official:true}]};
    }
    if(name==='nova_apply_changes')return {};
    throw new Error('Unexpected '+name);
  };
  const storage=createNormalizedStorage(rpc);
  const state=await storage.load({activate:true});
  const result=await storage.autoApprove({worker_run_id:3,worker_token:'token'});
  assert.deepEqual(result.approved,[7]);
  state.offers[0]={...state.offers[0],...result.offers[0]};
  await storage.persist(state);
  assert.ok(!calls.includes('nova_apply_changes'),'published row must not be written back as a local edit');
});
