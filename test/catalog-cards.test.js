import test from 'node:test';
import assert from 'node:assert/strict';
import {createSearchIndex,genericSummary} from '../public/search/engine.js';
import {homeDomain,logoDomain} from '../public/search/logos.js';
const base={status:'active',official:true,countries:['GLOBAL'],verified_at:new Date().toISOString(),confidence:90};
const offers=[
 {...base,id:1,brand:'Ryanair',title:'Descuento en vuelos',benefit:'10% en tarifas',category:'Travel',offer_type:'discount'},
 {...base,id:2,brand:'Nike',title:'Nike para estudiantes',benefit:'10% en ropa',category:'Shopping',offer_type:'discount'},
 {...base,id:3,brand:'Barbeque Nation',title:'Buffet',benefit:'Precio especial',category:'Shopping',offer_type:'discount'},
 {...base,id:4,brand:'Zed',title:'Zed Pro',summary:'Editor de código colaborativo',benefit:'Gratis un año',category:'Development',offer_type:'free'},
 {...base,id:5,brand:'JetBrains',title:'IDEs',summary:'Desacarga sin costo',benefit:'Licencias gratis',category:'Development',offer_type:'free'},
 {...base,id:6,brand:'Tavily',title:'API',summary:'Desbloquea descuentos exclusivos, créditos o planes gratuitos',benefit:'1000 llamadas',category:'AI',offer_type:'credits'},
];
const index=createSearchIndex(offers);
test('Spanish topic words find their whole category',()=>{
 assert.deepEqual(index.search({q:'viajes'}).map(o=>o.id),[1]);
 assert.deepEqual(index.search({q:'compras'}).map(o=>o.id).sort(),[2,3]);
 assert.deepEqual(index.search({q:'créditos'}).map(o=>o.id),[6]);
});
test('a typo match never beats an exact word, and boilerplate is not indexed',()=>{
 assert.deepEqual(index.search({q:'nation'}).map(o=>o.id),[3]);
 assert.deepEqual(createSearchIndex([...offers,{...base,id:7,brand:'Notion',title:'Plan',category:'Productivity'}]).search({q:'notion'}).map(o=>o.id),[7]);
 assert.equal(index.search({q:'exclusivos'}).length,0);
 assert.ok(genericSummary('Desbloquea descuentos exclusivos, créditos o planes gratuitos'));
});
test('multi-word queries fall back to the closest matches instead of nothing',()=>{
 assert.equal(index.search({q:'editor de código'})[0].id,4);
 assert.equal(index.search({q:'qwerty zxcvb'}).length,0);
});
test('logos come from the brand home domain',()=>{
 assert.equal(homeDomain('help.miro.com'),'miro.com');
 assert.equal(homeDomain('education.github.com'),'github.com');
 assert.equal(homeDomain('www.example.com.co'),'example.com.co');
 assert.equal(homeDomain('azure.microsoft.com'),'azure.microsoft.com');
 assert.equal(logoDomain({brand:'Namecheap',source_domain:'nc.me'}),'namecheap.com');
 assert.equal(logoDomain({brand:'Otra',source_url:'https://support.otra.io/x'}),'otra.io');
});
