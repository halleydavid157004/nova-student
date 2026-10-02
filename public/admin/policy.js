import {canonicalSource,sameOffer} from '../search/identity.js';
import {COUNTRY_CODES} from '../search/countries.js';
const countries=new Set([...COUNTRY_CODES,'GLOBAL']);
const fields=['benefit','value','requirements','verification','countries','expires_at','available'];
export function reviewDiff(approved,extracted){
 return fields.filter(key=>JSON.stringify(approved?.[key]??null)!==JSON.stringify(extracted?.[key]??null)).map(key=>({field:key,before:approved?.[key]??null,after:extracted?.[key]??null}));
}
// This evaluates worker evidence, never substitutes a search result or HTTP 200 for approval.
export function approvalProblems(item,{now=Date.now()}={}){
 const {offer:o,check:c,version:v}=item||{},x=v?.extraction,s=c?.signals||{},problems=[];
 if(!o||!c||!v||c.offer_version_id!==v.id||v.offer_id!==o.id)problems.push('Falta una extracción vinculada a la última verificación.');
 const checked=Date.parse(c?.checked_at);if(!Number.isFinite(checked)||checked>now+60000||now-checked>7*86400000)problems.push('Se necesita una verificación de los últimos siete días.');
 if(!['active','needs_review'].includes(c?.result)||!(c?.score>=55)||!(s.http>=200&&s.http<300)||s.blocked||s.network||s.soft_404||s.extraction||s.user_reports)problems.push('Hay señales de bloqueo, fallo o reportes pendientes.');
 if(!canonicalSource(o?.source_url)||!String(o?.source_url).startsWith('https://')||canonicalSource(s.final_url)!==canonicalSource(o?.source_url))problems.push('La fuente o su redirección requieren otra verificación.');
 if(!Array.isArray(s.material)||s.material.some(k=>!['value_changed','benefit_changed','verification_changed','countries_changed'].includes(k)))problems.push('La vigencia no está suficientemente acreditada.');
 const list=(v,max,length)=>Array.isArray(v)&&v.length<=max&&v.every(s=>typeof s==='string'&&s.length>0&&s.length<=length);
 if(!x||x.available!==true||typeof x.benefit!=='string'||!x.benefit.trim()||x.benefit.length>1000||typeof x.evidence!=='string'||x.evidence.length<10||x.evidence.length>400||x.evidence!==v?.evidence||!list(x.requirements,20,500)||!list(x.countries,250,7)||!x.countries.length||x.countries.some(k=>!/^([A-Z]{2}|GLOBAL)$/.test(k))||!(x.verification===null||typeof x.verification==='string'&&x.verification.length<=254)||!(x.value===null||typeof x.value==='string'&&x.value.length<=254)||Object.keys(x).sort().join(',')!==[...fields,'evidence'].sort().join(','))problems.push('La evidencia o los requisitos están incompletos.');
 if(Array.isArray(x?.countries)&&x.countries.some(k=>!countries.has(k)))problems.push('El país no tiene un código ISO reconocido.');
 if(x?.expires_at!==null&&(!/^\d{4}-\d{2}-\d{2}T/.test(x?.expires_at)||!Number.isFinite(Date.parse(x?.expires_at))||Date.parse(x.expires_at)<=now))problems.push('La oferta está vencida o su fecha es inválida.');
 return problems;
}
export function approvedCandidate(item){const x=item.version.extraction;return {...item.offer,benefit:x.benefit,verification:x.verification,countries:x.countries};}
export function duplicateIds(item,offers){const candidate=approvedCandidate(item);return offers.filter(o=>o.id!==candidate.id&&sameOffer(candidate,o)).map(o=>o.id);}
