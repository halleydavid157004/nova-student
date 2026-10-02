import test from 'node:test';
import assert from 'node:assert/strict';
import {approvalProblems,duplicateIds,reviewDiff} from '../public/admin/policy.js';
import {handleAdminReview} from '../src/services/admin-review.js';
const uid='11111111-1111-4111-8111-111111111111',sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_AUTH_ENABLED:'true'};
const token='fixture.'+Buffer.from(JSON.stringify({sub:uid,session_id:sid})).toString('base64url')+'.signature';
const now=Date.now();
const extraction={benefit:'Plan gratis para estudiantes',value:null,requirements:['Matrícula vigente'],verification:'Academic email',countries:['CO'],expires_at:null,evidence:'Students can claim a free education plan.',available:true};
const item={offer:{id:101,title:'Education',brand:'Fixture',source_url:'https://example.invalid/student',offer_type:'Free',countries:['CO'],benefit:extraction.benefit,verification:extraction.verification,updated_at:new Date(now).toISOString()},check:{id:201,offer_version_id:301,score:100,result:'needs_review',checked_at:new Date(now).toISOString(),signals:{http:200,final_url:'https://example.invalid/student',material:[]}},version:{id:301,offer_id:101,extraction,evidence:extraction.evidence},approved:null};
const user={id:uid,is_anonymous:false,email_confirmed_at:new Date(now).toISOString(),app_metadata:{nova_role:'admin'}};
async function call({method='GET',path='/api/admin/review',headers={},input={},userData=user,http=200,rpcFailure=false,context=item}={}){
 let result;const calls=[],network=[];
 const handled=await handleAdminReview({method,headers:{authorization:'Bearer '+token,'content-type':'application/json',...headers}},{setHeader(){}},new URL('https://nova-student-radar.onrender.com'+path),{env,body:async()=>input,json:(_,status,data)=>result={status,data},fetcher:async(url,options)=>{network.push({url,options});return Response.json(userData,{status:http});},rpc:async(op,data)=>{calls.push({op,data});if(rpcFailure)throw new Error('private email secret');if(op==='context')return {...context,published:[]};return op==='queue'?{items:[structuredClone(item)],published:[]}:{ok:true};}});
 return {handled,calls,network,...result};
}
test('approval demands recent attested evidence, never just HTTP 200 or official flag',()=>{
 assert.deepEqual(approvalProblems(item,{now}),[]);
 const variations=[{check:null},{version:null},{check:{...item.check,checked_at:new Date(now-8*86400000).toISOString()}},{check:{...item.check,checked_at:new Date(now+120000).toISOString()}},{check:{...item.check,score:50}},{check:{...item.check,signals:{...item.check.signals,blocked:'robots'}}},{check:{...item.check,signals:{...item.check.signals,final_url:'https://example.invalid/'}}},{check:{...item.check,signals:{...item.check.signals,material:['ended']}}},{version:{...item.version,extraction:{...extraction,available:false}}},{version:{...item.version,extraction:{...extraction,countries:['UNKNOWN']}}},{version:{...item.version,extraction:{...extraction,countries:['XX']}}},{version:{...item.version,extraction:{...extraction,evidence:'invented evidence'}}},{version:{...item.version,extraction:{...extraction,expires_at:'2000-01-01T00:00:00Z'}}}];
 for(const patch of variations)assert.ok(approvalProblems({...item,...patch},{now}).length,JSON.stringify(patch));
 const changed={...item,check:{...item.check,score:55,signals:{...item.check.signals,material:['value_changed']}}};assert.deepEqual(approvalProblems(changed,{now}),[]); // Requires explicit human review; no automatic publication.
});
test('review duplicate identity removes tracking variants while keeping countries and meaningful plans',()=>{
 const other={...item.offer,id:102,source_url:item.offer.source_url+'?utm_source=search'};
 assert.deepEqual(duplicateIds(item,[other]),[102]);assert.deepEqual(duplicateIds(item,[{...other,countries:['MX']}]),[]);
 assert.deepEqual(duplicateIds(item,[{...other,source_url:item.offer.source_url+'?plan=pro'}]),[]);
 assert.equal(reviewDiff(extraction,{...extraction,value:'USD 10'})[0].field,'value');
});
test('admin requires verified server metadata; rejects shared token, role spoofing, revoked user and foreign origin',async()=>{
 for(const options of [{headers:{authorization:'Bearer legacy-admin-token'}},{headers:{origin:'https://evil.invalid'}},{userData:{...user,app_metadata:{},user_metadata:{nova_role:'admin'}}},{userData:{...user,is_anonymous:true}},{userData:{...user,email_confirmed_at:null}},{userData:{...user,id:sid}},{http:401}]){const r=await call(options);assert.ok(r.status>=400);assert.equal(r.calls.length,0);}
 const old=await call({path:'/api/admin/test-digest',method:'POST'});assert.equal(old.status,410);assert.equal(old.network.length,0);
});
test('queue hides published comparison catalog and propagates verified identity only',async()=>{
 const r=await call();assert.equal(r.status,200);assert.equal(r.data.published,undefined);assert.deepEqual(r.calls[0].data,{user_id:uid,session_id:sid,after:0});assert.equal(r.data.items[0].problems.length,0);
 assert.equal(r.network[0].options.redirect,'error');assert.equal(r.network[0].options.credentials,'omit');assert.ok(!JSON.stringify(r.data).includes(uid));
});
test('actions reject malformed requests, unsupported field edits, absent consent and uncertain evidence',async()=>{
 const valid={action:'approve',id:101,expected_updated_at:item.offer.updated_at,check_id:201,reason:'Verifiqué la fuente y requisitos.',confirm_source:true};
 for(const input of [{...valid,user_id:sid},{...valid,reason:'ok'},{...valid,confirm_source:false},{...valid,id:0},{...valid,benefit:'fabricated'}]){const r=await call({method:'POST',input});assert.equal(r.status,400);assert.equal(r.calls.length,0);}
 const bad=await call({method:'POST',input:valid,context:{...item,check:null}});assert.equal(bad.status,409);assert.deepEqual(bad.calls.map(c=>c.op),['context']);
 const good=await call({method:'POST',input:valid});assert.equal(good.status,200);assert.deepEqual(good.calls.map(c=>c.op),['context','approve']);assert.equal(good.calls[1].data.user_id,uid);
 const failure=await call({rpcFailure:true});assert.equal(failure.status,503);assert.ok(!JSON.stringify(failure.data).includes('secret'));
});
