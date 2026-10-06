// Display facts conservatively; never turn missing information into free/verified.
const text=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
export function effectiveOfferType(o){
 const benefit=text(o?.benefit);const original=o?.offer_type;
 if(original==='bundle')return 'bundle';
 if(/creditos?\b|credits?\b/.test(benefit))return 'credits';
 const free=/\bgratis\b|\bgratuit[oa]s?\b|\bfree\b|sin costo|sin coste|100\s*%/.test(benefit);
 const paid=/descuento|discount|precio reducido|tarifa|\b[1-9]\d?\s*%/.test(benefit);
 const trial=/prueba|trial/.test(benefit);
 if(free&&paid&&!/100\s*%/.test(benefit))return 'bundle';
 if(paid&&!free)return 'discount';
 if(free&&trial)return 'other';
 if(free)return 'free';
 if(original==='free'&&!free)return 'other';
 return ['free','discount','credits','bundle','other'].includes(original)?original:'other';
}
export function verificationInfo(o){
 const date=o?.liveness_verified_at||o?.verified_at;
 const evidence=o?.evidence||o?.source_excerpt;
 const pending=o?.source_trust==='unconfirmed'||(o?.liveness_status&&o.liveness_status!=='active');
 const proven=!pending&&o?.liveness_status==='active'&&Number.isFinite(Date.parse(o?.liveness_verified_at))&&typeof evidence==='string'&&evidence.trim().length>=10;
 return {state:pending?'needs_review':proven?'verified':'unconfirmed',label:pending?'Comprobación en revisión':proven?'Comprobada con evidencia':'Última comprobación',date,evidence:typeof evidence==='string'?evidence.slice(0,400):null};
}
