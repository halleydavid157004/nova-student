import test from 'node:test';import assert from 'node:assert/strict';
import {effectiveOfferType,verificationInfo} from '../public/search/quality.js';
import {chatCandidates,groundedReply} from '../src/services/chat-catalog.js';
import {assessment} from '../src/services/liveness.js';
const stamp=new Date().toISOString(),base={id:1,title:'Plan educativo',brand:'Fixture',benefit:'Cursos de programación gratuitos',category:'Development',offer_type:'free',status:'active',official:true,countries:['GLOBAL'],liveness_verified_at:stamp,verified_at:stamp,liveness_status:'active',source_excerpt:'Free coding lessons for enrolled students.',source_url:'https://fixture.example/students'};
test('types distinguish discounts, mixed benefits, credits, trials and unknown terms',()=>{
 for(const [benefit,expected] of [['40% de descuento en Premium','discount'],['Suscripción a precio reducido','discount'],['Plan gratuito para estudiantes','free'],['Plan gratis y 30% de descuento adicional','bundle'],['100% de descuento durante 12 meses','free'],['$100 en créditos cloud','credits'],['Beneficio para estudiantes','other'],['Prueba gratis de 7 días','other']])assert.equal(effectiveOfferType({...base,benefit}),expected,benefit);
});
test('pending/legacy checks never get the same label as current evidence',()=>{
 assert.equal(verificationInfo(base).state,'verified');assert.equal(verificationInfo({...base,liveness_status:'needs_review'}).state,'needs_review');assert.equal(verificationInfo({...base,source_excerpt:null}).state,'unconfirmed');assert.equal(verificationInfo({...base,liveness_status:null}).state,'unconfirmed');
});
test('chat filters regional, stale, unknown-evidence, future and withdrawn rows before selection',()=>{
 const rows=[base,{...base,id:2,countries:['US'],source_url:'https://us.example/students'},{...base,id:3,liveness_status:'needs_review'},{...base,id:4,source_excerpt:null},{...base,id:5,status:'pending'},{...base,id:6,liveness_verified_at:'2000-01-01'},{...base,id:7,liveness_verified_at:new Date(Date.now()+86400000).toISOString()}];
 const c=chatCandidates('Soy estudiante en Colombia, recomiéndame cursos de programación',rows);assert.deepEqual(c.countries,['CO']);assert.deepEqual(c.offers.map(o=>o.id),[1]);const reply=groundedReply(c,[999,1,1]);assert.equal((reply.match(/offer=1/g)||[]).length,1);assert.ok(!reply.includes('offer=999'));assert.ok(!reply.includes('offer=2'));assert.match(reply,/GLOBAL no garantiza/);
});
test('country matching is deterministic across 30 Spanish and English requests',()=>{
 const cases=[['Colombia','CO'],['México','MX'],['Mexico','MX'],['Argentina','AR'],['Chile','CL'],['Perú','PE'],['Peru','PE'],['Brasil','BR'],['Brazil','BR'],['España','ES'],['Spain','ES'],['United States','US'],['Estados Unidos','US'],['Canada','CA'],['Canadá','CA'],['Reino Unido','GB'],['United Kingdom','GB'],['France','FR'],['Francia','FR'],['Germany','DE'],['Alemania','DE'],['Italia','IT'],['Italy','IT'],['Portugal','PT'],['Ecuador','EC'],['Costa Rica','CR'],['Australia','AU'],['New Zealand','NZ'],['Nueva Zelanda','NZ'],['Japón','JP']];
 for(const [country,code] of cases){const c=chatCandidates('Cursos para estudiantes en '+country,[base]);assert.ok(c.countries.includes(code),country);}
});
test('unknown questions and empty selection have no invented benefit or appended unrelated citations',()=>{
 const c=chatCandidates('descuento para teletransportacion',[base]);assert.deepEqual(c.offers,[]);assert.ok(!groundedReply(c,[]).includes('offer='));assert.ok(!groundedReply({offers:[base]},[999]).includes('offer='));
});

test('an inconclusive recheck keeps approved evidence and never refreshes the success timestamp',()=>{
 const response={status:200,url:base.source_url,redirects:[],body:'<title>Education benefit</title><main>'+('Students can access free coding lessons with an educational account. '.repeat(6))+'</main>'};
 const result=assessment({...base,status:'active',consecutive_failures:0},response,null,{extractionError:true});assert.equal(result.patch.source_excerpt,base.source_excerpt);assert.equal(result.patch.liveness_verified_at,base.liveness_verified_at);assert.equal(result.patch.status,'active');assert.equal(result.state,'needs_review');
});
