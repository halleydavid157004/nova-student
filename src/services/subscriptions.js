import crypto from 'node:crypto';
export const CONSENT_VERSION='2026-10-01';
export const PUBLIC_ORIGIN='https://nova-student-radar.onrender.com';
export function privacyConfig(env=process.env){
 const controller=String(env.PRIVACY_CONTROLLER||'').trim(),contact=String(env.PRIVACY_CONTACT_EMAIL||'').trim();
 const ready=controller.length>=2&&controller.length<=120&&!/[<>\r\n]/.test(controller)&&contact.length<=254&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(contact);
 return {ready,version:CONSENT_VERSION,controller:ready?controller:null,contact:ready?contact:null};
}
export function emailLinksReady(env=process.env){return typeof env.EMAIL_TOKEN_SECRET==='string'&&Buffer.byteLength(env.EMAIL_TOKEN_SECRET)>=32;}
const purposes=new Set(['confirm','unsubscribe','preferences']);
const valid=c=>c&&Number.isSafeInteger(c.id)&&c.id>0&&typeof c.nonce==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(c.nonce)&&purposes.has(c.purpose)&&Number.isSafeInteger(c.expires)&&c.expires>=0;
export function signEmailToken(claims,secret=process.env.EMAIL_TOKEN_SECRET){
 if(!emailLinksReady({EMAIL_TOKEN_SECRET:secret})||!valid(claims))throw new Error('Email links unavailable');
 const data=Buffer.from(JSON.stringify({id:claims.id,nonce:claims.nonce,purpose:claims.purpose,expires:claims.expires})).toString('base64url');
 return data+'.'+crypto.createHmac('sha256',secret).update(data).digest('base64url');
}
export function verifyEmailToken(token,purpose,{secret=process.env.EMAIL_TOKEN_SECRET,now=Date.now()}={}){
 if(!emailLinksReady({EMAIL_TOKEN_SECRET:secret})||typeof token!=='string'||token.length>1024||!purposes.has(purpose))return null;
 const parts=token.split('.');if(parts.length!==2||!parts.every(p=>/^[a-zA-Z0-9_-]+$/.test(p)))return null;
 const expected=crypto.createHmac('sha256',secret).update(parts[0]).digest();const given=Buffer.from(parts[1],'base64url');
 if(given.length!==expected.length||!crypto.timingSafeEqual(given,expected))return null;
 try{const c=JSON.parse(Buffer.from(parts[0],'base64url'));if(!valid(c)||c.purpose!==purpose||(c.expires!==0&&c.expires*1000<=now)||(purpose!=='unsubscribe'&&c.expires===0))return null;return c;}catch{return null;}
}
export function subscriptionLinks(context,{secret=process.env.EMAIL_TOKEN_SECRET,now=Date.now()}={}){
 const token=purpose=>signEmailToken({...context,purpose,expires:purpose==='unsubscribe'?0:Math.floor(now/1000)+90*86400},secret);
 const unsubscribe=PUBLIC_ORIGIN+'/api/subscriptions/unsubscribe?t='+encodeURIComponent(token('unsubscribe'));
 return {unsubscribe,preferences:PUBLIC_ORIGIN+'/preferences.html#preferences='+token('preferences'),headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
}
