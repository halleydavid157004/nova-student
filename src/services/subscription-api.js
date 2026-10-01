import {emailConsent,eraseSubscription} from '../db.js';
import {privacyConfig,verifyEmailToken,CONSENT_VERSION} from './subscriptions.js';
import {createRequestBudget} from './api-limits.js';
const admission=createRequestBudget({limit:120,windowMs:3600000,maxConcurrent:3});
export async function handleSubscriptions(req,res,url,{json,body,rpc=emailConsent,erase=eraseSubscription}={}){
 if(url.pathname==='/api/privacy'&&req.method==='GET'){json(res,200,privacyConfig());return true;}
 if(!url.pathname.startsWith('/api/subscriptions/'))return false;
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 const action=url.pathname.slice('/api/subscriptions/'.length);
 if(!['confirm','preview','unsubscribe','preferences','update','erase'].includes(action)){json(res,404,{error:'Not found'});return true;}
 if(req.method!=='POST'){json(res,405,{error:'Usa la página de preferencias para confirmar esta acción.'});return true;}
 const ticket=admission();if(ticket.retryAfter){res.setHeader('Retry-After',String(ticket.retryAfter));json(res,429,{error:'Intenta de nuevo más tarde.'});return true;}
 try{
  let input;
  if(action==='unsubscribe'&&req.headers['content-type']?.split(';')[0]==='application/x-www-form-urlencoded'){
   // RFC 8058: header link + POST. GET never changes a subscription.
   let text='';for await(const part of req){text+=part.toString();if(text.length>256)throw new Error('Invalid form');}
   if(new URLSearchParams(text).get('List-Unsubscribe')!=='One-Click')throw new Error('Invalid form');
   input={token:url.searchParams.get('t')};
  }else input=await body(req);
  const purpose=action==='confirm'||action==='preview'?'confirm':action==='unsubscribe'?'unsubscribe':'preferences';
  const claims=verifyEmailToken(input.token,purpose);
  if(!claims){json(res,400,{error:'Enlace inválido o vencido. Solicita uno nuevo.'});return true;}
  const data={id:claims.id,nonce:claims.nonce};
  if(action==='update'){
   if(!Number.isSafeInteger(input.alert_id)||input.alert_id<1||typeof input.enabled!=='boolean'||!['instant','daily','weekly'].includes(input.frequency)){json(res,400,{error:'Preferencias inválidas.'});return true;}
   Object.assign(data,{alert_id:input.alert_id,enabled:input.enabled,frequency:input.frequency});
  }
  if(action==='erase'&&input.confirm!==true){json(res,400,{error:'Confirma la eliminación de tus datos de correo.'});return true;}
  const result=action==='erase'?await erase(data):await rpc(action,data);json(res,200,result);
 }catch{json(res,503,{error:'No se pudo completar la acción. Intenta de nuevo o contacta al responsable del tratamiento.'});}
 finally{ticket.release();}
 return true;
}
export async function prepareConsent(alert,consent,{rpc=emailConsent,erase=eraseSubscription}={}){
 if(consent!==true)return {confirmationRequired:true,confirmationQueued:false};
 await rpc('request',{id:alert.id,version:CONSENT_VERSION});
 return {confirmationRequired:true,confirmationQueued:true};
}
