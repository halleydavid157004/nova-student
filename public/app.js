import {effectiveOfferType,verificationInfo} from './search/quality.js';
import {highlights} from './search/highlights.js';
import {genericSummary} from './search/engine.js';
import {logoDomain} from './search/logos.js';
/**
 * Nova Student Radar — Frontend App
 * Rewritten for full functionality & premium UX
 */

/* ============================================
   UTILIDADES
   ============================================ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const safeUrl = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : '#'; } catch { return '#'; } };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[c]));

// Códigos ISO (para el selector de país)
const ISO_CODES = [
  'AW','AF','AO','AI','AX','AL','AD','AE','AR','AM','AS','AQ','TF','AG','AU','AT','AZ',
  'BI','BE','BJ','BQ','BF','BD','BG','BH','BS','BA','BL','BY','BZ','BM','BO','BR','BB',
  'BN','BT','BV','BW','CF','CA','CC','CH','CL','CN','CI','CM','CD','CG','CK','CO','KM',
  'CV','CR','CU','CW','CX','KY','CY','CZ','DE','DJ','DM','DK','DO','DZ','EC','EG','ER',
  'EH','ES','EE','ET','FI','FJ','FK','FR','FO','FM','GA','GB','GE','GG','GH','GI','GN',
  'GP','GM','GW','GQ','GR','GD','GL','GT','GF','GU','GY','HK','HM','HN','HR','HT','HU',
  'ID','IM','IN','IO','IE','IR','IQ','IS','IL','IT','JM','JE','JO','JP','KZ','KE','KG',
  'KH','KI','KN','KR','KW','LA','LB','LR','LY','LC','LI','LK','LS','LT','LU','LV','MO',
  'MF','MA','MC','MD','MG','MV','MX','MH','MK','ML','MT','MM','ME','MN','MP','MZ','MR',
  'MS','MQ','MU','MW','MY','YT','NA','NC','NE','NF','NG','NI','NU','NL','NO','NP','NR',
  'NZ','OM','PK','PA','PN','PE','PH','PW','PG','PL','PR','KP','PT','PY','PS','PF','QA',
  'RE','RO','RU','RW','SA','SD','SN','SG','GS','SH','SJ','SB','SL','SV','SM','SO','PM',
  'RS','SS','ST','SR','SK','SI','SE','SZ','SX','SC','SY','TC','TD','TG','TH','TJ','TK',
  'TM','TL','TO','TT','TN','TR','TV','TW','TZ','UG','UA','UM','UY','US','UZ','VA','VC',
  'VE','VG','VI','VN','VU','WF','WS','YE','ZA','ZM','ZW'
];

const regionNames=new Intl.DisplayNames(['es'],{type:'region'});
const regionLabel=code=>code==='GLOBAL'?'Global':ISO_CODES.includes(code)?regionNames.of(code):'Países por confirmar';

/* ============================================
   ESTADO
   ============================================ */
let accountClient=null,accountSyncing=false;
let offers = [];
let saved = new Set();
try { saved = new Set(JSON.parse(localStorage.getItem('nova-saved-offers') || '[]').filter(Number.isInteger)); } catch { localStorage.removeItem('nova-saved-offers'); }
let currentView = 'discover';
let isListView = false;
let visibleCount = 48;

/* ============================================
   TOAST
   ============================================ */
let toastTimer = null;
function toast(msg, type = 'default') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show';
  if (type === 'success') el.style.background = '#15803d';
  else if (type === 'error') el.style.background = '#dc2626';
  else el.style.background = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ============================================
   API
   ============================================ */
async function apiFetch(url, opts = {}) {
  const r = await fetch(url, opts);
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error || `Error ${r.status}`),{status:r.status});
  return j;
}

/* ============================================
   TEMA
   ============================================ */
function initTheme() {
  const saved = localStorage.getItem('nova-theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark');
  }
  document.documentElement.classList.remove('pre-dark');
}

