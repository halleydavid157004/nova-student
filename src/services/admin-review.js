import {adminReview} from '../db.js';
import {authConfig} from './auth-config.js';
import {PUBLIC_ORIGIN} from './subscriptions.js';
import {createRequestBudget} from './api-limits.js';
import {approvalProblems,duplicateIds} from '../../public/admin/policy.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const budget=createRequestBudget({limit:120,windowMs:3600000,maxConcurrent:3});
const number=v=>Number.isSafeInteger(v)&&v>0;
export async function handleAdminReview(req,res,url,{json,body,env=process.env,fetcher=fetch,rpc=adminReview}={}){
 if(!url.pathname.startsWith('/api/admin/'))return false;
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 const route=url.pathname==='/api/admin/review';
 if(!route){json(res,410,{error:'Usa el panel de revisión y los workflows de GitHub Actions.'});return true;}
 if(!['GET','POST'].includes(req.method)){json(res,405,{error:'Método inválido.'});return true;}
 const config=authConfig(env);
 if(!config.enabled||env.SUPABASE_STORAGE_MODE==='snapshot'){json(res,503,{error:'Las cuentas administrativas todavía no están activadas.'});return true;}
 if(req.headers.origin&&req.headers.origin!==PUBLIC_ORIGIN){json(res,403,{error:'Origen inválido.'});return true;}
 const token=/^Bearer ([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)$/.exec(req.headers.authorization||'')?.[1];
 if(!token||token.length>8192){json(res,401,{error:'Inicia sesión con una cuenta administradora.'});return true;}
 if(req.method==='POST'&&req.headers['content-type']?.split(';')[0]!=='application/json'){json(res,415,{error:'Formato inválido.'});return true;}
 const ticket=budget();if(ticket.retryAfter){res.setHeader('Retry-After',String(ticket.retryAfter));json(res,429,{error:'Intenta más tarde.'});return true;}
 try{
  // Fetch fresh server-managed app_metadata: client metadata/JWT role claims are insufficient.
  const response=await fetcher(config.url+'/auth/v1/user',{headers:{apikey:config.key,Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok){json(res,response.status===401||response.status===403?401:503,{error:'No se pudo verificar la sesión.'});return true;}
  const text=await response.text();if(text.length>65536)throw new Error('Auth response too large');const user=JSON.parse(text);
  if(!uuid(user.id)||user.is_anonymous!==false||user.app_metadata?.nova_role!=='admin'||!Number.isFinite(Date.parse(user.email_confirmed_at))){json(res,403,{error:'Esta cuenta no tiene el rol administrador.'});return true;}
  let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));}catch{}
  if(claims?.sub!==user.id||!uuid(claims?.session_id)){json(res,401,{error:'Se requiere una sesión activa.'});return true;}
  const actor={user_id:user.id,session_id:claims.session_id};
  if(req.method==='GET'){
   const section=url.searchParams.get('section')||'queue',after=Number(url.searchParams.get('after')||0);
   if(!['queue','sources','audit'].includes(section)||!Number.isSafeInteger(after)||after<0||[...url.searchParams.keys()].some(k=>!['section','after'].includes(k))){json(res,400,{error:'Consulta inválida.'});return true;}
   const result=await rpc(section,{...actor,after});
   if(section==='queue')for(const item of result.items){item.problems=approvalProblems(item);item.duplicates=item.version?duplicateIds(item,result.published):[];}
   const {published,...safe}=result;json(res,200,safe);return true;
  }
  const input=await body(req),allowed=['action','id','expected_updated_at','check_id','reason','confirm_source','title','steps','enabled'];
  if(Object.keys(input).some(k=>!allowed.includes(k))||!['approve','reject','edit','source'].includes(input.action)||!number(input.id)||typeof input.reason!=='string'||input.reason.trim().length<10||input.reason.length>500||!Number.isFinite(Date.parse(input.expected_updated_at))){json(res,400,{error:'Completa una acción y un motivo de 10 a 500 caracteres.'});return true;}
  if(input.action==='approve'){
   if(input.confirm_source!==true||!number(input.check_id)){json(res,400,{error:'Confirma la revisión de la fuente y de sus requisitos.'});return true;}
   const context=await rpc('context',{...actor,id:input.id});
   const problems=approvalProblems(context);if(problems.length||duplicateIds(context,context.published||[]).length){json(res,409,{error:'La oferta necesita revisión o ya está publicada como otra ficha.'});return true;}
  }
  if(input.action==='edit'&&(typeof input.title!=='string'||!input.title.trim()||input.title.length>200||!Array.isArray(input.steps)||input.steps.length>20||input.steps.some(s=>typeof s!=='string'||!s.trim()||s.length>500))){json(res,400,{error:'Título o pasos inválidos.'});return true;}
  if(input.action==='source'&&typeof input.enabled!=='boolean'){json(res,400,{error:'Estado de fuente inválido.'});return true;}
  const result=await rpc(input.action,{...input,...actor});json(res,result.error?409:200,result.error?{error:'La ficha cambió o no cumple los requisitos. Recarga la cola.'}:{ok:true});
 }catch{json(res,503,{error:'No se pudo completar la revisión. Recarga antes de volver a intentar.'});}
 finally{ticket.release();}
 return true;
}
