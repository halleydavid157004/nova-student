import crypto from 'node:crypto';

export const EXTRACTION_SCHEMA = {
  type:'object',additionalProperties:false,
  required:['benefit','value','requirements','verification','countries','expires_at','evidence','available'],
  properties:{benefit:{type:'string'},value:{type:['string','null']},requirements:{type:'array',items:{type:'string'}},
    verification:{type:['string','null']},countries:{type:'array',items:{type:'string'}},expires_at:{type:['string','null']},
    evidence:{type:'string'},available:{type:'boolean'}},
};
const fold=s=>String(s??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
function benefitSignature(value){
  const text=fold(value), kinds=[];
  for(const [kind,pattern] of Object.entries({free:/\bfree\b|\bgratis\b|\bgratuit/,discount:/discount|descuento/,credits:/\bcredits?\b|\bcreditos?\b/,license:/licen[cs]/,storage:/storage|almacenamiento/}))if(pattern.test(text))kinds.push(kind);
  return {kinds,numbers:text.match(/\d+(?:[.,]\d+)?/g)||[]};
}
function verificationKind(value){
 const text=fold(value);
 if(/github/.test(text))return 'github';
 if(/sheer\s*id/.test(text))return 'sheerid';
 if(/unidays/.test(text))return 'unidays';
 if(/student\s*beans/.test(text))return 'studentbeans';
 if(/email|e-mail|correo|\.edu\b/.test(text))return 'email';
 if(/matricula|enrollment|enrolment|student card|carne/.test(text))return 'enrollment';
 return null;
}
export function htmlText(html) {
  return String(html).replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
    .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/\s+/g,' ').trim().slice(0,100000);
}
export function relevantSection(html) {
  const main=String(html).match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1]||html;
  const text=htmlText(main);
  const index=text.search(/\b(student|students|education|academic|estudiantes?|universitari[oa]|educaci[oó]n)\b/i);
  const section=text.slice(Math.max(0,index-250),Math.max(0,index-250)+6000);
  return {text:section,hash:crypto.createHash('sha256').update(fold(section)).digest('hex')};
}
export function validExtraction(value,text) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!EXTRACTION_SCHEMA.required.includes(k))||
    EXTRACTION_SCHEMA.required.some(k=>!(k in value)))return false;
  if(typeof value.benefit!=='string'||value.benefit.length>1000||typeof value.evidence!=='string'||value.evidence.length<10||value.evidence.length>400||typeof value.available!=='boolean')return false;
  for(const k of ['value','verification','expires_at'])if(value[k]!==null&&(typeof value[k]!=='string'||value[k].length>254))return false;
  if(!Array.isArray(value.requirements)||value.requirements.length>20||value.requirements.some(s=>typeof s!=='string'||s.length>500))return false;
  if(!Array.isArray(value.countries)||value.countries.length>250||value.countries.some(c=>!/^([A-Z]{2}|GLOBAL|UNKNOWN)$/.test(c)))return false;
  if(value.expires_at!==null&&(!/^\d{4}-\d{2}-\d{2}T/.test(value.expires_at)||!Number.isFinite(Date.parse(value.expires_at))))return false;
  if(value.value!==null){const numbers=value.value.match(/\d+(?:[.,]\d+)?/g)||[];if(numbers.some(number=>!fold(text).includes(number)))return false;}
  if(value.expires_at!==null){
    const date=value.expires_at.slice(0,10),[year,month,day]=date.split('-');
    if(![date,`${day}/${month}/${year}`,`${month}/${day}/${year}`].some(format=>text.includes(format)))return false;
  }
  if(value.available===false&&!/ended|no longer available|not available|closed|finaliz|terminad|no disponible|no student|no longer offer/i.test(text))return false;
  return fold(text).includes(fold(value.evidence));
}
export function maxAgeDays(){const n=Number(process.env.LIVENESS_MAX_AGE_DAYS||14);return Number.isInteger(n)&&n>=1&&n<=90?n:14;}
export function freshness(offer,now=Date.now(),days=maxAgeDays()) {
  const date=Date.parse(offer.liveness_verified_at||offer.verified_at||offer.discovered_at||'');
  return Number.isFinite(date)&&now-date<=days*86400000;
}
export function assessment(offer,response,extraction,{now=Date.now(),reports=0,extractionError=false}={}) {
  const section=relevantSection(response.body||'');
  const title=htmlText(String(response.body||'').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
  const signals={http:response.status,final_url:response.url||offer.source_url,redirects:response.redirects||[],section_hash:section.hash};
  let score=100,state='active',failure=false,material=[];
  const missing=/page not found|404\b|p[aá]gina no encontrada|not available/i.test(title)||(/page not found|p[aá]gina no encontrada/i.test(section.text)&&section.text.length<1200)||section.text.length<80;
  const ended=/no longer available|offer (?:has )?ended|promotion (?:has )?ended|oferta (?:ha )?finaliz[oó]|promoci[oó]n (?:ha )?terminad[oa]/i.test(section.text);
  if(response.blocked||[401,403,429].includes(response.status)||/captcha|verify you are human|just a moment|access denied/i.test(title+' '+section.text.slice(0,700))){state='blocked';score=25;failure=true;signals.blocked=response.blocked||'access_control';}
  else if([404,410].includes(response.status)||ended||(extraction?.expires_at&&Date.parse(extraction.expires_at)<=now)){state='expired';score=0;failure=true;material.push('ended');}
  else if(response.status<200||response.status>=400){state='needs_review';score=35;failure=true;signals.network=true;}
  else if(missing){state='possibly_expired';score=20;failure=true;signals.soft_404=true;}
  else {
    let final;try{final=new URL(signals.final_url)}catch{final=new URL(offer.source_url)}
    const original=new URL(offer.source_url);
    if(final.hostname.replace(/^www\./,'')!==original.hostname.replace(/^www\./,'')){score-=40;material.push('domain_redirect');}
    if(original.pathname!=='/'&&final.pathname==='/'&&response.redirects?.length){score-=40;material.push('home_redirect');}
    if(extractionError||!extraction){state='needs_review';score=Math.min(score,50);signals.extraction='unavailable_or_invalid';}
    else {
      if(!extraction.available||!extraction.benefit.trim()){material.push('benefit_missing');score-=60;failure=true;}
      const approved=offer.approved_extraction;
      const prior=approved?.value ?? offer.value ?? null;
      if(prior!==null && extraction.value!==null && fold(prior)!==fold(extraction.value)){material.push('value_changed');score-=45;failure=true;}
      if(approved?.benefit){
        const old=benefitSignature(approved.benefit),next=benefitSignature(extraction.benefit+' '+(extraction.value||''));
        if(old.kinds.some(kind=>!next.kinds.includes(kind))||old.numbers.some(number=>!next.numbers.includes(number))){material.push('benefit_changed');score-=30;}
      }
      if(offer.verification&&extraction.verification&&fold(offer.verification)!==fold(extraction.verification)&&!(verificationKind(offer.verification)&&verificationKind(offer.verification)===verificationKind(extraction.verification))){material.push('verification_changed');score-=20;}
      if(approved?.countries?.length && extraction.countries.length && !extraction.countries.includes('UNKNOWN') && JSON.stringify([...approved.countries].sort())!==JSON.stringify([...extraction.countries].sort())){material.push('countries_changed');score-=20;}
    }
    if(material.length)state='needs_review';
  }
  score=Math.max(0,Math.min(100,score-Math.min(15,Math.max(0,reports)*5)));
  if(reports>0&&state==='active'){state='needs_review';signals.user_reports=reports;}
  if(!freshness(offer,now)&&state!=='active'){score=Math.min(score,40);signals.stale=true;}
  const success=!!((state==='active'||(state==='needs_review'&&signals.user_reports&&material.length===0))&&extraction);
  const failures=success?0:(offer.consecutive_failures||0)+(failure?1:0);
  // Inconclusive AI failures do not accumulate evidence that a benefit expired.
  let status=offer.status;
  if(status==='active'&&failure&&failures>=2)status='inactive';
  if(status!=='active'&&state==='active')state='needs_review'; // recovery needs an approval
  signals.material=material;signals.rendered=!!response.rendered;
  return {score,state,success:success&&status==='active',failure,signals,extraction:extraction||null,section_hash:section.hash,
    patch:{status,liveness_score:score,liveness_status:state,consecutive_failures:failures,
      liveness_verified_at:success&&status==='active'?new Date(now).toISOString():offer.liveness_verified_at||null,
      ...(success&&status==='active'?{verified_at:new Date(now).toISOString()}:{}),source_hash:section.hash,
      source_excerpt:extraction?.evidence||offer.source_excerpt||offer.approved_extraction?.evidence||null},checked_at:new Date(now).toISOString()};
}

export async function validateOffer(offer,response,{extract,headless,reports=0,now=Date.now()}={}) {
  let section=relevantSection(response.body||'');
  const enough=/\b(student|students|estudiantes?|education|educaci[oó]n)\b/i.test(section.text)&&/free|gratis|discount|descuento|credit|benefit|plan/i.test(section.text);
  if(!enough&&headless&&response.status===200&&!response.blocked&&!/captcha|just a moment|access denied/i.test(section.text)){
    try{const rendered=await headless(response.url||offer.source_url);response={...rendered,redirects:[...(response.redirects||[]),...(rendered.redirects||[])],rendered:true};section=relevantSection(response.body||'');}catch{response={...response,rendered:false};}
  }
  const prelim=assessment(offer,response,null,{now,reports});
  if(['blocked','expired','possibly_expired'].includes(prelim.state)||response.status<200||response.status>=400)return prelim;
  // Published offers: when the exact approved quote (and every number/date it relies on) is still
  // on the official page, that quote is the evidence. AI extraction stays for new or changed pages.
  const approved=offer.approved_extraction;
  if(offer.status==='active'&&approved?.available===true&&validExtraction(approved,section.text)){
    const confirmed=assessment(offer,response,approved,{now,reports});
    confirmed.signals.evidence_reused=true;
    return confirmed;
  }
  let extraction=null;
  if(extract)for(let attempt=0;attempt<2;attempt++) {
    try{const answer=await extract(section.text,{retry:attempt});const parsed=typeof answer==='string'?JSON.parse(answer):answer;
      if(validExtraction(parsed,section.text)){extraction=parsed;break;}}catch(error){if(error.code==='AI_BUSY'||/rate|authentication|not set/i.test(error.message))break;}
  }
  return assessment(offer,response,extraction,{now,reports,extractionError:!extraction});
}
