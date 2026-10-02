/**
 * Nova Student — premium layer (Fase 10)
 * Adds on top of app.js without changing its data flow:
 *  - brand logos (Simple Icons, cached per browser; site icon as fallback)
 *  - live radar instrument + brand marquee in the hero
 *  - eligibility assistant ("Para mí"), compare tray, ⌘K command palette
 *  - Nova AI quick prompts and mobile tab bar
 * Everything degrades gracefully: if a request fails, the base app keeps working.
 */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const app = () => window.NovaApp || {};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------------- catalog ---------------- */
let CATALOG = [];
const catalogReady = fetch('/api/catalog', { cache: 'no-cache' })
  .then(r => (r.ok ? r.json() : { offers: [] }))
  .then(d => { CATALOG = (d.offers || []).filter(o => o && o.status !== 'expired'); return CATALOG; })
  .catch(() => []);
const byId = id => CATALOG.find(o => o.id === Number(id));
const CAT_LABEL = { Development: 'Desarrollo', Cloud: 'Cloud y hosting', Design: 'Diseño', Creative: 'Creativo', Productivity: 'Productividad', AI: 'Inteligencia artificial', Entertainment: 'Entretenimiento', Education: 'Educación y cursos', Finance: 'Finanzas', Hardware: 'Hardware', Security: 'Seguridad', Hosting: 'Dominios y hosting', Streaming: 'Streaming', Shopping: 'Compras', Travel: 'Viajes', Health: 'Salud y bienestar', Gaming: 'Gaming' };
const catLabel = k => CAT_LABEL[k] || k || '';
const typeLabel = t => ({ free: 'Gratis', discount: 'Descuento', credits: 'Créditos', bundle: 'Pack' }[t] || 'Beneficio');
const fresh = o => { const v = Date.parse(o.liveness_verified_at || o.verified_at); return Number.isFinite(v) ? v : 0; };

