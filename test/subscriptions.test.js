import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {privacyConfig,signEmailToken,verifyEmailToken,subscriptionLinks} from '../src/services/subscriptions.js';
import {initPreferences} from '../public/subscriptions/preferences.js';
import {renderPrivacy} from '../public/subscriptions/privacy.js';
const secret='fixture-secret-at-least-32-characters-long',nonce='11111111-1111-1111-1111-111111111111',now=Date.now();
test('purpose-scoped email tokens reject tampering, expiration and invalid configuration',()=>{
 const token=signEmailToken({id:1,nonce,purpose:'confirm',expires:Math.floor(now/1000)+60},secret);
 assert.equal(verifyEmailToken(token,'confirm',{secret,now}).id,1);
 assert.equal(verifyEmailToken(token,'preferences',{secret,now}),null);
 assert.equal(verifyEmailToken(token,'confirm',{secret:'different-key-at-least-32-characters'}),null);
 assert.equal(verifyEmailToken(token,'confirm',{secret,now:now+61000}),null);
 assert.equal(verifyEmailToken('x'.repeat(1025),'confirm',{secret}),null);
 assert.equal(verifyEmailToken(token.slice(0,-2)+'xx','confirm',{secret}),null);
 assert.throws(()=>signEmailToken({id:1,nonce,purpose:'unsubscribe',expires:0},'short'));
 assert.throws(()=>signEmailToken({id:-1,nonce,purpose:'unsubscribe',expires:0},secret));
 const links=subscriptionLinks({id:1,nonce},{secret,now});assert.equal(links.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
 assert.equal(verifyEmailToken(new URL(links.unsubscribe).searchParams.get('t'),'unsubscribe',{secret,now:now+365*86400000}).id,1);
 assert.ok(!JSON.stringify(links).includes(secret));
});
test('privacy remains unavailable without identified controller and valid private contact',()=>{
 assert.equal(privacyConfig({}).ready,false);assert.equal(privacyConfig({PRIVACY_CONTROLLER:'<script>',PRIVACY_CONTACT_EMAIL:'bad'}).ready,false);
 assert.equal(privacyConfig({PRIVACY_CONTROLLER:'Fixture operator',PRIVACY_CONTACT_EMAIL:'privacy@example.invalid'}).ready,true);
});
test('confirmation page cleans URL, previews safely and requires explicit confirmation',async()=>{
 const dom=new JSDOM(readFileSync('public/preferences.html','utf8'),{url:'https://example.invalid/preferences.html#confirm=fixture'}),calls=[];
 await initPreferences(dom.window.document,{location:dom.window.location,history:dom.window.history,fetcher:async(url,options)=>{assert.equal(dom.window.location.hash,'');calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({query:'<img src=x onerror=alert(1)>',country:'CO',frequency:'daily'})};}});
 assert.equal(calls.length,1);assert.match(calls[0].url,/preview$/);assert.equal(dom.window.document.querySelector('#preview img'),null);
 dom.window.document.getElementById('confirm').click();await new Promise(r=>setTimeout(r,0));assert.equal(calls.length,2);assert.match(calls[1].url,/confirm$/);
 dom.window.close();
});
test('preferences updates owned IDs through safe DOM and never executes stored queries',async()=>{
 const dom=new JSDOM(readFileSync('public/preferences.html','utf8'),{url:'https://example.invalid/preferences.html#preferences=fixture'}),calls=[];
 await initPreferences(dom.window.document,{location:dom.window.location,history:dom.window.history,fetcher:async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({status:'confirmed',alerts:[{id:12,query:'<script>throw 1</script>',frequency:'daily',enabled:true,confirmed:true}]})};}});
 assert.equal(dom.window.document.querySelector('#alerts script'),null);const form=dom.window.document.querySelector('#alerts form');form.querySelector('select').value='weekly';form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(calls[1].alert_id,12);assert.equal(calls[1].frequency,'weekly');dom.window.close();
});
test('privacy identity is rendered as text and a contact link',()=>{
 const dom=new JSDOM(readFileSync('public/privacy.html','utf8'));renderPrivacy(dom.window.document,{ready:true,controller:'Fixture <script>',contact:'privacy@example.invalid'});assert.equal(dom.window.document.querySelector('#controller script'),null);assert.equal(dom.window.document.querySelector('#contact a').textContent,'privacy@example.invalid');dom.window.close();
});

test('reopening another email link in the same document replaces prior handlers and state',async()=>{
 const dom=new JSDOM(readFileSync('public/preferences.html','utf8'),{url:'https://example.invalid/preferences.html#confirm=first'}),calls=[];
 const options={location:dom.window.location,history:dom.window.history,fetcher:async(url,request)=>{calls.push(JSON.parse(request.body));return {ok:true,json:async()=>({query:'Fixture',country:'CO',frequency:'daily'})};}};
 await initPreferences(dom.window.document,options);
 dom.window.location.hash='unsubscribe=second';await initPreferences(dom.window.document,options);
 assert.equal(dom.window.document.getElementById('confirm').hidden,true);
 dom.window.document.getElementById('unsubscribe').click();await new Promise(r=>setTimeout(r,0));assert.equal(calls.length,2);assert.equal(calls[1].token,'second');dom.window.close();
});

test('an old preview response cannot overwrite a newly opened unsubscribe link',async()=>{
 const dom=new JSDOM(readFileSync('public/preferences.html','utf8'),{url:'https://example.invalid/preferences.html#confirm=first'});let complete;
 const old=initPreferences(dom.window.document,{location:dom.window.location,history:dom.window.history,fetcher:()=>new Promise(r=>complete=r)});
 dom.window.location.hash='unsubscribe=second';await initPreferences(dom.window.document,{location:dom.window.location,history:dom.window.history,fetcher:async()=>{throw new Error('Unused');}});
 complete({ok:true,json:async()=>({query:'Old private query',country:'CO',frequency:'daily'})});await old;
 assert.equal(dom.window.document.getElementById('confirm').hidden,true);assert.equal(dom.window.document.getElementById('preview').textContent,'');assert.match(dom.window.document.getElementById('status').textContent,/baja/);dom.window.close();
});

test('erasure is explicit, clears private searches and resets on another link',async()=>{
 const dom=new JSDOM(readFileSync('public/preferences.html','utf8'),{url:'https://example.invalid/preferences.html#preferences=first'}),calls=[];
 const opts={location:dom.window.location,history:dom.window.history,fetcher:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({status:'confirmed',alerts:[{id:1,query:'Private search',frequency:'daily',enabled:true,confirmed:true}]})};}};
 await initPreferences(dom.window.document,opts);const form=dom.window.document.getElementById('eraseForm');assert.equal(form.hidden,false);
 form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(calls.length,1);
 dom.window.document.getElementById('eraseConsent').checked=true;form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(calls.length,2);assert.match(calls[1].url,/erase$/);assert.equal(calls[1].body.confirm,true);assert.equal(form.hidden,true);assert.equal(dom.window.document.querySelector('#alerts form'),null);
 dom.window.location.hash='unsubscribe=other';await initPreferences(dom.window.document,opts);assert.equal(form.hidden,true);assert.equal(dom.window.document.getElementById('eraseConsent').checked,false);dom.window.close();
});
