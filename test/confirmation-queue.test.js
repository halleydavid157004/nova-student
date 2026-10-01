import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'nova-confirmation-'));
Object.assign(process.env,{DATABASE_PATH:path.join(dir,'state.json'),SUPABASE_URL:'',SUPABASE_SECRET_KEY:'',EMAIL_TOKEN_SECRET:'fixture-signature-key-at-least-32-characters',PRIVACY_CONTROLLER:'Fixture operator',PRIVACY_CONTACT_EMAIL:'privacy@example.invalid',RESEND_API_KEY:'fixture-key',RESEND_FROM:'Nova <sender@example.invalid>'});
const {sendPendingConfirmations,emailStatus}=await import('../src/services/email.js');
const {db}=await import('../src/db.js');
after(()=>rmSync(dir,{recursive:true,force:true}));
test('confirmation queue sends only reserved messages and does not return private recipients',async()=>{
 const ops=[],messages=[];
 const rpc=async(op,input)=>{ops.push({op,input});if(op==='queue')return [{id:1},{id:2}];if(op==='claim')return input.id===1?{id:1,nonce:'11111111-1111-1111-1111-111111111111',expires:Math.floor(Date.now()/1000)+3600,email:'fixture@example.invalid'}:{skipped:'quota'};return {ok:true};};
 const r=await sendPendingConfirmations({rpc,send:async m=>messages.push(m)});assert.equal(messages.length,1);assert.match(messages[0].idempotencyKey,/^confirmation\//);assert.match(messages[0].html,/#confirm=/);assert.equal(ops.find(x=>x.op==='finish').input.status,'sent');assert.ok(!JSON.stringify(r).includes('fixture@example.invalid'));
});
test('unknown provider results are persisted as uncertain and stop the queue',async()=>{
 let sent=0,finish;
 const rpc=async(op,input)=>{if(op==='queue')return [{id:1},{id:2}];if(op==='claim')return {id:1,nonce:'11111111-1111-1111-1111-111111111111',expires:Math.floor(Date.now()/1000)+3600,email:'fixture@example.invalid'};if(op==='finish')finish=input;return {};};
 const result=await sendPendingConfirmations({rpc,send:async()=>{sent++;throw new Error('private provider body');}});assert.equal(sent,1);assert.equal(finish.status,'uncertain');assert.ok(db.runtime.emailRetryAt>Date.now());assert.ok(!JSON.stringify(result).includes('private'));
});
test('public email is off with a test sender or missing privacy identity/signature',()=>{
 assert.equal(emailStatus().configured,true);process.env.RESEND_FROM='Nova <onboarding@resend.dev>';assert.equal(emailStatus().configured,false);process.env.RESEND_FROM='Nova <sender@example.invalid>';process.env.PRIVACY_CONTROLLER='';assert.equal(emailStatus().configured,false);
});
