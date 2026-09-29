import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestBudget} from '../src/services/api-limits.js';

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
