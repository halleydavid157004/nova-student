import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DATABASE_PATH || './storage/nova-student.json';
const abs = path.resolve(dbPath);
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SECRET_KEY?.trim();
if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) {
  throw new Error('Set both SUPABASE_URL and SUPABASE_SECRET_KEY, or neither');
}
let remoteUrl;
if (supabaseUrl) {
  const parsed = new URL(supabaseUrl);
  if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('SUPABASE_URL must be the HTTPS project URL ending in .supabase.co');
  }
  if (!supabaseKey.startsWith('sb_secret_')) throw new Error('Use a Supabase secret API key (sb_secret_)');
  remoteUrl = `${parsed.origin}/rest/v1/nova_state`;
} else {
  fs.mkdirSync(path.dirname(abs), {recursive:true});
}

const blank=()=>({offers:[],sources:[],alerts:[],favorites:[],events:[],seq:{offers:0,sources:0,alerts:0,favorites:0,events:0}});
export let db=blank();
let remoteReady=false;
let dirty=0, persisted=0, pendingSave, writeTask, lastPersistError=null;

function normalize(next){
  db=next && typeof next==='object' && !Array.isArray(next) ? next : blank();
  for(const k of ['offers','sources','alerts','favorites','events']) if(!Array.isArray(db[k])) db[k]=[];
  db.seq ||= {};
  for(const k of ['offers','sources','alerts','favorites','events']) db.seq[k]=Math.max(db.seq[k]||0,...db[k].map(x=>Number(x.id)||0),0);
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
  return options.method ? null : response.json();
}

export async function migrate(){
  if(!remoteUrl)return load();
  const rows=await requestRemote('?id=eq.1&select=state');
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
  if(db.events.length>2000)db.events.splice(0,db.events.length-2000);
  if(remoteUrl){
    if(!remoteReady)throw new Error('Supabase storage has not been loaded');
    dirty++;
    // The crawler changes many sources per cycle. Batch snapshots to keep the
    // free tiers' bandwidth and database write volume small.
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
        await requestRemote('?on_conflict=id',{
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

export function storageStatus(){return {provider:remoteUrl?'supabase':'local',ready:!remoteUrl||remoteReady,synced:!remoteUrl||persisted===dirty,error:!!lastPersistError};}

for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
  const deadline=setTimeout(()=>process.exit(1),25000);
  flushSave().then(()=>{clearTimeout(deadline);process.exit(0)},e=>{
    console.error('[Storage] Shutdown save failed:',e.message);
    clearTimeout(deadline);process.exit(1);
  });
});
export function id(kind){db.seq[kind]=(db.seq[kind]||0)+1;return db.seq[kind];}
export function reset(next=blank()){db=next;save();}
export function event(type,title,details={},extra={}){const x={id:id('events'),type,title,details,created_at:new Date().toISOString(),...extra};db.events.push(x);save();return x;}
if(!remoteUrl)load();
