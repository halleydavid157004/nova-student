import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'nova-so-'));
process.env.DATABASE_PATH = path.join(dir, 'db.json');
const {db} = await import('../src/db.js');
const {createSourceClient} = await import('../src/services/source-http.js');
const so = await import('../src/services/studentoffers.js');
const {CURATED_SOURCES} = await import('../src/data/curated-sources.js');

// Excerpt of https://www.studentoffers.co/robots.txt (2026-10-02): generic agents may not use /api/.
const ROBOTS = 'User-agent: GPTBot\nAllow: /\n\nUser-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /_next/\n';
const SITEMAP = `<?xml version="1.0"?><urlset>
<url><loc>https://www.studentoffers.co/</loc></url>
<url><loc>https://www.studentoffers.co/tools</loc></url>
<url><loc>https://www.studentoffers.co/ai-and-machine-learning</loc></url>
<url><loc>https://www.studentoffers.co/offer/figma</loc></url>
<url><loc>https://www.studentoffers.co/offer/aws-educate</loc></url>
<url><loc>https://www.studentoffers.co/offer/some-deal</loc></url>
<url><loc>https://www.studentoffers.co/offer/figma</loc></url>
</urlset>`;
const page = (h1, href, label = 'Claim', extra = '') => `<html><head><title>${h1}: copy we must not keep | StudentOffers.co</title></head><body>
<a href="/tools">Tools</a><a href="https://twitter.com/studentoffers">Twitter</a>
<h1>${h1}</h1><p>Marketing description that must never be copied.</p>${extra}
<a class="btn" href="${href}">${label}</a></body></html>`;
const PAGES = {
  '/offer/figma': page('Figma', 'https://www.figma.com/education/?utm_source=studentoffers&ref=so'),
  '/offer/aws-educate': page('AWS Educate', 'https://aws.amazon.com/education/awseducate/'),
  '/offer/some-deal': page('Some Deal', 'https://www.myunidays.com/US/en-US/partners/some/view', 'Get the deal'),
};

function fakeSite(log) {
  return createSourceClient({wait: async () => {}, request: async url => {
    const u = new URL(url); log.push(u.pathname);
    if (u.pathname === '/robots.txt') return {status: 200, headers: {}, body: ROBOTS};
    if (u.pathname === '/sitemap.xml') return {status: 200, headers: {}, body: SITEMAP};
    if (PAGES[u.pathname]) return {status: 200, headers: {}, body: PAGES[u.pathname]};
    if (u.pathname.startsWith('/api/')) throw new Error('API must not be requested while robots.txt disallows it');
    return {status: 404, headers: {}, body: ''};
  }});
}

test('parsers keep only brand and official link, never page copy', () => {
  assert.deepEqual(so.offerPaths(so.parseSitemap(SITEMAP)), ['/offer/figma', '/offer/aws-educate', '/offer/some-deal']);
  const lead = so.parseOfferPage(PAGES['/offer/figma'], 'https://www.studentoffers.co/offer/figma');
  assert.equal(lead.brand, 'Figma');
  assert.equal(lead.url, 'https://www.figma.com/education/', 'tracking parameters removed');
  assert.ok(!JSON.stringify(lead).includes('Marketing'), 'no descriptive text is kept');
  assert.equal(so.parseOfferPage('<h1>Only text</h1>'), null);
  assert.equal(so.brandOwnsDomain('Figma', 'https://www.figma.com/education/'), true);
  assert.equal(so.brandOwnsDomain('AWS Educate', 'https://aws.amazon.com/education/awseducate/'), true);
  assert.equal(so.brandOwnsDomain('Some Deal', 'https://www.myunidays.com/x'), false, 'aggregators are never official');
  assert.equal(so.brandOwnsDomain('Notion', 'https://bit.ly/abc'), false);
});

test('discovery respects robots.txt, adds leads once and resumes with a cursor', async () => {
  db.sources.length = 0; db.events.length = 0; db.runtime = {};
  const log = [];
  const client = fakeSite(log);
  const first = await so.discoverStudentOffersLeads({client, limit: 2, now: Date.parse('2026-10-02T00:00:00Z')});
  assert.equal(first.mode, 'sitemap');
  assert.ok(!log.some(p => p.startsWith('/api/')), 'API not requested');
  assert.equal(first.discovered, 2);
  assert.equal(first.official, 2, 'figma.com and aws.amazon.com belong to the brand');
  assert.equal(db.runtime.studentOffers.cursor, 2);
  const second = await so.discoverStudentOffersLeads({client, limit: 2, now: Date.parse('2026-10-02T06:00:00Z')});
  assert.equal(second.discovered, 1);
  const unidays = db.sources.find(s => s.url.includes('myunidays'));
  assert.equal(unidays.official, false, 'aggregator claim link stays an unofficial lead');
  assert.equal(unidays.lead_ref, '/offer/some-deal');
  const again = await so.discoverStudentOffersLeads({client, limit: 5, now: Date.parse('2026-10-02T12:00:00Z')});
  assert.equal(again.discovered, 0, 'no duplicates');
  assert.equal(log.filter(p => p === '/sitemap.xml').length, 1, 'sitemap cached for a day');
  for (const s of db.sources) assert.ok(!/Marketing|copy we must not keep/.test(JSON.stringify(s)));
});

