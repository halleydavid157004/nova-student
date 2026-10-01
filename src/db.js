import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createNormalizedStorage} from './storage/normalized.js';

const dbPath = process.env.DATABASE_PATH || './storage/nova-student.json';
const abs = path.resolve(dbPath);
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SECRET_KEY?.trim();
if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) {
  throw new Error('Set both SUPABASE_URL and SUPABASE_SECRET_KEY, or neither');
}
let remoteUrl;
const storageMode = process.env.SUPABASE_STORAGE_MODE || 'normalized';
if (!['normalized','snapshot'].includes(storageMode)) throw new Error('Invalid SUPABASE_STORAGE_MODE');
if (supabaseUrl) {
  const parsed = new URL(supabaseUrl);
  if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('SUPABASE_URL must be the HTTPS project URL ending in .supabase.co');
  }
  if (!supabaseKey.startsWith('sb_secret_')) throw new Error('Use a Supabase secret API key (sb_secret_)');
  remoteUrl = `${parsed.origin}/rest/v1`;
} else {
  fs.mkdirSync(path.dirname(abs), {recursive:true});
}

const blank=()=>({offers:[],sources:[],alerts:[],favorites:[],events:[],seq:{offers:0,sources:0,alerts:0,favorites:0,events:0}});
export let db=blank();
let remoteReady=false;
let dirty=0, persisted=0, pendingSave, writeTask, lastPersistError=null;
let refreshTask, nativeWrites=0, nativeRevision=0, workerContext=null;
const normalizedStorage = remoteUrl && storageMode==='normalized' ? createNormalizedStorage(async(name,args={})=>{
  const response=await requestRemote('/rpc/'+name,{method:'POST',body:JSON.stringify(args),headers:{'Content-Type':'application/json'},jsonResponse:true});
  return response;
}) : null;

function normalize(next){
  db=next && typeof next==='object' && !Array.isArray(next) ? next : blank();
  for(const k of ['offers','sources','alerts','favorites','events']) if(!Array.isArray(db[k])) db[k]=[];
  db.seq ||= {};
  for(const k of ['offers','sources','alerts','favorites','events']) db.seq[k]=db[k].reduce((max,row)=>Math.max(max,Number(row.id)||0),Number(db.seq[k])||0);
  return db;
}

function readPrivateSeed(){
  if(!process.env.SEED_DATABASE_PATH)return null;
  const seed=path.resolve(process.env.SEED_DATABASE_PATH);
  return fs.existsSync(seed)?JSON.parse(fs.readFileSync(seed,'utf8')):null;
}

export function load(){
  if(remoteUrl)throw new Error('Use await migrate() for Supabase storage');
  if(!fs.existsSync(abs)){
    const seed=readPrivateSeed();
    if(seed)fs.writeFileSync(abs,JSON.stringify(seed));
  }
  return normalize(fs.existsSync(abs)?JSON.parse(fs.readFileSync(abs,'utf8')):blank());
}

async function requestRemote(query='',options={}){
  const response=await fetch(remoteUrl+query,{
    ...options,
    headers:{apikey:supabaseKey,Accept:'application/json',...options.headers},
    signal:AbortSignal.timeout(15000),
    redirect:'error',
  });
  if(!response.ok)throw new Error(`Supabase storage HTTP ${response.status}`);
  // PostgREST returns 204 for RPCs declared RETURNS void.
  // Keep parsing other JSON responses so invalid data still fails closed.
  if(response.status===204 || (options.method && !options.jsonResponse))return null;
  return response.json();
}

export async function migrate(){
  if(!remoteUrl)return load();
  if(normalizedStorage){
    normalize(await normalizedStorage.load({activate:true}));
    remoteReady=true;
    return db;
  }
  const rows=await requestRemote('/nova_state?id=eq.1&select=state');
  if(!Array.isArray(rows))throw new Error('Unexpected Supabase storage response');
  normalize(rows[0]?.state || readPrivateSeed() || blank());
  remoteReady=true;
  return db;
}

function scheduleFlush(delay){
  if(pendingSave)return;
  pendingSave=setTimeout(()=>{
    pendingSave=null;
    flushSave().catch(e=>console.error('[Storage] Supabase save failed:',e.message));
  },delay);
}

