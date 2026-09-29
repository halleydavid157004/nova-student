/**
 * Nova Student Radar — Intelligent Discovery Engine v2.0
 * 
 * Multi-source crawler that automatically discovers, extracts,
 * and creates student offers from the web 24/7.
 * 
 * Sources:
 *  1. StudentOffers.co public API
 *  2. Brave Search API (trending queries)
 *  3. Known aggregator scraping (UNiDAYS, Student Beans, GitHub Education partners)
 *  4. Direct source monitoring (detects changes on official pages)
 */

import crypto from 'node:crypto';
import { db, save, id } from '../db.js';
import { extractOfferWithAI, aiEnabled, discoverWithGroq } from './groq.js';

const ua = 'Mozilla/5.0 (compatible; NovaStudentRadar/2.0; +https://github.com/nova-student-radar)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = s => crypto.createHash('sha256').update(s).digest('hex');

const CONCURRENCY_DELAY = 300;  // ms between requests
const FETCH_TIMEOUT = 20000;

/* ═══════════════════════════════════════════
   TEXT EXTRACTION
   ═══════════════════════════════════════════ */
function textFromHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200000);
}

function excerpt(text) {
  const keys = ['student', 'students', 'education', 'academic', 'discount', 'free',
    'eligible', 'verify', 'verification', 'university', 'college', '.edu'];
  const low = text.toLowerCase();
  let p = keys.map(k => low.indexOf(k)).filter(x => x >= 0).sort((a, b) => a - b)[0] ?? 0;
  return text.slice(Math.max(0, p - 400), p + 2000);
}

/* ═══════════════════════════════════════════
   SMART OFFER EXTRACTION
   Attempts to extract offer details from page text
   ═══════════════════════════════════════════ */
const CATEGORY_KEYWORDS = {
  'Development': ['developer','programming','code','ide','sdk','api','devtools','coding','git','database'],
  'Cloud':       ['cloud','hosting','server','infrastructure','compute','deploy','serverless','kubernetes','docker'],
  'Design':      ['design','figma','sketch','ui','ux','graphic','prototype','wireframe','illustration'],
  'Creative':    ['creative','photo','video','animation','vfx','music production','audio','editing'],
  'AI':          ['ai','artificial intelligence','machine learning','gpt','llm','copilot','neural','deep learning','chatbot'],
  'Productivity':['productivity','office','notes','calendar','email','collaboration','workspace','task','project management'],
  'Streaming':   ['streaming','music','video','movies','tv','podcast','entertainment','media'],
  'Education':   ['course','learn','certification','tutorial','training','bootcamp','mooc','lecture','class'],
  'Shopping':    ['shop','store','laptop','computer','tablet','phone','electronics','hardware','buy','discount'],
  'Security':    ['security','password','vpn','antivirus','encryption','privacy','2fa','authentication'],
  'Gaming':      ['game','gaming','unity','unreal','engine','esports','steam','playstation','xbox'],
  'Travel':      ['travel','flight','hotel','transport','rail','bus','airline','accommodation'],
  'Health':      ['health','fitness','meditation','mental','wellness','gym','yoga','therapy'],
  'Finance':     ['finance','bank','investing','credit','fintech','payment','insurance','scholarship'],
  'Hosting':     ['domain','ssl','website','web hosting','dns','cdn'],
};

