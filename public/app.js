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

/* ============================================
   ESTADO
   ============================================ */
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
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
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
}

$('#theme-toggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('nova-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

/* ============================================
   INICIALIZACIÓN DE SELECTORES
   ============================================ */
function loadCountries() {
  const dn = new Intl.DisplayNames([navigator.language || 'es'], { type: 'region' });
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
    m.categories.forEach(v => {
      $('#category').insertAdjacentHTML('beforeend', `<option>${esc(v)}</option>`);
    });
    m.verifications.forEach(v => {
      $('#verification').insertAdjacentHTML('beforeend', `<option>${esc(v)}</option>`);
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
  return { free: '🎁 Gratis', discount: '💸 Descuento', credits: '☁️ Créditos', bundle: '📦 Pack' }[type] || '✨ Beneficio';
}

/* ============================================
   TARJETA DE OFERTA
   ============================================ */
function renderCard(o) {
  const isSaved = saved.has(o.id);
  const initials = (o.brand || o.title || '?').slice(0, 2).toUpperCase();
  const domain = o.source_domain || (o.source_url ? (() => { try { return new URL(o.source_url).hostname.replace(/^www\./, ''); } catch { return ''; } })() : '');
  const logoHtml = domain
    ? `<img src="https://icon.horse/icon/${domain}" alt="" class="brand-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid';" /><div class="brand-initials" style="display:none;" aria-hidden="true">${esc(initials)}</div>`
    : `<div class="brand-initials" aria-hidden="true">${esc(initials)}</div>`;

  return `
    <article class="card" data-id="${o.id}" role="listitem" tabindex="0" aria-label="${esc(o.title)}">
      <div class="card-top">
        <div class="brandmark">${logoHtml}</div>
        <button
          class="save-btn ${isSaved ? 'saved' : ''}"
          data-save="${o.id}"
          aria-label="${isSaved ? 'Quitar de guardadas' : 'Guardar oferta'}"
          title="${isSaved ? 'Quitar de guardadas' : 'Guardar'}"
        >${isSaved ? '♥' : '♡'}</button>
      </div>
      <span class="badge ${badgeClass(o.offer_type)}">${badgeLabel(o.offer_type)}</span>
      <h3>${esc(o.title)}</h3>
      ${o.summary ? `<p class="card-summary">${esc(o.summary)}</p>` : ''}
      <div class="card-meta">
        <span class="meta-tag">${esc(o.category)}</span>
        <span class="meta-tag">${esc(o.verification)}</span>
        ${o.official ? '<span class="meta-tag official">✓ Oficial</span>' : ''}
        ${(o.countries || []).includes('GLOBAL') ? '<span class="meta-tag">🌍 Global</span>' : ''}
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
      if (e.target.closest('.save-btn')) return;
      openOffer(Number(c.dataset.id));
    });
    c.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
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
      try {
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
        localStorage.setItem('nova-saved-offers', JSON.stringify([...saved]));
        updateSavedBadge();
        if (currentView === 'saved') await loadSaved();
      } catch {
        toast('Error al guardar', 'error');
      }
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
  if (skeleton) skeleton.style.display = '';
  if (grid) grid.innerHTML = '';

  const q = $('#q').value.trim();
  const country = $('#country').value;
  const category = $('#category').value;
  const verification = $('#verification').value;

  const params = new URLSearchParams({ q, country, category, verification, limit: '500' });

  try {
    let [{ offers: list }, { sources }] = await Promise.all([
      apiFetch('/api/offers?' + params),
      apiFetch('/api/sources?q=' + encodeURIComponent(q))
    ]);
    if (generation !== searchGeneration) return;

    // Client-side quick-tabs filtering
    if (currentTab === 'recent') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 14); // Consider recent as last 14 days
      list = list.filter(o => new Date(o.updated_at || o.created_at || Date.now()) >= weekAgo);
    } else if (currentTab === 'hot') {
      list = list.filter(o => o.tags?.includes('hot') || o.tags?.includes('trending') || o.tags?.includes('must-have'));
    } else if (currentTab === 'expiring') {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 2);
      list = list.filter(o => o.expires_at && new Date(o.expires_at) <= nextMonth);
    }

    if (skeleton) skeleton.style.display = 'none';

    const titleEl = $('#resultTitle');
    if (titleEl) {
      titleEl.textContent = q ? `Resultados para "${q}"` : 'Beneficios destacados';
    }

    visibleCount = 48;
    render(list);

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
    const initials = (o.brand || o.title || '?').slice(0, 2).toUpperCase();
    const domain = o.source_domain || (o.source_url ? (() => { try { return new URL(o.source_url).hostname.replace(/^www\./, ''); } catch { return ''; } })() : '');
    const logoHtml = domain
      ? `<img src="https://icon.horse/icon/${domain}" alt="" class="brand-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid';" /><div class="brand-initials" style="display:none;" aria-hidden="true">${esc(initials)}</div>`
      : `<div class="brand-initials" aria-hidden="true">${esc(initials)}</div>`;

    content.innerHTML = `
      <div class="offer-detail-header">
        <div class="modal-kicker">${esc(o.brand)} · ${esc(o.category)}</div>
        <div class="offer-detail-brandmark">${logoHtml}</div>
        <div>
          <span class="badge ${badgeClass(o.offer_type)}">${badgeLabel(o.offer_type)}</span>
          <h2 class="offer-detail-title" id="modalTitle">${esc(o.title)}</h2>
          <p class="offer-detail-summary">${esc(o.summary)}</p>
        </div>
      </div>

      <div class="offer-section">
        <h3>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Qué obtienes
        </h3>
        <div class="benefit-highlight">${esc(o.benefit)}</div>
      </div>

      ${o.requirements?.length ? `
      <div class="offer-section">
        <h3>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Requisitos
        </h3>
        ${o.requirements.map(r => `
          <div class="requirement-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            ${esc(r)}
          </div>`).join('')}
      </div>` : ''}

      ${o.steps?.length ? `
      <div class="offer-section">
        <h3>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          Cómo obtenerla
        </h3>
        <ol class="steps-list">
          ${o.steps.map(s => `<li>${esc(s)}</li>`).join('')}
        </ol>
      </div>` : ''}

      <div class="offer-section">
        <h3>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Detalles
        </h3>
        <div class="offer-info-row">
          <span class="info-pill">🔐 ${esc(o.verification)}</span>
          <span class="info-pill">${o.requires_card ? '💳 Puede requerir tarjeta' : '🚫 Sin tarjeta'}</span>
          <span class="info-pill">📅 Verificada: ${new Date(o.verified_at).toLocaleDateString('es', { dateStyle: 'medium' })}</span>
          ${o.official ? '<span class="info-pill">✅ Fuente oficial</span>' : ''}
          ${(o.countries || []).includes('GLOBAL') ? '<span class="info-pill">🌍 Global</span>' : ''}
        </div>
      </div>

      <a class="source-cta" href="${esc(safeUrl(o.source_url))}" target="_blank" rel="noopener noreferrer">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        ${o.official ? 'Ir a la fuente oficial' : 'Ver fuente para verificar la oferta'}
      </a>`;

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
  btn.textContent = 'Activando…';

  const data = Object.fromEntries(new FormData(e.currentTarget));
  data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota';

  try {
    const result = await apiFetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    status.textContent = result.deliveryConfigured === false
      ? '✓ Alerta guardada. Los envíos por correo están pendientes de configuración.'
      : '✓ Alerta activada correctamente';
    status.className = 'success';
    toast(result.deliveryConfigured === false ? 'Alerta guardada; correo pendiente' : 'Alerta creada ✓', 'success');
    setTimeout(() => closeAlertModal(), 1400);
  } catch (err) {
    status.textContent = '✗ ' + err.message;
    status.className = '';
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Activar alerta`;
  }
});

/* ============================================
   VISTA: GUARDADAS
   ============================================ */
async function loadSaved() {
  try {
    const results = await Promise.allSettled([...saved].map(id => apiFetch(`/api/offers/${id}`)));
    const list = results.filter(x => x.status === 'fulfilled').map(x => x.value.offer);
    if (list.length !== saved.size) {
      saved = new Set(list.map(o => o.id));
      localStorage.setItem('nova-saved-offers', JSON.stringify([...saved]));
    }
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
    : brave.running ? 'Buscando oportunidades' : brave.lastError ? labels[brave.lastError] || 'Revisar conexión'
    : brave.budget?.remaining === 0 ? 'Límite mensual alcanzado' : 'Programado cada 6 horas';
  const date = value => value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('es-CO', {dateStyle: 'short', timeStyle: 'short'}) : 'Pendiente';
  panel.innerHTML = `<div><span class="radar-schedule-label">BRAVE SEARCH</span><strong>${esc(state)}</strong></div>
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
                <small>${esc(s.domain)} · ${s.official ? '✓ Oficial' : 'Descubierta'} · ${esc(s.category)}</small>
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
$('#searchBtn').addEventListener('click', () => search());

$('#q').addEventListener('keydown', e => {
  if (e.key === 'Enter') search();
});

// Chips de búsqueda rápida
$$('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    $('#q').value = btn.dataset.q;
    search();
    // Scroll suave al grid
    $('#discover')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// Filtros en tiempo real
['#country', '#category', '#verification'].forEach(sel => {
  const el = $(sel);
  if (el) el.addEventListener('change', () => search());
});

// Limpiar filtros
$('#clear').addEventListener('click', () => {
  $('#q').value = '';
  $('#country').value = 'ALL';
  $('#category').value = 'ALL';
  $('#verification').value = 'ALL';
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

    grid.innerHTML = categories.map(c => `
      <div class="category-card"
           role="listitem"
           data-category="${esc(c.key)}"
           style="--cat-color: ${c.color || 'var(--accent)'};"
           tabindex="0"
           aria-label="${esc(c.label)}: ${c.offers} ofertas">
        <span class="category-emoji" aria-hidden="true">${c.emoji || '📦'}</span>
        <div class="category-info">
          <div class="category-name">${esc(c.label || c.key)}</div>
          <div class="category-count">${c.offers} oferta${c.offers !== 1 ? 's' : ''}</div>
        </div>
      </div>
    `).join('');

    // Save metadata for UI
    categories.forEach(c => { categoryMeta[c.key] = c; });

    // Click to filter by category
    grid.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => {
        const cat = card.dataset.category;
        $('#category').value = cat;
        $('#q').value = '';
        search();
        // Scroll to results
        setTimeout(() => {
          $('#discover')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
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
    grid.innerHTML = trending.map(o => {
      const tags = o.tags || [];
      const isHot = tags.includes('hot') || tags.includes('trending');
      return renderCard(o).replace(
        '<article class="card"',
        `<article class="card" ${isHot ? '' : ''}`
      ) + (isHot ? '' : '');
    }).map((html, i) => {
      const tags = trending[i]?.tags || [];
      const isHot = tags.includes('hot');
      if (isHot) {
        return html.replace('</div>\n      <span class="badge', '<span class="hot-badge">🔥 HOT</span></div>\n      <span class="badge');
      }
      return html;
    }).join('');

    bindCards(grid);
  } catch (e) {
    console.error('loadTrending error:', e);
  }
}

/* ============================================
   ARRANQUE
   ============================================ */
let currentTab = 'all';

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

  // Búsqueda inicial
  await search();

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

init().catch(console.error);
