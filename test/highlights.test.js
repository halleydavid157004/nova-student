import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {highlights} from '../public/search/highlights.js';
import {publicCatalog} from '../src/services/catalog-export.js';
import {prioritizedSources} from '../src/services/scan-priority.js';
const now=Date.now(),day=86400000;
const offer={id:1,status:'active',official:true,verified_at:new Date(now-day).toISOString(),confidence:99,offer_type:'free',requires_card:false,benefit:'Licencia educativa',requirements:['Matrícula vigente'],tags:['hot'],source_url:'https://example.org/student'};
const keys=o=>highlights(o,{now}).map(h=>h.key);
test('highlights use approved data and documented criteria, not legacy tags',()=>{
 assert.deepEqual(keys(offer),['hot','imperdible']);
 assert.deepEqual(keys({...offer,confidence:89,tags:['hot','must-have']}),[]);
 assert.deepEqual(keys({...offer,requires_card:undefined}),['hot']);
 assert.deepEqual(keys({...offer,requirements:[]}),['hot']);
 assert.deepEqual(keys({...offer,offer_type:'discount'}),['hot']);
 assert.deepEqual(keys({...offer,liveness_score:80}),[]);
});
test('uncertain, future, stale, expired and unapproved offers never receive highlights',()=>{
 for(const patch of [{official:false},{status:'pending'},{verified_at:new Date(now+day).toISOString()},{verified_at:new Date(now-8*day).toISOString()},{expires_at:'invalid'},{expires_at:new Date(now-day).toISOString()},{liveness_status:'needs_review'},{liveness_status:'blocked'}])assert.deepEqual(keys({...offer,...patch}),[]);
 assert.deepEqual(keys({...offer,expires_at:new Date(now+5*day).toISOString()}),['hot','imperdible','expiring']);
 assert.deepEqual(keys({...offer,liveness_verified_at:new Date(now-8*day).toISOString()}),[]);
 assert.deepEqual(highlights(offer,{now,maxAge:0}),[]);
});
test('catalog computes labels instead of accepting externally supplied promotion claims',()=>{
 const row=publicCatalog([{...offer,highlights:[{label:'Inventada'}]}]).offers[0];
 assert.deepEqual(row.highlights.map(h=>h.key),['hot','imperdible']);
 assert.ok(!JSON.stringify(row).includes('Inventada'));
});
test('due approved offers get scan capacity without bypassing terms or backoff',()=>{
 const sources=Array.from({length:6},(_,i)=>({id:i+1,url:`https://example.org/${i+1}`,enabled:true,last_checked_at:i<3?null:new Date(now).toISOString()}));
 const offers=[{...offer,source_url:'https://example.org/6?utm_source=radar',verified_at:new Date(now-2*day).toISOString()}];
 assert.deepEqual(prioritizedSources(sources,offers,{now,limit:3}).map(s=>s.id),[6,1,2]);
 sources[5].next_retry_at=new Date(now+day).toISOString();
 assert.deepEqual(prioritizedSources(sources,offers,{now,limit:3}).map(s=>s.id),[1,2,3]);
 assert.deepEqual(prioritizedSources(sources,offers,{now,limit:0}),[]);
 const many=Array.from({length:4},(_,i)=>({...offer,source_url:`https://example.org/${i+3}`,verified_at:new Date(now-2*day).toISOString()}));
 sources[5].next_retry_at=null;
 // Two of three slots go to due published offers even when older sources are waiting.
 assert.deepEqual(prioritizedSources(sources,many,{now,limit:3}).map(s=>s.id),[3,4,1]);
});

test('production workflows select the existing secrets environment and retain explicit stop',()=>{
 for(const file of ['radar-schedule.yml','validate-offers.yml']){const workflow=readFileSync('.github/workflows/'+file,'utf8');assert.match(workflow,/environment: Variables/);assert.match(workflow,/RADAR_ACTIONS_ENABLED != 'false'/);assert.match(workflow,/group: nova-radar-writer/);assert.match(workflow,/timeout-minutes: 25/);}
});

test('official sources with never-checked candidates come right after due published offers',()=>{
 const sources=Array.from({length:12},(_,i)=>({id:i+1,url:`https://brand${i+1}.example/students`,enabled:true,official:i>=8,last_checked_at:new Date(now-(30-i)*day).toISOString()}));
 const offers=[{id:1,status:'pending',source_id:11,source_url:'https://brand11.example/students'},{id:2,status:'pending',source_id:12,source_url:'https://brand12.example/students'},
  {id:3,status:'pending',source_id:10,source_url:'https://brand10.example/students',liveness_status:'needs_review',liveness_verified_at:new Date(now).toISOString()},
  {id:4,status:'pending',source_id:1,source_url:'https://brand1.example/students'}];
 assert.deepEqual(prioritizedSources(sources,offers,{now,limit:5}).map(s=>s.id),[11,1,2,3,4]);
 assert.deepEqual(prioritizedSources(sources,offers,{now,limit:10}).slice(0,2).map(s=>s.id),[11,12]);
});
