import {uniqueOffers} from '../../public/search/identity.js';
import {isPublishedOffer} from './search.js';
const fields=['id','slug','brand','title','summary','benefit','category','offer_type','verification','countries','requirements','steps','tags','official','reviewed','status','confidence','requires_card','commercial_use','discovered_at','verified_at','liveness_verified_at','expires_at','liveness_score','liveness_status','updated_at'];
export function publicCatalog(offers) {
  return {schema:1,generated_at:new Date().toISOString(),offers:uniqueOffers(offers.filter(isPublishedOffer)).map(offer=>{
    const row=Object.fromEntries(fields.filter(key=>offer[key]!==undefined).map(key=>[key,offer[key]]));
    try{const url=new URL(offer.source_url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error();for(const key of [...url.searchParams.keys()]){const value=url.searchParams.get(key);if(!((['country','region'].includes(key)&&/^[A-Z]{2}$/.test(value))||(key==='plan'&&/^(free|pro|premium|basic|student|education|academic|starter|standard|plus|business|enterprise)$/.test(value))))url.searchParams.delete(key);}url.hash='';row.source_url=url.href;row.source_domain=url.hostname;}catch{row.source_url=null;row.source_domain=null;}
    if(offer.liveness_verified_at&&typeof offer.source_excerpt==='string')row.evidence=offer.source_excerpt.slice(0,400);
    return row;
  })};
}
