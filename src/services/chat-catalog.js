import {COUNTRY_CODES} from '../../public/search/countries.js';
import {createSearchIndex,fold,queryTerms,published} from '../../public/search/engine.js';
import {verificationInfo,effectiveOfferType} from '../../public/search/quality.js';
import {uniqueOffers} from '../../public/search/identity.js';
const names=[];
for(const locale of ['es','en']){const display=new Intl.DisplayNames([locale],{type:'region'});for(const code of COUNTRY_CODES)names.push([fold(display.of(code)),code]);}
names.push(['ee uu','US'],['usa','US'],['reino unido','GB'],['uk','GB']);
const clean=value=>fold(value).replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
export function chatCandidates(message,offers,{now=Date.now(),maxAge=14}={}){
 const query=clean(message);const locations=[...new Set(names.filter(([name])=>(' '+query+' ').includes(' '+clean(name)+' ')).map(([,code])=>code))];
 const cross=/explor.*otros paises|explor.*other countries|ofertas internacionales/.test(query);
 let rows=uniqueOffers(offers.filter(o=>published(o,now,maxAge)&&verificationInfo(o).state==='verified'));
 if(locations.length&&!cross)rows=rows.filter(o=>o.countries?.includes('GLOBAL')||locations.some(code=>o.countries?.includes(code)));
 let topic=query;for(const [name] of names)topic=topic.replaceAll(clean(name),' ');
 topic=topic.replace(/\b(soy|desde|recomiendame|recomienda|recomendar|dame|dos|tres|aprender|cita|citar|sus|fichas|publicados|programacion|busco|necesito|beneficios|i|am|recommend|published|learn)\b/g,w=>w==='programacion'?'desarrollo':' ');
 const terms=queryTerms(topic),rank=new Map(),index=createSearchIndex(rows,{maxAge});
 for(const term of terms)for(const [i,o] of index.search({q:term,now,limit:100}).entries())rank.set(o.id,(rank.get(o.id)||0)+100-i);
 if(terms.length)rows=rows.filter(o=>rank.has(o.id)).sort((a,b)=>rank.get(b.id)-rank.get(a.id)||a.id-b.id);
 return {offers:rows.slice(0,10),countries:locations,cross};
}
export function groundedReply(candidate,selected){
 const ids=Array.isArray(selected)?[...new Set(selected)].filter(id=>Number.isSafeInteger(id)&&candidate.offers.some(o=>o.id===id)).slice(0,3):[];
 const rows=ids.map(id=>candidate.offers.find(o=>o.id===id));
 if(!rows.length)return 'No encontré una oferta con evidencia vigente que responda a tu consulta y país. Prueba otra marca o categoría; no significa que el beneficio no exista.';
 return rows.map(o=>`**${o.title}**\n${o.benefit||o.summary||'Consulta el beneficio en la ficha.'}\nTipo: ${({free:'Gratis',discount:'Descuento',credits:'Créditos',bundle:'Beneficio combinado',other:'Consultar condiciones'})[effectiveOfferType(o)]}. Países publicados: ${(o.countries||[]).join(', ')}.\nRequisitos: ${(o.requirements||[]).join('; ')||'Consultar fuente'}.\nPasos: ${(o.steps||[]).join('; ')||'Consultar fuente'}.\nFicha: https://nova-student-radar.onrender.com/?offer=${o.id}`).join('\n\n')+'\n\nConfirma las condiciones y tu elegibilidad en la ficha y la fuente. GLOBAL no garantiza elegibilidad local. Una VPN no sustituye residencia ni matrícula.';
}
