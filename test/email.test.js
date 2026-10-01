import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeSmtpData} from '../src/services/email.js';

test('SMTP escapes leading dots without escaping its final data terminator',()=>{
  const data=encodeSmtpData('Subject: Test\n\nFirst\n.\n.secret\nLast');
  assert.equal(data,'Subject: Test\r\n\r\nFirst\r\n..\r\n..secret\r\nLast\r\n.');
  assert.ok((data+'\r\n').endsWith('\r\n.\r\n'),'SMTP server can finish DATA');
});

test('Resend transport passes unsubscribe headers and rejects success without a receipt',async()=>{
 const {sendMail}=await import('../src/services/email.js');
 const previousFetch=globalThis.fetch,previousKey=process.env.RESEND_API_KEY,previousFrom=process.env.RESEND_FROM;
 process.env.RESEND_API_KEY='fixture-key';process.env.RESEND_FROM='Nova <sender@example.invalid>';
 try{
  let payload;globalThis.fetch=async(_,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({id:'fixture-receipt'})};};
  assert.equal((await sendMail({to:'fixture@example.invalid',subject:'Fixture',html:'Fixture',headers:{'List-Unsubscribe':'<https://example.invalid/unsubscribe>'}})).id,'fixture-receipt');assert.ok(payload.headers['List-Unsubscribe']);
  globalThis.fetch=async()=>({ok:true,json:async()=>({})});await assert.rejects(sendMail({to:'fixture@example.invalid',subject:'Fixture',html:'Fixture'}),/receipt unavailable/);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=previousKey;if(previousFrom===undefined)delete process.env.RESEND_FROM;else process.env.RESEND_FROM=previousFrom;}
});
