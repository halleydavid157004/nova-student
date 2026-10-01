import {createSearchIndex} from '../../public/search/engine.js';
import {maxAgeDays,freshness} from './liveness.js';
import { db } from '../db.js';
import {uniqueOffers} from '../../public/search/identity.js';


// Crawler results are leads until someone verifies the concrete benefit.
export function isPublishedOffer(o){return o?.status==='active' && (o.official===true || o.reviewed===true) && (!o.expires_at || new Date(o.expires_at).getTime()>Date.now()) && freshness(o)}
export function searchOffers(filters={}){return createSearchIndex(db.offers,{maxAge:maxAgeDays()}).search(filters)}
export function searchSuggestions(q){return createSearchIndex(db.offers.filter(isPublishedOffer),{maxAge:maxAgeDays()}).suggestions(q)}
export function domainOffers(domain){const d=String(domain||'').replace(/^www\./,'').toLowerCase();if(!d)return [];return uniqueOffers(db.offers.filter(o=>isPublishedOffer(o)&&typeof o.source_domain==='string'&&(o.source_domain===d||o.source_domain.endsWith('.'+d)||d.endsWith('.'+o.source_domain))).sort((a,b)=>b.confidence-a.confidence))}