/* ---------------- logos ---------------- */
// Simple Icons (CC0) ships as one CommonJS file. We load it at most once per new set of brands
// and keep only the icons we need in localStorage, so repeat visits cost nothing.
const ICON_KEY = 'nova-icons-v16';
let iconCache = store.get(ICON_KEY, {});
const ALIASES = { 'google': ['google'], 'google cloud': ['googlecloud', 'google'], 'github': ['github'], 'microsoft': ['microsoft'], 'amazon': ['amazon'], 'aws': ['amazonwebservices', 'amazonaws'], 'amazon web services': ['amazonwebservices', 'amazonaws'], 'apple': ['apple'], 'adobe': ['adobecreativecloud', 'adobe'], 'jetbrains': ['jetbrains'], 'notion': ['notion'], 'figma': ['figma'], 'spotify': ['spotify'], 'youtube': ['youtube'], 'coursera': ['coursera'], 'autodesk': ['autodesk'], 'canva': ['canva'], 'digitalocean': ['digitalocean'], 'unity': ['unity'], 'openai': ['openai'], 'perplexity': ['perplexity'], 'linkedin': ['linkedin'], 'unidays': ['unidays'], 'isic': ['isic'], 'mongodb': ['mongodb'], 'heroku': ['heroku'], 'datacamp': ['datacamp'], 'namecheap': ['namecheap'], '1password': ['1password'], 'samsung': ['samsung'], 'dell': ['dell'], 'lenovo': ['lenovo'], 'hp': ['hp'], 'tableau': ['tableau'], 'miro': ['miro'], 'evernote': ['evernote'], 'obsidian': ['obsidian'], 'deezer': ['deezer'], 'tidal': ['tidal'], 'hulu': ['hulu'], 'nike': ['nike'], 'adidas': ['adidas'], 'puma': ['puma'], 'uber': ['uber'], 'doordash': ['doordash'], 'headspace': ['headspace'], 'emirates': ['emirates'], 'discover': ['discover'], 'chase': ['chase'], 'cisco': ['cisco'], 'ibm': ['ibm'], 'comptia': ['comptia'], 'hack the box': ['hackthebox'], 'tryhackme': ['tryhackme'], 'grammarly': ['grammarly'], 'gitkraken': ['gitkraken'], 'datadog': ['datadog'], 'sentry': ['sentry'], 'postman': ['postman'], 'educative': ['educative'], 'codecademy': ['codecademy'], 'arcgis': ['arcgis'], 'esri': ['arcgis'] };
const siSlug = s => String(s || '').toLowerCase().replace(/\+/g, 'plus').replace(/\./g, 'dot').replace(/&/g, 'and').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const slugsFor = brand => { const k = norm(brand).trim(); return [...new Set([...(ALIASES[k] || []), siSlug(brand), siSlug(String(brand).split(/[\s(·/-]/)[0])].filter(Boolean))]; };
const lum = hex => { const n = parseInt(hex, 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
let libPromise = null;
function loadLibrary() {
  if (libPromise) return libPromise;
  libPromise = new Promise(res => {
    const prev = window.module; window.module = { exports: {} };
    const el = document.createElement('script');
    el.src = 'https://cdn.jsdelivr.net/npm/simple-icons@16.33.0/index.js'; el.async = true; el.crossOrigin = 'anonymous';
    el.onload = () => { const lib = window.module.exports; window.module = prev; res(lib && Object.keys(lib).length ? lib : null); };
    el.onerror = () => { window.module = prev; res(null); };
    document.head.appendChild(el);
  });
  return libPromise;
}
function paint(el, icon) {
  const hex = icon.hex;
  el.classList.remove('mg'); el.classList.add('has-logo', 'in');
  if (lum(hex) > 0.75) el.classList.add('dark-tile');
  el.innerHTML = `<svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="#${hex}" d="${icon.path}"/></svg>`;
}
function paintFavicon(el) {
  const domain = el.dataset.domain; if (!domain || el.dataset.fav) return;
  el.dataset.fav = '1';
  const img = new Image(); img.referrerPolicy = 'no-referrer'; img.alt = '';
  img.onload = () => { if (img.naturalWidth >= 24 && el.classList.contains('mg')) { el.classList.remove('mg'); el.classList.add('has-logo', 'in', 'fav'); el.replaceChildren(img); } };
  img.src = `https://icon.horse/icon/${encodeURIComponent(domain)}`;
}
let hydrateTimer = null;
function scheduleHydrate() { clearTimeout(hydrateTimer); hydrateTimer = setTimeout(hydrate, 60); }
async function hydrate() {
  const tiles = $$('.lg.mg[data-brand]'); if (!tiles.length) return;
  const need = new Set();
  for (const el of tiles) {
    const slugs = slugsFor(el.dataset.brand);
    const hit = slugs.map(s => iconCache[s]).find(Boolean);
    if (hit) paint(el, hit);
    else if (slugs.some(s => !(s in iconCache))) need.add(el.dataset.brand);
    else paintFavicon(el);
  }
  if (!need.size) return;
  const lib = await loadLibrary();
  for (const brand of need) for (const s of slugsFor(brand)) {
    const key = 'si' + s.charAt(0).toUpperCase() + s.slice(1);
    iconCache[s] = lib && lib[key]?.path ? { path: lib[key].path, hex: lib[key].hex } : 0;
  }
  if (lib) store.set(ICON_KEY, iconCache);
  for (const el of $$('.lg.mg[data-brand]')) {
    const hit = slugsFor(el.dataset.brand).map(s => iconCache[s]).find(Boolean);
    hit ? paint(el, hit) : paintFavicon(el);
  }
}
new MutationObserver(scheduleHydrate).observe(document.body, { childList: true, subtree: true });

function tile(o, size = '') {
  const brand = o.brand || o.title || '?';
  const w = String(brand).replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const ini = (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase();
  let h = 0; for (const c of String(brand)) h = (h * 31 + c.charCodeAt(0)) % 360;
  let domain = ''; try { domain = new URL(o.source_url).hostname.replace(/^www\./, ''); } catch {}
  return `<span class="lg mg ${size}" data-brand="${esc(brand)}" data-domain="${esc(domain)}" style="--h:${h}" aria-hidden="true">${esc(ini)}</span>`;
}

/* ---------------- hero: radar instrument + marquee ---------------- */
function nextRun() {
  const n = new Date(), hrs = [0, 6, 12, 18];
  for (let i = 0; i <= 48; i++) { const c = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), n.getUTCHours() + i, 17)); if (c > n && hrs.includes(c.getUTCHours())) return c; }
  return null;
}
function countdown() { const n = nextRun(); if (!n) return 'cada 6 horas'; const m = Math.round((n - Date.now()) / 6e4); return `próximo escaneo en ${m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min' : m + ' min'}`; }
function mountScope(list) {
  const scope = $('#heroScope'); if (!scope || !list.length) return;
  const cats = [...new Set(list.map(o => o.category))].sort();
  const brands = new Set(); const top = [];
  for (const o of [...list].sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || fresh(b) - fresh(a))) {
    if (!brands.has(o.brand) && top.length < 16) { brands.add(o.brand); top.push(o.id); }
  }
  const groups = {}; list.forEach(o => (groups[o.category] = groups[o.category] || []).push(o));
  const html = list.map((o, idx) => {
    const ci = cats.indexOf(o.category), g = groups[o.category], k = g.indexOf(o);
    let f = (ci + 0.5 + (k - (g.length - 1) / 2) * (0.8 / Math.max(1, g.length))) / cats.length;
    let r = 0.13 + 0.3 * ((idx * 0.618) % 1);
    const ti = top.indexOf(o.id);
    if (ti >= 0) { f = (ti + 0.5) / top.length; r = ti % 2 ? 0.25 : 0.39; }
    const a = f * 2 * Math.PI, x = 50 + Math.sin(a) * r * 100, y = 50 - Math.cos(a) * r * 100;
    const d = (f * 7 - 7).toFixed(2) + 's';
    const tip = `${o.brand || o.title} · ${typeLabel(o.offer_type)}`;
    return ti >= 0
      ? `<button class="blip" type="button" data-offer="${o.id}" data-tip="${esc(tip)}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--d:${d}" aria-label="${esc(o.title)}">${tile(o)}</button>`
      : `<button class="blip dot" type="button" data-offer="${o.id}" data-tip="${esc(tip)}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--d:${d}" aria-label="${esc(o.title)}" tabindex="-1"></button>`;
  }).join('');
  scope.insertAdjacentHTML('beforeend', html);
  const tipEl = $('#blipTip');
  scope.addEventListener('pointerover', e => { const b = e.target.closest('.blip'); if (!b) return; tipEl.hidden = false; tipEl.textContent = b.dataset.tip; tipEl.style.left = b.style.left; tipEl.style.top = b.style.top; });
  scope.addEventListener('pointerout', e => { if (!e.relatedTarget?.closest?.('.blip')) tipEl.hidden = true; });
  const cd = $('#radarNext'); if (cd) { cd.textContent = countdown(); setInterval(() => (cd.textContent = countdown()), 30000); }
  const latest = Math.max(...list.map(fresh));
  const st = $('#heroStatus');
  if (st && latest) { const h = (latest - Date.now()) / 36e5, rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' }); st.textContent = `Radar activo · última verificación ${Math.abs(h) < 48 ? rtf.format(Math.round(h), 'hour') : rtf.format(Math.round(h / 24), 'day')}`; }
}
function mountMarquee(list) {
  const wrap = $('#marquee'), track = $('#marqueeTrack'); if (!wrap || !track) return;
  const seen = new Set(), items = [];
  for (const o of [...list].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))) { if (!seen.has(o.brand)) { seen.add(o.brand); items.push(o); } }
  if (items.length < 6) return;
  const row = k => items.slice(0, 40).map(o => `<button class="mq-item" type="button" data-offer="${o.id}"${k ? ' aria-hidden="true" tabindex="-1"' : ''}>${tile(o)}<span>${esc(o.brand || o.title)}</span></button>`).join('');
  track.innerHTML = row(0) + row(1); wrap.hidden = false;
}

