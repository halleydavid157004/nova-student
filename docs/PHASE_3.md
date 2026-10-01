# Fase 3 — radar completo en GitHub Actions

Plan y archivos: trasladar descubrimiento, validación, exportación pública y digests a `tools/browser/radar.js` y `radar-schedule.yml`; ampliar `worker.js`, almacenamiento y migración/rollback para coordinar procesos, conservar presupuesto y registrar ejecuciones; seleccionar fuentes con `scan-priority.js`; exportar únicamente una lista explícita de campos; probar ciclo, permisos, recuperación y cuotas.

## Funcionamiento y transición

El workflow usa Ubuntu estándar y Node 24 en el repo público. Cron `17 */6 * * *`: ventanas 00:17, 06:17, 12:17 y 18:17 UTC. Consulta Supabase y proveedores directamente: **no usa URL, health ni endpoint administrativo de Render**. Descubre pistas pendientes, valida fuentes con robots y headless cuando hace falta, genera `generated/catalog.json` y procesa digests elegibles. Playwright sigue fuera de las dependencias de Render.

`RADAR_ACTIONS_ENABLED=true` es una variable de repositorio que activa el nuevo trabajo. Hasta activarla sigue funcionando el trabajo antiguo que despierta Render; nunca se ejecutan ambos en la misma ejecución. En Render `RADAR_ENGINE=actions` y `WORKER_ENABLED=false` eliminan los timers, digests y escaneos administrativos locales. API, altas, chat y extensión conservan sus rutas. `/api/worker-status` mantiene campos anteriores y añade `engine` y `localEnabled`; recupera los metadatos de Actions desde Supabase. No borres BRAVE/Groq de Render si el chat los necesita.

La activación real y una primera ejecución contra proveedores están pendientes de GitHub Secrets y despliegue manual del propietario. CI prueba el ciclo con datos sintéticos, sin gastar APIs. No se presenta esa prueba como una ejecución productiva.

## Coordinación e historial

Además de `concurrency: nova-radar-writer`, PostgreSQL reserva una lease global de 30 minutos, con token UUID y `worker_runs`. Timeout de workflows: 25 minutos. Un proceso con lease vigente excluye al siguiente; los ciclos completados no se repiten en la misma ventana. Una ejecución fallida se puede reintentar; una lease abandonada queda registrada como fallo y expira. Las consultas Brave ya reservadas en esa ventana no se repiten. Un ciclo manual de validación usa la misma lease y no descubre ni envía correo.

El worker comprueba el token antes de descubrir, de escanear cada lote y de enviar correo. Cada check de Actions comprueba su token y referencia `worker_run_id`. El resumen transaccional contiene conteos de descubrimiento, escaneo, catálogo, correo y presupuesto; el Job Summary usa solo números. Los errores guardados son códigos controlados, sin cuerpos de proveedores, URLs privadas ni correos. Ningún RPC de coordinación/reserva admite anon o authenticated.

Una cancelación puede interrumpir el catálogo antes de terminar; el siguiente ciclo lo regenera. El export no se publica ni se sube como artefacto en esta fase: la publicación estática con Pages pertenece a Fase 4. El catálogo limita tamaño a 2 MB, elimina parámetros de URL y omite campos privados por construcción. No se exporta `db`, reportes, suscriptores o alertas. `generated/` está ignorado por git.

## Prioridad, cuotas y conservación

Lote de 30 fuentes por ciclo; cuatro visitas concurrentes con cola/frecuencia por origen. Prioridad: antigüedad de última comprobación (sin techo, evita inanición), score bajo y visitas agregadas cuando exista esa métrica. La fase no añade seguimiento personal ni inventa visitas; actualmente domina antigüedad/score. Se excluyen fuentes deshabilitadas, bloqueadas por términos o en backoff. Retry-After largo nunca se acorta a 24 horas; Crawl-delay superior a un minuto se difiere sin reducirlo para forzar una visita. El comportamiento rotativo local anterior sigue disponible para compatibilidad.

Brave conserva las reservas transaccionales en `budget_usage`: tope absoluto 600/mes UTC y 100 auxiliares; cuatro búsquedas por ventana. `BRAVE_MONTHLY_LIMIT` en GitHub puede reducirlo, nunca aumentarlo por encima de 600. El crédito disponible de otras aplicaciones de la cuenta no se puede inferir de Nova: no habilites gastos adicionales. Groq conserva 12 llamadas de extracción por ciclo; límites de proveedor y chat siguen aplicando.

