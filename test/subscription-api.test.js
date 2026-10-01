import test from 'node:test';
import assert from 'node:assert/strict';
import {handleSubscriptions,prepareConsent} from '../src/services/subscription-api.js';
import {signEmailToken} from '../src/services/subscriptions.js';
process.env.EMAIL_TOKEN_SECRET='fixture-signature-key-at-least-32-characters';
const nonce='11111111-1111-1111-1111-111111111111';
const token=purpose=>signEmailToken({id:1,nonce,purpose,expires:purpose==='unsubscribe'?0:Math.floor(Date.now()/1000)+60});
async function call(action,{method='POST',input={},query='',form}={}){
 const calls=[],headers={};let result;
 const req={method,headers:{'content-type':form?'application/x-www-form-urlencoded':'application/json'},async *[Symbol.asyncIterator](){yield Buffer.from(form||'');}};
 const res={setHeader(k,v){headers[k]=v;}};
 const handled=await handleSubscriptions(req,res,new URL('https://nova-student-radar.onrender.com/api/subscriptions/'+action+query),{json:(_,status,data)=>{result={status,data};},body:async()=>input,rpc:async(op,data)=>{calls.push({op,data});return {ok:true};}});
 return {handled,calls,headers,...result};
}
test('GET and malformed tokens never mutate subscription rows',async()=>{
 assert.equal((await call('confirm',{method:'GET',query:'?t='+token('confirm')})).status,405);
 const bad=await call('unsubscribe',{input:{token:'tampered'}});assert.equal(bad.status,400);assert.equal(bad.calls.length,0);
 const wrong=await call('confirm',{input:{token:token('preferences')}});assert.equal(wrong.status,400);assert.equal(wrong.calls.length,0);
});
test('RFC 8058 unsubscribe accepts exactly the signed URL and one-click POST',async()=>{
 const result=await call('unsubscribe',{query:'?t='+encodeURIComponent(token('unsubscribe')),form:'List-Unsubscribe=One-Click'});
 assert.equal(result.status,200);assert.equal(result.calls[0].op,'unsubscribe');assert.deepEqual(result.calls[0].data,{id:1,nonce});assert.equal(result.headers['Referrer-Policy'],'no-referrer');
 assert.equal((await call('unsubscribe',{query:'?t='+token('unsubscribe'),form:'List-Unsubscribe=Wrong'})).calls.length,0);
});
test('preferences use token identity, never a supplied subscriber ID',async()=>{
 const r=await call('update',{input:{token:token('preferences'),id:999,alert_id:12,enabled:false,frequency:'weekly'}});
 assert.equal(r.status,200);assert.equal(r.calls[0].data.id,1);assert.equal(r.calls[0].data.alert_id,12);
 const bad=await call('update',{input:{token:token('preferences'),alert_id:12,enabled:'true',frequency:'weekly'}});assert.equal(bad.status,400);assert.equal(bad.calls.length,0);
});
test('saving without separate opt-in never requests email confirmation',async()=>{
 let calls=0;const rpc=async()=>{calls++;return {};};
 await prepareConsent({id:1},false,{rpc});assert.equal(calls,0);
 await prepareConsent({id:1},true,{rpc});assert.equal(calls,1);
});
