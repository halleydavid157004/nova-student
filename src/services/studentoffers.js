/**
 * Fase 11 — Leads from StudentOffers.co, collected the way their robots.txt allows,
 * plus the curated list of official student pages.
 *
 * Rules:
 *  - Every request goes through sourceClient: robots.txt, crawl pacing, SSRF guard, size limit.
 *  - Their robots.txt disallows /api/ for generic agents (checked 2026-10-02). The API path is
 *    used only if robots allows it for our user agent; otherwise we read the public sitemap and
 *    offer pages, which robots allows.
 *  - We keep only facts needed to find the official page: brand name and the claim link.
 *    No descriptions, prices or labels are copied. Leads are unofficial sources until the
 *    radar extracts evidence from the official page and the offer passes review.
 */
import {canonicalSource} from '../../public/search/identity.js';
import {CURATED_SOURCES} from '../data/curated-sources.js';
import {sourceClient, sourceUrl} from './source-http.js';
import {db, save, id} from '../db.js';

export const SO_ORIGIN = 'https://www.studentoffers.co';
const DAY = 86400000;
// Sites that list offers from other brands: a link to them is a lead, never the official page.
const AGGREGATOR = /(^|\.)(studentoffers\.co|myunidays\.com|unidays\.com|studentbeans\.com|id\.me|sheerid\.com|studentuniverse\.com|slickdeals\.net|reddit\.com|medium\.com)$/i;
const SOCIAL = /(^|\.)(twitter\.com|x\.com|facebook\.com|instagram\.com|tiktok\.com|threads\.net|discord\.gg|discord\.com|t\.me|wa\.me|pinterest\.com)$/i;
const CLAIM = /\b(claim|get (?:the )?(?:offer|deal|discount)|get it|redeem|visit (?:site|offer)|official|reclamar|obtener|ir a la oferta)\b/i;
const decode = s => String(s ?? '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;|&#160;/g, ' ');
const stripTags = s => decode(String(s ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

export function pagesPerCycle(env = process.env) {
  const n = Number(env.STUDENTOFFERS_PAGES_PER_CYCLE ?? 25);
  return Number.isInteger(n) ? Math.max(0, Math.min(60, n)) : 25;
}

export function parseSitemap(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => decode(m[1]));
}

/** Offer detail pages only (e.g. /offer/figma). Returns paths, de-duplicated, in sitemap order. */
export function offerPaths(urls) {
  const out = [];
  for (const value of urls) {
    try {
      const u = new URL(value);
      if (!/^(www\.)?studentoffers\.co$/i.test(u.hostname) || u.search) continue;
      const m = u.pathname.match(/^\/offer\/([a-z0-9][a-z0-9-]{0,99})\/?$/i);
      if (m && !out.includes(`/offer/${m[1].toLowerCase()}`)) out.push(`/offer/${m[1].toLowerCase()}`);
    } catch {}
  }
  return out;
}

/** Brand + official claim link from an offer page. Never returns their copy. */
export function parseOfferPage(html, pageUrl = SO_ORIGIN) {
  const text = String(html || '');
  let brand = stripTags(text.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  if (!brand) brand = decode(text.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)/i)?.[1] || '').split(/[:|–—-]/)[0].trim();
  brand = brand.slice(0, 120);
  const links = [];
  for (const m of text.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = decode(m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || '');
    let url;
    try { url = new URL(href, pageUrl); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol)) continue;
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (/(^|\.)studentoffers\.co$/.test(host) || SOCIAL.test(host)) continue;
    const label = stripTags(m[2]) + ' ' + decode(m[1].match(/\baria-label\s*=\s*["']([^"']+)["']/i)?.[1] || '');
    // Drop tracking parameters; keep plan/country style parameters the canonical form keeps.
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|ref$|via$|aff|affiliate|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    url.hash = '';
    links.push({url: url.href, host, claim: CLAIM.test(label)});
  }
  if (!brand || !links.length) return null;
  const pick = links.find(l => l.claim && !AGGREGATOR.test(l.host)) || links.find(l => l.claim) || links.find(l => !AGGREGATOR.test(l.host));
  return pick ? {brand, url: pick.url, viaClaimButton: pick.claim} : null;
}

/** True when the link lives on the brand's own domain (e.g. Figma → figma.com, AWS Educate → aws.amazon.com). */
export function brandOwnsDomain(brand, url) {
  const host = hostOf(url);
  if (!host || AGGREGATOR.test(host)) return false;
  const labels = host.split('.');
  const words = String(brand || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !['for', 'the', 'and', 'student', 'students', 'education', 'edu', 'pro', 'plus', 'premium', 'free', 'plan'].includes(w));
  const joined = words.join('');
  return words.some(w => w.length >= 3 && labels.includes(w)) || (joined.length >= 3 && labels.some(l => l === joined));
}

function addSource({name, url, category, countries, official, via, ref}) {
  let safe;
  try { safe = sourceUrl(url).href; } catch { return null; }
  if (db.sources.some(s => canonicalSource(s.url) === canonicalSource(safe))) return null;
  const source = {
    id: id('sources'), name: String(name).slice(0, 180), url: safe, domain: hostOf(safe), category, countries,
    enabled: true, official: official === true, last_checked_at: null, last_hash: null, last_status: null, last_error: null,
    discovered_via: via, ...(ref ? {lead_ref: ref} : {}),
  };
  db.sources.push(source);
  db.events.push({id: id('events'), type: 'source_discovered', source_id: source.id, title: `Nueva fuente: ${source.name}`,
    details: {url: safe, via, ...(ref ? {page: ref} : {})}, created_at: new Date().toISOString()});
  return source;
}

