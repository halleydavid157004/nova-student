// Shared identity rules: preserve regional and benefit variants; never deduplicate by domain.
const fold=v=>String(v??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
export function canonicalSource(value){
 try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;
 u.hostname=u.hostname.toLowerCase().replace(/^www\./,'');u.hash='';
 for(const key of [...u.searchParams.keys()])if(/^(utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid)$/i.test(key))u.searchParams.delete(key);
 u.searchParams.sort();u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.href;
 }catch{return null;}
}
export function offerKeys(o){
 const countries=[...new Set(Array.isArray(o.countries)?o.countries:[])].sort();
 const variant=JSON.stringify([countries,fold(o.benefit),fold(o.offer_type),fold(o.verification)]);
 const url=canonicalSource(o.source_url),keys=[];
 if(url&&(fold(o.benefit)||fold(o.title)))keys.push('url:'+url+variant+(fold(o.benefit)?'':fold(o.title)));
 if(fold(o.brand)&&fold(o.title)&&fold(o.benefit))keys.push('offer:'+JSON.stringify([fold(o.brand),fold(o.title),variant,url?new URL(url).search:'']));
 return keys;
}
export function sameOffer(a,b){const keys=new Set(offerKeys(a));return offerKeys(b).some(k=>keys.has(k));}
export function uniqueOffers(offers){
 const parents=offers.map((_,i)=>i),keys=new Map();
 const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 offers.forEach((o,i)=>{for(const key of offerKeys(o)){if(keys.has(key))parents[root(i)]=root(keys.get(key));else keys.set(key,i);}});
 const preferred=(a,b)=>Number(b.reviewed===true)-Number(a.reviewed===true)||(Date.parse(b.liveness_verified_at||b.verified_at)||0)-(Date.parse(a.liveness_verified_at||a.verified_at)||0)||(Number(b.liveness_score)||0)-(Number(a.liveness_score)||0)||Number(a.id)-Number(b.id);
 const groups=new Map();offers.forEach((o,i)=>{const r=root(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(o);});
 return [...groups.values()].map(group=>group.sort(preferred)[0]);
}
