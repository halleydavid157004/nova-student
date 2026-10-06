import {effectiveOfferType,verificationInfo} from './quality.js';
// Editorial recommendations, never popularity or an approval mechanism.
const DAY=86400000;
export function highlights(o,{now=Date.now(),maxAge=14}={}){
 const stamp=Date.parse(o?.liveness_verified_at||o?.verified_at||'');
 const age=(now-stamp)/DAY;
 if(verificationInfo(o).state!=='verified')return [];
 if(!o||o.status!=='active'||!(o.official===true||o.reviewed===true)||!Number.isFinite(age)||age<0||age>maxAge||
   (o.expires_at&&!(Date.parse(o.expires_at)>now))||
   (o.liveness_status&&o.liveness_status!=='active'))return [];
 const score=Number.isFinite(o.liveness_score)?o.liveness_score:o.confidence;
 const labels=[];
 if(age<=7&&score>=90)labels.push({key:'hot',label:'🔥 Hot',reason:'Revisada en los últimos 7 días, con puntuación de al menos 90. No mide popularidad.'});
 if(age<=7&&score>=95&&effectiveOfferType(o)==='free'&&o.requires_card===false&&
   typeof o.benefit==='string'&&o.benefit.trim()&&Array.isArray(o.requirements)&&o.requirements.some(x=>typeof x==='string'&&x.trim()))
   labels.push({key:'imperdible',label:'⭐ Imperdible',reason:'Beneficio gratuito, sin tarjeta, con requisitos documentados y puntuación de al menos 95. Comprueba tu elegibilidad.'});
 const remaining=(Date.parse(o.expires_at)-now)/DAY;
 if(remaining>0&&remaining<=14)labels.push({key:'expiring',label:'⏳ Por vencer',reason:'La fecha registrada de vencimiento está dentro de los próximos 14 días.'});
 return labels;
}