test('API is used only when robots.txt allows it for this agent', async () => {
  db.sources.length = 0; db.runtime = {};
  const client = createSourceClient({wait: async () => {}, request: async url => {
    const u = new URL(url);
    if (u.pathname === '/robots.txt') return {status: 200, headers: {}, body: 'User-agent: *\nAllow: /\n'};
    if (u.pathname === '/api/offers') return {status: 200, headers: {}, body: JSON.stringify({offers: [{slug: 'notion', brand: 'Notion', claim_url: 'https://www.notion.com/product/notion-for-education', description: 'do not keep'}]})};
    return {status: 404, headers: {}, body: ''};
  }});
  const r = await so.discoverStudentOffersLeads({client});
  assert.equal(r.mode, 'api');
  assert.equal(r.discovered, 1);
  assert.equal(db.sources[0].official, true);
  assert.ok(!JSON.stringify(db.sources[0]).includes('do not keep'));
});

test('switch and limits', async () => {
  assert.deepEqual(await so.discoverStudentOffersLeads({env: {STUDENTOFFERS_DISCOVERY: 'false'}}), {enabled: false, discovered: 0});
  assert.equal(so.pagesPerCycle({STUDENTOFFERS_PAGES_PER_CYCLE: '500'}), 60);
  assert.equal(so.pagesPerCycle({}), 25);
});

test('curated official pages are added once, as official sources with safe URLs', () => {
  db.sources.length = 0;
  const first = so.ensureCuratedSources();
  assert.ok(first.discovered > 80);
  assert.equal(so.ensureCuratedSources().discovered, 0, 'idempotent');
  assert.ok(db.sources.every(s => s.official === true && s.url.startsWith('https://') && s.discovered_via === 'Nova curated official page'));
  const urls = CURATED_SOURCES.map(r => r[1]);
  assert.equal(new Set(urls).size, urls.length, 'no duplicate URLs in the curated list');
  const known = new Set(['Development', 'Cloud', 'Design', 'Creative', 'Productivity', 'AI', 'Entertainment', 'Education', 'Finance', 'Hardware', 'Security', 'Hosting', 'Streaming', 'Shopping', 'Travel', 'Health', 'Gaming']);
  assert.ok(CURATED_SOURCES.every(([, , category, countries]) => known.has(category) && Array.isArray(countries) && countries.length));
});

test('curated list covers the main Latin American countries with local official pages', () => {
  for (const code of ['CO', 'MX', 'CL', 'AR', 'PE', 'BR'])
    assert.ok(CURATED_SOURCES.some(([, , , countries]) => countries.includes(code)), `missing ${code}`);
  const latam = CURATED_SOURCES.filter(([, , , countries]) => countries.some(c => ['CO', 'MX', 'CL', 'AR', 'PE'].includes(c)));
  assert.ok(latam.length >= 12);
});

test('curated pages are promoted while uncurated StudentOffers URLs stay pending', () => {
  db.sources.length = 0;
  db.sources.push(
    {id: 1, name: 'Hulu', url: 'https://www.hulu.com/student', official: false, enabled: true, discovered_via: 'Brave Search'},
    {id: 2, name: 'Databricks', url: 'https://www.databricks.com/learn/free-edition', official: false, enabled: true, discovered_via: 'StudentOffers API'},
    {id: 3, name: 'Antares', url: 'https://www.studentbeans.com/student-discount/us/antares', official: false, enabled: true, discovered_via: 'StudentOffers API'},
    {id: 4, name: 'The Ultimate Manual to GitHub Student Developer Pack - Nira', url: 'https://nira.com/github-student-developer-pack/', official: false, enabled: true, discovered_via: 'Brave Search'},
    {id: 5, name: 'Apple Education', url: 'https://student-redirect.studentoffersteam.workers.dev/apple', official: false, enabled: true, discovered_via: 'StudentOffers API'});
  const curated = so.ensureCuratedSources();
  assert.equal(curated.upgraded, 1);
  assert.equal(db.sources.find(s => s.id === 1).official, true, 'curated URL wins over the lead');
  assert.equal(so.ensureCuratedSources().upgraded, 0, 'idempotent');
  assert.deepEqual(so.promoteOfficialLeads(), {promoted: 0});
  assert.equal(db.sources.find(s => s.id === 2).official, false, 'a genuine but uncurated URL still requires review');
  assert.ok([3, 4, 5].every(key => db.sources.find(s => s.id === key).official === false), 'aggregators, blogs and redirects stay unconfirmed');
  assert.deepEqual(so.promoteOfficialLeads(), {promoted: 0});
});

test('official trust requires an exact curated page and repairs legacy hostname promotions',()=>{
 for(const url of ['https://notion.attacker.example/student','https://attacker.example/notion.com','https://notion.com.attacker.example/student','https://notion.com/unknown-promotion','https://notion.com@attacker.example/student','https://figma.com/blog/unknown'])assert.equal(so.brandOwnsDomain('Notion',url),false);
 assert.equal(so.brandOwnsDomain('Notion','https://www.notion.com/product/notion-for-education?utm_source=copy'),true);
 db.sources.length=0;db.sources.push({id:99,name:'Notion',url:'https://notion.attacker.example/student',official:true,discovered_via:'StudentOffers API'});
 assert.deepEqual(so.promoteOfficialLeads(),{promoted:0,demoted:1});assert.equal(db.sources[0].official,false);assert.equal(db.sources[0].official_reason,'unconfirmed_url');assert.deepEqual(so.promoteOfficialLeads(),{promoted:0});
});