export function save(){
  if(!normalizedStorage && db.events.length>2000)db.events.splice(0,db.events.length-2000);
  if(remoteUrl){
    if(!remoteReady)throw new Error('Supabase storage has not been loaded');
    dirty++;
    // Batch changed rows to keep free-tier requests and write volume small.
    scheduleFlush(60000);
    return;
  }
  const tmp=abs+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db));fs.renameSync(tmp,abs);
}

export function saveSoon(){
  if(remoteUrl)return save();
  if(!pendingSave)pendingSave=setTimeout(()=>{pendingSave=null;save()},1000);
}

export async function flushSave(){
  if(pendingSave){clearTimeout(pendingSave);pendingSave=null;if(!remoteUrl)save();}
  if(!remoteUrl)return;
  if(!writeTask && persisted<dirty){
    writeTask=(async()=>{
      while(persisted<dirty){
        const revision=dirty;
        const state=structuredClone(db);
        if(normalizedStorage) await normalizedStorage.persist(state);
        else await requestRemote('/nova_state?on_conflict=id',{
          method:'POST',
          headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
          body:JSON.stringify({id:1,state,updated_at:new Date().toISOString()}),
        });
        persisted=revision;
        lastPersistError=null;
      }
    })().catch(e=>{lastPersistError=e.message;throw e}).finally(()=>{
      writeTask=null;
      if(persisted<dirty)scheduleFlush(5000);
    });
  }
  if(writeTask)await writeTask;
}

export function storageStatus(){return {provider:remoteUrl?'supabase':'local',schema:normalizedStorage?'normalized':remoteUrl?'snapshot':'local',ready:!remoteUrl||remoteReady,synced:!remoteUrl||persisted===dirty,error:!!lastPersistError};}

export async function refreshStorage(){
  if(refreshTask)return refreshTask;
  if(!normalizedStorage || dirty!==persisted || writeTask || nativeWrites || !normalizedStorage.dueForRefresh())return;
  const revision=dirty, native=nativeRevision;
  refreshTask=(async()=>{
    const state=await normalizedStorage.load({canAdopt:()=>dirty===revision && dirty===persisted && !writeTask && !nativeWrites && nativeRevision===native});
    if(state)normalize(state);
  })().finally(()=>{refreshTask=null});
  return refreshTask;
}

export async function reserveBraveBudget(month,purpose,limit){
  if(!normalizedStorage)return null;
  return normalizedStorage.reserveBrave(month,purpose,limit);
}

