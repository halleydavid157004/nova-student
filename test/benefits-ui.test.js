import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {initBenefits} from '../public/benefits/page.js';
const html=readFileSync('public/benefits.html','utf8'),now=Date.UTC(2026,9,2,18);
const fixture={id:1,brand:'Fixture',title:'<img src=x onerror=alert(1)>',benefit:'Plan gratis',status:'active',reviewed:true,source_url:'https://example.invalid/student',countries:['CO'],verification:'Educational email',requirements:['Matrícula vigente'],steps:['Consultar fuente'],liveness_verified_at:new Date(now).toISOString(),liveness_status:'active',evidence:'<script>window.pwned=1</script>',expires_at:'2026-11-15T12:00:00Z'};
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
test('benefits UI safely matches, calculates, reports minimal data, clears and reads only own saved profile',async()=>{
 const dom=new JSDOM(html,{url:'http://localhost:4310/benefits.html'}),doc=dom.window.document,calls=[];let profileReads=0;const $=id=>doc.getElementById(id),event=type=>new dom.window.Event(type,{bubbles:true,cancelable:true});
 const app=await initBenefits(doc,{now:()=>now,timeZone:'America/Bogota',startTimer:()=>0,stopTimer:()=>{},loadProfile:async()=>{profileReads++;return {country:'CO',email_type:'educational',career:'Ingeniería'};},fetcher:async(url,options)=>{calls.push({url,options});if(url.endsWith('/api/catalog'))return Response.json({schema:1,max_age_days:14,offers:[fixture,{...fixture,id:2,source_url:fixture.source_url+'?utm_source=copy'},{...fixture,id:3,reviewed:false}]});return Response.json({ok:true});}});
 try{
 assert.equal($('benefits-country').options.length,250);assert.equal(doc.querySelectorAll('.benefit').length,1);assert.equal(doc.querySelectorAll('.benefit img,.benefit script').length,0);assert.equal(profileReads,0);assert.equal(dom.window.localStorage.length,0);
 $('benefits-account').click();await wait();assert.equal(profileReads,1);assert.equal($('benefits-country').value,'CO');assert.equal($('benefits-student').value,'unknown');
 $('benefits-student').value='yes';$('benefits-profile').dispatchEvent(event('submit'));assert.match(doc.querySelector('.badge').textContent,/Coincide/);
 const form=doc.querySelector('.estimate');form.querySelector('[name=regular_monthly]').value='20';form.querySelector('[name=student_monthly]').value='5';form.querySelector('[name=selected]').checked=true;form.dispatchEvent(event('input'));
 assert.match($('benefits-total').textContent,/15,00/);assert.match($('benefits-total').textContent,/No es ahorro confirmado/);assert.match(doc.querySelector('.result-note').textContent,/1 meses/);assert.equal(calls.length,1);
 doc.querySelector('[data-worked]').click();await wait();assert.equal(calls.length,2);assert.deepEqual(JSON.parse(calls[1].options.body),{reason:'worked'});assert.equal(calls[1].options.credentials,'omit');assert.equal(calls[1].options.headers.Authorization,undefined);
 $('benefits-country').value='MX';$('benefits-profile').dispatchEvent(event('submit'));assert.match($('benefits-total').textContent,/Sin precios/);assert.equal(doc.querySelector('[name=selected]').disabled,true);
 $('benefits-country').value='CO';$('benefits-profile').dispatchEvent(event('submit'));$('benefits-clear').click();assert.equal(doc.querySelector('[name=regular_monthly]').value,'');assert.equal(app.inputs.get(1).selected,false);assert.equal(dom.window.localStorage.length,0);assert.equal(dom.window.sessionStorage.length,0);
 }finally{app.dispose();dom.window.close();}
});
test('failed refresh cannot publish hidden entries or claim a new catalog; static mode never requests account configuration',async()=>{
 const dom=new JSDOM(html.replace('data-mode="render"','data-mode="static"'),{url:'https://example.invalid/project/benefits.html'}),doc=dom.window.document;let fail=false;const calls=[];
 const app=await initBenefits(doc,{now:()=>now,startTimer:()=>0,stopTimer:()=>{},fetcher:async(url)=>{calls.push(url);if(fail)return new Response('',{status:503});return Response.json({schema:1,offers:[{...fixture,status:'inactive'}]});}});
 try{assert.equal(doc.querySelectorAll('.benefit').length,0);assert.equal(doc.getElementById('benefits-account').hidden,true);fail=true;await app.reload();assert.match(doc.getElementById('benefits-status').textContent,/No hay datos nuevos confirmados/);assert.ok(calls.every(url=>url.endsWith('/api/catalog')));}finally{app.dispose();dom.window.close();}
});
