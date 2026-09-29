import { db, migrate, save, flushSave, id } from './db.js';
import { OFFERS, SOURCES } from './data/seed.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function seedDatabase(){
const now=new Date().toISOString();
for(const o of OFFERS){
  const existing=db.offers.find(x=>x.slug===o.slug);
  const row={...o,source_domain:new URL(o.source_url).hostname.replace(/^www\./,''),status:o.status||'active',discovered_at:existing?.discovered_at||now,verified_at:o.status==='pending'?null:o.verified_at||'2026-09-28T00:00:00.000Z',updated_at:now,source_hash:existing?.source_hash||null,source_excerpt:existing?.source_excerpt||null};
  if(existing) Object.assign(existing,row); else db.offers.push({id:id('offers'),...row});
}
for(const [name,url,category,countries] of SOURCES){
  if(!db.sources.some(x=>x.url===url)) db.sources.push({id:id('sources'),name,url,domain:new URL(url).hostname.replace(/^www\./,''),category,countries,enabled:true,official:true,last_checked_at:null,last_hash:null,last_status:null,last_error:null});
}
save();
return {offers:db.offers.length,sources:db.sources.length};
}

// Apply curated corrections to existing storage once without replacing user data.
export function applyCatalogCorrections(){
  let changed=0;
  for(const o of OFFERS){
    if(!o.catalog_revision)continue;
    const existing=db.offers.find(x=>x.slug===o.slug);
    if(!existing||existing.catalog_revision===o.catalog_revision)continue;
    Object.assign(existing,o,{source_domain:new URL(o.source_url).hostname.replace(/^www\./,''),status:o.status||existing.status||'active',updated_at:new Date().toISOString()});
    changed++;
  }
  if(changed)save();
  return changed;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await migrate();
  const result=seedDatabase();
  await flushSave();
  console.log(`Seed complete: ${result.offers} offers, ${result.sources} sources.`);
}
