import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'nova-brave-'));
process.env.DATABASE_PATH = path.join(dir, 'db.json');
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SECRET_KEY = '';
process.env.GROQ_API_KEY = 'test-fallback-key';
process.env.GROQ_MIN_DELAY_MS = '0';
process.env.BRAVE_SEARCH_API_KEY = 'test-private-key';
const storage = await import('../src/db.js');
const {braveSearch, braveStatus, radarWindow, nextRadarRun} = await import('../src/services/brave.js');
const {discoverWithBrave, scanAll, getBraveDiscoveryStatus} = await import('../src/services/crawler.js');
const {getWorkerStatus, runDiscoveryAndScan} = await import('../src/worker.js');
const mockClient={fetch:async url=>{const response=await globalThis.fetch(url);return {status:response.status,body:await response.text(),url,redirects:[]}}};
after(() => rmSync(dir, {recursive: true, force: true}));

test('Brave rotates queries, shares concurrent work and survives a restart without spending twice', async t => {
  let clock = Date.parse('2026-09-15T01:00:00Z');
  t.mock.method(Date, 'now', () => clock);
  storage.reset();
  process.env.BRAVE_MONTHLY_LIMIT = '600';
  const queries = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.headers['X-Subscription-Token'], 'test-private-key');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    queries.push(new URL(url).searchParams.get('q'));
    return Response.json({web: {results: [{url: `https://vendor${queries.length}.example/students`, title: 'Student software education plan'}]}});
  });
  const first = discoverWithBrave();
  assert.equal(discoverWithBrave(), first, 'concurrent callers share one batch');
  assert.equal(getBraveDiscoveryStatus().running, true);
  const result = await first;
  assert.equal(result.queriesUsed, 4);
  assert.equal(result.discovered, 4);
  assert.equal(new Set(queries).size, 4);
  assert.equal(braveStatus().budget.used, 4);
  assert.ok(storage.db.sources.every(source => source.official === false));
  assert.equal(getBraveDiscoveryStatus().running, false);
  storage.load();
  assert.equal((await discoverWithBrave()).skipped, 'not_due');
  assert.equal(queries.length, 4, 'reloaded snapshots retain the six-hour reservation');
  clock += 6 * 3600000;
  const next = await discoverWithBrave();
  assert.equal(next.queriesUsed, 4);
  assert.equal(new Set(queries).size, 8, 'next window uses different queries');
  assert.equal(braveStatus().budget.used, 8);
});

test('the shared budget caps auxiliary lookups and resets in the next UTC month', async t => {
  storage.reset();
  process.env.BRAVE_MONTHLY_LIMIT = '1';
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return Response.json({web: {results: []}}); });
  await braveSearch('official student program', {count: 1});
  assert.equal((await discoverWithBrave()).skipped, 'monthly_limit');
  assert.equal((await braveSearch('another auxiliary lookup')).skipped, 'monthly_limit');
  assert.equal(requests, 1);
  storage.db.runtime.brave.month = '2000-01';
  await braveSearch('new monthly allowance');
  assert.equal(requests, 2);
  assert.equal(braveStatus().budget.used, 1);
  process.env.BRAVE_MONTHLY_LIMIT = '100000';
  assert.equal(braveStatus().budget.limit, 600, 'environment cannot exceed the protective cap');
  storage.db.runtime.brave.used = 100;
  storage.db.runtime.brave.lookupUsed = 100;
  assert.equal((await braveSearch('auxiliary request', {purpose: 'lookup'})).skipped, 'lookup_limit');
  assert.equal(requests, 2);
  await braveSearch('scheduled discovery');
  assert.equal(requests, 3, 'auxiliary lookups cannot consume the reserved discovery capacity');
});

test('429 stops the batch, retains its consumed attempt and prevents immediate retries', async t => {
  storage.reset();
  process.env.BRAVE_MONTHLY_LIMIT = '600';
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {requests++; return new Response('private provider body', {status: 429, headers: {'retry-after': '120'}});});
  const result = await discoverWithBrave();
  assert.equal(result.error, 'rate_limited');
  assert.equal(requests, 1);
  assert.equal(braveStatus().budget.used, 1);
  assert.ok(Date.parse(braveStatus().retryAt) >= Date.now() + 110000);
  assert.equal((await braveSearch('retry')).skipped, 'cooldown');
  assert.equal(requests, 1);
  assert.ok(!JSON.stringify(storage.db).includes('test-private-key'));
  assert.ok(!JSON.stringify(storage.db).includes('private provider body'));
});

