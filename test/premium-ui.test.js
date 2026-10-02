import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync('public/index.html', 'utf8');
const app = readFileSync('public/app.js', 'utf8');
const premium = readFileSync('public/premium.js', 'utf8');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));

test('every element app.js looks up by id exists in index.html', () => {
  const used = new Set([...app.matchAll(/\$\('#([A-Za-z][\w-]*)/g)].map(m => m[1]));
  // Created at runtime by app.js itself.
  for (const dynamic of ['searchHints', 'offerReportForm', 'offerReportReason', 'offerEvidence', 'modalTitle', 'nova-ai-typing']) used.delete(dynamic);
  const missing = [...used].filter(id => !ids.has(id));
  assert.deepEqual(missing, []);
});

test('premium layer is loaded after the app and only uses ids that exist', () => {
  assert.ok(html.indexOf('/app.js') < html.indexOf('/premium.js'), 'premium.js loads after app.js');
  const used = new Set([...premium.matchAll(/\$\('#([A-Za-z][\w-]*)/g)].map(m => m[1]));
  for (const dynamic of ['palQ', 'palL']) used.delete(dynamic);
  assert.deepEqual([...used].filter(id => !ids.has(id)), []);
});

test('premium layer keeps privacy and safety rules', () => {
  assert.ok(!/nova-profile|sendBeacon|gtag|analytics/i.test(premium), 'no profile storage or telemetry');
  assert.match(premium, /const esc = /, 'escapes untrusted catalog text');
  assert.ok(!/innerHTML\s*=\s*[^;]*\$\{(?!esc\()[^}]*\.(title|benefit|summary|brand)\b/.test(premium), 'catalog text is never interpolated unescaped');
  assert.match(premium, /simple-icons@\d+\.\d+\.\d+\//, 'logo library is pinned to an exact version');
});

test('cards keep the hooks used by tests, keyboard users and the premium layer', () => {
  for (const hook of ['class="card"', 'data-save=', 'data-compare=', 'class="lg mg']) assert.ok(app.includes(hook), hook);
  assert.match(app, /closest\('\.save-btn, \.cmp-btn'\)/, 'save and compare buttons do not open the detail');
  assert.match(app, /window\.NovaApp = \{/, 'app exposes the small API used by premium.js');
});
