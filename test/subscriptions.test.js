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
