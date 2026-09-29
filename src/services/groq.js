/**
 * Nova AI — Groq-powered intelligence layer for Nova Student Radar.
 *
 * Powers:
 *  1. Intelligent offer extraction from raw web text (crawler)
 *  2. Nova AI chat assistant (frontend)
 *  3. Offer enrichment & smart summaries
 */

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const API_KEY = process.env.GROQ_API_KEY || '';
const MODELS = [...new Set([
  process.env.GROQ_MODEL || 'llama-3.1-70b-versatile',
  ...(process.env.GROQ_FALLBACK_MODELS || 'llama-3.1-8b-instant, llama3-8b-8192, mixtral-8x7b-32768')
    .split(',').map(x => x.trim()).filter(Boolean),
])];
let activeModel = MODELS[0];
let lastError = null;

// Valid categories matching CATEGORIES in seed.js
const VALID_CATEGORIES = [
  'Development', 'Cloud', 'Design', 'Creative', 'AI', 'Productivity',
  'Streaming', 'Education', 'Shopping', 'Security', 'Gaming',
  'Travel', 'Health', 'Finance', 'Hosting', 'Entertainment', 'Hardware'
];

function enabled() { return !!API_KEY; }
export function aiStatus() {
  return {enabled: enabled(), model: activeModel, error: lastError};
}

/* ═══════════════════════════════════════════
   RATE LIMITER — Prevents 429 errors
   ═══════════════════════════════════════════ */
const rateLimiter = {
  lastCall: 0,
<<<<<<< HEAD
  minDelay: Math.max(0, Number(process.env.GROQ_MIN_DELAY_MS ?? 12000)),
  queue: Promise.resolve(),
  async wait() {
    const turn = this.queue.then(async () => {
      const delay = Math.max(0, this.minDelay - (Date.now() - this.lastCall));
      if (delay) await new Promise(r => setTimeout(r, delay));
      this.lastCall = Date.now();
    });
    this.queue = turn.catch(() => {});
    await turn;
  }
};

/**
 * Low-level call to Groq chat completions with retry logic.
 */
