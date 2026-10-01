import test from 'node:test';
import assert from 'node:assert/strict';
import {publicCatalog} from '../src/services/catalog-export.js';
import {jobSummary} from '../src/services/job-summary.js';
import {prioritizedSources} from '../src/services/scan-priority.js';

test('public catalog uses explicit fields and strips sensitive URL data',()=>{
 const offer={id:1,title:'Approved',status:'active',official:true,verified_at:new Date().toISOString(),source_url:'https://example.org/student?email=secret@example.invalid#token',email:'private@example.invalid',reporter_hash:'private',extra:{subscribers:['private']}};
 const result=publicCatalog([offer,{...offer,id:2,official:false},{...offer,id:3,verified_at:'2000-01-01'},{...offer,id:4,status:'inactive'}]);
 assert.equal(result.offers.length,1);assert.equal(result.offers[0].source_url,'https://example.org/student');assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes('secret'));
});
test('source priority considers age, score and visits and excludes forbidden/backoff sources',()=>{
 const now=Date.now();const sources=[{id:1,enabled:true,last_checked_at:new Date(now).toISOString()},{id:2,enabled:true,last_checked_at:new Date(now-20*86400000).toISOString()},{id:3,enabled:true,terms_blocked:true},{id:4,enabled:true,next_retry_at:new Date(now+999999).toISOString()}];
 assert.deepEqual(prioritizedSources(sources,[{source_id:1,liveness_score:0}],{now}).map(s=>s.id),[2,1]);
 const same=sources.slice(0,2).map(s=>({...s,last_checked_at:new Date(now).toISOString()}));same[1].visits=1000;
 assert.equal(prioritizedSources(same,[{source_id:1,liveness_score:0}],{now})[0].id,2);
 assert.equal(prioritizedSources(same,[{source_id:1,liveness_score:0}],{now,limit:1}).length,1);
});
test('job summary accepts only aggregate counts, never provider strings or recipient rows',()=>{
 const summary=jobSummary({summary:{discovery:{newSources:3},scan:{total:2,errors:'private-email@example.invalid'},catalog:{offers:1},raw:['secret'],digests:{sent:0}}});
 assert.match(summary,/Fuentes comprobadas \| 2/);assert.ok(!summary.includes('secret'));assert.ok(!summary.includes('private-email'));
 assert.ok(!jobSummary({skipped:'malicious<secret>'}).includes('secret'));
});
