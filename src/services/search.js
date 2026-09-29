import { db } from '../db.js';
// Crawler results are leads until someone verifies the concrete benefit.
export function isPublishedOffer(o){return o?.status==='active' && (o.official===true || o.reviewed===true)}
export function searchOffers({q='',country='ALL',category='ALL',verification='ALL',limit=100}={}){
  q=String(q||'').trim().toLowerCase(); limit=Math.max(1,Math.min(500,Number(limit)||100));
  return db.offers.filter(o=>{
    if(!isPublishedOffer(o))return false;
    if(q) {
      const qNorm = q.replace(/\s+/g, '');
      const textBlock = [o.title,o.brand,o.summary,o.benefit,...(o.requirements||[])].join(' ').toLowerCase();
      const textNorm = textBlock.replace(/\s+/g, '');
      if (!textBlock.includes(q) && !textNorm.includes(qNorm)) return false;
    }
    if(category!=='ALL'&&o.category!==category)return false;
    if(verification!=='ALL'&&o.verification!==verification)return false;
    if(country!=='ALL' && !(o.countries||[]).includes('GLOBAL') && !(o.countries||[]).includes(country))return false;
    return true;
  }).sort((a,b)=>new Date(b.verified_at)-new Date(a.verified_at)||b.confidence-a.confidence).slice(0,limit);
}
export function domainOffers(domain){const d=String(domain||'').replace(/^www\./,'').toLowerCase();if(!d)return [];return db.offers.filter(o=>isPublishedOffer(o)&&typeof o.source_domain==='string'&&(o.source_domain===d||o.source_domain.endsWith('.'+d)||d.endsWith('.'+o.source_domain))).sort((a,b)=>b.confidence-a.confidence)}
