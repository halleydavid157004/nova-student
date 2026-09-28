import { db } from '../db.js';
export function searchOffers({q='',country='ALL',category='ALL',verification='ALL',status='active',limit=100}={}){
  q=String(q||'').trim().toLowerCase(); limit=Math.max(1,Math.min(500,Number(limit)||100));
  return db.offers.filter(o=>{
    if(o.status!==status)return false;
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
export function domainOffers(domain){const d=String(domain||'').replace(/^www\./,'').toLowerCase();return db.offers.filter(o=>o.status==='active'&&(o.source_domain===d||o.source_domain.endsWith('.'+d)||d.endsWith('.'+o.source_domain))).sort((a,b)=>b.confidence-a.confidence)}
