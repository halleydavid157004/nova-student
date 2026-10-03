// Which website's icon represents a brand. Offers often link to help., docs. or regional pages whose
// icon is generic, so known brands map to their home domain and other hosts drop service subdomains.
import {BRAND_DOMAINS} from './brand-domains.js';
const fold=v=>String(v??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9+.]+/g,' ').trim();
const SERVICE=/^(www|help|support|docs|doc|blog|about|app|dashboard|manual|learn|learning|education|edu|student|students|get|go|plus|ai|flights|catalyst|community|store|shop)$/;
const SECOND_LEVEL=new Set(['co','com','org','net','edu','gov','ac','gob']);
export function homeDomain(host){
 const parts=String(host||'').toLowerCase().replace(/\.$/,'').split('.').filter(Boolean);
 if(parts.length<2||!parts.every(p=>/^[a-z0-9-]+$/.test(p)))return '';
 const keep=parts.length>2&&SECOND_LEVEL.has(parts[parts.length-2])&&parts[parts.length-1].length===2?3:2;
 while(parts.length>keep&&SERVICE.test(parts[0]))parts.shift();
 return parts.join('.');
}
export function logoDomain(o){
 const known=BRAND_DOMAINS[fold(o?.brand)];
 if(known)return known;
 let host=o?.source_domain||'';
 if(!host&&o?.source_url){try{host=new URL(o.source_url).hostname;}catch{host='';}}
 return homeDomain(host);
}
