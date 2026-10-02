import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestBudget,clientAddress} from '../src/services/api-limits.js';

test('public API budgets cap simultaneous work and sustained usage separately',()=>{
  const take=createRequestBudget({limit:3,windowMs:60000,maxConcurrent:2});
  const first=take(), second=take();
  assert.ok(take().retryAfter,'concurrent work is refused before being queued');
  first.release(); first.release();
  const third=take();
  assert.ok(third.release,'capacity is freed once');
  second.release(); third.release();
  assert.ok(take().retryAfter,'finishing work does not reset the usage budget');
});

test('report identity uses the address Render saw, never a spoofed first hop or a non-Render header', () => {
  const req = {socket: {remoteAddress: '10.0.0.5'}, headers: {'x-forwarded-for': '1.2.3.4, 203.0.113.9'}};
  assert.equal(clientAddress(req, {RENDER: 'true'}), '203.0.113.9');
  assert.equal(clientAddress(req, {}), '10.0.0.5');
  assert.equal(clientAddress({...req, headers: {'x-forwarded-for': 'not an ip<script>'}}, {RENDER: 'true'}), '10.0.0.5');
  assert.equal(clientAddress({socket: {}, headers: {}}, {RENDER: 'true'}), 'unknown');
});
