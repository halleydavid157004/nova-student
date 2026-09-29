import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFERS } from '../src/data/seed.js';
import { isPublishedOffer } from '../src/services/search.js';

test('expired promotions and unreviewed leads stay out of the public catalog',()=>{
  assert.equal(isPublishedOffer({status:'active',official:true,expires_at:'2020-01-01T00:00:00Z'}),false);
  assert.equal(isPublishedOffer({status:'active',official:false,reviewed:false}),false);
  assert.equal(isPublishedOffer({status:'active',official:true}),true);
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
