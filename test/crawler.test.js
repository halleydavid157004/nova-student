import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const dir=mkdtempSync(path.join(tmpdir(),'nova-crawler-'));
process.env.DATABASE_PATH=path.join(dir,'db.json');
const {db}=await import('../src/db.js');
const {scanAll,extractOfferFromText}=await import('../src/services/crawler.js');

test('first and subsequent scan batches use valid source objects',async()=>{
  db.sources.push({id:1,name:'Example',url:'https://example.invalid/student',enabled:true});
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(String(url).endsWith('/robots.txt'))return new Response('User-agent: *\nAllow: /', {status:200});
    return new Response('Student education discount available here.',{status:200});
  };
  try {
    for(let i=0;i<2;i++){
      const result=await scanAll({client:{fetch:async url=>{const response=await globalThis.fetch(url);return {status:response.status,body:await response.text(),url,redirects:[]}}}});
      assert.equal(result.length,1);
      assert.equal(result[0].id,1);
      assert.equal(result[0].error,undefined);
      assert.ok(db.sources[0].last_checked_at);
    }
  } finally {
    globalThis.fetch=original;
    rmSync(dir,{recursive:true,force:true});
  }
});

test('an extracted lead remains pending until reviewed',()=>{
  const lead=extractOfferFromText('Student education discount free offer for university students.', 'https://example.invalid/students','Example');
  assert.equal(lead.status,'pending');
  assert.equal(lead.official,false);
});

test('source backoff never shortens a long provider Retry-After',async()=>{
 const source={id:99,name:'Fixture',url:'https://fixture.example/student'};
 const {scanSource}=await import('../src/services/crawler.js');
 const {mkdirSync}=await import('node:fs');mkdirSync(dir,{recursive:true});
 const before=Date.now();await scanSource(source,{client:{fetch:async()=>({status:503,body:'',url:source.url,retryAfterMs:3*86400000})}});
 assert.ok(Date.parse(source.next_retry_at)>=before+3*86400000);const {flushSave}=await import('../src/db.js');await flushSave();rmSync(dir,{recursive:true,force:true});
});
