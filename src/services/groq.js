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
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

function enabled() { return !!API_KEY; }

/**
 * Low-level call to Groq chat completions.
 */
async function groqChat(messages, { temperature = 0.4, max_tokens = 1024 } = {}) {
  if (!API_KEY) throw new Error('GROQ_API_KEY not set');
  const res = await fetch(GROQ_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(`Groq API ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
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
  const trimmed = rawText.slice(0, 3000);

  let domain;
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }

  const prompt = `Analiza el siguiente texto extraído de la web "${domain}" y determina si contiene una oferta, descuento o beneficio real para ESTUDIANTES.

Si NO es una oferta legítima para estudiantes, responde EXACTAMENTE: NO_OFFER

Si SÍ es una oferta para estudiantes, responde en este formato JSON exacto (sin markdown, sin backticks):
{
  "brand": "Nombre de la empresa",
  "title": "Título corto y claro de lo que obtienen gratis/con descuento (máx 60 chars)",
  "summary": "Descripción breve de 1 línea sobre el beneficio concreto (máx 100 chars)",
  "category": "Una de: AI_ML, CLOUD, DESIGN, DEVELOPER, PRODUCTIVITY, EDUCATION, ENTERTAINMENT, SHOPPING, HEALTH, FINANCE, OTHER",
  "offer_type": "Una de: FREE, DISCOUNT, CREDITS, BUNDLE, TRIAL",
  "countries": ["GLOBAL"] o ["US","MX",...],
  "requires_card": false,
  "steps": ["Paso 1 claro", "Paso 2 claro", "Paso 3 claro"],
  "confidence": 85
}

REGLAS IMPORTANTES:
- El título debe ser claro y directo: qué obtienes gratis. Ej: "GitHub Copilot — Gratis para Estudiantes"
- El summary debe explicar el beneficio concreto, no repetir el título
- Los steps deben ser instrucciones reales y útiles de cómo reclamar la oferta
- confidence: 90+ si es de la página oficial, 70-89 si es referencia indirecta, <70 si es dudoso
- NO inventes ofertas que no estén en el texto

TEXTO DE LA WEB:
${trimmed}`;

  try {
    const answer = await groqChat([
      { role: 'system', content: 'Eres un analista experto en ofertas estudiantiles. Respondes solo en el formato solicitado.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.2, max_tokens: 600 });

    if (answer.includes('NO_OFFER')) return null;

    // Parse JSON from response
    const jsonMatch = answer.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.brand || !parsed.title) return null;

    return {
      brand: parsed.brand,
      title: parsed.title,
      summary: parsed.summary || '',
      category: parsed.category || 'OTHER',
      offer_type: parsed.offer_type || 'FREE',
      countries: parsed.countries || ['GLOBAL'],
      requires_card: !!parsed.requires_card,
      steps: parsed.steps || ['Visita el enlace oficial', 'Verifica tu condición de estudiante', 'Activa la oferta'],
      confidence: Math.min(100, Math.max(30, Number(parsed.confidence) || 70)),
      source_domain: domain,
      source_url: url,
    };
  } catch (e) {
    console.error('[Nova AI] Extraction error:', e.message);
    return null;
  }
}

/* ═══════════════════════════════════════════
   2. OFFER ENRICHMENT
   ═══════════════════════════════════════════ */

/**
 * Takes an existing offer with a messy summary and rewrites it cleanly.
 */
export async function enrichOffer(offer) {
  if (!enabled() || !offer) return offer;
  try {
    const answer = await groqChat([
      { role: 'system', content: 'Eres un editor de contenido premium. Reescribes textos sucios en resúmenes profesionales breves en español.' },
      { role: 'user', content: `Reescribe esta información de oferta estudiantil de forma limpia y profesional.

Marca: ${offer.brand}
Título actual: ${offer.title}
Resumen actual: ${offer.summary}
Beneficio: ${offer.benefit || ''}
URL: ${offer.source_url || ''}

Responde en JSON exacto (sin markdown):
{
  "title": "Título mejorado (máx 60 chars, claro y directo)",
  "summary": "Resumen limpio de 1 línea (máx 100 chars)"
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

/**
 * The Nova AI assistant. Receives the user's message + context of available
 * offers and returns a personalized, helpful response.
 */
export async function chatWithNova(userMessage, offers = []) {
  if (!enabled()) return 'Lo siento, el asistente Nova AI no está configurado. Contacta al administrador.';

  // Build context from top offers (limit to keep tokens low)
  const topOffers = offers.slice(0, 40).map((o, i) =>
    `${i + 1}. ${o.title} | ${o.category} | ${o.offer_type} | ${o.summary || ''} | URL: ${o.source_url || 'N/A'}`
  ).join('\n');

  const systemPrompt = `Eres "Nova AI", el asistente inteligente de Nova Student Radar, la plataforma más avanzada de ofertas para estudiantes del mundo.

TU PERSONALIDAD:
- Eres amigable, entusiasta y súper útil
- Respondes siempre en español
- Usas emojis moderadamente para ser cercano
- Eres directo y das recomendaciones concretas
- Conoces a fondo cada oferta disponible en la plataforma

TUS CAPACIDADES:
- Recomendar ofertas específicas según la carrera, país o necesidad del estudiante
- Explicar paso a paso cómo reclamar cualquier oferta
- Comparar ofertas similares
- Dar tips para maximizar los beneficios estudiantiles
- Responder preguntas sobre verificación (.edu, ISIC, etc.)

OFERTAS DISPONIBLES EN LA PLATAFORMA:
${topOffers}

REGLAS:
- Solo recomienda ofertas que estén en la lista de arriba
- Si no hay una oferta para lo que pide el usuario, dilo honestamente
- Mantén las respuestas concisas (máx 3 párrafos)
- Si el usuario pregunta algo no relacionado con ofertas estudiantiles, redirige amablemente`;

  try {
    const answer = await groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ], { temperature: 0.6, max_tokens: 800 });

    return answer || 'No pude generar una respuesta. Intenta reformular tu pregunta.';
  } catch (e) {
    console.error('[Nova AI] Chat error:', e.message);
    return 'Ocurrió un error al procesar tu pregunta. Inténtalo de nuevo en unos segundos.';
  }
}

export { enabled as aiEnabled };
