import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir = mkdtempSync(path.join(tmpdir(), 'nova-search-'));
process.env.DATABASE_PATH = path.join(dir, 'db.json');
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SECRET_KEY = '';
const {db} = await import('../src/db.js');
const {searchOffers} = await import('../src/services/search.js');
const offer = {status: 'active', official: true, countries: ['GLOBAL'], requirements: [], confidence: 90, verified_at: '2026-09-29T12:00:00Z'};
db.offers.push(
  {...offer, id: 1, brand: 'Notion', title: 'Plan educativo', summary: 'Educación gratuita', benefit: 'Gratis', category: 'Productivity'},
  {...offer, id: 2, brand: 'Canva', title: 'Diseño para estudiantes', category: 'Design'},
  {...offer, id: 3, brand: 'Copilot', title: 'Asistente para código', category: 'AI'},
  {...offer, id: 4, brand: 'Other', title: 'Paid software', category: 'Development'},
  {...offer, id: 5, brand: 'Another', title: 'Integración con Notion', category: 'Development', verified_at: '2026-09-30T12:00:00Z'},
  {...offer, id: 6, brand: 'Notion', title: 'Sin verificar', official: false, status: 'pending'},
);
after(() => rmSync(dir, {recursive: true, force: true}));

test('search ignores accents, matches categories and separates short AI terms from unrelated words', () => {
  assert.deepEqual(searchOffers({q: 'diseno'}).map(item => item.id), [2]);
  assert.deepEqual(searchOffers({q: 'NOTION educacion gratis'}).map(item => item.id), [1]);
  assert.deepEqual(searchOffers({q: 'productividad'}).map(item => item.id), [1]);
  assert.deepEqual(searchOffers({q: 'IA'}).map(item => item.id), [3]);
  assert.deepEqual(searchOffers({q: 'AI'}).map(item => item.id), [3]);
});

test('exact brands outrank newer mentions while filters and publication checks remain effective', () => {
  assert.deepEqual(searchOffers({q: 'notion'}).map(item => item.id), [1, 5]);
  assert.deepEqual(searchOffers({q: 'notion', category: 'Development'}).map(item => item.id), [5]);
  assert.equal(searchOffers({q: 'notion', category: 'AI'}).length, 0);
  assert.ok(searchOffers({q: 'notion', country: 'CO'}).every(item => item.id !== 6));
  assert.equal(searchOffers({q: 'term not present'}).length, 0);
});