/* ---------------- layers ---------------- */
let lastFocus = null;
function openLayer(html) {
  lastFocus = document.activeElement;
  $('#layer').innerHTML = `<div class="scrim" data-layer-close></div>${html}`;
  document.body.style.overflow = 'hidden';
  ($('#layer [autofocus]') || $('#layer .x-btn') || $('#layer button'))?.focus();
}
function closeLayer() {
  if (!$('#layer').innerHTML) return false;
  $('#layer').innerHTML = ''; document.body.style.overflow = '';
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  return true;
}
const X = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const ARROW = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
const mini = (o, extra = '') => `<button class="mini" type="button" data-offer="${o.id}">${tile(o)}<div><b>${esc(o.title)}</b><span>${esc(o.benefit || o.summary || '')}</span></div>${extra}</button>`;
function openOffer(id) { closeLayer(); app().openOffer?.(Number(id)); }

/* ---------------- ⌘K palette ---------------- */
let pal = { sel: 0, items: [] };
function matches(o, q) { const h = norm([o.title, o.brand, o.benefit, o.summary, o.category, catLabel(o.category), o.verification, (o.tags || []).join(' ')].join(' ')); return norm(q).split(/\s+/).filter(Boolean).every(w => h.includes(w)); }
function openPalette() {
  openLayer(`<div class="palette" role="dialog" aria-modal="true" aria-label="Buscar"><div class="pi"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="palQ" autofocus placeholder="Busca ofertas, marcas o categorías…" autocomplete="off" aria-label="Buscar"><kbd>esc</kbd></div><div class="pl" id="palL" role="listbox"></div><div class="pal-f"><span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span><span><kbd>↵</kbd> abrir</span><span><kbd>esc</kbd> cerrar</span></div></div>`);
  pal.sel = 0; renderPalette('');
}
function renderPalette(q) {
  const offs = (q ? CATALOG.filter(o => matches(o, q)) : [...CATALOG].sort((a, b) => fresh(b) - fresh(a))).slice(0, q ? 8 : 6).map(o => ({ k: 'o', o }));
  const cats = [...new Set(CATALOG.map(o => o.category))].filter(c => q && norm(catLabel(c) + ' ' + c).includes(norm(q))).slice(0, 4).map(c => ({ k: 'c', c }));
  const acts = [['wizard', 'Armar mi lista de beneficios'], ['ai', 'Preguntarle a Nova AI'], ['alert', 'Crear una alerta'], ['saved', 'Ver mis guardadas'], ['radar', 'Ver el radar']].filter(([, l]) => !q || norm(l).includes(norm(q))).map(([a, l]) => ({ k: 'a', a, l }));
  pal.items = [...offs, ...cats, ...acts]; pal.sel = Math.min(pal.sel, Math.max(0, pal.items.length - 1));
  let i = -1;
  const sec = (t, arr, fn) => arr.length ? `<h5>${t}</h5>` + arr.map(x => { i++; return `<button class="sg" type="button" role="option" data-pal="${i}" aria-selected="${i === pal.sel}">${fn(x)}</button>`; }).join('') : '';
  $('#palL').innerHTML = sec('Ofertas', offs, x => `${tile(x.o, 'md')}<div><b>${esc(x.o.title)}</b><span>${esc(x.o.brand)} · ${esc(typeLabel(x.o.offer_type))}</span></div>`) +
    sec('Categorías', cats, x => `<span class="lg md ico">#</span><div><b>${esc(catLabel(x.c))}</b></div>`) +
    sec('Acciones', acts, x => `<span class="lg md ico">→</span><div><b>${esc(x.l)}</b></div>`) || `<p class="muted pad">Sin coincidencias. Prueba con otra palabra o pregúntale a Nova AI.</p>`;
}
function palGo(i) {
  const x = pal.items[i]; if (!x) return; closeLayer();
  if (x.k === 'o') return openOffer(x.o.id);
  if (x.k === 'c') { app().showView?.('discover'); const sel = $('#category'); if (sel) { sel.value = x.c; sel.dispatchEvent(new Event('change')); } $('#results')?.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth' }); return; }
  if (x.a === 'wizard') return openWizard();
  if (x.a === 'ai') return openAI();
  if (x.a === 'alert') return $('#createAlert-header')?.click();
  app().showView?.(x.a);
}

/* ---------------- compare ---------------- */
let compare = [];
function syncCompareButtons() { $$('[data-compare]').forEach(b => b.setAttribute('aria-pressed', compare.includes(Number(b.dataset.compare)))); }
function renderTray() {
  const tray = $('#tray'); if (!tray) return;
  if (!compare.length) { tray.innerHTML = ''; return; }
  const os = compare.map(byId).filter(Boolean);
  tray.innerHTML = `<div class="tray" role="region" aria-label="Comparar ofertas"><span class="stack">${os.map(o => tile(o)).join('')}</span><span class="tray-t">${os.length} para comparar</span><button class="btn-ghost sm" type="button" data-cmp-clear>Vaciar</button><button class="btn-primary sm" type="button" data-cmp-open${os.length < 2 ? ' disabled' : ''}>Comparar</button></div>`;
}
function toggleCompare(id) {
  id = Number(id);
  const i = compare.indexOf(id);
  if (i >= 0) compare.splice(i, 1);
  else if (compare.length >= 3) { app().toast?.('Puedes comparar hasta 3 ofertas'); return; }
  else compare.push(id);
  syncCompareButtons(); renderTray();
}
function openCompare() {
  const os = compare.map(byId).filter(Boolean); if (os.length < 2) return;
  const date = o => fresh(o) ? new Date(fresh(o)).toLocaleDateString('es', { dateStyle: 'medium' }) : 'Pendiente';
  const rows = [
    ['Qué obtienes', o => esc(o.benefit || o.summary || '')],
    ['Tipo', o => esc(typeLabel(o.offer_type))],
    ['Verificación', o => esc(o.verification)],
    ['Países', o => esc((o.countries || []).join(', '))],
    ['Tarjeta', o => o.requires_card === true ? 'Puede requerir' : o.requires_card === false ? '<span class="good">No requiere</span>' : 'Consultar'],
    ['Requisitos', o => (o.requirements || []).slice(0, 3).map(esc).join('<br>') || '—'],
    ['Última comprobación', o => esc(date(o))],
  ];
  openLayer(`<div class="sheet wide" role="dialog" aria-modal="true" aria-labelledby="cmpT"><div class="sheet-head"><h2 id="cmpT">Comparación</h2><button class="x-btn" type="button" data-layer-close aria-label="Cerrar">${X}</button></div>
  <div class="cmp-table"><table><thead><tr><th></th>${os.map(o => `<th><div class="cmp-h">${tile(o, 'md')}<b>${esc(o.title)}</b></div></th>`).join('')}</tr></thead>
  <tbody>${rows.map(([h, f]) => `<tr><th scope="row">${h}</th>${os.map(o => `<td>${f(o)}</td>`).join('')}</tr>`).join('')}
  <tr><th></th>${os.map(o => `<td><button class="btn-secondary sm" type="button" data-offer="${o.id}">Ver ficha</button></td>`).join('')}</tr></tbody></table></div></div>`);
}

/* ---------------- eligibility assistant ---------------- */
const INTERESTS = [
  ['code', 'Programación', ['Development', 'Cloud', 'Hosting', 'AI']],
  ['design', 'Diseño, video y música', ['Design', 'Creative', 'Streaming']],
  ['data', 'Datos, IA e investigación', ['AI', 'Education', 'Productivity']],
  ['sec', 'Ciberseguridad', ['Security', 'Development']],
  ['study', 'Estudiar mejor', ['Education', 'Productivity', 'AI']],
  ['life', 'Ahorro del día a día', ['Entertainment', 'Streaming', 'Shopping', 'Travel', 'Health', 'Finance', 'Hardware', 'Gaming']],
];
const COUNTRIES = [['CO', 'Colombia'], ['MX', 'México'], ['AR', 'Argentina'], ['CL', 'Chile'], ['PE', 'Perú'], ['ES', 'España'], ['US', 'Estados Unidos'], ['OTHER', 'Otro país']];
let wz = null;
function openWizard() {
  // Answers live only in memory (same privacy rule as Mis beneficios): nothing is stored or sent.
  wz = { step: 0, level: null, country: null, interests: new Set(), have: new Set(['email']) };
  renderWizard();
}
function needsFor(o) {
  const v = norm(o.verification);
  if (v === 'none' || v.includes('self')) return 'none';
  if (v.includes('github')) return 'github';
  if (v.includes('institutional')) return 'school';
  if (v.includes('email') && !v.includes('sheerid') && !v.includes('document')) return 'email';
  return 'id';
}
function wizardResults() {
  const cats = new Set(INTERESTS.filter(([k]) => wz.interests.has(k)).flatMap(([, , c]) => c));
  const okCountry = o => { const c = o.countries || []; return c.includes('GLOBAL') || (wz.country !== 'OTHER' && c.includes(wz.country)); };
  const can = o => { const n = needsFor(o); return n === 'none' || n === 'school' || (n === 'email' && wz.have.has('email')) || (n === 'id' && (wz.have.has('id') || wz.have.has('email'))) || (n === 'github' && wz.have.has('github') && (wz.have.has('email') || wz.have.has('id'))); };
  const list = CATALOG.filter(o => okCountry(o) && (!cats.size || cats.has(o.category))).sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || (a.offer_type === 'free' ? -1 : 1));
  return { ready: list.filter(can), needs: list.filter(o => !can(o)) };
}
function renderWizard() {
  const w = wz;
  const prog = `<div class="wz-prog">${[0, 1, 2, 3].map(i => `<i class="${i <= Math.min(w.step, 3) ? 'on' : ''}"></i>`).join('')}</div>`;
  const ch = (key, val, label, sub, on) => `<button class="choice" type="button" data-wz="${key}" data-v="${val}" aria-pressed="${on}"><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
  let body = '', nav = '';
  if (w.step === 0) body = `<h2>¿Qué estudias ahora?</h2><div class="choices">${[['school', 'Colegio', 'Bachillerato o secundaria'], ['uni', 'Universidad', 'Pregrado o tecnología'], ['grad', 'Posgrado', 'Maestría o doctorado'], ['teacher', 'Soy docente', 'Profesor o investigador']].map(([v, l, s]) => ch('level', v, l, s, w.level === v)).join('')}</div>`;
  if (w.step === 1) body = `<h2>¿Dónde estudias?</h2><div class="choices three">${COUNTRIES.map(([v, l]) => ch('country', v, l, '', w.country === v)).join('')}</div>`;
  if (w.step === 2) body = `<div><h2>¿Qué te interesa?</h2><p class="muted">Elige todas las que quieras.</p></div><div class="choices">${INTERESTS.map(([k, l]) => ch('interests', k, l, '', w.interests.has(k))).join('')}</div>`;
  if (w.step === 3) body = `<h2>¿Qué tienes a mano?</h2><div class="choices">${[['email', 'Correo institucional', 'Termina en .edu, .edu.co, etc.'], ['id', 'Carné o certificado', 'De este periodo académico'], ['github', 'Cuenta de GitHub', 'Para el GitHub Student Pack']].map(([v, l, s]) => ch('have', v, l, s, w.have.has(v))).join('')}</div>`;
  if (w.step < 4) {
    const can = (w.step === 0 && w.level) || (w.step === 1 && w.country) || (w.step === 2 && w.interests.size) || w.step === 3;
    nav = `<div class="wz-nav"><button class="btn-ghost" type="button" data-wz-back${w.step === 0 ? ' hidden' : ''}>Atrás</button><span></span><button class="btn-primary" type="button" data-wz-next${can ? '' : ' disabled'}>${w.step === 3 ? 'Ver mis beneficios' : 'Siguiente'} ${ARROW}</button></div>`;
  } else {
    const r = wizardResults();
    body = `<div class="res-top"><div><b>${r.ready.length}</b><span>beneficios que puedes reclamar ya${r.needs.length ? ` · ${r.needs.length} con un paso extra` : ''}</span></div><button class="btn-light sm" type="button" data-wz-save>Guardar todos</button></div>
      <div class="res-list">${r.ready.length ? `<h4>Puedes reclamarlas ya</h4>${r.ready.slice(0, 30).map(o => mini(o, `<span class="tag ${o.offer_type === 'free' ? 'free' : ''}">${esc(typeLabel(o.offer_type))}</span>`)).join('')}` : '<p class="muted">Con estas respuestas no encontramos coincidencias verificadas. Prueba con más intereses o pregúntale a Nova AI.</p>'}
      ${r.needs.length ? `<h4>Necesitas un paso extra</h4>${r.needs.slice(0, 12).map(o => mini(o, `<span class="tag line">${esc(o.verification)}</span>`)).join('')}` : ''}</div>`;
    nav = `<div class="wz-nav"><button class="btn-ghost" type="button" data-wz-redo>Volver a empezar</button><span></span><button class="btn-primary" type="button" data-wz-save>Guardar en mis guardadas</button></div>`;
  }
  const html = `<div class="sheet wz" role="dialog" aria-modal="true" aria-labelledby="wzT"><div class="sheet-head"><div class="wz-top"><span class="eyebrow" id="wzT">Tu lista de beneficios${w.step < 4 ? ` · ${w.step + 1}/4` : ''}</span>${prog}</div><button class="x-btn" type="button" data-layer-close aria-label="Cerrar">${X}</button></div><div class="wz-body">${body}</div>${nav}</div>`;
  if ($('#layer .wz')) { $('#layer .wz').outerHTML = html; $('#layer .wz .choice, #layer .wz [data-wz-next]')?.focus(); } else openLayer(html);
}

/* ---------------- Nova AI helpers ---------------- */
function openAI(prompt) {
  const panel = $('#nova-ai-panel');
  if (panel && panel.style.display !== 'flex') $('#nova-ai-fab')?.click();
  if (prompt) { const input = $('#nova-ai-input'); input.value = prompt; $('#nova-ai-form').requestSubmit(); }
}
function mountAISuggestions() {
  const box = $('#nova-ai-suggest'); if (!box) return;
  const ideas = ['Estudio ingeniería en Colombia, ¿qué IA gratis tengo?', '¿Qué créditos cloud no piden tarjeta?', 'Software de diseño gratis para estudiantes', '¿Qué necesito para el GitHub Student Pack?'];
  box.innerHTML = ideas.map(t => `<button type="button" data-ai="${esc(t)}">${esc(t)}</button>`).join('');
}

/* ---------------- events ---------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-offer],[data-compare],[data-cmp-open],[data-cmp-clear],[data-layer-close],[data-open-wizard],[data-pal],[data-wz],[data-wz-next],[data-wz-back],[data-wz-redo],[data-wz-save],[data-ai],[data-tab-view],#openPalette,#openWizard,#askNova');
  if (!el) return;
  if (el.matches('[data-compare]')) { e.stopPropagation(); toggleCompare(el.dataset.compare); return; }
  if (el.matches('[data-offer]')) return openOffer(el.dataset.offer);
  if (el.matches('[data-cmp-open]')) return openCompare();
  if (el.matches('[data-cmp-clear]')) { compare = []; syncCompareButtons(); renderTray(); return; }
  if (el.matches('[data-layer-close]')) return closeLayer();
  if (el.matches('[data-open-wizard],#openWizard')) return openWizard();
  if (el.matches('#openPalette')) return openPalette();
  if (el.matches('#askNova')) return openAI();
  if (el.matches('[data-ai]')) return openAI(el.dataset.ai);
  if (el.matches('[data-pal]')) return palGo(Number(el.dataset.pal));
  if (el.matches('[data-tab-view]')) { app().showView?.(el.dataset.tabView); $$('.tabbar [data-tab-view]').forEach(b => b.toggleAttribute('aria-current', b === el)); window.scrollTo(0, 0); return; }
  if (el.matches('[data-wz]')) {
    const k = el.dataset.wz, v = el.dataset.v;
    if (k === 'level' || k === 'country') { wz[k] = v; wz.step++; } else { wz[k].has(v) ? wz[k].delete(v) : wz[k].add(v); }
    return renderWizard();
  }
  if (el.matches('[data-wz-next]')) { wz.step++; return renderWizard(); }
  if (el.matches('[data-wz-back]')) { wz.step = Math.max(0, wz.step - 1); return renderWizard(); }
  if (el.matches('[data-wz-redo]')) { wz.step = 0; return renderWizard(); }
  if (el.matches('[data-wz-save]')) {
    const ids = wizardResults().ready.map(o => o.id);
    Promise.resolve(app().saveMany?.(ids)).then(n => { closeLayer(); app().toast?.(`${n || 0} ofertas nuevas en tus guardadas`, 'success'); app().showView?.('saved'); });
  }
}, true);
document.addEventListener('input', e => { if (e.target.id === 'palQ') { pal.sel = 0; renderPalette(e.target.value); } });
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#palQ') ? closeLayer() : openPalette(); return; }
  if (e.key === '/' && !typing) { e.preventDefault(); openPalette(); return; }
  if (e.key === 'Escape' && closeLayer()) { e.stopImmediatePropagation(); return; }
  if ($('#palQ') && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
    e.preventDefault(); if (e.key === 'Enter') return palGo(pal.sel);
    pal.sel = (pal.sel + (e.key === 'ArrowDown' ? 1 : -1) + pal.items.length) % Math.max(1, pal.items.length);
    $$('#palL .sg').forEach((b, i) => b.setAttribute('aria-selected', i === pal.sel)); $$('#palL .sg')[pal.sel]?.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'Tab' && $('#layer .sheet, #layer .palette')) {
    const f = $$('#layer button:not([disabled]), #layer input, #layer a').filter(x => x.offsetParent !== null); if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
}, true);
// Keep the mobile tab bar in sync with the desktop nav.
document.addEventListener('click', e => { const b = e.target.closest('.nav-btn'); if (b) $$('.tabbar [data-tab-view]').forEach(x => x.toggleAttribute('aria-current', x.dataset.tabView === b.dataset.view)); });
// Spotlight that follows the cursor on cards.
document.addEventListener('pointermove', e => { const c = e.target.closest?.('.card'); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px'); }, { passive: true });
// Re-apply compare state whenever app.js re-renders cards.
new MutationObserver(() => compare.length && syncCompareButtons()).observe(document.body, { childList: true, subtree: true });

/* ---------------- boot ---------------- */
mountAISuggestions();
catalogReady.then(list => { mountScope(list); mountMarquee(list); scheduleHydrate(); });
scheduleHydrate();
