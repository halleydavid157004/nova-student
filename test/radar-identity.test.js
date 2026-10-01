import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalSource,sameOffer,uniqueOffers} from '../public/search/identity.js';
import {createSearchIndex} from '../public/search/engine.js';
import {publicCatalog} from '../src/services/catalog-export.js';
import {discoveryQueries} from '../src/services/discovery-queries.js';
import {COUNTRY_CODES} from '../public/search/countries.js';
const a={id:1,brand:'Marca',title:'Plan estudiantil',benefit:'100 créditos',offer_type:'credits',verification:'Student ID',countries:['CO'],source_url:'https://www.example.com/student/?utm_source=radar#apply',status:'active',official:true,verified_at:new Date().toISOString()};
test('canonical URLs remove tracking, preserve eligibility parameters and paths',()=>{
 assert.equal(canonicalSource(a.source_url),'https://example.com/student');
 assert.equal(canonicalSource('https://example.com/?country=CO&plan=pro&utm_medium=email'),'https://example.com/?country=CO&plan=pro');
 assert.notEqual(canonicalSource('https://example.com/a'),canonicalSource('https://example.com/b'));
 assert.equal(canonicalSource('https://secret:password@example.com'),null);
});
test('duplicates are suppressed in search and export, retaining reviewed evidence',()=>{
 const b={...a,id:2,source_url:'https://example.com/student',reviewed:true};
 assert.ok(sameOffer(a,b));assert.deepEqual(uniqueOffers([a,b]).map(o=>o.id),[2]);
 assert.deepEqual(createSearchIndex([a,b]).search().map(o=>o.id),[2]);
 assert.deepEqual(publicCatalog([a,b]).offers.map(o=>o.id),[2]);
 assert.deepEqual(uniqueOffers([b,a]).map(o=>o.id),[2]);
});
test('different benefits, countries and verification methods remain independent',()=>{
 const variants=[a,{...a,id:2,benefit:'200 créditos'},{...a,id:3,countries:['US']},{...a,id:4,verification:'Educational email'}];
 assert.equal(uniqueOffers(variants).length,4);
 assert.equal(sameOffer(a,{...a,source_url:'https://example.com/other',title:'Otro plan',benefit:'Licencia gratis'}),false);
 assert.equal(uniqueOffers([{id:1},{id:2}]).length,2);
});
test('international exploration preserves strict default and never changes eligibility',()=>{
 const us={...a,id:2,countries:['US'],requirements:['US residency required']};
 const index=createSearchIndex([a,us]);assert.deepEqual(index.search({country:'CO'}).map(o=>o.id),[1]);
 const global=index.search({country:'CO',cross:true});assert.deepEqual(global.map(o=>o.id),[1,2]);
 assert.equal(global[1].requirements[0],'US residency required');assert.equal(global[1].vpn_required,undefined);
 assert.equal(index.search({country:'CO',cross:'false'}).length,1);
 assert.equal(createSearchIndex([a,{...a,id:3,official:false}]).search({cross:true}).length,1);
});
test('international queue covers every assigned ISO country and prioritizes Latin America',()=>{
 const queries=discoveryQueries(['student AI discount']);assert.equal(queries.length,COUNTRY_CODES.length+20);
 assert.match(queries[0],/Colombia/);assert.equal(queries[1],'student AI discount');
 for(const name of ['United States','Japan','Brazil','Spain','India'])assert.ok(queries.some(q=>q.includes(name)),name);
 assert.equal(new Set(queries).size,queries.length);
});

test('same domain may contribute distinct pending offers; unknown geography is not global',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const path=await import('node:path');const dir=mkdtempSync(path.join(tmpdir(),'nova-identity-'));process.env.DATABASE_PATH=path.join(dir,'db.json');
 const {db,flushSave}=await import('../src/db.js');const {scanSource,extractOfferFromText}=await import('../src/services/crawler.js');
 try{const text='Student education university discount free academic software. '.repeat(12);
 for(const [id,name,url] of [[1,'Alpha tool','https://example.invalid/alpha'],[2,'Beta tool','https://example.invalid/beta']])await scanSource({id,name,url},{extract:null,client:{fetch:async()=>({status:200,body:text,url})}});
 assert.equal(db.offers.length,2);assert.ok(db.offers.every(o=>o.status==='pending'&&!o.official));
 assert.deepEqual(extractOfferFromText(text,'https://example.invalid/new','New').countries,[]);
 }finally{await flushSave();rmSync(dir,{recursive:true,force:true});}
});
