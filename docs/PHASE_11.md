# Fase 11 — Pistas de StudentOffers conformes y fuentes oficiales curadas

Versión 2.11.0. Sin migración ni dependencias nuevas. Variables opcionales nuevas: `STUDENTOFFERS_PAGES_PER_CYCLE` (0–60, por defecto 25) y `NOVA_CURATED_SOURCES` (por defecto `true`).

## Problema corregido

`discoverStudentOffers` llamaba directamente a `https://www.studentoffers.co/api/v1/offers` con `fetch`, sin pasar por el cliente que respeta robots.txt. El robots.txt de StudentOffers (consultado el 2026-10-02) permite `/` pero **prohíbe `/api/`** a agentes genéricos como NovaStudentRadar. La auditoría de producto ya lo había señalado.

## Cómo funciona ahora (`src/services/studentoffers.js`)

1. **Primero comprueba robots.txt.** Si algún día permite `/api/` a NovaStudentRadar (o nos autorizan), usa la API documentada a través de `sourceClient`.
2. **Mientras no lo permita**, lee `sitemap.xml` (declarado en su robots) una vez al día y procesa hasta `STUDENTOFFERS_PAGES_PER_CYCLE` fichas `/offer/<slug>` por ciclo, con las pausas de `sourceClient`. Un cursor en `app_runtime` (`studentOffers`) continúa donde quedó; las fichas nuevas del sitemap pasan primero. Con 650 fichas y 4 ciclos al día, la primera pasada completa tarda unos 7 días.
3. De cada ficha guarda **solo la marca y el enlace del botón «Claim»** (sin parámetros de seguimiento). No se copian descripciones, precios, países ni etiquetas.
4. El enlace se registra como **fuente** (`discovered_via: "StudentOffers (pista)"`, `lead_ref: /offer/<slug>`). Es `official: true` solo si el dominio pertenece a la marca (Figma → figma.com, AWS Educate → aws.amazon.com); los agregadores (UNiDAYS, Student Beans, ID.me…) nunca son oficiales.
5. Desde ahí sigue el flujo existente: el radar visita la página oficial, extrae con evidencia y la oferta queda **pendiente** hasta pasar la revisión de la fase 8. Una pista nunca se publica sola.

## Fuentes oficiales curadas (`src/data/curated-sources.js`)

106 páginas oficiales de programas para estudiantes (IA, desarrollo, nube, diseño, ciencia, seguridad, streaming, hardware, viajes…). Cada ciclo `ensureCuratedSources()` agrega las que falten (idempotente, por URL canónica) como fuentes oficiales. `scan-priority` revisa primero las fuentes nunca comprobadas. Una URL equivocada o movida solo falla su comprobación y entra en espera; se corrige editando el archivo.

## Búsqueda propia

Sin cambios: Brave (cupo mensual compartido ≤ 600, consultas que alternan Latinoamérica, temas y países), respaldo con Groq y socios de GitHub Education. El panel Radar muestra ahora el origen de cada fuente («vía …»).

## Validación

`test/studentoffers.test.js`: con el robots.txt real de StudentOffers no se pide `/api/`; el sitemap y las fichas producen pistas sin texto copiado; deduplicación, cursor, caché diaria del sitemap; uso de la API solo si robots lo permite; los agregadores no son oficiales; la lista curada es idempotente, sin duplicados y con categorías válidas. `test/worker-actions.test.js` desactiva la lista curada para mantener su escenario de una sola fuente.

## Operación y rollback

Sin cambios en Render ni en Supabase. Para pausar: `STUDENTOFFERS_DISCOVERY=false` o `NOVA_CURATED_SOURCES=false` en las variables del workflow. Rollback: revertir el PR; las fuentes ya agregadas pueden desactivarse desde el panel de revisión (sección Fuentes).

## Siguiente paso propuesto

La publicación sigue requiriendo la aprobación de la fase 8 (la base de datos impide que una validación publique). Para publicar automáticamente ofertas de fuentes oficiales con evidencia fuerte haría falta una migración nueva con su función, auditoría y pruebas en PostgreSQL; se propone como fase aparte.
