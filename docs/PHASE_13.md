# Fase 13 — Verificación continua de lo publicado

Versión 2.13.0. Migración nueva: `supabase/migrations/20261003000000_phase13_report_quarantine.sql`
(rollback en `supabase/rollback/phase13_report_quarantine.sql`). Sin variables ni servicios nuevos.

## Por qué

Con la publicación automática de la fase 12, la confianza depende de volver a comprobar lo
publicado. El límite real era Groq: 12 extracciones con IA por ciclo (unas 48 al día, dentro de los
200.000 tokens diarios gratis), compartidas entre ofertas nuevas y re-verificaciones.

## Qué cambia

- **Re-verificación sin IA cuando nada cambió.** Para una oferta publicada, si la cita exacta
  aprobada (y cada número y fecha que contiene) sigue en la página oficial, esa cita es la evidencia
  del día: la verificación queda registrada con `evidence_reused` y no gasta IA. Si la cita
  desaparece, se usa la extracción con IA como antes; si la página terminó, da 404 o bloquea, se
  aplican las reglas de siempre. Las ofertas no publicadas siempre reciben una extracción nueva.
- **Más capacidad para lo publicado.** Hasta dos tercios de cada lote se reservan para las ofertas
  publicadas que cumplen 24 horas sin comprobar (antes un tercio). El radar de Actions revisa 60
  fuentes por ciclo (antes 30), con las mismas pausas por origen y el mismo cupo de IA.
- **Reportes que retiran.** Si dos personas distintas reportan una oferta publicada como vencida,
  cambiada o rota en 14 días, y son más que quienes dicen que les funcionó, la oferta sale del
  catálogo al instante, vuelve a `pending` y queda un evento `offer_reported_hidden`. Se republica
  aprobándola en el panel tras una verificación nueva; la aprobación automática no la toca mientras
  tenga reportes pendientes.
- **Identidad de quien reporta.** Detrás del proxy de Render todas las visitas llegaban con la
  dirección del proxy, así que todos contaban como una sola persona (y compartían el tope de 3
  reportes al día). Ahora se usa la última entrada de `X-Forwarded-For`, la que añade Render, solo
  cuando `RENDER=true`. Se guarda únicamente su HMAC, como antes.

## Activación

Supabase → SQL Editor → ejecutar la migración de esta fase (después de la de la fase 12).

## Validación

`test/liveness.test.js` (reuso de la cita, sin llamadas a la IA; vuelve a la IA si la cita
desaparece; nunca para ofertas no publicadas; una página vencida sigue venciendo),
`test/highlights.test.js` (reserva de dos tercios), `test/api-limits.test.js` (dirección del
cliente) y `test/phase13-sql.sql` en PostgreSQL (un reporte o el mismo reportero no retiran; dos sí;
las confirmaciones pesan; evento de revisión; rollback).
