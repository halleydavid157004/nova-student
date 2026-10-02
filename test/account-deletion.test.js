import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAccountDeletion,processAccountDeletions} from '../src/services/account-deletion.js';
const uid='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64);
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SECRET_KEY:'sb_secret_fixture',SUPABASE_AUTH_ENABLED:'true'};
const sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',jwt='fixture.'+Buffer.from(JSON.stringify({sub:uid,session_id:sid})).toString('base64url')+'.signature';
const user={id:uid,is_anonymous:false,email:'owner@example.invalid',email_confirmed_at:'2026-10-01T00:00:00Z'};
async function call({method='POST',headers={},input={confirm:'ELIMINAR'},overrides={},userData=user,deleteStatus=200,proofStatus=404,proofCode='user_not_found',rpcFailure,logoutFailure=false}={}){
 const calls=[],network=[];let result;
 const req={method,headers:{authorization:'Bearer '+jwt,'content-type':'application/json',...headers}},res={setHeader(){}};
 const handled=await handleAccountDeletion(req,res,new URL('https://nova-student-radar.onrender.com/api/account/delete'),{env:{...env,...overrides},body:async()=>input,json:(_,status,data)=>result={status,data},rpc:async(op,data)=>{calls.push({op,data});if(op===rpcFailure)throw new Error('private storage failure');if(op==='begin')return {hash};if(op==='claim')return {user_id:uid};return {ok:true};},fetcher:async(url,options)=>{
  network.push({url,options});if(url.endsWith('/user'))return Response.json(userData);
  if(url.includes('/logout')){if(logoutFailure)throw new Error('private provider error');return new Response(null,{status:204});}
  if(options.method==='DELETE')return Response.json({}, {status:deleteStatus});
  return Response.json({code:proofCode},{status:proofStatus});
 }});return {handled,calls,network,...result};
}
test('account deletion rejects GET, absent JWT, foreign origin and implicit confirmation',async()=>{
 for(const options of [{method:'GET'},{headers:{authorization:''}},{headers:{origin:'https://evil.invalid'}},{input:{confirm:true}},{input:{confirm:'ELIMINAR',user_id:uid}},{headers:{'content-type':'text/plain'}}]){const r=await call(options);assert.ok(r.status>=400);assert.equal(r.calls.length,0);assert.equal(r.network.length,0);}
 const off=await call({overrides:{SUPABASE_AUTH_ENABLED:'false'}});assert.equal(off.status,503);assert.equal(off.network.length,0);
});
test('only the verified permanent user and verified email select deletion identity',async()=>{
 for(const u of [{...user,is_anonymous:true},{...user,email_confirmed_at:null},{...user,id:'invalid'},{...user,email:'bad'}]){const r=await call({userData:u});assert.equal(r.status,403);assert.equal(r.calls.length,0);}
 const mismatched=await call({userData:{...user,id:'22222222-2222-4222-8222-222222222222'}});assert.equal(mismatched.status,401);assert.equal(mismatched.calls.length,0);
 const r=await call();assert.equal(r.status,200);assert.deepEqual(r.data,{status:'completed'});
 assert.deepEqual(r.calls[0],{op:'begin',data:{user_id:uid,email:user.email,session_id:sid}});assert.deepEqual(r.calls.map(c=>c.op),['begin','claim','finish']);
 assert.ok(r.network[1].url.includes('logout?scope=global'));
 for(const n of r.network){assert.equal(n.options.redirect,'error');assert.equal(n.options.credentials,'omit');if(n.url.includes('/admin/')){assert.equal(n.options.headers.apikey,env.SUPABASE_SECRET_KEY);assert.equal(n.options.headers.Authorization,undefined);}}
 assert.equal(JSON.parse(r.network.find(n=>n.options.method==='DELETE').options.body).should_soft_delete,false);
 assert.ok(!JSON.stringify(r.data).includes(user.email));
});
test('unknown Auth outcome stays pending, never reports completed or leaks provider errors',async()=>{
 for(const options of [{deleteStatus:503},{proofStatus:200},{proofStatus:404,proofCode:'unknown_route'},{rpcFailure:'claim'},{rpcFailure:'finish'}]){const r=await call(options);assert.equal(r.status,202);assert.deepEqual(r.data,{status:'pending'});}
 const failure=await call({rpcFailure:'begin'});assert.equal(failure.status,503);assert.ok(!JSON.stringify(failure.data).includes('private'));assert.equal(failure.network.length,1);
 const logout=await call({logoutFailure:true});assert.equal(logout.status,200); // hard deletion removes Auth parent/sessions after RLS block.
});
test('queued deletion uses durable claim, lease, verified absence and legacy error-code support',async()=>{
 const ops=[];let leases=0,requests=0;
 const result=await processAccountDeletions({env,beforeSend:async()=>leases++,rpc:async(op,input)=>{ops.push({op,input});if(op==='queue')return [{hash}];if(op==='claim')return {user_id:uid};return {};},fetcher:async(_,options)=>{requests++;return options.method==='DELETE'?Response.json({}):Response.json({error_code:'user_not_found'},{status:404});}});
 assert.deepEqual(result,{completed:1,pending:0});assert.equal(leases,1);assert.equal(requests,2);assert.deepEqual(ops.map(o=>o.op),['queue','claim','finish']);
 const backedOff=await processAccountDeletions({env,rpc:async(op)=>op==='queue'?[{hash}]:{skipped:'backoff'},fetcher:async()=>{throw new Error('No provider request permitted');}});assert.deepEqual(backedOff,{completed:0,pending:1});
 assert.deepEqual(await processAccountDeletions({env:{},rpc:()=>{throw new Error('Missing configuration');}}),{completed:0,pending:0});
});
