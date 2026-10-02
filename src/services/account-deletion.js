import {accountDeletion} from '../db.js';
import {authConfig} from './auth-config.js';
import {PUBLIC_ORIGIN} from './subscriptions.js';
import {createRequestBudget} from './api-limits.js';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const admission=createRequestBudget({limit:60,windowMs:3600000,maxConcurrent:3});
function backend(env){const url=String(env.SUPABASE_URL||'').replace(/\/$/,''),key=String(env.SUPABASE_SECRET_KEY||'').trim();return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)&&key.startsWith('sb_secret_')?{url,key}:null;}
async function request(config,path,{fetcher=fetch,method='GET',token,body}={}){
 const r=await fetcher(config.url+'/auth/v1/'+path,{method,headers:{apikey:config.key,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 let data={};if(r.status!==204){const text=await r.text();if(text.length>65536)throw new Error('Auth response unavailable');if(text)data=JSON.parse(text);}
 return {status:r.status,ok:r.ok,data};
}
const notFound=r=>r.status===404&&(r.data.code==='user_not_found'||r.data.error_code==='user_not_found');
async function complete(hash,{env=process.env,fetcher=fetch,rpc=accountDeletion}={}){
 const config=backend(env);if(!config)return false;
 try{
  const item=await rpc('claim',{hash});if(!uuid(item.user_id))return false;
  const path='admin/users/'+item.user_id;
  const deletion=await request(config,path,{fetcher,method:'DELETE',body:{should_soft_delete:false}});
  if(!deletion.ok&&!notFound(deletion))return false;
  const proof=await request(config,path,{fetcher});
  if(!notFound(proof))return false;
  await rpc('finish',{hash,user_id:item.user_id});return true;
 }catch{return false;} // Persistent claim backoff; no token/email/error string in logs.
}
export async function processAccountDeletions({env=process.env,fetcher=fetch,rpc=accountDeletion,beforeSend}={}){
 if(!backend(env))return {completed:0,pending:0};
 const queued=await rpc('queue',{});let completed=0;
 for(const item of queued){await beforeSend?.();if(await complete(item.hash,{env,fetcher,rpc}))completed++;}
 return {completed,pending:queued.length-completed};
}
export async function handleAccountDeletion(req,res,url,{json,body,env=process.env,fetcher=fetch,rpc=accountDeletion}={}){
 if(url.pathname!=='/api/account/delete')return false;
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='POST'){json(res,405,{error:'La eliminación requiere confirmación explícita.'});return true;}
 const config=authConfig(env);
 if(!config.enabled||!backend(env)||env.SUPABASE_STORAGE_MODE==='snapshot'){json(res,503,{error:'Las cuentas no están activadas.'});return true;}
 if(req.headers.origin&&req.headers.origin!==PUBLIC_ORIGIN){json(res,403,{error:'Origen inválido.'});return true;}
 const token=/^Bearer ([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)$/.exec(req.headers.authorization||'')?.[1];
 if(!token||token.length>8192){json(res,401,{error:'Inicia sesión para eliminar tu cuenta.'});return true;}
 if(req.headers['content-type']?.split(';')[0]!=='application/json'){json(res,415,{error:'Formato inválido.'});return true;}
 const ticket=admission();if(ticket.retryAfter){res.setHeader('Retry-After',String(ticket.retryAfter));json(res,429,{error:'Intenta de nuevo más tarde.'});return true;}
 try{
  const input=await body(req);if(input.confirm!=='ELIMINAR'||Object.keys(input).some(k=>k!=='confirm')){json(res,400,{error:'Escribe ELIMINAR para confirmar.'});return true;}
  const verified=await request(config,'user',{fetcher,token});
  if(!verified.ok){json(res,verified.status===401||verified.status===403?401:503,{error:'No se pudo verificar la sesión.'});return true;}
  const user=verified.data;
  if(!uuid(user.id)||user.is_anonymous!==false||typeof user.email!=='string'||user.email.length>254||!/^\S+@\S+\.\S+$/.test(user.email)||!Number.isFinite(Date.parse(user.email_confirmed_at))){json(res,403,{error:'Se requiere una cuenta con correo verificado.'});return true;}
  let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));}catch{}
  if(!uuid(claims?.session_id)||claims?.sub!==user.id){json(res,401,{error:'Se requiere una sesión activa de esta cuenta.'});return true;}
  const begun=await rpc('begin',{user_id:user.id,email:user.email,session_id:claims.session_id});
  // Blocked by RLS first; revoke refresh sessions before attempting hard deletion.
  try{await request(backend(env),'logout?scope=global',{fetcher,method:'POST',token});}catch{}
  const done=await complete(begun.hash,{env,fetcher,rpc});
  json(res,done?200:202,{status:done?'completed':'pending'});
 }catch{json(res,503,{error:'No se pudo registrar la eliminación. Intenta de nuevo.'});}
 finally{ticket.release();}
 return true;
}
