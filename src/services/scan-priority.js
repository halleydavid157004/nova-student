import {canonicalSource} from '../../public/search/identity.js';
// Age grows without a ceiling so popular sources cannot starve old sources.
export function prioritizedSources(sources,offers,{now=Date.now(),limit=30}={}) {
  const scores=new Map(),due=new Set();
  for(const offer of offers){const key=offer.source_id||offer.source_url;const stamp=Date.parse(offer.liveness_verified_at||offer.verified_at||'');if(offer.status==='active'&&(offer.official===true||offer.reviewed===true)&&(!Number.isFinite(stamp)||now-stamp>=86400000)){due.add(key);if(offer.source_url)due.add(canonicalSource(offer.source_url));}const score=Number.isFinite(offer.liveness_score)?offer.liveness_score:50;scores.set(key,Math.min(scores.get(key)??100,score));}
  const ranked=sources.filter(source=>source.enabled&&!source.terms_blocked&&!(Date.parse(source.next_retry_at)>now))
    .map(source=>{const checked=Date.parse(source.last_checked_at);const age=Number.isFinite(checked)?Math.max(0,(now-checked)/86400000):30;
      const score=scores.get(source.id)??scores.get(source.url)??50;
      const visits=Math.max(0,Number(source.visits)||0);
      return {source,rank:age*10+(100-score)/10+Math.min(20,Math.log2(visits+1)*2)};})
    .sort((a,b)=>b.rank-a.rank||a.source.id-b.source.id);
  const cap=Math.max(0,Math.floor(Number(limit)||0));
  // Up to two thirds go to published offers due for their daily check (cheap: their approved
  // quote is re-confirmed without AI); the rest keeps age fairness for discovery.
  const reserved=ranked.filter(({source})=>due.has(source.id)||(source.url&&due.has(canonicalSource(source.url)))).slice(0,Math.ceil(cap*2/3));
  const used=new Set(reserved.map(({source})=>source.id));
  return [...reserved,...ranked.filter(({source})=>!used.has(source.id))].slice(0,cap).map(row=>row.source);
}
