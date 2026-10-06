import {effectiveOfferType} from './quality.js';
import {uniqueOffers} from './identity.js';
import {SYNONYMS,TOPIC_CATEGORIES,TOPIC_TYPES} from './synonyms.js';
export const fold=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim();
const words=value=>fold(value).match(/[\p{L}\p{N}]+/gu)||[];
const STOP=new Set('que para de del la el los las un una unos unas y o en con por como puedo quiero hay me mi mis tu su al a sin estudiantes estudiante student students beneficio beneficios oferta ofertas plan the for and of'.split(' '));
// Scraped page boilerplate that says nothing about the product; never index or show it.
export const genericSummary=value=>/desbloquea descuentos exclusivos|we use cookies|cookie|javascript|sign in|log in/i.test(String(value||''));
const aliases=new Map(),topicOf=new Map();
for(const group of SYNONYMS){const values=[...new Set(group.flatMap(words))];for(const alias of group){aliases.set(fold(alias),values);for(const w of words(alias))if(!topicOf.has(w))topicOf.set(w,group[0]);}}
export function queryTerms(query){let text=fold(String(query).slice(0,200));for(const [alias,group] of aliases)if(alias.includes(' '))text=text.replaceAll(alias,group[0]);return [...new Set(words(text).filter(w=>!STOP.has(w)))].slice(0,12);}
// Bounded Damerau-Levenshtein: adjacent transpositions count as one typo.
function distance(a,b,max){if(Math.abs(a.length-b.length)>max)return max+1;const rows=[Array.from({length:b.length+1},(_,i)=>i)];for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++){let n=Math.min(row[j-1]+1,rows[i-1][j]+1,rows[i-1][j-1]+Number(a[i-1]!==b[j-1]));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])n=Math.min(n,rows[i-2][j-2]+1);row.push(n);}rows.push(row);}return rows[a.length][b.length];}
export function emailRequirement(o){
 if(['educational','any','none','unknown'].includes(o.email_requirement))return o.email_requirement;
 const text=fold([o.verification,...(Array.isArray(o.requirements)?o.requirements:[])].join(' '));
 if(/educational email|education email|correo (educativo|institucional)|institutional email|\.edu\b/.test(text))return 'educational';
 if(/any email|correo personal|cualquier correo/.test(text))return 'any';
 if(/no email required|sin correo|no requiere correo/.test(text))return 'none';
 return 'unknown';
}
export function published(o,now=Date.now(),maxAge=14){const stamp=Date.parse(o.liveness_verified_at||o.verified_at||o.discovered_at||'');return o.status==='active'&&(o.official===true||o.reviewed===true)&&(!o.expires_at||Date.parse(o.expires_at)>now)&&Number.isFinite(stamp)&&stamp<=now+60000&&now-stamp<=maxAge*86400000;}
export function createSearchIndex(offers,{maxAge=14}={}){
 const rows=offers.filter(o=>published(o,Date.now(),maxAge)).map(o=>({...o,offer_type:effectiveOfferType(o)})).map(o=>({offer:o,brand:fold(o.brand),tokens:new Map()}));
 const inverted=new Map();
 for(let i=0;i<rows.length;i++){
  const row=rows[i],o=row.offer;
  for(const [value,weight] of [[o.brand,12],[o.title,7],[o.category,5],[(Array.isArray(o.tags)?o.tags:[]).join(' '),3],[o.benefit,3],[genericSummary(o.summary)?'':o.summary,2]])for(const token of words(value))row.tokens.set(token,Math.max(row.tokens.get(token)||0,weight));
  for(const [token,weight] of row.tokens){if(!inverted.has(token))inverted.set(token,new Map());inverted.get(token).set(i,weight);}
 }
 const vocabulary=[...inverted.keys()];
 // Every result must match every term; when nothing does, results that match the most terms are shown instead.
 function termMatches(term){
  const matched=new Map(),equivalent=aliases.get(term)||[term],add=(i,score)=>matched.set(i,Math.max(matched.get(i)||0,score));
  let direct=false;
  for(const token of vocabulary){let multiplier=0;
   if(token===term)multiplier=10;
   else if(equivalent.includes(token))multiplier=7;
   else if(term.length>=2&&token.startsWith(term))multiplier=5;
   if(multiplier){direct=true;for(const [i,weight] of inverted.get(token))add(i,multiplier*weight);}
  }
  const topic=topicOf.get(term),cats=TOPIC_CATEGORIES[topic]||[],types=TOPIC_TYPES[topic]||[];
  if(cats.length||types.length)rows.forEach((row,i)=>{if(cats.includes(row.offer.category)||types.includes(row.offer.offer_type))add(i,60);});
  // Typos only count when the word matches nothing as typed ("notion" must not find "nation").
  if(!direct&&!matched.size&&term.length>=4){const max=term.length>=8?2:1;
   for(const token of vocabulary)if(distance(term,token,max)<=max)for(const [i,weight] of inverted.get(token))add(i,3*weight);}
  return matched;
 }
 function search({q='',country='ALL',category='ALL',verification='ALL',email='ALL',week=false,cross=false,limit=500,now=Date.now()}={}){
  const terms=queryTerms(q),scores=new Map(),hits=new Map();
  // Rare words weigh more, so "editor de código" ranks editors above every developer tool.
  for(const term of terms){const matched=termMatches(term),rarity=Math.log(1+rows.length/Math.max(1,matched.size));for(const [i,score] of matched){scores.set(i,(scores.get(i)||0)+score*rarity);hits.set(i,(hits.get(i)||0)+1);}}
  const keep=i=>{const o=rows[i].offer;return published(o,now,maxAge)&&(cross===true||cross==='true'||country==='ALL'||(o.countries||[]).includes('GLOBAL')||(o.countries||[]).includes(country))&&(category==='ALL'||o.category===category)&&(verification==='ALL'||o.verification===verification)&&(email==='ALL'||emailRequirement(o)===email)&&(!(week===true||week==='true')||now-Date.parse(o.liveness_verified_at||o.verified_at||'')<=7*86400000);};
  let selected=terms.length?[...hits.keys()].filter(keep):rows.map((_,i)=>i).filter(keep);
  if(terms.length>1){const all=selected.filter(i=>hits.get(i)===terms.length);if(all.length)selected=all;else{const best=Math.max(0,...selected.map(i=>hits.get(i)));selected=best>=Math.ceil(terms.length/2)?selected.filter(i=>hits.get(i)===best):[];}}
  const wanted=fold(q);
  const results=selected.map(i=>{const row=rows[i],o=row.offer;const age=Math.max(0,(now-Date.parse(o.liveness_verified_at||o.verified_at||o.discovered_at))/86400000);return {offer:o,score:(scores.get(i)||0)+((o.countries||[]).includes(country)?40:0)+(wanted&&row.brand===wanted?1000:0)+(wanted&&row.brand.startsWith(wanted)?300:0)+(Number(o.liveness_score)||Number(o.confidence)||0)/10+Math.max(0,14-age)};})
   .sort((a,b)=>b.score-a.score||Number(a.offer.id)-Number(b.offer.id)).map(x=>x.offer);
  return uniqueOffers(results).slice(0,Math.max(1,Math.min(500,Number(limit)||100)));
 }
 function suggestions(q){const terms=queryTerms(q);return [...new Set(terms.flatMap(term=>vocabulary.filter(token=>term.length>=3&&distance(term,token,2)<=2)))].slice(0,5);}
 return {search,suggestions};
}
// Only predefined topic labels leave the client; unknown words never do.
export function gapTopics(query){const terms=queryTerms(query);return SYNONYMS.filter(group=>group.some(alias=>terms.some(term=>(aliases.get(term)||[term]).includes(words(alias)[0])))).map(group=>group[0]).slice(0,4);}