export async function importLegacySnapshot(){
  if(!remoteUrl)throw new Error('Configure server-side Supabase variables before importing');
  return requestRemote('/rpc/nova_import_snapshot',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'},jsonResponse:true});
}

export async function persistAlertRow(alert){
  if(!normalizedStorage)return null;
  nativeWrites++;nativeRevision++;
  try{
    const row=await normalizedStorage.createAlert(alert);
    const existing=db.alerts.find(item=>item.id===row.id);
    if(existing)Object.assign(existing,row);else db.alerts.push(row);
    lastPersistError=null;
    return row;
  }catch(error){lastPersistError=error.message;throw error;}
  finally{nativeWrites--;nativeRevision++;}
}

export function setWorkerContext(context){workerContext=context;}
export async function claimWorker(jobKey,window){
 const token=crypto.randomUUID();
 if(normalizedStorage)return normalizedStorage.claimWorker(jobKey,window,token);
 return {token,run_id:null,attempt:1};
}
export async function assertWorker(token){if(normalizedStorage)await normalizedStorage.assertWorker(token);}
export async function finishWorker(token,status,summary){if(normalizedStorage)await normalizedStorage.finishWorker(token,status,summary);}
function forgetAlerts(ids=[]){
 const removed=new Set(ids);db.alerts=db.alerts.filter(a=>!removed.has(a.id));normalizedStorage.forgetAlerts(ids);
}
export async function workerMaintenance(){
 if(!normalizedStorage)return {capacity_low:false};
 nativeWrites++;nativeRevision++;
 try{const result=await normalizedStorage.maintenance();forgetAlerts(result.removed_alert_ids);const {removed_alert_ids,...summary}=result;return {...summary,alerts_removed:removed_alert_ids?.length||0};}
 finally{nativeWrites--;nativeRevision++;}
}
export async function claimDigest(alert,key){
 if(normalizedStorage)return normalizedStorage.claimDigest(alert.id,key);
 if(alert.confirmed!==true)return {skipped:'unconfirmed'};
 db.runtime||={};const month=new Date().toISOString().slice(0,7),day=new Date().toISOString().slice(0,10);
 let usage=db.runtime.emailBudget;
 if(usage?.month!==month)usage=db.runtime.emailBudget={month,day,used:0,daily:0,keys:[]};
 if(usage.day!==day){usage.day=day;usage.daily=0;usage.keys=[];}
 if(usage.keys.includes(key))return {skipped:'already_reserved'};
 if(usage.used>=2700||usage.daily>=90)return {skipped:'quota'};
 usage.used++;usage.daily++;usage.keys.push(key);save();await flushSave();return {key};
}
export async function finishDigest(alert,key,status,providerId){
 if(normalizedStorage){nativeWrites++;nativeRevision++;try{const row=await normalizedStorage.finishDigest(key,status,providerId);Object.assign(alert,row);}finally{nativeWrites--;nativeRevision++;}}
 else if(status==='sent'){alert.last_sent_at=new Date().toISOString();save();await flushSave();}
}

export async function configureValidation(days){if(normalizedStorage)await normalizedStorage.configureValidation(days);}
export async function validationContext(offer){
  return normalizedStorage ? normalizedStorage.validationContext(offer.id) : {offer,approved_extraction:offer.approved_extraction||null,report_weight:0};
}
export async function recordCheck(offer,check){
  if(!normalizedStorage){Object.assign(offer,check.patch);db.checks||=[];db.checks.push({offer_id:offer.id,...check});save();return;}
  nativeWrites++;nativeRevision++;
  try{
    const keys=['status','title','benefit','source_url','consecutive_failures','liveness_status','liveness_verified_at'];
    const expected=Object.fromEntries(keys.map(k=>[k,offer[k]??null]));
    const row=await normalizedStorage.recordCheck({key:crypto.randomUUID(),offer_id:offer.id,expected,check,...(workerContext?{worker_run_id:workerContext.run_id,worker_token:workerContext.token}:{})});
    Object.assign(offer,row);
  }catch(error){lastPersistError=error.message;throw error;}
  finally{nativeWrites--;nativeRevision++;}
}
export async function submitReport(offerId,reporter,reason){
  if(normalizedStorage)return normalizedStorage.submitReport(offerId,reporter,reason);
  return {unavailable:true};
}

for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
  const deadline=setTimeout(()=>process.exit(1),25000);
  flushSave().then(()=>{clearTimeout(deadline);process.exit(0)},e=>{
    console.error('[Storage] Shutdown save failed:',e.message);
    clearTimeout(deadline);process.exit(1);
  });
});
export function id(kind){
  if(normalizedStorage)return normalizedStorage.nextId(kind);
  db.seq[kind]=(db.seq[kind]||0)+1;return db.seq[kind];
}
export function reset(next=blank()){db=next;save();}
export function event(type,title,details={},extra={}){const x={id:id('events'),type,title,details,created_at:new Date().toISOString(),...extra};db.events.push(x);save();return x;}
if(!remoteUrl)load();

// Subscription data never travels through public catalog exports.
export async function emailConsent(op,input={}){
 if(!normalizedStorage)throw Object.assign(new Error('Normalized subscriptions unavailable'),{status:503});
 if(!['request','queue','claim','finish','context','confirm','preview','unsubscribe','preferences','update'].includes(op))throw new Error('Invalid email operation');
 nativeWrites++;nativeRevision++;
 try{return await requestRemote('/rpc/nova_email_consent',{method:'POST',body:JSON.stringify({op,input}),headers:{'Content-Type':'application/json'},jsonResponse:true});}
 finally{nativeWrites--;nativeRevision++;}
}

export async function eraseSubscription(input){
 if(!normalizedStorage)throw new Error('Normalized subscriptions unavailable');
 nativeWrites++;nativeRevision++;
 try{const result=await requestRemote('/rpc/nova_erase_subscription',{method:'POST',body:JSON.stringify({input}),headers:{'Content-Type':'application/json'},jsonResponse:true});forgetAlerts(result.removed_alert_ids);return {ok:true};}
 finally{nativeWrites--;nativeRevision++;}
}
