# Fase 15 — Llevar las pistas a su página oficial

Versión 2.15.0. Sin migraciones ni variables nuevas.

## Por qué

En producción (2026-10-02) había 516 ofertas detectadas y solo 25 publicadas. 465 estaban
pendientes, venían de fuentes marcadas como **no oficiales** y nunca se habían comprobado. La
aprobación automática (Fase 12) solo publica ofertas de fuentes oficiales, así que no podía tocarlas.

Dos causas:

1. Las pistas de StudentOffers guardadas antes de la Fase 11 quedaron todas como no oficiales,
   aunque muchas enlazan directo al sitio de la marca (Databricks → databricks.com, Cloudflare →
   cloudflare.com…). La Fase 11 ya aplica la regla `brandOwnsDomain` a las pistas nuevas, no a las
   viejas.
2. Una página curada (revisada a mano) que ya existía como pista no se agregaba otra vez, y seguía
   como no oficial (Hulu, Gemini para estudiantes, Tableau, Office 365 Education…: 14 en producción).

Además, el lote de cada ciclo no distinguía entre una fuente oficial con una oferta nueva sin
comprobar y cualquier otra fuente vieja: con más de mil fuentes, una oferta nueva podía esperar
semanas a su primera verificación.

## Qué cambia

- `ensureCuratedSources` marca como oficial la fuente existente con la misma URL canónica que una
  página curada (`official_reason: curated`).
- `promoteOfficialLeads` (cada ciclo de descubrimiento) marca como oficiales las pistas de
  StudentOffers cuyo enlace está en el dominio de la marca (`official_reason: brand_domain`). No
  toca agregadores (StudentBeans, UNiDAYS, SheerID…), redirecciones ni pistas de búsqueda (Brave),
  cuyos nombres son títulos de página y harían pasar blogs por oficiales.
- Prioridad del lote: después de las ofertas publicadas que tocan re-verificar, hasta una quinta
  parte del lote (12 de 60, las llamadas de IA por ciclo) va a fuentes oficiales con ofertas que
  nunca se comprobaron.

Marcar una fuente como oficial **no publica nada**: la oferta sigue necesitando una verificación
`active` con puntuación ≥ 80, la misma comprobación de evidencia que el panel, sin reportes ni
duplicados. La IA (Groq) sigue limitada a 12 extracciones por ciclo, así que el atraso se procesa
en días, no de una vez.

## Cómo deshacer

Una fuente promovida se puede desactivar desde el panel (pestaña de fuentes) o en Supabase:
`update nova_private.sources set official=false where extra->>'official_reason'='brand_domain';`
(la próxima corrida la volvería a promover; para apagarlo del todo hay que revertir este cambio).

## Validación

`test/studentoffers.test.js`: la URL curada gana sobre la pista; una pista de StudentOffers en el
dominio de la marca se promueve; agregadores, blogs de búsqueda y redirecciones no; las dos
funciones son idempotentes. `test/highlights.test.js`: orden del lote con el nuevo tramo y su tope.