test('authentication failures stop after one request and malformed JSON stays observable', async t => {
  storage.reset();
  process.env.BRAVE_MONTHLY_LIMIT = '600';
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response('do not persist this', {status: 401}); });
  assert.equal((await discoverWithBrave()).error, 'authentication');
  assert.equal(requests, 1);
  assert.equal(braveStatus().lastHttpStatus, 401);
  storage.reset();
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>invalid response</html>', {status: 200}));
  assert.equal((await braveSearch('student programs')).error, 'invalid_response');
  assert.equal(braveStatus().budget.used, 1);
});

test('known HTTP restrictions retain their status and scan position survives reload', async t => {
  storage.reset();
  process.env.SCAN_BATCH_SIZE = '1';
  storage.db.sources.push(
    {id: 1, name: 'Restricted', url: 'https://restricted.example/student', enabled: true},
    {id: 2, name: 'Second', url: 'https://second.example/student', enabled: true},
  );
  t.mock.method(globalThis, 'fetch', async url => String(url).endsWith('/robots.txt')
    ? new Response('User-agent: *\nAllow: /') : new Response('', {status: 403}));
  const first = await scanAll({client:mockClient});
  assert.equal(first[0].id, 1);
  assert.equal(storage.db.sources[0].last_status, 403);
  storage.load();
  const second = await scanAll({client:mockClient});
  assert.equal(second[0].id, 2, 'a cold start does not return to the first batch');
  assert.equal(storage.db.runtime.scanCursor, 2);
});

test('six-hour windows and worker history remain stable across restarts and legacy intervals', async () => {
  storage.reset();
  const before = Date.parse('2026-09-30T06:16:59Z');
  const after = Date.parse('2026-09-30T06:17:00Z');
  assert.equal(radarWindow(after), radarWindow(before) + 1);
  assert.equal(nextRadarRun(before), '2026-09-30T06:17:00.000Z');
  assert.equal(nextRadarRun(after), '2026-09-30T12:17:00.000Z');
  process.env.SCAN_INTERVAL_MS = '1800000';
  storage.db.runtime = {worker: {lastWindow: radarWindow(), scanCount: 7, lastScanResult: {cycle: 7}}};
  storage.save();
  storage.load();
  assert.equal(getWorkerStatus().scanCount, 7);
  assert.equal(getWorkerStatus().intervalHours, 6);
  assert.equal((await runDiscoveryAndScan()).skipped, 'not_due');
});

test('automatic and manual cycles cannot overlap, and empty Brave results do not invoke Groq', async t => {
  storage.reset();
  process.env.BRAVE_MONTHLY_LIMIT = '600';
  process.env.STUDENTOFFERS_DISCOVERY = 'false';
  storage.db.sources.push({id: 1, name: 'Denied', url: 'https://denied.example/student', enabled: true});
  let groqCalls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('api.search.brave.com')) return Response.json({web: {results: []}});
    if (String(url).includes('api.groq.com')) {groqCalls++; return Response.json({choices: [{message: {content: '[]'}}]});}
    if (String(url).includes('education.github.com')) return new Response('No partner entries');
    if (String(url).endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /');
    return new Response('', {status: 403});
  });
  const automatic = runDiscoveryAndScan({sourceOptions:{client:mockClient}});
  assert.equal(runDiscoveryAndScan({force: true}), automatic);
  assert.equal(getWorkerStatus().scanning, true);
  const result = await automatic;
  assert.equal(result.scan.length, 1);
  assert.equal(groqCalls, 0, 'zero new results are a successful search, not an AI fallback trigger');
  assert.equal(getWorkerStatus().lastScanResult.scan.errors, 1);
  assert.equal(getWorkerStatus().lastScanResult.scan.ok, 0);
  storage.load();
  assert.equal(getWorkerStatus().lastScanResult.scan.errors, 1);
  assert.equal((await runDiscoveryAndScan()).skipped, 'not_due');
});
