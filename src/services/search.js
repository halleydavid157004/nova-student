import {freshness} from './liveness.js';
import { db } from '../db.js';
import {CATEGORIES} from '../data/seed.js';

const fold = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

function relevance(offer, query) {
  if (!query) return 0;
  const brand = fold(offer.brand), title = fold(offer.title);
  const fields = [title, brand, offer.summary, offer.benefit, offer.category,
    CATEGORIES[offer.category]?.label, offer.category === 'AI' ? 'ia' : '',
    ...(offer.requirements || []), ...(offer.tags || [])];
  const text = fold(fields.join(' '));
  const tokens = [...new Set(query.split(' '))];
  const words = new Set(text.match(/[\p{L}\p{N}]+/gu) || []);
  const matches = tokens.every(token => token.length <= 2 ? words.has(token) : text.includes(token));
  const compact = tokens.length > 1 && text.replace(/\s/g, '').includes(query.replace(/\s/g, ''));
  if (!matches && !compact) return -1;
  return Number(brand === query) * 100 + Number(title.includes(query)) * 40
    + tokens.reduce((score, token) => score + Number(brand.includes(token)) * 20 + Number(title.includes(token)) * 8, 0);
}
// Crawler results are leads until someone verifies the concrete benefit.
export function isPublishedOffer(o){return o?.status==='active' && (o.official===true || o.reviewed===true) && (!o.expires_at || new Date(o.expires_at).getTime()>Date.now()) && freshness(o)}
export function searchOffers({q='',country='ALL',category='ALL',verification='ALL',limit=100}={}){
  q=fold(String(q||'').slice(0,200)); limit=Math.max(1,Math.min(500,Number(limit)||100));
  return db.offers.filter(o=>{
    if(!isPublishedOffer(o))return false;
    if(category!=='ALL'&&o.category!==category)return false;
    if(verification!=='ALL'&&o.verification!==verification)return false;
    if(country!=='ALL' && !(o.countries||[]).includes('GLOBAL') && !(o.countries||[]).includes(country))return false;
    return true;
  }).map(offer=>({offer,score:relevance(offer,q)})).filter(result=>result.score>=0)
    .sort((a,b)=>b.score-a.score || new Date(b.offer.verified_at)-new Date(a.offer.verified_at) || b.offer.confidence-a.offer.confidence)
    .slice(0,limit).map(result=>result.offer);
}
export function domainOffers(domain){const d=String(domain||'').replace(/^www\./,'').toLowerCase();if(!d)return [];return db.offers.filter(o=>isPublishedOffer(o)&&typeof o.source_domain==='string'&&(o.source_domain===d||o.source_domain.endsWith('.'+d)||d.endsWith('.'+o.source_domain))).sort((a,b)=>b.confidence-a.confidence)}