Resend admite únicamente suscriptores con consentimiento confirmado. Reservas antes del envío: 90 intentos/día UTC y 2.700/mes, dejan margen de 10/día y 300/mes para futuros opt-in. Se conserva la reserva aunque el proveedor falle. Clave de idempotencia y `digest_deliveries` impiden duplicar envíos; un fallo incierto no se reintenta automáticamente. El proveedor recibe una sola llamada por intención, con pausas de 600 ms. Un fallo detiene el lote y persiste backoff de al menos una hora/Retry-After. Los resultados omiten el email. Este control no sustituye el opt-in, preferencias, baja ni cola recuperable de Fase 7. Sin remitente apto ya disponible, deja las claves de correo vacías; no compres un dominio.

Un ciclo cada seis horas procesa digests diarios/semanales a partir de las 08:00 de su zona, en la siguiente ventana; no garantiza entrega a las 08:00 exactas. Los periodos deduplican cada día/lunes/ventana instantánea. Alertas no confirmadas permanecen guardadas pero no se envían.

Mantenimiento: checks y eventos 90 días; versiones no aprobadas 90 días si ningún check las referencia; reportes 30 días; ejecuciones/correos terminados 90 días; presupuestos 24 meses. Nunca borra versiones aprobadas, suscriptores ni alertas. Más de 400 MB de base detiene el ciclo antes de proveedores para conservar margen bajo 500 MB Free. La retención debe revisarse con datos reales, sin descargar datos personales a GitHub.

## Activación: pasos para el propietario

1. En GitHub: repo → **Settings → Secrets and variables → Actions → Secrets**. Crea `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GROQ_API_KEY`, `BRAVE_SEARCH_API_KEY` con los mismos valores privados existentes en Render. No los pegues en PRs, archivos ni chat. `RESEND_API_KEY` y `RESEND_FROM` son opcionales y requieren remitente apto ya disponible.
2. Aplica las migraciones de Fases 1–3 si montas otro proyecto. En este proyecto se documenta abajo la verificación aplicada. Mantén normalizado.
3. En Render añade `RADAR_ENGINE=actions` y deja `WORKER_ENABLED=false`, conservando `SUPABASE_STORAGE_MODE=normalized`. **Save and deploy / Manual Deploy latest commit** de 2.4.0. Verifica health sin error y `worker-status` con `engine: actions`, `localEnabled: false`. No es necesario activar un worker o cron de pago.
4. En GitHub → misma pantalla → **Variables**, crea `RADAR_ACTIONS_ENABLED` con valor `true`. Si modificas `LIVENESS_MAX_AGE_DAYS`, usa el mismo valor en Render y GitHub (por defecto 14).
5. **Actions → Radar cada 6 horas → Run workflow → main**. Comprueba verde y su Summary. Una ventana completada puede indicar `already_completed`; espera la siguiente ventana. El workflow manual de validación también comparte la coordinación.
6. Comprueba `docs/supabase-actions-verify.sql` (solo conteos y permisos), ficha pública y chat. No publiques suscriptores ni una exportación completa para depurar.

Si faltan Secrets no actives la variable. Si debes volver temporalmente al motor anterior, desactiva la variable, detén todos los jobs y despliega la versión acordada con `WORKER_ENABLED=false` hasta revisar el estado. `supabase/rollback/phase3_actions_radar.sql` libera leases y marca interrupciones, conservando historia y presupuestos. No reactives el crawler viejo automáticamente ni borres reservas para repetir llamadas.

## Pruebas y limitaciones

`npm test`: ciclo sin Render con proveedores simulados, export público, prioridad, Summary, idempotencia/consentimiento/cuota de correo y periodos horarios. PostgreSQL 17 en CI: exclusión entre jobs, token inválido, ventana repetida, reintento, abandono, provenance de check, RLS, cuota diaria/mensual y mantenimiento. Continúan Node 20/24, Windows y E2E Chromium para buscar, abrir ficha y guardar alerta.

Los cron de GitHub pueden retrasarse o perder ejecuciones bajo carga; se desactivan en repos públicos tras 60 días sin actividad. No se promete puntualidad exacta ni disponibilidad ilimitada. Se conserva minuto 17 para evitar inicio de hora, y una ejecución manual permite revisar/reanudar. Sin actividad, reactiva Actions desde GitHub. No se crean commits vacíos para eludir esa política.

Fuentes oficiales consultadas 2026-10-01 UTC (2026-09-30 Colombia): [schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Resend usage](https://resend.com/docs/api-reference/rate-limit). Más límites en `FREE_TIER_LIMITS.md`.