$('#theme-toggle').addEventListener('click', () => {
  document.documentElement.classList.remove('pre-dark');
  document.body.classList.toggle('dark');
  localStorage.setItem('nova-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

/* ============================================
   INICIALIZACIÓN DE SELECTORES
   ============================================ */
function loadCountries() {
  let dn;
  try { dn = new Intl.DisplayNames([navigator.language || 'es', 'es'], { type: 'region' }); } catch { dn = new Intl.DisplayNames(['es'], { type: 'region' }); }
  const sel = $('#country');
  ISO_CODES
    .map(code => [code, dn.of(code) || code])
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([code, name]) => {
      sel.insertAdjacentHTML('beforeend', `<option value="${code}">${esc(name)}</option>`);
    });
}

async function loadMeta() {
  try {
    const m = await apiFetch('/api/meta');
    Object.assign(categoryMeta, m.categoryMeta || {});
    m.categories.forEach(v => {
      $('#category').insertAdjacentHTML('beforeend', `<option value="${esc(v)}">${esc(categoryMeta[v]?.label || v)}</option>`);
    });
    m.verifications.forEach(v => {
      $('#verification').insertAdjacentHTML('beforeend', `<option value="${esc(v)}">${esc(verLabel(v))}</option>`);
    });
  } catch (e) {
    console.error('loadMeta error:', e);
  }
}

async function loadStats() {
  try {
    const s = await apiFetch('/api/stats');
    animateNumber('#sOffers', s.total);
    animateNumber('#sSources', s.sources);
    animateNumber('#sFresh', s.fresh);
    animateNumber('#sEvents', s.events);
  } catch (e) {
    console.error('loadStats error:', e);
  }
}

function animateNumber(sel, target) {
  const el = $(sel);
  if (!el) return;
  const start = 0;
  const duration = 800;
  const startTime = performance.now();
  const update = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (target - start) * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

/* ============================================
   BADGE HELPERS
   ============================================ */
function badgeClass(type) {
  return { free: 'badge-free', discount: 'badge-discount', credits: 'badge-credits', bundle: 'badge-bundle' }[type] || 'badge-default';
}

function badgeLabel(type) {
  return { free: 'Gratis', discount: 'Descuento', credits: 'Créditos', bundle: 'Pack' }[type] || 'Beneficio';
}

/* ============================================
   TARJETA DE OFERTA
   ============================================ */
const brandDomain = o => logoDomain(o);
const brandHue = name => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
// Monogram first; premium.js swaps in the brand logo (Simple Icons, then the site icon) when available.
function logoTile(o, size = '') {
  const brand = o.brand || o.title || '?';
  const words = String(brand).replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
  return `<span class="lg mg ${size}" data-brand="${esc(brand)}" data-domain="${esc(brandDomain(o))}" style="--h:${brandHue(brand)}" aria-hidden="true">${esc(initials)}</span>`;
}
const catLabel = key => categoryMeta[key]?.label || key || '';
const VERIFICATION_LABELS = {'None':'Sin verificación','Educational email':'Correo educativo','Institutional':'Licencia institucional','Self-enrollment':'Inscripción libre','Education verification':'Verificación educativa','GitHub Education':'GitHub Education','SheerID':'SheerID','ISIC verification':'Carné ISIC'};
const verLabel = v => String(v || '').split(' / ').map(x => VERIFICATION_LABELS[x] || x.replace('Educational email','Correo educativo').replace('documents','documentos').replace('Self-declaration','autodeclaración')).join(' / ');
const verifiedStamp = o => { const v = Date.parse(o.liveness_verified_at || o.verified_at); return Number.isFinite(v) ? new Date(v) : null; };

// One line that says what the product is; scraped boilerplate and repeats of the benefit are dropped.
const genericTitle = t => /beneficios? para estudiantes|student (discount|offer|benefit)s?$/i.test(String(t || ''));
function cardDescription(o) {
  const benefit = String(o.benefit || '').trim();
  for (const text of [o.summary, genericTitle(o.title) ? '' : o.title]) {
    const value = String(text || '').trim();
    if (value && !genericSummary(value) && value !== benefit && !benefit.startsWith(value.slice(0, 40))) return value;
  }
  return '';
}
const SHORT_CAT = {Development:'Desarrollo',Cloud:'Cloud',Design:'Diseño',Creative:'Creativo',Productivity:'Productividad',AI:'IA',Entertainment:'Entretenimiento',Education:'Educación',Finance:'Finanzas',Hardware:'Hardware',Security:'Seguridad',Hosting:'Hosting',Streaming:'Streaming',Shopping:'Compras',Travel:'Viajes',Health:'Salud',Gaming:'Gaming'};
const placesLabel = o => { const places = (o.countries || []).map(regionLabel); return places.length > 2 ? places.slice(0, 2).join(', ') + ' +' + (places.length - 2) : places.join(', ') || 'Países por confirmar'; };
const PIN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const OUT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

function renderCard(o) {
  o={...o,offer_type:effectiveOfferType(o)};
  const isSaved = saved.has(o.id);
  const selectedCountry=$('#country')?.value || 'ALL';
  const foreign=selectedCountry!=='ALL'&&!(o.countries||[]).includes('GLOBAL')&&!(o.countries||[]).includes(selectedCountry);
  const stamp = verifiedStamp(o);
  const top = highlights(o).find(h => h.key !== 'hot');
  const desc = cardDescription(o);
  const benefit = o.benefit || o.summary || '';
  return `
    <article class="card offer-card" data-id="${o.id}" role="listitem" tabindex="0" aria-label="${esc(o.brand || o.title)}: ${esc(benefit)}">
      <div class="oc-top">
        <div class="brandmark">${logoTile(o)}</div>
        <div class="oc-head">
          <h3 title="${esc(o.title)}">${esc(o.brand || o.title)}</h3>
          <div class="oc-tags">
            ${top ? `<span class="oc-tag hot hl-${esc(top.key)}" title="${esc(top.reason)}">${esc(top.label)}</span>` : ''}
            <span class="oc-tag">${esc(SHORT_CAT[o.category] || catLabel(o.category))}</span>
            <span class="oc-tag t-${esc(o.offer_type || 'other')}">${badgeLabel(o.offer_type)}</span>
          </div>
        </div>
        <button class="save-btn ${isSaved ? 'saved' : ''}" data-save="${o.id}" aria-label="${isSaved ? 'Quitar de guardadas' : 'Guardar oferta'}" title="${isSaved ? 'Quitar de guardadas' : 'Guardar'}">${isSaved ? '♥' : '♡'}</button>
      </div>
      <p class="oc-benefit t-${esc(o.offer_type || 'other')}"><span>${esc(benefit)}</span></p>
      ${desc ? `<p class="oc-desc">${esc(desc)}</p>` : ''}
      <a class="oc-cta" href="${esc(safeUrl(o.source_url))}" target="_blank" rel="noopener noreferrer" data-claim="${o.id}">Obtener beneficio ${OUT}</a>
      <div class="oc-foot">
        <span class="oc-place" title="${esc((o.countries || []).map(regionLabel).join(', '))}">${PIN}${esc(placesLabel(o))}</span>
        ${foreign ? '<span class="oc-warn" title="Comprueba si puedes reclamarla desde tu país">Otro país</span>' : ''}
        <span class="oc-date">${stamp ? `${esc(verificationInfo(o).label)} <time datetime="${esc(stamp.toISOString())}">${esc(stamp.toLocaleDateString('es', { day: 'numeric', month: 'short' }))}</time>` : ''}</span>
        <button class="cmp-btn" type="button" data-compare="${o.id}" aria-pressed="false" aria-label="Comparar ${esc(o.brand || o.title)}" title="Comparar"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M12 2v20"/></svg></button>
        <button class="oc-more" type="button" data-details="${o.id}">Detalles</button>
      </div>
    </article>`;
}

/* ============================================
   RENDER DE LISTA
   ============================================ */
function render(list, targetSel = '#grid', isSavedView = false) {
  const el = $(targetSel);
  if (!el) return;

  if (isListView) el.classList.add('list-view');
  else el.classList.remove('list-view');

  if (list.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          <line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
        <strong>${isSavedView ? 'No tienes ofertas guardadas' : 'Sin resultados'}</strong>
        <p>${isSavedView ? 'Guarda ofertas con el botón ♡ para encontrarlas aquí.' : 'Prueba con otros filtros o términos de búsqueda.'}</p>
      </div>`;
  } else {
    el.innerHTML = (isSavedView ? list : list.slice(0, visibleCount)).map(renderCard).join('');
  }

  if (!isSavedView) {
    offers = list;
    const more = $('#loadMore');
    if (more) more.hidden = list.length <= visibleCount;
    const countEl = $('#count');
    if (countEl) {
      countEl.textContent = list.length
        ? `${list.length.toLocaleString()} resultado${list.length !== 1 ? 's' : ''}`
        : '';
    }
  }

  bindCards(el);
  updateSavedBadge();
}

/* ============================================
   EVENTOS DE TARJETAS
   ============================================ */
function bindCards(root) {
  // Click en tarjeta → abrir detalle
  root.querySelectorAll('.card').forEach(c => {
    c.addEventListener('click', e => {
      if (e.target.closest('.save-btn, .cmp-btn, .oc-cta')) return;
      openOffer(Number(c.dataset.id));
    });
    c.addEventListener('keydown', e => {
      if (e.target===c&&(e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        openOffer(Number(c.dataset.id));
      }
    });
  });

  // Botón guardar / quitar
  root.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.save);
      if(accountSyncing){toast('Espera a que termine la sincronización de favoritos.');return;}
      try {
        if(accountClient){btn.disabled=true;await accountClient.favorite(id,!saved.has(id));}
        if (saved.has(id)) {
          saved.delete(id);
          btn.textContent = '♡';
          btn.classList.remove('saved');
          btn.setAttribute('aria-label', 'Guardar oferta');
          toast('Oferta eliminada de guardadas');
        } else {
          saved.add(id);
          btn.textContent = '♥';
          btn.classList.add('saved');
          btn.setAttribute('aria-label', 'Quitar de guardadas');
          toast('Oferta guardada ✓', 'success');
        }
        if(!accountClient)localStorage.setItem('nova-saved-offers', JSON.stringify([...saved]));
        updateSavedBadge();
        if (currentView === 'saved') await loadSaved();
      } catch {
        toast('No se pudo confirmar el cambio. Tus favoritos se conservan.', 'error');
      }finally{btn.disabled=false;}
    });
  });
}

function updateSavedBadge() {
  const badge = $('#savedCount');
  if (!badge) return;
  if (saved.size > 0) {
    badge.textContent = saved.size;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

/* ============================================
   BÚSQUEDA PRINCIPAL
   ============================================ */
let searchDebounce = null;
let searchGeneration = 0;

async function search() {
  const generation = ++searchGeneration;
  const skeleton = $('#loadingSkeleton');
  const grid = $('#grid');
  if (grid) grid.setAttribute('aria-busy', 'true');

  const q = $('#q').value.trim();
  syncCatalogControls();
  const country = $('#country').value;
  const category = $('#category').value;
  const verification = $('#verification').value;

  const params = new URLSearchParams({ q, country, category, verification, email:$('#emailRequirement').value,week:String($('#verifiedWeek').checked),cross:String($('#crossCountry').checked),limit: '500' });

  try {
    let [{ offers: list, suggestions=[],gap_topics=[] }, { sources }] = await Promise.all([
      apiFetch('/api/offers?' + params),
      q ? apiFetch('/api/sources?q=' + encodeURIComponent(q)) : Promise.resolve({ sources: [] })
    ]);
    if (generation !== searchGeneration) return;

    // Client-side quick-tabs filtering
    if (currentTab === 'recent') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 14); // Consider recent as last 14 days
      list = list.filter(o => new Date(o.updated_at || o.created_at || Date.now()) >= weekAgo);
    } else if (currentTab === 'hot') {
      list = list.filter(o => highlights(o).some(h=>h.key==='hot'||h.key==='imperdible'));
    } else if (currentTab === 'imperdible') {
      list = list.filter(o => highlights(o).some(h=>h.key==='imperdible'));
    } else if (currentTab === 'expiring') {
      list = list.filter(o => highlights(o).some(h=>h.key==='expiring'));
    }

    if (skeleton) skeleton.style.display = 'none';
    grid?.removeAttribute('aria-busy');

    const titleEl = $('#resultTitle');
    if (titleEl) {
      const cat = category !== 'ALL' ? catLabel(category) : '';
      titleEl.textContent = q ? `Resultados para "${q}"${cat ? ' en ' + cat : ''}` : cat || 'Todas las ofertas';
    }

    visibleCount = 48;
    render(list);
    let hints=$('#searchHints');if(!hints){hints=document.createElement('div');hints.id='searchHints';$('#resultTitle').after(hints);}
    hints.replaceChildren();
    if(!list.length){const button=document.createElement('button');button.className='btn-ghost';button.textContent='Quitar búsqueda y filtros';button.addEventListener('click',()=>$('#clear').click());hints.append(button);}
    if(!list.length&&category!=='ALL'){const button=document.createElement('button');button.className='btn-secondary';button.textContent='Buscar en todas las categorías';button.addEventListener('click',()=>setCategory('ALL'));hints.append(button);}
    if(!list.length&&q){for(const term of suggestions){const button=document.createElement('button');button.className='btn-ghost';button.textContent='Buscar '+term;button.addEventListener('click',()=>{$('#q').value=term;search();});hints.append(button);}
      if(gap_topics.length)apiFetch('/api/search-gap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topics:gap_topics})}).catch(()=>{});
    }

    // Descubrimientos sin verificar
    const knownUrls = new Set(list.map(o => o.source_url));
    const unverified = (q ? sources.filter(s => !knownUrls.has(s.url) && !s.official) : []).slice(0, 12);

    const wrap = $('#discoveriesWrap');
    if (wrap) {
      wrap.hidden = unverified.length === 0;
      const countEl = $('#discoveryCount');
      if (countEl) countEl.textContent = `${unverified.length} pistas`;
      const list2 = $('#discoveryList');
      if (list2) {
        list2.innerHTML = unverified.map(s => `
          <div class="source-row">
            <a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">
              <strong>${esc(s.name)}</strong>
              <small>${esc(s.domain)} · ${esc(s.category)}</small>
              <div class="discovery-note">Pista del radar. Verifica siempre en la fuente oficial antes de usarla.</div>
            </a>
            <span class="source-state">Por verificar</span>
          </div>`).join('');
      }
    }
  } catch (e) {
    if (generation !== searchGeneration) return;
    if (skeleton) skeleton.style.display = 'none';
    const grid = $('#grid');
    if (grid) grid.innerHTML = `<div class="empty-state"><strong>Error al cargar</strong><p>${esc(e.message)}</p></div>`;
  }
}

function triggerSearch() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(search, 200);
}

/* ============================================
   MODAL: DETALLE DE OFERTA
   ============================================ */
async function openOffer(id) {
  const modal = $('#modal');
  const content = $('#modalContent');

  try {
    const { offer: o } = await apiFetch(`/api/offers/${id}`);
    const stamp = verifiedStamp(o);
    const evidence = o.evidence || o.source_excerpt;
    const isSaved = saved.has(o.id);
    content.innerHTML = `
      <div class="offer-detail-header" style="--h:${brandHue(o.brand || o.title)}">
        <div class="od-head">
          <div class="offer-detail-brandmark">${logoTile(o, 'xl')}</div>
          <div class="od-title">
            <div class="modal-kicker">${esc(o.brand)} · ${esc(catLabel(o.category))}</div>
            <h2 class="offer-detail-title" id="modalTitle">${esc(o.title)}</h2>
            <div class="od-badges"><span class="badge ${badgeClass(o.offer_type)}">${badgeLabel(o.offer_type)}</span>${highlights(o).map(h=>`<span class="meta-tag hl-${esc(h.key)}" title="${esc(h.reason)}">${esc(h.label)}</span>`).join('')}${o.official ? '<span class="meta-tag official">✓ Fuente oficial</span>' : ''}</div>
          </div>
        </div>
        ${o.summary ? `<p class="offer-detail-summary">${esc(o.summary)}</p>` : ''}
        <div class="od-actions">
          <a class="source-cta" href="${esc(safeUrl(o.source_url))}" target="_blank" rel="noopener noreferrer">
            ${o.official ? 'Ir a la fuente oficial' : 'Ver fuente para verificar la oferta'}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>
          </a>
          <button class="save-btn od-save ${isSaved ? 'saved' : ''}" type="button" data-save="${o.id}" aria-label="${isSaved ? 'Quitar de guardadas' : 'Guardar oferta'}">${isSaved ? '♥' : '♡'}</button>
          <button class="btn-ghost" type="button" data-compare="${o.id}" aria-pressed="false">Comparar</button>
          <button class="btn-ghost" type="button" data-share="${o.id}">Copiar enlace</button>
        </div>
      </div>

      <div class="od-grid">
        <div class="od-main">
          <div class="offer-section">
            <h3>Qué obtienes</h3>
            <div class="benefit-highlight">${esc(o.benefit)}</div>
          </div>
          ${o.requirements?.length ? `
          <div class="offer-section">
            <h3>Requisitos</h3>
            ${o.requirements.map(r => `<div class="requirement-item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>${esc(r)}</div>`).join('')}
          </div>` : ''}
          ${o.steps?.length ? `
          <div class="offer-section">
            <h3>Cómo obtenerla</h3>
            <ol class="steps-list">${o.steps.map(st => `<li>${esc(st)}</li>`).join('')}</ol>
          </div>` : ''}
          <div class="offer-section"><h3>Acceso desde otros países</h3><p>Comprueba residencia, matrícula y método de verificación en los requisitos y la fuente. Una VPN no sustituye esos requisitos; utiliza solo métodos expresamente permitidos por el proveedor.</p></div>
          ${o.liveness_verified_at && evidence ? `<div class="offer-section" id="offerEvidence"><h3>Evidencia de la última verificación</h3><blockquote>${esc(evidence)}</blockquote></div>` : ''}
        </div>
        <aside class="od-side">
          <dl class="facts">
            <div><dt>Verificación</dt><dd>${esc(verLabel(o.verification))}</dd></div>
            <div><dt>Tarjeta</dt><dd>${o.requires_card===true ? 'Puede requerir' : o.requires_card===false ? 'No requiere' : 'Consultar fuente'}</dd></div>
            <div><dt>${esc(verificationInfo(o).label)}</dt><dd>${stamp ? esc(stamp.toLocaleDateString('es', { dateStyle: 'medium' })) : 'Pendiente'}</dd></div>
            <div><dt>Estado</dt><dd>${o.liveness_status && o.liveness_status !== 'active' ? 'Necesita revisión' : 'Activa'}</dd></div>
            <div><dt>Países</dt><dd>${esc((o.countries || []).map(regionLabel).join(', ') || 'Por confirmar')}</dd></div>
            ${o.expires_at ? `<div><dt>Vence</dt><dd>${esc(new Date(o.expires_at).toLocaleDateString('es', { dateStyle: 'medium' }))}</dd></div>` : ''}
          </dl>
          <form id="offerReportForm" class="offer-section report-box"><label for="offerReportReason">¿Qué ocurrió al intentar reclamarla?</label>
            <select id="offerReportReason"><option value="worked">Me funcionó</option><option value="expired">La oferta terminó</option><option value="changed">Las condiciones cambiaron</option><option value="broken">El enlace no funciona</option></select>
            <button class="btn-secondary" type="submit">Enviar reporte</button>
          </form>
        </aside>
      </div>`;
    bindCards(content);
    content.querySelector('[data-share]')?.addEventListener('click', async () => {
      const link = `${location.origin}/?offer=${o.id}`;
      try { await navigator.clipboard.writeText(link); toast('Enlace copiado', 'success'); } catch { toast(link); }
    });

    $('#offerReportForm').addEventListener('submit',async event=>{
      event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
      try{await apiFetch(`/api/offers/${id}/reports`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:$('#offerReportReason').value})});toast('Gracias. Tu reporte se tendrá en cuenta en la revisión.','success');}
      catch{toast('No se pudo enviar el reporte. Intenta más tarde.','error');}
      finally{button.disabled=false;}
    });
    modal.removeAttribute('hidden');
    modal.querySelector('.modal-panel')?.focus();
    document.body.style.overflow = 'hidden';
  } catch (e) {
    toast('Error al cargar la oferta', 'error');
  }
}

function closeModal() {
  $('#modal').setAttribute('hidden', '');
  document.body.style.overflow = '';
}

// Eventos de cierre del modal de detalle
$$('[data-close]').forEach(el => el.addEventListener('click', closeModal));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('#modal').hasAttribute('hidden')) closeModal();
    if (!$('#alertModal').hasAttribute('hidden')) closeAlertModal();
  }
});

