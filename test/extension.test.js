import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {extensionFiles} from '../tools/extension/build.js';
test('extension production settings have one source and generated files stay consistent',()=>{
 const settings=JSON.parse(readFileSync('extension/settings.json','utf8'));const files=extensionFiles(settings);
 for(const [name,content] of Object.entries(files))assert.equal(readFileSync('extension/'+name,'utf8'),content);
 const manifest=JSON.parse(files['manifest.json']);assert.deepEqual(manifest.host_permissions,[settings.apiOrigin+'/*']);assert.equal(manifest.background.service_worker,'background.js');
 assert.throws(()=>extensionFiles({apiOrigin:'http://localhost:4310'}),/origin/);
});
test('extension popup renders untrusted offers as text and links only to the catalog',async()=>{
 const dom=new JSDOM(readFileSync('extension/popup.html','utf8'));const config={apiOrigin:'https://nova-student-radar.onrender.com'};
 const chrome={tabs:{query:(_input,cb)=>cb([{url:'https://example.invalid/private?token=secret'}])},runtime:{sendMessage:async request=>{assert.deepEqual(Object.keys(request).sort(),['domain','type']);return {offers:[{id:12,title:'<img src=x onerror=alert(1)>',benefit:'<script>bad()</script>',source_url:'javascript:alert(1)'}]};}},storage:{local:{get:(_defaults,cb)=>cb({radarNotice:false}),set:()=>{}}}};
 runInNewContext(readFileSync('extension/popup.js','utf8'),{chrome,document:dom.window.document,NOVA_CONFIG:config,URL});await new Promise(r=>setTimeout(r,10));
 assert.equal(dom.window.document.querySelectorAll('#results img,#results script').length,0);assert.equal(dom.window.document.querySelector('#results a').href,config.apiOrigin+'/?offer=12');assert.equal(dom.window.document.querySelector('#notice').checked,false);
});
test('automatic domain scanning is opt-in and sends nothing when disabled',async()=>{
 let calls=0;runInNewContext(readFileSync('extension/content.js','utf8'),{chrome:{storage:{local:{get:async()=>({radarNotice:false})}},runtime:{sendMessage:()=>{calls++;}}}});await new Promise(r=>setTimeout(r,5));assert.equal(calls,0);
});
