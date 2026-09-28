import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DATABASE_PATH || './storage/nova-student.json';
const abs = path.resolve(dbPath);
fs.mkdirSync(path.dirname(abs), {recursive:true});

const blank=()=>({offers:[],sources:[],alerts:[],favorites:[],events:[],seq:{offers:0,sources:0,alerts:0,favorites:0,events:0}});
export let db=blank();

export function load(){
  if(fs.existsSync(abs)){
    try{db=JSON.parse(fs.readFileSync(abs,'utf8'));}catch{db=blank();}
  }
  for(const k of ['offers','sources','alerts','favorites','events']) if(!Array.isArray(db[k])) db[k]=[];
  db.seq ||= {offers:0,sources:0,alerts:0,favorites:0,events:0};
  for(const k of ['offers','sources','alerts','favorites','events']) db.seq[k]=Math.max(db.seq[k]||0,...db[k].map(x=>Number(x.id)||0),0);
  return db;
}
export function save(){
  const tmp=abs+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(db,null,2)); fs.renameSync(tmp,abs);
}
export function id(kind){db.seq[kind]=(db.seq[kind]||0)+1;return db.seq[kind];}
export function reset(next=blank()){db=next;save();}
export function migrate(){load();save();}
export function event(type,title,details={},extra={}){const x={id:id('events'),type,title,details,created_at:new Date().toISOString(),...extra};db.events.push(x);save();return x;}
load();
