import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import { OFFERS } from '../src/data/seed.js';
import { isPublishedOffer } from '../src/services/search.js';

test('expired promotions and unreviewed leads stay out of the public catalog',()=>{
  assert.equal(isPublishedOffer({status:'active',official:true,expires_at:'2020-01-01T00:00:00Z'}),false);
  assert.equal(isPublishedOffer({status:'active',official:false,reviewed:false}),false);
  assert.equal(isPublishedOffer({status:'active',official:true,verified_at:new Date().toISOString()}),true);
});

test('seed uses the current ChatGPT student promotion and excludes unsupported AI claims',()=>{
  const offer=OFFERS.find(o=>o.slug==='chatgpt-plus-student');
  assert.match(offer.benefit,/Cuatro mensualidades gratis/);
  assert.equal(offer.countries[0],'US');
  assert.ok(offer.expires_at);
  for(const slug of ['notion-ai-student','copilot-microsoft','claude-anthropic']){
    assert.equal(OFFERS.some(o=>o.slug===slug),false);
  }
});

test('JetBrains seed lists the current eligibility methods',()=>{
  const offer=OFFERS.find(o=>o.slug==='jetbrains-student-pack');
  const requirements=offer.requirements.join(' ');
  assert.match(requirements,/correo institucional/);
  assert.match(requirements,/ISIC\/ITIC/);
  assert.match(requirements,/GitHub Student Developer Pack/);
  assert.match(requirements,/ya no acepta documentos escolares/);
});

test('catalog respects current product limits and quarantines unconfirmed promotions',()=>{
  const get=slug=>OFFERS.find(o=>o.slug===slug);
  assert.match(get('canva-education').requirements.join(' '),/primaria o secundaria/);
  assert.match(get('microsoft-365-education').benefit,/100 GB/);
  assert.doesNotMatch(get('microsoft-365-education').benefit,/1 TB/);
  assert.match(get('github-copilot-free').benefit,/cuota/);
  assert.doesNotMatch(get('spotify-premium-student').summary,/SHOWTIME/);
  assert.match(get('notion-student-free').requirements.join(' '),/un solo miembro/);
  assert.match(get('coursera-student').benefit,/primer módulo/);
  for(const slug of ['replit-hacker','digitalocean-student'])assert.equal(isPublishedOffer({...get(slug)}),false);
});

test('existing databases receive curated corrections once and retain user data',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'nova-catalog-'));
  const program=`
    import assert from 'node:assert/strict';
    const {db}=await import('./src/db.js');
    const {applyCatalogCorrections}=await import('./src/seed.js');
    db.offers=[{id:42,slug:'microsoft-365-education',benefit:'1 TB',status:'active',source_hash:'previous'},{id:43,slug:'digitalocean-student',status:'active',official:true},{id:44,slug:'notion-student-free',status:'inactive'}];
    db.alerts=[{id:5,email:'keep@example.invalid'}];db.sources=[{id:9,url:'https://example.invalid'}];
    assert.equal(applyCatalogCorrections(),3);
    assert.equal(db.offers[0].id,42);assert.equal(db.offers[0].source_hash,'previous');assert.match(db.offers[0].benefit,/100 GB/);
    assert.equal(db.offers[1].status,'pending');assert.equal(db.offers[2].status,'inactive');
    assert.equal(db.alerts[0].email,'keep@example.invalid');assert.equal(db.sources[0].id,9);
    db.offers[0].benefit='Later editorial change';assert.equal(applyCatalogCorrections(),0);
    assert.equal(db.offers[0].benefit,'Later editorial change');
  `;
  try {
    const result=spawnSync(process.execPath,['--input-type=module','-e',program],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,DATABASE_PATH:path.join(dir,'db.json'),SUPABASE_URL:'',SUPABASE_SECRET_KEY:'',SEED_DATABASE_PATH:''}});
    assert.equal(result.status,0,result.stderr);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
