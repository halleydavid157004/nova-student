// Age grows without a ceiling so popular sources cannot starve old sources.
export function prioritizedSources(sources,offers,{now=Date.now(),limit=30}={}) {
  const scores=new Map();
  for(const offer of offers){const key=offer.source_id||offer.source_url;const score=Number.isFinite(offer.liveness_score)?offer.liveness_score:50;scores.set(key,Math.min(scores.get(key)??100,score));}
  return sources.filter(source=>source.enabled&&!source.terms_blocked&&!(Date.parse(source.next_retry_at)>now))
    .map(source=>{const checked=Date.parse(source.last_checked_at);const age=Number.isFinite(checked)?Math.max(0,(now-checked)/86400000):30;
      const score=scores.get(source.id)??scores.get(source.url)??50;
      const visits=Math.max(0,Number(source.visits)||0);
      return {source,rank:age*10+(100-score)/10+Math.min(20,Math.log2(visits+1)*2)};})
    .sort((a,b)=>b.rank-a.rank||a.source.id-b.source.id).slice(0,limit).map(row=>row.source);
}
