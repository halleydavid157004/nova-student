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
const MODEL = 'openai/gpt-oss-20b';

// Valid categories matching CATEGORIES in seed.js
const VALID_CATEGORIES = [
  'Development', 'Cloud', 'Design', 'Creative', 'AI', 'Productivity',
  'Streaming', 'Education', 'Shopping', 'Security', 'Gaming',
  'Travel', 'Health', 'Finance', 'Hosting', 'Entertainment', 'Hardware'
];

function enabled() { return !!API_KEY; }

/* ═══════════════════════════════════════════
   RATE LIMITER — Prevents 429 errors
   ═══════════════════════════════════════════ */
const rateLimiter = {
  lastCall: 0,
  minDelay: 4000, // ms between API calls (15 req/min max)
  queue: [],
  async wait() {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    if (elapsed < this.minDelay) {
      await new Promise(r => setTimeout(r, this.minDelay - elapsed));
    }
    this.lastCall = Date.now();
  }
};

/**
 * Low-level call to Groq chat completions with retry logic.
 */
async function groqChat(messages, { temperature = 0.4, max_tokens = 1024, retries = 2 } = {}) {
  if (!API_KEY) throw new Error('GROQ_API_KEY not set');

  for (let attempt = 0; attempt <= retries; attempt++) {
    await rateLimiter.wait();

    try {
      const res = await fetch(GROQ_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens }),
        signal: AbortSignal.timeout(30000),
      });

      if (res.status === 429) {
        // Rate limited — wait and retry
        const retryAfter = parseInt(res.headers.get('retry-after') || '10', 10);
        console.log(`[Nova AI] Rate limited. Waiting ${retryAfter}s before retry ${attempt + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (!res.ok) {
        const err = await res.text().catch(() => 'Unknown error');
        throw new Error(`Groq API ${res.status}: ${err}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || '';
    } catch (e) {
      if (attempt === retries) throw e;
      console.log(`[Nova AI] Attempt ${attempt + 1} failed: ${e.message}. Retrying...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('All retries exhausted');
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
      source_domain: parsed.direct_url ? new URL(parsed.direct_url).hostname.replace(/^www\./, '') : domain,
      source_url: parsed.direct_url || url,
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
  if (!enabled()) return 'Lo siento, el asistente Nova AI no está configurado. Contacta al administrador.';

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
    return 'Ocurrió un error al procesar tu pregunta. Inténtalo de nuevo en unos segundos.';
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