/* ============================================
   MODAL: ALERTA
   ============================================ */
function openAlertModal() {
  const form = $('#alertForm');
  const q = $('#q').value;
  const country = $('#country').value;
  const category = $('#category').value;
  const verification = $('#verification').value;

  if (q) $('#alertQuery').value = q;
  if (country !== 'ALL') {
    const sel = $('#alertCountry');
    if (sel) {
      const opt = [...sel.options].find(o => o.value === country);
      if (opt) sel.value = country;
    }
  }
  if (category !== 'ALL') {
    const catInput = form.querySelector('[name=category]');
    if (catInput) catInput.value = category;
  }
  if (verification !== 'ALL') {
    const verInput = form.querySelector('[name=verification]');
    if (verInput) verInput.value = verification;
  }

  $('#alertStatus').textContent = '';
  $('#alertStatus').className = '';
  $('#alertModal').removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#alertEmail')?.focus(), 100);
}

function closeAlertModal() {
  $('#alertModal').setAttribute('hidden', '');
  document.body.style.overflow = '';
}

$$('[data-close-alert]').forEach(el => el.addEventListener('click', closeAlertModal));

// Handlers de abrir alerta
['#createAlert', '#createAlert-header', '#alertCta'].forEach(sel => {
  const el = $(sel);
  if (el) el.addEventListener('click', openAlertModal);
});

