import test from 'node:test';
import assert from 'node:assert/strict';
import {liveOffers,eligibility,calendarOffers,deadlineMonth,savingsEstimate,savingsTotal,verificationBadge} from '../public/benefits/model.js';
const now=Date.UTC(2026,9,2,18),options={now};
const profile={country:'CO',student:true,email_type:'educational',career:'Ingeniería de sistemas'};
const offer={id:1,brand:'Fixture',title:'Plan educativo',benefit:'Plan sin costo',status:'active',reviewed:true,source_url:'https://example.invalid/student',countries:['CO'],verification:'Educational email',requirements:['Matrícula vigente y correo institucional'],offer_type:'free',verified_at:new Date(now).toISOString(),liveness_verified_at:new Date(now).toISOString(),liveness_status:'active',evidence:'Students can claim a free education plan.'};
test('benefits reapply publication, freshness and dedup before matching or summing',()=>{
 const rows=[offer,{...offer,id:2,source_url:offer.source_url+'?utm_source=radar'},{...offer,id:3,countries:['MX']},{...offer,id:4,reviewed:false},{...offer,id:5,status:'inactive'},{...offer,id:6,expires_at:new Date(now-1).toISOString()},{...offer,id:7,liveness_verified_at:new Date(now-15*86400000).toISOString()},{...offer,id:8,liveness_verified_at:new Date(now+120000).toISOString()}];
 assert.deepEqual(liveOffers(rows,options).map(o=>o.id),[1,3]);
 assert.equal(eligibility(rows[3],profile,options).state,'unavailable');
});
test('eligibility explains country, educational email, enrollment and uncertainty without promising a claim',()=>{
 const good=eligibility(offer,profile,options);assert.equal(good.state,'matches');assert.ok(good.reasons.at(-1).includes('no la garantiza'));
 for(const p of [{...profile,country:'MX'},{...profile,email_type:'personal'},{...profile,student:false}])assert.equal(eligibility(offer,p,options).state,'not_matched');
 for(const p of [{...profile,country:''},{...profile,email_type:'unknown'},{...profile,student:null}])assert.equal(eligibility(offer,p,options).state,'review');
 assert.equal(eligibility({...offer,countries:['GLOBAL']},{...profile,country:'MX'},options).state,'matches');
 assert.equal(eligibility({...offer,countries:['UNKNOWN']},profile,options).state,'review');
 assert.equal(eligibility({...offer,liveness_status:'blocked'},profile,options).state,'review');
 assert.equal(eligibility({...offer,requirements:[]},profile,options).state,'review');
});
test('alternative student documents do not falsely disqualify personal email; careers use explicit requirements only',()=>{
 assert.equal(eligibility({...offer,requirements:['Correo institucional o constancia de matrícula']},{...profile,email_type:'personal'},options).state,'review');
 assert.equal(eligibility({...offer,requirements:['No requiere ser estudiantes de diseño. Matrícula vigente.']},profile,options).state,'matches');
 const design={...offer,requirements:['Estudiantes de diseño. Matrícula vigente.']};
 assert.equal(eligibility(design,profile,options).state,'not_matched');assert.equal(eligibility(design,{...profile,career:'Graphic design'},options).state,'matches');assert.equal(eligibility(design,{...profile,career:''},options).state,'review');
 assert.equal(eligibility({...offer,benefit:'Software de diseño para todos'},profile,options).state,'matches');
});
test('calendar respects exact deadlines, timezone month boundaries, freshness and duplicate variants',()=>{
 const boundary={...offer,expires_at:'2026-11-01T00:30:00Z'},later={...offer,id:3,title:'Otro',source_url:'https://example.invalid/other',expires_at:'2026-11-03T12:00:00Z'},unknown={...offer,id:4,title:'Sin fecha',source_url:'https://example.invalid/unknown'};
 assert.equal(deadlineMonth(boundary.expires_at,'America/Bogota'),'2026-10');assert.equal(deadlineMonth(boundary.expires_at,'UTC'),'2026-11');
 assert.deepEqual(calendarOffers([boundary,later,unknown,{...boundary,id:2,source_url:offer.source_url+'?utm_source=copy'}],{...options,month:'2026-10',timeZone:'America/Bogota'}).map(o=>o.id),[1]);
 assert.deepEqual(calendarOffers([later,boundary],{...options,timeZone:'UTC'}).map(o=>o.id),[1,3]);
});
test('USD estimates require both personal prices, handle decimals exactly, and cap complete months before expiration',()=>{
 assert.deepEqual(savingsEstimate(offer,{regular_monthly:'20',student_monthly:'5',months:'12'},options),{offer_id:1,amount_usd:180,months:12,requested_months:12,limited_by_deadline:false,basis:'user_prices',currency:'USD'});
 assert.equal(savingsEstimate(offer,{regular_monthly:'0.30',student_monthly:'0.10',months:12},options).amount_usd,2.4);
 for(const input of [{regular_monthly:'',student_monthly:'0',months:12},{regular_monthly:'1e3',student_monthly:'0',months:12},{regular_monthly:'2.001',student_monthly:'0',months:12},{regular_monthly:'20',student_monthly:'-1',months:12},{regular_monthly:'20',student_monthly:'0',months:13}])assert.equal(savingsEstimate(offer,input,options),null);
 const ended={...offer,expires_at:'2026-11-15T18:00:00Z'};const short=savingsEstimate(ended,{regular_monthly:'20',student_monthly:'5',months:12},options);assert.equal(short.months,1);assert.equal(short.amount_usd,15);assert.equal(short.limited_by_deadline,true);
 assert.equal(savingsEstimate({...offer,status:'inactive'},{regular_monthly:20,student_monthly:0,months:12},options),null);
 assert.equal(savingsEstimate(offer,{regular_monthly:5,student_monthly:10,months:12},options).amount_usd,0);
});
test('end-of-month savings caps use real calendar months, including leap years',()=>{
 const jan=Date.UTC(2028,0,31,12),o={...offer,verified_at:new Date(jan).toISOString(),liveness_verified_at:new Date(jan).toISOString(),expires_at:'2028-02-29T12:00:00Z'};
 assert.equal(savingsEstimate(o,{regular_monthly:10,student_monthly:0,months:12},{now:jan}).months,1);
});
test('totals never count tracking duplicates, mismatched countries, withdrawn rows or unselected estimates',()=>{
 const duplicate={...offer,id:2,source_url:offer.source_url+'?utm_source=copy'},regional={...offer,id:3,countries:['MX']},retired={...offer,id:4,status:'inactive'},other={...offer,id:5,title:'Otro',source_url:'https://example.invalid/other'};
 const inputs=new Map([1,2,3,4,5].map(id=>[id,{selected:id!==5,regular_monthly:10,student_monthly:0,months:12}]));
 const result=savingsTotal([offer,duplicate,regional,retired,other],inputs,profile,options);assert.equal(result.amount_usd,120);assert.deepEqual(result.estimates.map(e=>e.offer_id),[1]);
});
test('badge differentiates evidence-backed checks from legacy timestamps and warns about review',()=>{
 assert.equal(verificationBadge(offer).evidence,offer.evidence);
 assert.equal(verificationBadge({...offer,liveness_verified_at:null}).evidence,null);
 assert.equal(verificationBadge({...offer,evidence:''}).evidence,null);
 assert.equal(verificationBadge({...offer,liveness_status:'needs_review'}).needs_review,true);
});