async function groqChat(messages, { temperature = 0.4, max_tokens = 1024, retries = 2 } = {}) {
  if (!API_KEY) throw new Error('GROQ_API_KEY not set');
  const candidates = [activeModel, ...MODELS.filter(m => m !== activeModel)];
  for (const model of candidates) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      await rateLimiter.wait();
      try {
      const res = await fetch(GROQ_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ model, messages, temperature, max_completion_tokens: max_tokens,
          ...(model.startsWith('openai/gpt-oss-') ? {reasoning_effort:'low'} : {}) }),
        signal: AbortSignal.timeout(30000),
      });

      const status = res.status;
      let text = '';
      if (!res.ok || status === 429) {
          text = await res.text().catch(() => '');
      }

      if (status === 429 || text.includes('Rate limit reached')) {
          if (attempt < retries) {
            let delay = 15000;
            const seconds = Number(res.headers.get('retry-after'));
            if (Number.isFinite(seconds) && seconds > 0) {
              delay = Math.min(seconds * 1000, 15000);
            } else {
              const match = text.match(/try again in ([\d.]+)s/);
              if (match) delay = Math.ceil(parseFloat(match[1])) * 1000;
              else delay = 1000 * (attempt + 1);
            }
            console.log(`[Nova AI] Rate limited. Waiting ${delay/1000}s before retry ${attempt + 1}/${retries}...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          lastError = 'rate_limited';
          throw Object.assign(new Error(`Groq API ${status}: ${text}`), { permanent: true });
      }

      if (!res.ok) {
        if ([400,403,404].includes(status) && /model|decommission|unsupported|permission|blocked/i.test(text)) {
          console.warn(`[Nova AI] Model ${model} unavailable; trying next configured model.`);
          lastError = 'model_unavailable';
          break; // break retry loop to try next model
        }
        if (status === 401 || status === 403) {
          lastError = 'authentication';
          throw Object.assign(new Error('Groq authentication failed'), { permanent: true });
        }
        if (status >= 500) {
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          lastError = 'provider_unavailable';
          throw Object.assign(new Error(`Groq API ${status}`), { permanent: true });
        }
        lastError = 'provider_error';
        throw Object.assign(new Error(`Groq API ${status}: ${text}`), { permanent: true });
      }

      const data = text ? JSON.parse(text) : await res.json();
      activeModel = model;
      lastError = null;
      return data.choices?.[0]?.message?.content?.trim() || '';
      } catch (e) {
        if (e.permanent || attempt === retries) {
          lastError ||= 'network_error';
          throw e;
        }
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw new Error('No configured Groq model is available');
}

/* ═══════════════════════════════════════════
   1. INTELLIGENT OFFER EXTRACTION
   ═══════════════════════════════════════════ */

/**
 * Given raw scraped text + URL, uses Groq AI to extract a clean,
 * structured student offer or returns null if no valid offer exists.
 */
export async function extractOfferWithAI(rawText, url) {
  if (!enabled()) return null;

  // Limit input to avoid token waste
  const trimmed = rawText.slice(0, 2000);

  let domain;
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }

  const prompt = `Analiza este texto extraído de "${domain}" y determina si contiene una oferta real para ESTUDIANTES.

REGLAS:
1. El usuario quiere enlaces DIRECTOS a la oferta oficial de la marca, no artículos de blog.
2. Si el texto es un blog pero menciona el enlace oficial directo, extráelo en "direct_url".
3. Si el texto habla de una oferta real pero NO tiene el enlace oficial, responde solicitando una búsqueda en vivo para encontrarlo, usando "needs_search": "NombreMarca student discount".
4. Si NO es una oferta para estudiantes, responde: NO_OFFER

Responde en JSON exacto (sin markdown):
{
  "brand": "Nombre oficial de la empresa",
  "title": "Qué obtienen gratis/descuento",
  "summary": "Beneficio concreto",
  "category": "UNA de: ${VALID_CATEGORIES.join(', ')}",
  "offer_type": "free o discount",
  "countries": ["GLOBAL"],
  "requires_card": false,
  "steps": ["Paso 1", "Paso 2"],
  "direct_url": "https://url-oficial.com/student",
  "needs_search": "Búsqueda a realizar si no hay direct_url (opcional)",
  "confidence": 80
}

TEXTO:
${trimmed}`;

  try {
    const answer = await groqChat([
      { role: 'system', content: 'Eres analista de ofertas estudiantiles. Solo respondes en el formato pedido. Responde en español.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.2, max_tokens: 500 });

    if (answer.includes('NO_OFFER')) return null;

    const jsonMatch = answer.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.brand || !parsed.title) return null;

    // Validate and normalize category
    let category = parsed.category || 'Education';
    if (!VALID_CATEGORIES.includes(category)) {
      // Try case-insensitive match
      const match = VALID_CATEGORIES.find(c => c.toLowerCase() === category.toLowerCase());
      category = match || 'Education';
    }

    return {
      brand: parsed.brand,
      title: parsed.title,
      summary: parsed.summary || '',
      category,
      offer_type: parsed.offer_type || 'free',
      countries: parsed.countries || ['GLOBAL'],
      requires_card: !!parsed.requires_card,
      steps: parsed.steps || ['Visita el enlace oficial', 'Verifica tu condición de estudiante', 'Activa la oferta'],
      confidence: Math.min(100, Math.max(30, Number(parsed.confidence) || 70)),
      source_domain: parsed.direct_url && /^https?:\/\//i.test(parsed.direct_url) ? new URL(parsed.direct_url).hostname.replace(/^www\./, '') : domain,
      source_url: parsed.direct_url && /^https?:\/\//i.test(parsed.direct_url) ? parsed.direct_url : url,
      needs_search: parsed.needs_search || null,
    };
  } catch (e) {
    console.error('[Nova AI] Extraction error:', e.message);
    return null;
  }
}

/* ═══════════════════════════════════════════
   2. OFFER ENRICHMENT
   ═══════════════════════════════════════════ */

export async function enrichOffer(offer) {
  if (!enabled() || !offer) return offer;
  try {
    const answer = await groqChat([
      { role: 'system', content: 'Eres editor de contenido premium. Reescribes textos sucios en resúmenes profesionales breves en español.' },
      { role: 'user', content: `Reescribe esta oferta de forma limpia:

Marca: ${offer.brand}
Título: ${offer.title}
Resumen: ${offer.summary}
URL: ${offer.source_url || ''}

Responde en JSON (sin markdown):
{
  "title": "Título mejorado (max 60 chars)",
  "summary": "Resumen limpio 1 línea (max 100 chars)"
}` },
    ], { temperature: 0.3, max_tokens: 200 });

    const jsonMatch = answer.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.title) offer.title = parsed.title;
      if (parsed.summary) offer.summary = parsed.summary;
    }
  } catch (e) {
    console.error('[Nova AI] Enrichment error:', e.message);
  }
  return offer;
}

/* ═══════════════════════════════════════════
   3. NOVA AI CHAT ASSISTANT
   ═══════════════════════════════════════════ */

export async function chatWithNova(userMessage, offers = []) {
  if (!enabled()) throw new Error('AI_NOT_CONFIGURED');

  // Smart Context: Score and sort offers based on relevance to the user's message
  const userWords = userMessage.toLowerCase().replace(/[^a-z0-9áéíóúñ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  
  const scoredOffers = offers.map(o => {
    let score = o.confidence || 0;
    const searchableText = `${o.title} ${o.brand} ${o.category} ${o.summary}`.toLowerCase();
    
    // Boost score if words from the user's message appear in the offer
    for (const word of userWords) {
      if (searchableText.includes(word)) {
        score += 500; // Massive boost for direct keyword hits (e.g. "amazon")
      }
    }
    return { ...o, score };
  });

  // Sort by score (descending) and take the top 15 most relevant offers
  scoredOffers.sort((a, b) => b.score - a.score);

  const topOffers = scoredOffers.slice(0, 15).map((o, i) =>
    `${i + 1}. ${o.title} | ${o.category} | ${o.offer_type} | ${o.summary || ''} | URL: ${o.source_url || 'N/A'}`
  ).join('\n');

  const systemPrompt = `Eres "Nova AI", el asistente inteligente de Nova Student Radar, la plataforma más avanzada de ofertas para estudiantes.

TU PERSONALIDAD:
- Amigable, entusiasta y útil
- Respondes SIEMPRE en español
- Usas emojis moderadamente
- Das recomendaciones concretas con pasos claros
- Respuestas concisas (máx 3 párrafos)

OFERTAS DISPONIBLES:
${topOffers}

REGLAS:
- Solo recomienda ofertas de la lista
- Si no hay oferta para lo que pide el usuario, dilo honestamente
- Si preguntan algo no relacionado con ofertas, redirige amablemente`;

  try {
    const answer = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ], { temperature: 0.6, max_tokens: 600 });

    return answer || 'No pude generar una respuesta. Intenta reformular tu pregunta.';
  } catch (e) {
    console.error('[Nova AI] Chat error:', e.message);
    throw e;
  }
}

/* ═══════════════════════════════════════════
   4. FALLBACK DISCOVERY (KNOWLEDGE BASE)
   ═══════════════════════════════════════════ */

export async function discoverWithGroq(topic = 'software') {
  if (!enabled()) return [];
  try {
    const prompt = `Actúa como una API de búsqueda. Devuelve una lista de 5 URLs EXACTAS Y REALES de páginas web oficiales que ofrezcan descuentos, licencias gratis o beneficios para ESTUDIANTES universitarios relacionados con: ${topic}. 
No inventes URLs. Usa páginas famosas y reales.
Responde ÚNICAMENTE con un arreglo JSON de strings de las URLs. Ningún otro texto.
Ejemplo: ["https://spotify.com/student", "https://aws.amazon.com/education/awseducate/"]`;

    const answer = await groqChat([
      { role: 'system', content: 'Eres un motor de búsqueda JSON. Solo devuelves arrays de URLs válidas.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.7, max_tokens: 300 });

    const jsonMatch = answer.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    
    const urls = JSON.parse(jsonMatch[0]);
    return urls.filter(u => u.startsWith('http'));
  } catch (e) {
    console.error('[Nova AI] Fallback discovery error:', e.message);
    return [];
  }
}

export { enabled as aiEnabled };
