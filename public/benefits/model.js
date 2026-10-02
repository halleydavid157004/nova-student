import {uniqueOffers} from '../search/identity.js';
import {published,emailRequirement,fold} from '../search/engine.js';
import {COUNTRY_CODES} from '../search/countries.js';
export const LATAM=['AR','BO','BR','CL','CO','CR','CU','DO','EC','SV','GT','HN','MX','NI','PA','PY','PE','PR','UY','VE'];
const countries=new Set(COUNTRY_CODES);
export const CAREERS={
 design:['design','diseno','arquitectura','architecture'],
 engineering:['engineering','ingenieria','computer science','computacion','informatica','sistemas'],
 education:['education','educacion','pedagogia'],
 medicine:['medicine','medical','medicina','salud'],
 business:['business','administracion','negocios','economia','economics'],
 music:['music','musica'],
};
const careerGroup=value=>Object.entries(CAREERS).filter(([,aliases])=>aliases.some(a=>new RegExp('(?:^|[^a-z])'+a+'(?:$|[^a-z])').test(fold(value)))).map(([key])=>key);
const requirements=o=>(Array.isArray(o.requirements)?o.requirements:[]).filter(v=>typeof v==='string').join(' ');
export function liveOffers(offers,{now=Date.now(),maxAge=14}={}){
 const ids=new Set();return uniqueOffers((Array.isArray(offers)?offers:[]).filter(o=>{
  if(!o||!Number.isSafeInteger(o.id)||o.id<1||ids.has(o.id)||!published(o,now,maxAge)||Date.parse(o.liveness_verified_at||o.verified_at||o.discovered_at)>now+60000)return false;
  ids.add(o.id);return true;
 }));
}
export function eligibility(o,profile={},options={}){
 if(!liveOffers([o],options).length)return {state:'unavailable',label:'Oferta fuera del catálogo vigente',reasons:['No está publicada o su verificación/vencimiento no es vigente.']};
 const reasons=[],mismatch=[],review=[];const location=Array.isArray(o.countries)?o.countries:[];
 if(!countries.has(profile.country))review.push('Indica tu país para comprobar la disponibilidad.');
 else if(!location.length||location.includes('UNKNOWN'))review.push('La disponibilidad por país todavía requiere comprobar la fuente.');
 else if(!location.includes('GLOBAL')&&!location.includes(profile.country))mismatch.push('Tu país no figura entre los países publicados. Una VPN no sustituye residencia, matrícula ni verificación.');
 else reasons.push('Tu país coincide con la disponibilidad publicada.');
 if(profile.student===false)mismatch.push('Este beneficio requiere la condición de estudiante.');
 else if(profile.student!==true)review.push('Confirma si actualmente eres estudiante y comprueba los documentos exigidos.');
 else reasons.push('Declaraste que actualmente eres estudiante.');
 const mail=emailRequirement(o),text=fold([o.verification,requirements(o)].join(' '));
 const alternate=/\b(or|o)\b/.test(text)&&/student id|carnet|proof|document|constancia|matricula/.test(text);
 if(mail==='educational'&&profile.email_type!=='educational'){
  if(alternate)review.push('La fuente menciona una verificación alternativa al correo educativo; comprueba qué documento admite.');
  else if(profile.email_type==='personal')mismatch.push('Se pide un correo educativo o institucional y declaraste correo personal.');
  else review.push('Comprueba si tienes el correo educativo exigido.');
 }else if(mail==='unknown')review.push('Revisa el método de verificación: el tipo de correo no está confirmado.');
 else reasons.push(mail==='educational'?'Declaraste disponer de correo educativo.':'El correo no presenta una incompatibilidad documentada.');
 const required=careerGroup(fold(requirements(o)).split(/[.;]/).filter(s=>!/(?:no requiere|no necesitas|not required|not restricted|any major|cualquier carrera)/.test(s)).join('.').match(/(?:students (?:of|in)|majoring in|studying|estudiantes? de|curs(?:ar|ando))\s+([^.;]{1,100})/g)?.join(' ')||'');
 if(required.length){const actual=careerGroup(profile.career||'');if(!actual.length)review.push('La oferta menciona una carrera específica; comprueba tu programa en la fuente.');else if(!actual.some(k=>required.includes(k)))mismatch.push('La carrera indicada no coincide con la restricción de carrera publicada.');else reasons.push('Tu carrera coincide con la restricción publicada.');}
 if(o.liveness_status&&o.liveness_status!=='active')review.push('La última comprobación está en revisión; comprueba la fuente antes de reclamar.');
 if(!requirements(o).trim())review.push('Los requisitos están incompletos en la ficha.');
 return {state:mismatch.length?'not_matched':review.length?'review':'matches',label:mismatch.length?'No coincide con tu perfil':review.length?'Necesita comprobar requisitos':'Coincide con lo que declaraste',reasons:[...mismatch,...review,...reasons,'La fuente decide la elegibilidad final; este resultado no la garantiza.']};
}
export function verificationBadge(o){
 const stamp=o?.liveness_verified_at||o?.verified_at;const evidence=o?.evidence||o?.source_excerpt;
 const valid=typeof evidence==='string'&&evidence.trim().length>=10&&Number.isFinite(Date.parse(o?.liveness_verified_at));
 return {label:valid?'Verificación con evidencia':'Última comprobación; evidencia no disponible',date:Number.isFinite(Date.parse(stamp))?new Date(stamp).toISOString():null,evidence:valid?evidence.slice(0,400):null,needs_review:!!o?.liveness_status&&o.liveness_status!=='active'};
}
export function deadlineMonth(stamp,timeZone='UTC'){
 const d=new Date(stamp);if(!Number.isFinite(d.getTime()))return null;
 const parts=new Intl.DateTimeFormat('en',{timeZone,year:'numeric',month:'2-digit'}).formatToParts(d);
 return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
}
export function calendarOffers(offers,{month='',timeZone='UTC',...options}={}){
 return liveOffers(offers,options).filter(o=>Number.isFinite(Date.parse(o.expires_at))&&(!month||deadlineMonth(o.expires_at,timeZone)===month)).sort((a,b)=>Date.parse(a.expires_at)-Date.parse(b.expires_at)||a.id-b.id);
}
function cents(value){const text=String(value??'').trim();if(!/^\d{1,6}(?:\.\d{1,2})?$/.test(text))return null;const [whole,fraction='']=text.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));}
function afterMonths(now,n){const d=new Date(now),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.getTime();}
export function savingsEstimate(o,input={},options={}){
 const now=options.now??Date.now();if(!liveOffers([o],{...options,now}).length)return null;
 const regular=cents(input.regular_monthly),student=cents(input.student_monthly),wanted=Number(input.months);
 if(regular===null||student===null||!Number.isInteger(wanted)||wanted<1||wanted>12)return null;
 let months=wanted;const deadline=Date.parse(o.expires_at);if(Number.isFinite(deadline))while(months>0&&afterMonths(now,months)>deadline)months--;
 const amount=Math.max(0,regular-student)*months;
 return {offer_id:o.id,amount_usd:amount/100,months,requested_months:wanted,limited_by_deadline:months<wanted,basis:'user_prices',currency:'USD'};
}
export function savingsTotal(offers,inputs,profile,options={}){
 const estimates=liveOffers(offers,options).filter(o=>inputs.get(o.id)?.selected&&eligibility(o,profile,options).state!=='not_matched').map(o=>savingsEstimate(o,inputs.get(o.id),options)).filter(Boolean);
 return {estimates,amount_usd:estimates.reduce((total,e)=>total+Math.round(e.amount_usd*100),0)/100};
}
