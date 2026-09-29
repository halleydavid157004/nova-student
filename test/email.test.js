import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeSmtpData} from '../src/services/email.js';

test('SMTP escapes leading dots without escaping its final data terminator',()=>{
  const data=encodeSmtpData('Subject: Test\n\nFirst\n.\n.secret\nLast');
  assert.equal(data,'Subject: Test\r\n\r\nFirst\r\n..\r\n..secret\r\nLast\r\n.');
  assert.ok((data+'\r\n').endsWith('\r\n.\r\n'),'SMTP server can finish DATA');
});