// Envío del formulario de alerta
$('#alertForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#alertSubmitBtn');
  const status = $('#alertStatus');

  btn.disabled = true;
  btn.textContent = 'Guardando…';

  const data = Object.fromEntries(new FormData(e.currentTarget));
  data.consent=$('#alertConsent')?.checked===true;
  data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota';

  try {
    const result = await apiFetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    status.textContent = !data.consent
      ? '✓ Alerta guardada sin activar correo. Puedes solicitar confirmación autorizando el envío.'
      : result.deliveryConfigured === false
      ? '✓ Alerta guardada. Los envíos por correo están pendientes de configuración.'
      : '✓ Alerta guardada. Si corresponde, recibirás un enlace para confirmar. Las solicitudes repetidas se limitan a una por día.';
    status.className = 'success';
    toast(!data.consent ? 'Búsqueda guardada sin correo' : result.deliveryConfigured === false ? 'Alerta guardada; correo pendiente' : 'Solicitud de alerta guardada', 'success');
    setTimeout(() => closeAlertModal(), 1400);
  } catch (err) {
    status.textContent = '✗ ' + err.message;
    status.className = '';
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Guardar alerta`;
  }
});

/* ============================================
   VISTA: GUARDADAS
   ============================================ */
async function loadSaved() {
  try {
    const results = await Promise.allSettled([...saved].map(id => apiFetch(`/api/offers/${id}`)));
    const list = results.filter(x => x.status === 'fulfilled').map(x => x.value.offer);
    if(!accountClient){const previous=[...saved];for(let i=0;i<results.length;i++)if(results[i].status==='rejected'&&results[i].reason.status===404)saved.delete(previous[i]);localStorage.setItem('nova-saved-offers', JSON.stringify([...saved]));}
    render(list, '#savedGrid', true);
    updateSavedBadge();
  } catch (e) {
    console.error('loadSaved error:', e);
  }
}

/* ============================================
   VISTA: RADAR
   ============================================ */
let allSources = [];
let allEvents = [];
let radarSources = [];
let sourceVisibleCount = 80;

function renderRadarSchedule(worker) {
  const panel = $('#radarSchedule');
  if (!panel) return;
  if (!worker?.brave) { panel.innerHTML = '<p>Estado del radar temporalmente no disponible.</p>'; return; }
  const brave = worker.brave;
  const labels = {authentication: 'Revisar conexión', quota: 'Cuota alcanzada', rate_limited: 'Pausa temporal',
    upstream: 'Proveedor no disponible', network: 'Sin respuesta', storage: 'Guardado pendiente', invalid_response: 'Respuesta no válida'};
  let state = !worker.enabled ? 'Pausado' : !brave.enabled ? 'Sin conectar'
    : worker.scanning || brave.running ? 'Buscando oportunidades' : brave.lastError ? labels[brave.lastError] || 'Revisar conexión'
    : brave.budget?.remaining === 0 ? 'Límite mensual alcanzado' : 'Programado cada 6 horas';
  const date = value => value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('es-CO', {dateStyle: 'short', timeStyle: 'short'}) : 'Pendiente';
  panel.innerHTML = `<div><span class="radar-schedule-label">${worker.engine==='actions'?'RADAR · GITHUB ACTIONS':'BRAVE SEARCH'}</span><strong>${esc(state)}</strong></div>
    <div><span class="radar-schedule-label">ÚLTIMA BÚSQUEDA</span><strong>${esc(date(brave.lastCompletedAt))}</strong></div>
    <div><span class="radar-schedule-label">PRÓXIMA VENTANA</span><strong>${esc(date(brave.nextRunAt))}</strong></div>
    <p>Hasta 4 búsquedas por ciclo. Las pistas nuevas se revisan antes de aparecer en el catálogo.</p>`;
}

async function loadRadar() {
  try {
    const [{ sources }, { events }, status] = await Promise.all([
      apiFetch('/api/sources?limit=1000'),
      apiFetch('/api/events'),
      apiFetch('/api/worker-status').catch(() => null)
    ]);
    allSources = sources;
    allEvents = events;
    renderRadarSchedule(status?.worker);
    renderRadar(sources, events);
  } catch (e) {
    console.error('loadRadar error:', e);
  }
}

function renderRadar(sources, events, reset = true) {
  if (reset) sourceVisibleCount = 80;
  radarSources = sources;
  const radarCount = $('#radarCount');
  if (radarCount) radarCount.textContent = `${sources.length} fuentes`;

  // Lista de fuentes
  const sourceList = $('#sourceList');
  if (sourceList) {
    sourceList.innerHTML = sources.length
      ? sources.slice(0, sourceVisibleCount).map(s => {
          const restricted = s.last_error === 'Blocked by robots.txt' || /HTTP (401|403|429)/.test(s.last_error || '');
          const missing = [404, 410].includes(s.last_status);
          const stateClass = restricted || missing ? 'warn' : s.last_error ? 'err' : s.last_status ? 'ok' : '';
          const stateLabel = s.last_error === 'Blocked by robots.txt' ? 'Rastreo no permitido'
            : /HTTP (401|403)/.test(s.last_error || '') ? 'Acceso restringido'
            : /HTTP 429/.test(s.last_error || '') ? 'Pausa temporal'
            : s.last_error ? 'Sin respuesta' : missing ? 'No disponible'
            : s.last_status ? 'Comprobada' : 'Pendiente';
          return `
            <div class="source-row">
              <div>
                <strong><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a></strong>
                <small>${esc(s.domain)} · ${s.official ? '✓ Oficial' : 'Pista por verificar'} · ${esc(s.category)}${s.discovered_via ? ` · vía ${esc(s.discovered_via)}` : ''}</small>
                ${s.last_checked_at ? `<small>Última comprobación: ${new Date(s.last_checked_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</small>` : ''}
              </div>
              <span class="source-state ${stateClass}">${esc(stateLabel)}</span>
            </div>`;
        }).join('')
      : '<div class="empty-state"><p>Sin fuentes todavía.</p></div>';
  }
  const more = $('#sourceMore');
  if (more) more.hidden = sources.length <= sourceVisibleCount;

  // Lista de eventos
  const eventList = $('#eventList');
  if (eventList) {
    eventList.innerHTML = events.length
      ? events.map(ev => `
          <div class="event-row">
            <div class="event-kind">${esc(ev.type).replace(/_/g, ' ')}</div>
            <strong>${esc(ev.title)}</strong>
            <small>${new Date(ev.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</small>
          </div>`).join('')
      : `<div class="event-row">
           <strong>Sin cambios registrados</strong>
           <small>Los cambios aparecerán tras los próximos escaneos.</small>
         </div>`;
  }
}

$('#sourceMore')?.addEventListener('click', () => {
  sourceVisibleCount += 80;
  renderRadar(radarSources, allEvents, false);
});
$('#radarRefresh')?.addEventListener('click', async () => {
  const button = $('#radarRefresh');
  button.disabled = true;
  try { await loadRadar(); }
  finally { button.disabled = false; }
});

$('#loadMore')?.addEventListener('click', () => { visibleCount += 48; render(offers); });

// Búsqueda en radar
$('#radarQ')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) {
    renderRadar(allSources, allEvents);
    return;
  }
  const filtered = allSources.filter(s =>
    [s.name, s.domain, s.category, s.url].join(' ').toLowerCase().includes(q)
  );
  renderRadar(filtered, allEvents);
});

/* ============================================
   NAVEGACIÓN ENTRE VISTAS
   ============================================ */
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const view = btn.dataset.view;
    if (view === currentView) return;

    // Actualizar botones activos
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Actualizar secciones visibles
    $$('.view').forEach(v => v.classList.remove('active'));
    const target = $('#' + view);
    if (target) target.classList.add('active');

    currentView = view;

    // Cargar datos de la vista
    if (view === 'saved') await loadSaved();
    if (view === 'radar') await loadRadar();
  });
});

/* ============================================
   BÚSQUEDA: EVENTOS
   ============================================ */
const scrollToResults = () => $('#results')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
$('#searchBtn').addEventListener('click', () => { search(); scrollToResults(); });

// Both search boxes (hero and catalog) share one query and filter as you type.
for (const sel of ['#q', '#q2']) {
  const input = $(sel);
  input?.addEventListener('input', () => { const other = $(sel === '#q' ? '#q2' : '#q'); if (other) other.value = input.value; triggerSearch(); });
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchDebounce); search(); if (sel === '#q') scrollToResults(); } });
}
$('#q2Clear')?.addEventListener('click', () => { $('#q').value = ''; $('#q2').value = ''; search(); $('#q2').focus(); });

// Chips de búsqueda rápida
$$('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    $('#q').value = btn.dataset.q;
    search();
    scrollToResults();
  });
});

function setCategory(cat, scroll = false) {
  $('#category').value = [...$('#category').options].some(o => o.value === cat) ? cat : 'ALL';
  search();
  if (scroll) scrollToResults();
}
// Keeps the second search box, the clear button and the category pills in step with the filters.
function syncCatalogControls() {
  const q = $('#q').value, q2 = $('#q2');
  if (q2 && document.activeElement !== q2) q2.value = q;
  const clear = $('#q2Clear'); if (clear) clear.hidden = !q;
  const cat = $('#category').value;
  $$('#catBar [data-cat]').forEach(b => { const on = b.dataset.cat === cat; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  $$('#categoriesGrid .category-card').forEach(c => c.classList.toggle('active', c.dataset.category === cat));
}

// Advanced filters stay folded until asked for; the toggle shows how many are in use.
function syncFilterToggle() {
  const n = ['#country', '#verification', '#emailRequirement'].filter(sel => $(sel)?.value !== 'ALL').length + ['#crossCountry', '#verifiedWeek'].filter(sel => $(sel)?.checked).length;
  const badge = $('#filterCount'); if (badge) { badge.textContent = n; badge.hidden = !n; }
}
$('#filtersToggle')?.addEventListener('click', () => {
  const bar = $('#filtersBar'), open = bar.hidden;
  bar.hidden = !open; $('#filtersToggle').setAttribute('aria-expanded', String(open));
});
['#country', '#verification', '#emailRequirement', '#verifiedWeek', '#crossCountry'].forEach(sel => $(sel)?.addEventListener('change', syncFilterToggle));

// Filtros en tiempo real
['#country', '#category', '#verification','#emailRequirement','#verifiedWeek','#crossCountry'].forEach(sel => {
  const el = $(sel);
  if (el) el.addEventListener('change', () => search());
});

// Limpiar filtros
$('#clear').addEventListener('click', () => {
  $('#q').value = '';
  if ($('#q2')) $('#q2').value = '';
  $('#country').value = 'ALL';
  $('#category').value = 'ALL';
  $('#verification').value = 'ALL';
  $('#emailRequirement').value='ALL';$('#verifiedWeek').checked=false;$('#crossCountry').checked=false;
  syncFilterToggle();
  search();
});

/* ============================================
   VISTA GRID / LISTA
   ============================================ */
$('#gridViewBtn')?.addEventListener('click', () => {
  isListView = false;
  $('#gridViewBtn').classList.add('active');
  $('#gridViewBtn').setAttribute('aria-pressed', 'true');
  $('#listViewBtn').classList.remove('active');
  $('#listViewBtn').setAttribute('aria-pressed', 'false');
  render(offers);
});

$('#listViewBtn')?.addEventListener('click', () => {
  isListView = true;
  $('#listViewBtn').classList.add('active');
  $('#listViewBtn').setAttribute('aria-pressed', 'true');
  $('#gridViewBtn').classList.remove('active');
  $('#gridViewBtn').setAttribute('aria-pressed', 'false');
  render(offers);
});

/* ============================================
   HEADER: EFECTO SCROLL
   ============================================ */
const header = $('#site-header');
let lastScrollY = 0;

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  if (scrollY > 80) {
    header.style.boxShadow = '0 4px 24px rgba(0,0,0,0.08)';
  } else {
    header.style.boxShadow = 'none';
  }
  lastScrollY = scrollY;
}, { passive: true });

/* ============================================
   CATEGORÍAS
   ============================================ */
let categoryMeta = {};

async function loadCategories() {
  try {
    const { categories } = await apiFetch('/api/categories');
    const grid = $('#categoriesGrid');
    if (!grid || !categories?.length) return;

    // Save metadata for UI
    categories.forEach(c => { categoryMeta[c.key] = c; });

    grid.innerHTML = categories.map(c => `
      <button type="button" class="category-card"
           role="listitem"
           data-category="${esc(c.key)}"
           style="--cat-color: ${c.color || 'var(--accent)'};"
           aria-label="${esc(c.label)}: ${c.offers} ofertas">
        <span class="category-emoji" aria-hidden="true">${c.emoji || '📦'}</span>
        <span class="category-info">
          <span class="category-name">${esc(c.label || c.key)}</span>
          <span class="category-count">${c.offers} oferta${c.offers !== 1 ? 's' : ''}</span>
        </span>
      </button>
    `).join('');
    grid.querySelectorAll('.category-card').forEach(card => card.addEventListener('click', () => { $('#q').value = ''; setCategory(card.dataset.category, true); }));

    const total = categories.reduce((n, c) => n + c.offers, 0);
    const bar = $('#catBar');
    if (bar) {
      bar.innerHTML = `<button type="button" class="cat-pill active" data-cat="ALL" aria-pressed="true">Todas <span>${total}</span></button>` +
        categories.map(c => `<button type="button" class="cat-pill" data-cat="${esc(c.key)}" aria-pressed="false"><i aria-hidden="true">${c.emoji || ''}</i>${esc(c.label || c.key)} <span>${c.offers}</span></button>`).join('');
      bar.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => setCategory(b.dataset.cat)));
    }
    syncCatalogControls();
  } catch (e) {
    console.error('loadCategories error:', e);
  }
}

/* ============================================
   TRENDING OFFERS
   ============================================ */
async function loadTrending() {
  try {
    const { offers: trending } = await apiFetch('/api/offers/trending');
    const section = $('#trendingSection');
    const grid = $('#trendingGrid');
    if (!section || !grid) return;

    if (!trending?.length) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    grid.innerHTML = trending.map(renderCard).join('');

    bindCards(grid);
  } catch (e) {
    console.error('loadTrending error:', e);
  }
}

/* ============================================
   ARRANQUE
   ============================================ */
let currentTab = 'all';

async function syncAccountFavorites(){
  try{
    const config=await apiFetch('/api/auth-config');if(!config.enabled)return;
    accountSyncing=true;
    const {createAccountClient}=await import('./accounts/client.js'),candidate=await createAccountClient(config);
    if(await candidate.restore()){
      const merged=await candidate.mergeFavorites([...saved]);saved=new Set(merged);accountClient=candidate;
      localStorage.removeItem('nova-saved-offers');$('#accountLink').textContent='Mi cuenta · sincronizada';
      updateSavedBadge();render(offers);if(currentView==='saved')await loadSaved();
    }
  }catch{toast('La sincronización no está disponible. Tus favoritos locales se conservan.');}
  finally{accountSyncing=false;}
}

async function init() {
  initTheme();
  loadCountries();

  // Bind tabs
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      search();
    });
  });

  // Cargar todo en paralelo
  await Promise.all([
    loadMeta(),
    loadStats(),
    loadSaved(),
    loadCategories(),
    loadTrending(),
  ]);

  // The public catalog renders before optional account synchronization.
  await search();
  syncAccountFavorites();
  const offerId=new URLSearchParams(location.search).get('offer');if(/^\d+$/.test(offerId||''))await openOffer(Number(offerId));

  // Ocultar skeletons de carga
  const skeleton = $('#loadingSkeleton');
  if (skeleton) skeleton.style.display = 'none';

  // ── Nova AI Chat Widget ──
  initNovaAI();
}

/* ============================================
   NOVA AI CHAT ASSISTANT
   ============================================ */
function initNovaAI() {
  const fab = $('#nova-ai-fab');
  const panel = $('#nova-ai-panel');
  const closeBtn = $('#nova-ai-close');
  const form = $('#nova-ai-form');
  const input = $('#nova-ai-input');
  const messages = $('#nova-ai-messages');
  if (!fab || !panel) return;

  let isOpen = false;

  function togglePanel() {
    isOpen = !isOpen;
    panel.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) input.focus();
  }

  fab.addEventListener('click', togglePanel);
  closeBtn.addEventListener('click', togglePanel);

  // Escape key closes panel
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) togglePanel();
  });

  function addMessage(content, type = 'bot') {
    const msg = document.createElement('div');
    msg.className = `nova-ai-msg nova-ai-msg-${type}`;
    msg.innerHTML = `
      <div class="nova-ai-msg-avatar">${type === 'bot' ? '✦' : '👤'}</div>
      <div class="nova-ai-msg-body">${content}</div>
    `;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  function addTyping() {
    const typing = document.createElement('div');
    typing.className = 'nova-ai-msg nova-ai-msg-bot';
    typing.id = 'nova-ai-typing';
    typing.innerHTML = `
      <div class="nova-ai-msg-avatar">✦</div>
      <div class="nova-ai-msg-body"><div class="nova-ai-typing"><span></span><span></span><span></span></div></div>
    `;
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
    return typing;
  }

  function removeTyping() {
    const t = $('#nova-ai-typing');
    if (t) t.remove();
  }

  // Format markdown-like text into HTML
  function formatResponse(text) {
    return esc(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code style="background:rgba(124,58,237,0.15);padding:1px 4px;border-radius:4px;font-size:12px;">$1</code>')
      .replace(/\n/g, '<br>');
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const userMsg = input.value.trim();
    if (!userMsg) return;

    input.value = '';
    addMessage(esc(userMsg), 'user');

    const sendBtn = form.querySelector('.nova-ai-send');
    sendBtn.disabled = true;
    input.disabled = true;
    addTyping();

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      removeTyping();
      if (!res.ok) throw new Error(data.error || 'La IA no está disponible.');
      if (data.model) { const label = $('#nova-ai-model-label'); if (label) label.textContent = data.model; }

      if (data.reply) {
        addMessage(formatResponse(data.reply), 'bot');
      } else {
        addMessage('No pude generar una respuesta. Inténtalo de nuevo.', 'bot');
      }
    } catch (err) {
      removeTyping();
      addMessage(esc(err.message || 'Error de conexión. Verifica que el servidor esté activo.'), 'bot');
    } finally {
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
    }
  });

  // Check AI status
  fetch('/api/ai/status').then(r => r.json()).then(data => {
    const label = $('#nova-ai-model-label');
    if (label) label.textContent = data.enabled ? data.model : 'No configurada';
  }).catch(() => {});
}

window.NovaApp = {
  openOffer,
  search,
  isSaved: id => saved.has(id),
  savedIds: () => [...saved],
  async saveMany(ids) {
    let added = 0;
    for (const id of ids) {
      if (saved.has(id)) continue;
      try { if (accountClient) await accountClient.favorite(id, true); saved.add(id); added++; } catch {}
    }
    if (!accountClient) localStorage.setItem('nova-saved-offers', JSON.stringify([...saved]));
    updateSavedBadge(); render(offers);
    if (currentView === 'saved') await loadSaved();
    return added;
  },
  showView(view) { $(`.nav-btn[data-view="${view}"]`)?.click(); },
  toast,
};

init().catch(console.error);

fetch('/api/privacy').then(r=>r.json()).then(p=>{if(p.ready){$('#alertConsent').disabled=false;$('#consentNotice').textContent='La confirmación llegará por correo después de procesar la solicitud.';}}).catch(()=>{});