function guessCategory(text) {
  const low = text.toLowerCase();
  let best = 'Education', bestScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.reduce((s, kw) => s + (low.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

function guessOfferType(text) {
  const low = text.toLowerCase();
  if (/\bfree\b|\bgratis\b|\bno cost\b|\b100%\s*off\b/i.test(low)) return 'free';
  if (/\bcredits?\b|\bcréditos?\b|\b\$\d+\s*(in|en)\s*credit/i.test(low)) return 'credits';
  if (/\b(bundle|pack|paquete)\b/i.test(low)) return 'bundle';
  if (/\b(discount|descuento|%\s*off|save\s*\d)\b/i.test(low)) return 'discount';
  return 'free';
}

function guessVerification(text) {
  const low = text.toLowerCase();
  if (low.includes('sheerid')) return 'SheerID';
  if (low.includes('unidays')) return 'UNiDAYS';
  if (low.includes('github education') || low.includes('github student')) return 'GitHub Education';
  if (/\.edu\b|educational email|correo institucional|school email/i.test(low)) return 'Educational email';
  if (/isic/i.test(low)) return 'ISIC';
  return 'Education verification';
}

function guessCountries(text) {
  const low = text.toLowerCase();
  if (/\bglobal\b|\bworldwide\b|\beverywhere\b|\ball countries\b/i.test(low)) return ['GLOBAL'];
  const hits = [];
  const map = {US:'united states|usa|u\\.s\\.',GB:'united kingdom|uk|britain',
    DE:'germany|deutschland',FR:'france',ES:'spain|españa',IT:'italy|italia',
    CA:'canada',AU:'australia',JP:'japan',KR:'korea',BR:'brazil|brasil',
    MX:'mexico|méxico',CO:'colombia',AR:'argentina',IN:'india',NL:'netherlands'};
  for (const [code, pattern] of Object.entries(map)) {
    if (new RegExp(pattern, 'i').test(low)) hits.push(code);
  }
  return hits.length ? hits : ['GLOBAL'];
}

/**
 * Given scraped text from a page, try to extract a structured offer.
 * Returns null if the page doesn't look like a student offer.
 */
export function extractOfferFromText(text, url, sourceName = '') {
  const low = text.toLowerCase();
  // Must have student-related keywords
  const studentScore = ['student', 'students', 'education', 'academic', 'university',
    'college', '.edu', 'estudiant', 'educati'].reduce((s, k) => s + (low.includes(k) ? 1 : 0), 0);
  if (studentScore < 2) return null;

  // Must have offer-related keywords
  const offerScore = ['free', 'gratis', 'discount', 'descuento', 'credits', 'plan',
    'offer', 'deal', 'save', 'off', 'trial', 'pricing'].reduce((s, k) => s + (low.includes(k) ? 1 : 0), 0);
  if (offerScore < 1) return null;

  // Filter out listicles, blogs, and guides from being extracted by Regex
  if (/(top\s*\d+|best|mejores|deals|descuentos para|lista|guía|blog)/i.test(sourceName)) return null;

  let domain;
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }

  const brand = sourceName || domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const category = guessCategory(text);
  const ex = excerpt(text);

  let cleanSummary = ex.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s.,?!-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanSummary.length < 20 || /Pricing|Log in|Sign up|Skip to|Menu|Cart|Search/i.test(cleanSummary)) {
    cleanSummary = 'Desbloquea descuentos exclusivos, créditos o planes gratuitos verificando tu correo institucional.';
  } else {
    cleanSummary = cleanSummary.substring(0, 100) + (cleanSummary.length > 100 ? '...' : '');
  }

  return {
    slug: `discovered-${hash(url).slice(0, 12)}`,
    brand,
    title: `${brand} - Beneficios para Estudiantes`,
    summary: cleanSummary,
    benefit: ex.slice(0, 300).trim(),
    category,
    offer_type: guessOfferType(text),
    countries: guessCountries(text),
    requirements: ['Verificar condición de estudiante en la fuente oficial'],
    steps: ['Visita el enlace oficial','Verifica tu condición de estudiante','Activa la oferta siguiendo las instrucciones del sitio'],
    verification: guessVerification(text),
    source_url: url,
    source_domain: domain,
    official: false,
    confidence: 60,
    requires_card: /credit card|tarjeta|payment method/i.test(low),
    status: 'active',
    auto_discovered: true,
    discovered_via: 'Nova Radar auto-discovery',
    tags: ['discovered'],
  };
}

/* ═══════════════════════════════════════════
   ROBOTS.TXT CHECK
   ═══════════════════════════════════════════ */
async function robotsAllows(targetUrl) {
  try {
    const u = new URL(targetUrl);
    const rr = await fetch(`${u.protocol}//${u.host}/robots.txt`, {
      headers: { 'user-agent': ua },
      signal: AbortSignal.timeout(7000)
    });
    if (!rr.ok) return true;
    const txt = await rr.text();
    const lines = txt.split(/\r?\n/);
    let applies = false;
    const rules = [];
    for (const raw of lines) {
      const line = raw.split('#')[0].trim();
      if (!line) continue;
      const [k, ...rest] = line.split(':');
      const v = rest.join(':').trim();
      if (k.toLowerCase() === 'user-agent')
        applies = (v === '*' || v.toLowerCase().includes('novastudentradar'));
      else if (applies && k.toLowerCase() === 'disallow' && v)
        rules.push(v);
    }
    return !rules.some(rule => u.pathname.startsWith(rule));
  } catch { return true; }
}

/* ═══════════════════════════════════════════
   SOURCE SCANNER — checks for changes
   ═══════════════════════════════════════════ */
export async function scanSource(source) {
  const now = new Date().toISOString();
  try {
    if (!(await robotsAllows(source.url))) {
      source.last_checked_at = now;
      source.last_error = 'Blocked by robots.txt';
      save();
      return { id: source.id, name: source.name, skipped: true, reason: 'robots.txt' };
    }

    const r = await fetch(source.url, {
      headers: { 'user-agent': ua, 'accept-language': 'en-US,en;q=0.8,es;q=0.6' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    const html = await r.text();
    const text = textFromHtml(html);
    const h = hash(text);
    const changed = !!source.last_hash && source.last_hash !== h;

    Object.assign(source, {
      last_checked_at: now,
      last_hash: h,
      last_status: r.status,
      last_error: null,
    });

    // Update existing offers tied to this source
    for (const o of db.offers.filter(x => x.source_url === source.url)) {
      if (r.status >= 400 && r.status < 500) {
        // Expired or Not Found -> auto-disable
        o.status = 'inactive';
      } else if (r.status === 200) {
        o.status = 'active'; // Recovered
      }
      
      Object.assign(o, {
        source_hash: h,
        source_excerpt: excerpt(text),
        verified_at: now,
        updated_at: now,
      });
    }

    // If page changed, log event
    if (changed) {
      db.events.push({
        id: id('events'),
        type: 'source_changed',
        source_id: source.id,
        title: `${source.name} cambió su contenido`,
        details: { url: source.url, status: r.status },
        created_at: now,
      });
    }

    // Try to auto-extract new offer if source has no linked offer
    const hasOffer = db.offers.some(o => o.source_url === source.url);
    if (!hasOffer && text.length > 200) {
      // Try fast regex-based extraction first (no API cost)
      let extracted = extractOfferFromText(text, source.url, source.name);

      // If regex failed but text looks promising, try AI extraction
      if (!extracted && aiEnabled() && text.length > 500) {
        const low = text.toLowerCase();
        const hasStudentKeywords = ['student', 'education', '.edu', 'university'].some(k => low.includes(k));
        const hasOfferKeywords = ['free', 'discount', 'gratis', 'credits'].some(k => low.includes(k));
        if (hasStudentKeywords && hasOfferKeywords) {
          try {
            let aiResult = await extractOfferWithAI(text, source.url);
            
            // If AI requested a real-time search to find the official URL
            if (aiResult && aiResult.needs_search) {
              try {
                const key = process.env.BRAVE_SEARCH_API_KEY;
                if (key) {
                  const u = new URL('https://api.search.brave.com/res/v1/web/search');
                  u.searchParams.set('q', aiResult.needs_search);
                  u.searchParams.set('count', '1');
                  const sr = await fetch(u, { headers: { 'X-Subscription-Token': key, Accept: 'application/json' }});
                  if (sr.ok) {
                    const sj = await sr.json();
                    if (sj.web?.results?.[0]?.url) {
                      aiResult.source_url = sj.web.results[0].url;
                      aiResult.source_domain = new URL(aiResult.source_url).hostname.replace(/^www\./, '');
                      console.log(`[Nova AI] 🔍 Live Search found official URL: ${aiResult.source_url}`);
                    } else { aiResult = null; } // Discard if no real result
                  } else { aiResult = null; }
                } else { aiResult = null; }
              } catch(e) { aiResult = null; }
            }

            if (aiResult) {
              delete aiResult.needs_search;
              extracted = {
                slug: `ai-${hash(aiResult.source_url || source.url).slice(0, 12)}`,
                ...aiResult,
                verification: guessVerification(text),
                official: false,
                auto_discovered: true,
                discovered_via: 'Nova AI + Live Search',
                tags: ['discovered', 'ai-extracted'],
              };
            }
          } catch (e) {
            console.error('[Nova AI] Extraction failed, skipping:', e.message);
          }
        }
      }

      if (extracted) {
        const exists = db.offers.some(o => o.slug === extracted.slug || o.source_url === source.url || o.source_domain === extracted.source_domain);
        if (!exists) {
          const newOffer = {
            id: id('offers'),
            ...extracted,
            discovered_at: now,
            verified_at: now,
            updated_at: now,
            source_hash: h,
            source_excerpt: excerpt(text),
          };
          db.offers.push(newOffer);
          db.events.push({
            id: id('events'),
            type: 'offer_auto_created',
            title: `Oferta auto-descubierta: ${extracted.title}`,
            details: { url: source.url, category: extracted.category, brand: extracted.brand },
            created_at: now,
          });
          console.log(`[Discovery] ${aiEnabled() ? '🧠 AI' : '📝 Regex'} offer: ${extracted.title}`);
        }
      }
    }

    save();
    return { id: source.id, name: source.name, status: r.status, changed, chars: text.length };

  } catch (e) {
    source.last_checked_at = now;
    source.last_error = String(e.message || e);
    save();
    return { id: source.id, name: source.name, error: source.last_error };
  }
}

export async function scanAll() {
  const out = [];
  const sources = db.sources.filter(x => x.enabled);
  console.log(`[Scan] Starting scan of ${sources.length} sources…`);

  for (const s of sources) {
    out.push(await scanSource(s));
    await sleep(CONCURRENCY_DELAY);
  }

  console.log(`[Scan] Complete. ${out.filter(x => x.changed).length} changed, ${out.filter(x => x.error).length} errors.`);
  return out;
}

/* ═══════════════════════════════════════════
   DISCOVER: StudentOffers.co API
   ═══════════════════════════════════════════ */
export async function discoverStudentOffers() {
  if (String(process.env.STUDENTOFFERS_DISCOVERY || 'true').toLowerCase() === 'false')
    return { enabled: false, discovered: 0 };

  try {
    const r = await fetch('https://www.studentoffers.co/api/v1/offers', {
      headers: { Accept: 'application/json', 'user-agent': ua },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!r.ok) return { enabled: true, discovered: 0, error: `HTTP ${r.status}` };

    const j = await r.json();
    const rows = Array.isArray(j) ? j : (j.offers || j.data || j.results || []);
    let added = 0;

    for (const item of rows.slice(0, 1000)) {
      const title = item.title || item.name || item.offer_name || item.company || item.brand;
      if (!title) continue;

      const candidates = [
        item.source_url, item.official_url, item.claim_url, item.url,
        item.link, item.website, ...(Array.isArray(item.links) ? item.links : [])
      ].filter(x => typeof x === 'string' && /^https?:\/\//.test(x));

      const url = candidates.find(x => !new URL(x).hostname.endsWith('studentoffers.co')) || candidates[0];
      if (!url) continue;
      if (db.sources.some(x => x.url === url)) continue;

      let dom;
      try { dom = new URL(url).hostname.replace(/^www\./, ''); } catch { continue; }
      if (db.sources.some(x => x.domain === dom)) continue;

      const category = item.category || item.type || guessCategory(
        [title, item.description || '', item.tags?.join(' ') || ''].join(' ')
      );

      const source = {
        id: id('sources'),
        name: String(title).slice(0, 180),
        url, domain: dom,
        category,
        countries: Array.isArray(item.countries) ? item.countries : guessCountries(item.description || title),
        enabled: true, official: false,
        last_checked_at: null, last_hash: null, last_status: null, last_error: null,
        discovered_via: 'StudentOffers API',
      };

      db.sources.push(source);
      db.events.push({
        id: id('events'),
        type: 'source_discovered',
        source_id: source.id,
        title: `Nueva pista: ${source.name}`,
        details: { url, via: 'StudentOffers API' },
        created_at: new Date().toISOString(),
      });
      added++;
    }

    save();
    console.log(`[StudentOffers] Discovered ${added} new sources from ${rows.length} total.`);
    return { enabled: true, discovered: added, totalSeen: rows.length };

  } catch (e) {
    return { enabled: true, discovered: 0, error: String(e.message || e) };
  }
}

/* ═══════════════════════════════════════════
   DISCOVER: Brave Search API
   Much more aggressive query set focused on trending topics
   ═══════════════════════════════════════════ */
const BRAVE_QUERIES = [
  // General
  'student discount free software 2026',
  'best student deals education university',
  'student developer pack tools free',
  // AI & Trending
  'chatgpt student discount free 2026',
  'AI tools free for students education',
  'copilot student free ai coding',
  'claude ai student education free',
  'midjourney student discount',
  'perplexity ai student plan',
  // Streaming & Entertainment
  'amazon prime student free trial 2026',
  'spotify premium student discount',
  'apple music student plan free tv+',
  'youtube premium student plan',
  'discord nitro student discount',
  'hulu student plan discount',
  // Cloud & Dev
  'aws azure google cloud student credits free',
  'cloud computing free credits students',
  'free hosting student developer',
  // Productivity
  'notion student free plan',
  'microsoft 365 free student education',
  'adobe creative cloud student discount 2026',
  'canva pro free students',
  'grammarly student premium discount',
  // Hardware & Shopping
  'apple education store student discount macbook',
  'samsung student discount laptop',
  'dell student discount',
  'lenovo student discount laptop 2026',
  // Learning
  'coursera free courses student financial aid',
  'udemy student discount courses',
  'skillshare student plan free',
  // Health & Lifestyle
  'headspace calm student discount meditation',
  'gym student discount membership',
  // Finance
  'student bank account no fees free',
  'credit card student rewards',
  // Travel
  'student travel discount flights isic',
];

export async function discoverWithBrave() {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return { enabled: false, reason: 'BRAVE_SEARCH_API_KEY not configured', discovered: 0 };

  let added = 0;
  let queriesUsed = 0;

  // Pick a subset of queries each run (rotate through them)
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const queriesPerRun = 8;
  const startIdx = (dayOfYear * queriesPerRun) % BRAVE_QUERIES.length;
  const selectedQueries = [];
  for (let i = 0; i < queriesPerRun; i++) {
    selectedQueries.push(BRAVE_QUERIES[(startIdx + i) % BRAVE_QUERIES.length]);
  }

  console.log(`[Brave] Running ${selectedQueries.length} discovery queries…`);

  for (const q of selectedQueries) {
    const u = new URL('https://api.search.brave.com/res/v1/web/search');
    u.searchParams.set('q', q);
    u.searchParams.set('count', '20');
    u.searchParams.set('freshness', 'pm');  // past month

    try {
      const r = await fetch(u, {
        headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) continue;

      const j = await r.json();
      queriesUsed++;

      for (const item of (j.web?.results || [])) {
        try {
          const url = item.url;
          const dom = new URL(url).hostname.replace(/^www\./, '');
          const title = item.title || dom;
          const desc = item.description || '';
          const combined = title + ' ' + desc;

          // Must be student-related
          if (!/(student|education|academic|university|college|\.edu|estudiant)/i.test(combined)) continue;
          // Skip if already known
          if (db.sources.some(x => x.url === url || x.domain === dom)) continue;
          // Skip aggregator/news sites (we want direct sources)
          if (/(reddit\.com|twitter\.com|facebook\.com|wikipedia\.org|quora\.com|medium\.com|forbes\.com)/i.test(dom)) continue;
          // Skip if URL explicitly says it's a blog, article, or listicle
          if (/(blog|article|news|top-|best-|deals-|review)/i.test(url)) continue;

          const category = guessCategory(combined);
          const s = {
            id: id('sources'),
            name: title.slice(0, 180),
            url, domain: dom, category,
            countries: guessCountries(combined),
            enabled: true, official: false,
            last_checked_at: null, last_hash: null, last_status: null, last_error: null,
            discovered_via: `Brave Search: "${q}"`,
          };

          db.sources.push(s);
          db.events.push({
            id: id('events'),
            type: 'source_discovered',
            source_id: s.id,
            title: `Nueva fuente: ${title.slice(0, 80)}`,
            details: { url, query: q },
            created_at: new Date().toISOString(),
          });
          added++;
        } catch { /* skip invalid URLs */ }
      }

      save();
    } catch { /* skip failed queries */ }

    await sleep(400);
  }

  console.log(`[Brave] Discovered ${added} new sources from ${queriesUsed} queries.`);
  return { enabled: true, discovered: added, queriesUsed };
}

/* ═══════════════════════════════════════════
   DISCOVER: GitHub Education Partners Page
   Scrapes the partners list for new sources
   ═══════════════════════════════════════════ */
export async function discoverGitHubPartners() {
  try {
    const r = await fetch('https://education.github.com/pack/partners', {
      headers: { 'user-agent': ua, 'accept-language': 'en-US,en;q=0.8' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!r.ok) return { discovered: 0, error: `HTTP ${r.status}` };

    const html = await r.text();
    // Extract partner URLs from the page
    const urlMatches = html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi);
    let added = 0;

    for (const [, url] of urlMatches) {
      try {
        const dom = new URL(url).hostname.replace(/^www\./, '');
        // Skip GitHub's own domains and common non-partner links
        if (/(github\.com|github\.io|microsoft\.com|google\.com|fonts\.|cdn\.|analytics\.|twitter\.|facebook\.)/i.test(dom)) continue;
        if (db.sources.some(x => x.domain === dom)) continue;

        const s = {
          id: id('sources'),
          name: dom.split('.')[0].charAt(0).toUpperCase() + dom.split('.')[0].slice(1),
          url, domain: dom,
          category: 'Development',
          countries: ['GLOBAL'],
          enabled: true, official: false,
          last_checked_at: null, last_hash: null, last_status: null, last_error: null,
          discovered_via: 'GitHub Education Partners page',
        };

        db.sources.push(s);
        db.events.push({
          id: id('events'),
          type: 'source_discovered',
          source_id: s.id,
          title: `GitHub Partner: ${s.name}`,
          details: { url, via: 'GitHub Education Partners' },
          created_at: new Date().toISOString(),
        });
        added++;
      } catch { /* skip invalid URLs */ }
    }

    save();
    console.log(`[GitHub Partners] Discovered ${added} new partner sources.`);
    return { discovered: added };
  } catch (e) {
    return { discovered: 0, error: String(e.message || e) };
  }
}

/* ═══════════════════════════════════════════
   MASTER DISCOVERY — Runs all discovery engines
   ═══════════════════════════════════════════ */
export async function discoverAll() {
  console.log(`[Discovery] Starting full discovery cycle…`);
  const start = Date.now();

  const studentOffers = await discoverStudentOffers();
  await sleep(500);

  const brave = await discoverWithBrave();
  await sleep(500);

  let groqFallback = { discovered: 0 };
  // Fallback if Brave failed or found nothing (e.g. out of quota)
  if ((!brave.enabled || brave.discovered === 0 || brave.error) && aiEnabled()) {
    console.log(`[Discovery] Brave quota exhausted or failed. Activating Groq AI Fallback Discovery…`);
    const topics = ['software developers', 'cloud platforms', 'design tools', 'streaming services', 'ai services'];
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    const urls = await discoverWithGroq(randomTopic);
    let added = 0;
    
    for (const url of urls) {
      try {
        const dom = new URL(url).hostname.replace(/^www\./, '');
        if (db.sources.some(x => x.domain === dom || x.url === url)) continue;
        
        const s = {
          id: id('sources'),
          name: \`AI Discovered: \${dom}\`,
          url, domain: dom, category: 'Education',
          countries: ['GLOBAL'],
          enabled: true, official: false,
          last_checked_at: null, last_hash: null, last_status: null, last_error: null,
          discovered_via: 'Groq AI Knowledge Base',
        };
        db.sources.push(s);
        added++;
      } catch { /* skip */ }
    }
    save();
    groqFallback.discovered = added;
    console.log(`[Discovery] Groq AI Fallback found ${added} new sources.`);
  }

  const github = await discoverGitHubPartners();

  const totalDiscovered = (studentOffers.discovered || 0) + (brave.discovered || 0) + (groqFallback.discovered || 0) + (github.discovered || 0);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`[Discovery] Complete in ${elapsed}s. Total new sources: ${totalDiscovered}`);
  console.log(`  └─ StudentOffers: ${studentOffers.discovered || 0}, Brave: ${brave.discovered || 0}, Groq: ${groqFallback.discovered || 0}, GitHub: ${github.discovered || 0}`);

  // Log summary event
  if (totalDiscovered > 0) {
    db.events.push({
      id: id('events'),
      type: 'discovery_cycle',
      title: `Ciclo de descubrimiento: ${totalDiscovered} nuevas fuentes`,
      details: { studentOffers: studentOffers.discovered, brave: brave.discovered, groq: groqFallback.discovered, github: github.discovered, elapsed },
      created_at: new Date().toISOString(),
    });
    save();
  }

  return { studentOffers, brave, groqFallback, github, discovered: totalDiscovered };
}
