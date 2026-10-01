import tls from 'node:tls';
import crypto from 'node:crypto';
import {db,save,flushSave,claimDigest,finishDigest} from '../db.js';
import { searchOffers } from './search.js';
function esc(s=''){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function b64(s){return Buffer.from(String(s)).toString('base64')}
async function sendResend({to,subject,html,idempotencyKey}){const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},signal:AbortSignal.timeout(20000),body:JSON.stringify({from:process.env.RESEND_FROM||'Nova Student <onboarding@resend.dev>',to:[to],subject,html})});if(!r.ok){const retry=r.headers.get('retry-after');const seconds=Number(retry);const retryAt=retry?(Number.isFinite(seconds)?Date.now()+seconds*1000:Date.parse(retry)):Date.now()+3600000;throw Object.assign(new Error('Email provider unavailable'),{retryAt:Number.isFinite(retryAt)?retryAt:Date.now()+3600000});}return r.json()}
function smtpCommand(socket,cmd,expect=[250]){return new Promise((resolve,reject)=>{let buf='';const onData=d=>{buf+=d.toString();const lines=buf.split(/\r?\n/).filter(Boolean);const last=lines.at(-1)||'';if(/^\d{3} /.test(last)){cleanup();const code=Number(last.slice(0,3));if(expect.includes(code))resolve(buf);else reject(new Error(`SMTP ${code}: ${buf.trim()}`))}};const onErr=e=>{cleanup();reject(e)};const onClose=()=>onErr(new Error('SMTP connection closed'));const cleanup=()=>{socket.off('data',onData);socket.off('error',onErr);socket.off('close',onClose)};socket.on('data',onData);socket.on('error',onErr);socket.on('close',onClose);if(cmd!==null)socket.write(cmd+'\r\n')})}
async function sendSmtp({to,subject,html}){const host=process.env.SMTP_HOST||'smtp.gmail.com',port=Number(process.env.SMTP_PORT||465),user=process.env.SMTP_USER,pass=process.env.SMTP_PASS,from=process.env.EMAIL_FROM||user;if(!user||!pass)throw new Error('Email not configured. Add RESEND_API_KEY or SMTP_USER/SMTP_PASS.');const socket=tls.connect({host,port,servername:host});socket.setTimeout(15000,()=>socket.destroy(new Error('SMTP timeout')));try{await smtpCommand(socket,null,[220]);await smtpCommand(socket,'EHLO nova-student.local',[250]);await smtpCommand(socket,'AUTH LOGIN',[334]);await smtpCommand(socket,b64(user),[334]);await smtpCommand(socket,b64(pass),[235]);await smtpCommand(socket,`MAIL FROM:<${user}>`,[250]);await smtpCommand(socket,`RCPT TO:<${to}>`,[250,251]);await smtpCommand(socket,'DATA',[354]);const text=html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();const msg=[`From: ${from}`,`To: ${to}`,`Subject: =?UTF-8?B?${b64(subject)}?=`,'MIME-Version: 1.0','Content-Type: multipart/alternative; boundary="nova-boundary"','', '--nova-boundary','Content-Type: text/plain; charset=UTF-8','',text,'--nova-boundary','Content-Type: text/html; charset=UTF-8','',html,'--nova-boundary--'].join('\r\n');await smtpCommand(socket,encodeSmtpData(msg),[250]);await smtpCommand(socket,'QUIT',[221]);socket.end();return{ok:true}}finally{socket.destroy()}}
export function encodeSmtpData(message){return String(message).replace(/\r?\n/g,'\r\n').replace(/^\./gm,'..')+'\r\n.'}
export function emailStatus(){return {configured:!!(process.env.RESEND_API_KEY&&process.env.RESEND_FROM)||!!(process.env.RENDER!=='true'&&process.env.SMTP_USER&&process.env.SMTP_PASS)}}
export async function sendMail(x){return process.env.RESEND_API_KEY?sendResend(x):sendSmtp(x)}
export function digestPeriod(alert,now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:alert.timezone||'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 if(alert.frequency==='instant')return `instant:${Math.floor(now.getTime()/21600000)}`;
 if(Number(parts.hour)<8)return null;
 const date=`${parts.year}-${parts.month}-${parts.day}`;
 if(alert.frequency==='weekly')return parts.weekday==='Mon'?`weekly:${date}`:null;
 return `daily:${date}`;
}
export async function sendDueDigests({force=false,now=new Date(),send=sendMail,beforeSend}={}) {
 const results=[];
 if(send===sendMail&&(!emailStatus().configured||db.runtime?.emailRetryAt>Date.now()))return results;
 for(const alert of db.alerts.filter(a=>a.enabled)){
  const period=digestPeriod(alert,now);if(!force&&!period)continue;
  const offers=searchOffers({q:alert.query,country:alert.country,category:alert.category,verification:alert.verification,limit:20});
  const last=alert.last_sent_at?Date.parse(alert.last_sent_at):now.getTime()-7*86400000;
  const chosen=(force?offers:offers.filter(o=>Date.parse(o.updated_at)>last||Date.parse(o.discovered_at)>last)).slice(0,12);
  if(!chosen.length)continue;
  const key=crypto.createHash('sha256').update(`${alert.id}:${period||`forced:${now.toISOString().slice(0,10)}`}`).digest('hex');
  await beforeSend?.();
  const reservation=await claimDigest(alert,key);
  if(reservation.skipped){results.push({skipped:reservation.skipped});continue;}
  const rows=chosen.map(o=>`<div style="padding:16px;border:1px solid #e7e7ee;border-radius:16px;margin:12px 0"><h3>${esc(o.title)}</h3><p>${esc(o.benefit)}</p><p>${esc((o.requirements||[]).join(' · '))}</p><a href="${esc(/^https?:\/\//.test(o.source_url)?o.source_url:'#')}">Ver fuente</a></div>`).join('');
  try{
   if(send===sendMail)await new Promise(resolve=>setTimeout(resolve,600));
   const receipt=await send({to:alert.email,subject:`Nova Student: ${chosen.length} ofertas para ti`,idempotencyKey:`digest/${key}`,html:`<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto"><h1>Beneficios estudiantiles</h1>${rows}<p>Confirma las condiciones en la fuente antes de reclamar el beneficio.</p></div>`});
   await finishDigest(alert,key,'sent',typeof receipt?.id==='string'?receipt.id:null);results.push({sent:true,count:chosen.length});
  }catch(error){
   await finishDigest(alert,key,'uncertain',null).catch(()=>{});results.push({error:'delivery_uncertain'});
   if(send===sendMail){db.runtime||={};db.runtime.emailRetryAt=Math.max(Date.now()+3600000,error.retryAt||0);save();await flushSave();break;}
  }
 }
 return results;
}