/**
 * Idempotent: adds curated official pages that are not in the source list yet. A curated page that
 * was first found as an unconfirmed lead (same canonical URL) is marked official: the curated list is
 * checked by hand, and a lead must not hide it from automatic approval.
 */
export function ensureCuratedSources(list = CURATED_SOURCES, env = process.env) {
  if (String(env.NOVA_CURATED_SOURCES || 'true').toLowerCase() === 'false') return {enabled: false, discovered: 0};
  let added = 0, upgraded = 0;
  for (const [name, url, category, countries] of list) {
    if (addSource({name, url, category, countries, official: true, via: 'Nova curated official page'})) { added++; continue; }
    let safe;
    try { safe = canonicalSource(sourceUrl(url).href); } catch { continue; }
    const existing = db.sources.find(s => s.official !== true && canonicalSource(s.url) === safe);
    if (existing) { existing.official = true; existing.official_reason = 'curated'; upgraded++; }
  }
  if (added || upgraded) save();
  return {discovered: added, upgraded, total: list.length};
}

/**
 * Leads saved before Fase 11 were all stored as unconfirmed, even when StudentOffers linked straight
 * to the brand's own site. Apply the same rule new leads get (`brandOwnsDomain`) to those old
 * StudentOffers leads. Brave and other search leads are left alone: their names are page titles,
 * not brands, so the domain check would trust blogs.
 */
export function promoteOfficialLeads() {
  let promoted = 0;
  for (const source of db.sources) {
    if (source.official === true || !/^StudentOffers/i.test(String(source.discovered_via || ''))) continue;
    if (!brandOwnsDomain(source.name, source.url)) continue;
    source.official = true; source.official_reason = 'brand_domain'; promoted++;
  }
  if (promoted) save();
  return {promoted};
}

/**
 * One bounded pass over StudentOffers leads. Resumes where the previous cycle stopped.
 * `guessCategory` comes from the crawler so categories stay consistent with other leads.
 */
export async function discoverStudentOffersLeads({client = sourceClient, guessCategory = () => 'Education', limit = pagesPerCycle(), now = Date.now(), env = process.env} = {}) {
  if (String(env.STUDENTOFFERS_DISCOVERY || 'true').toLowerCase() === 'false') return {enabled: false, discovered: 0};
  db.runtime ||= {};
  const state = db.runtime.studentOffers ||= {cursor: 0, pages: [], sitemapAt: null, checked: 0};
  const result = {enabled: true, mode: 'sitemap', discovered: 0, checked: 0, official: 0};

  // The documented API is only used if robots.txt allows it for this agent.
  const api = await client.policy(`${SO_ORIGIN}/api/offers`).catch(() => ({allowed: false}));
  if (api.allowed) {
    result.mode = 'api';
    const r = await client.fetch(`${SO_ORIGIN}/api/offers`);
    if (r.blocked || r.status !== 200) return {...result, error: r.blocked ? `blocked_${r.blocked}` : `HTTP ${r.status}`};
    let rows = [];
    try { const j = JSON.parse(r.body); rows = Array.isArray(j) ? j : j.offers || j.data || []; } catch { return {...result, error: 'invalid_json'}; }
    for (const item of rows.slice(0, 1000)) {
      const brand = item.brand || item.company || item.name || item.title;
      const url = [item.claim_url, item.official_url, item.source_url, item.url, item.link].find(x => typeof x === 'string' && /^https?:\/\//.test(x) && !/studentoffers\.co/i.test(x));
      if (!brand || !url) continue;
      result.checked++;
      const official = brandOwnsDomain(brand, url);
      if (addSource({name: brand, url, category: guessCategory(`${brand} ${url}`), countries: [], official, via: 'StudentOffers API (pista)', ref: item.slug ? `/offer/${item.slug}` : undefined})) { result.discovered++; if (official) result.official++; }
    }
    if (result.discovered) save();
    return result;
  }

  if (!state.pages.length || !(now - Date.parse(state.sitemapAt) < DAY)) {
    const r = await client.fetch(`${SO_ORIGIN}/sitemap.xml`);
    if (r.blocked || r.status !== 200) return {...result, error: r.blocked ? `blocked_${r.blocked}` : `HTTP ${r.status}`};
    const pages = offerPaths(parseSitemap(r.body));
    if (!pages.length) return {...result, error: 'empty_sitemap'};
    const old = new Set(state.pages);
    // New pages go first so fresh offers are not stuck behind a full pass.
    state.pages = [...pages.filter(p => !old.has(p)), ...pages.filter(p => old.has(p))];
    if (pages.some(p => !old.has(p))) state.cursor = 0;
    state.sitemapAt = new Date(now).toISOString();
  }
  const total = state.pages.length, start = Number.isSafeInteger(state.cursor) ? state.cursor % total : 0;
  const batch = Array.from({length: Math.min(limit, total)}, (_, i) => state.pages[(start + i) % total]);
  let processed = 0;
  for (const path of batch) {
    const r = await client.fetch(SO_ORIGIN + path);
    if (r.blocked) { result.error = `blocked_${r.blocked}`; break; } // respect robots/crawl-delay; resume next cycle
    processed++;
    if (r.status !== 200) continue;
    result.checked++;
    const lead = parseOfferPage(r.body, SO_ORIGIN + path);
    if (!lead) continue;
    const official = brandOwnsDomain(lead.brand, lead.url);
    if (addSource({name: lead.brand, url: lead.url, category: guessCategory(`${lead.brand} ${lead.url}`), countries: [], official, via: 'StudentOffers (pista)', ref: path})) {
      result.discovered++; if (official) result.official++;
    }
  }
  state.cursor = (start + processed) % total;
  state.checked = (Number(state.checked) || 0) + result.checked;
  save();
  return {...result, totalPages: total, cursor: state.cursor};
}
