import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DATABASE_PATH || './storage/nova-student.json';
const abs = path.resolve(dbPath);
fs.mkdirSync(path.dirname(abs), {recursive:true});

const blank=()=>({offers:[],sources:[],alerts:[],favorites:[],events:[],seq:{offers:0,sources:0,alerts:0,favorites:0,events:0}});
export let db=blank();

export function load(){
  // A new persistent disk starts empty. Seed it once without ever overwriting
  // data already written on the mounted volume.
  if(!fs.existsSync(abs) && process.env.SEED_DATABASE_PATH){
    const seed=path.resolve(process.env.SEED_DATABASE_PATH);
    if(fs.existsSync(seed))fs.copyFileSync(seed,abs);
  }
  if(fs.existsSync(abs)){
    db=JSON.parse(fs.readFileSync(abs,'utf8'));
  }
  for(const k of ['offers','sources','alerts','favorites','events']) if(!Array.isArray(db[k])) db[k]=[];
  db.seq ||= {offers:0,sources:0,alerts:0,favorites:0,events:0};
  for(const k of ['offers','sources','alerts','favorites','events']) db.seq[k]=Math.max(db.seq[k]||0,...db[k].map(x=>Number(x.id)||0),0);
  return db;
}
export function save(){
  if(db.events.length>2000) db.events.splice(0,db.events.length-2000);
  const tmp=abs+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(db)); fs.renameSync(tmp,abs);
}
let pendingSave;
export function saveSoon(){
  if(!pendingSave) pendingSave=setTimeout(()=>{pendingSave=null;save()},1000);
}
export function flushSave(){
  if(pendingSave){clearTimeout(pendingSave);pendingSave=null;save()}
}
for(const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>{flushSave();process.exit(0)});
export function id(kind){db.seq[kind]=(db.seq[kind]||0)+1;return db.seq[kind];}
export function reset(next=blank()){db=next;save();}
export function migrate(){load();}
export function event(type,title,details={},extra={}){const x={id:id('events'),type,title,details,created_at:new Date().toISOString(),...extra};db.events.push(x);save();return x;}
load();
