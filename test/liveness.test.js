import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessment,validateOffer,relevantSection,validExtraction,freshness} from '../src/services/liveness.js';
const now=Date.parse('2026-09-30T20:00:00Z');
const fixture=name=>readFileSync(`test/fixtures/${name}.html`,'utf8');
const offer=()=>({id:1,status:'active',reviewed:true,source_url:'https://fixture.example/students',verified_at:new Date(now-86400000).toISOString()});
const page=name=>({status:200,body:fixture(name),url:offer().source_url,redirects:[]});
const extraction=()=>({benefit:'Free cloud plan',value:'100 USD',requirements:['Enrollment'],verification:'Educational email',countries:['CO'],expires_at:null,evidence:'students receive a free cloud plan with 100 USD in credits',available:true});

test('active page requires schema and a real evidence quote; HTTP 200 alone never verifies',async()=>{
  const checked=await validateOffer(offer(),page('active'),{extract:async()=>extraction(),now});
  assert.equal(checked.state,'active');assert.equal(checked.success,true);assert.equal(checked.score,100);
  assert.equal(checked.patch.liveness_verified_at,new Date(now).toISOString());
  const weak=await validateOffer(offer(),page('active'),{now});
  assert.equal(weak.state,'needs_review');assert.equal(weak.success,false);assert.equal(weak.patch.liveness_verified_at,null);
});
test('expired, soft-404, redirects and blocks have distinct signals',()=>{
  assert.equal(assessment(offer(),page('expired'),null,{now}).state,'expired');
  assert.equal(assessment(offer(),page('soft-404'),null,{now}).signals.soft_404,true);
  assert.equal(assessment(offer(),page('blocked'),null,{now}).state,'blocked');
  assert.equal(assessment(offer(),{...page('active'),status:403},null,{now}).state,'blocked');
  const redirect=assessment(offer(),{...page('active'),url:'https://other.example/',redirects:[{from:offer().source_url,to:'https://other.example/'}]},extraction(),{now});
  assert.deepEqual(redirect.signals.material,['domain_redirect','home_redirect']);assert.ok(redirect.score<50);
});
test('one failure keeps reviewed offers published; two withdraw; recovery requires approval',()=>{
  const first=assessment(offer(),{...page('active'),status:404},null,{now});
  assert.equal(first.patch.status,'active');assert.equal(first.patch.consecutive_failures,1);
  const second=assessment({...offer(),...first.patch},{...page('active'),status:404},null,{now});
  assert.equal(second.patch.status,'inactive');assert.equal(second.patch.consecutive_failures,2);
  const recovered=assessment({...offer(),...second.patch},page('active'),extraction(),{now});
  assert.equal(recovered.patch.status,'inactive');assert.equal(recovered.state,'needs_review');assert.equal(recovered.success,false);
});
test('material value changes produce review; banners do not change relevant fingerprints',()=>{
  const changed=assessment({...offer(),approved_extraction:{value:'50 USD'}},page('active'),extraction(),{now});
  assert.ok(changed.signals.material.includes('value_changed'));assert.equal(changed.state,'needs_review');
  const html=fixture('active');assert.equal(relevantSection(html).hash,relevantSection(html.replace('Random banner','Completely different ad and login')).hash);
  assert.equal(assessment({...offer(),approved_extraction:{benefit:'Plan gratuito'}},page('active'),extraction(),{now}).state,'active','translations and paraphrases are not material failures');
});
test('invalid extraction retries once, while AI outages do not accumulate expiry failures',async()=>{
  let calls=0;const result=await validateOffer(offer(),page('active'),{extract:async()=>{calls++;return {...extraction(),evidence:'Invented quote that does not exist.'}},now});
  assert.equal(calls,2);assert.equal(result.state,'needs_review');assert.equal(result.patch.consecutive_failures,0);
  assert.equal(validExtraction({...extraction(),countries:['<script>']},fixture('active')),false);
  assert.equal(validExtraction({...extraction(),available:'yes'},fixture('active')),false);
});
test('headless is a fallback, skips blocks and verifies rendered evidence',async()=>{
  let calls=0;
  const headless=async()=>{calls++;return page('active')};
  const result=await validateOffer(offer(),page('dynamic'),{extract:async()=>extraction(),headless,now});
  assert.equal(calls,1);assert.equal(result.success,true);assert.equal(result.signals.rendered,true);
  await validateOffer(offer(),page('blocked'),{headless,now});assert.equal(calls,1);
});
test('temporal decay and bounded reports do not invent expired status',()=>{
  assert.equal(freshness(offer(),now),true);
  assert.equal(freshness({...offer(),verified_at:new Date(now-15*86400000).toISOString()},now),false);
  assert.equal(freshness({...offer(),verified_at:new Date(now-15*86400000).toISOString()},now,30),true);
  const result=assessment(offer(),page('active'),extraction(),{now,reports:99});
  assert.equal(result.score,85);assert.equal(result.state,'needs_review');assert.equal(result.patch.status,'active');assert.equal(result.patch.consecutive_failures,0);
});
