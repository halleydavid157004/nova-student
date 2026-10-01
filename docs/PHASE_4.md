# Fase 4 — Catálogo estático y SEO

El generador `tools/static/build.js` recibe únicamente `generated/catalog.json` del radar. Reaplica publicación (official/reviewed, activa, fresca y no vencida) y lista explícita de campos, escapa HTML/JSON-LD, limita rutas a IDs y slugs seguros, rechaza IDs duplicados y limita el sitio a 10 MB. Genera portada con ofertas en HTML inicial, ficha por beneficio con requisitos/pasos/fuente/evidencia cuando existe, catalog.json, sitemap, robots, favicon, CSS local y 404. No publica instantáneas, suscriptores, secretos ni notas privadas.

Búsqueda básica en cliente sin solicitudes a Render; la fase 5 añadirá relevancia, sinónimos y filtros completos. El cliente oculta ofertas vencidas o sin comprobación fresca incluso cuando el visitante conserva HTML antiguo. Las fechas visibles son las comprobaciones reales, no la generación. Nova AI/alertas enlazan a la aplicación de Render y conservan su arranque en frío; cuentas/doble opt-in están pendientes de fases posteriores.

## Publicación gratuita

1. Completar y verificar la activación de Actions de fase 3.
2. GitHub → Settings → Pages → Build and deployment → Source: GitHub Actions.
3. GitHub → Settings → Secrets and variables → Actions → Variables: `STATIC_PAGES_ENABLED=true`.
4. Ejecutar Radar cada 6 horas. Si no exporta catalog.json por ventana ya completada, esperar la siguiente ejecución programada.
5. Comprobar el job `pages` y su URL. El destino previsto es https://halleydavid157004.github.io/nova-student/; no se declara publicado hasta una ejecución exitosa.

La generación y Lighthouse se ejecutan en el job del radar; fallos no publican. Solo el job de despliegue recibe pages:write/id-token:write, sin secretos del radar. El artefacto contiene únicamente generated/site y se conserva un día. Sin PAT ni nuevo servidor. Dejar `STATIC_PAGES_ENABLED` ausente mantiene la fase 3 sin cambios.

## Pruebas y rollback

`npm test` cubre HTML inicial, gate de publicación, campos privados, XSS/JSON-LD, rutas, SEO, búsqueda sin tildes y decaimiento de caché. `npm test --prefix tools/browser` ejecuta Chromium y Lighthouse en Actions (Lighthouse 13.5.0 fijado en lockfile, solo herramientas). Exige ≥90 en rendimiento, accesibilidad y SEO en portada y ficha; además audita el catálogo productivo antes de publicar. Estos umbrales no se consideran logrados hasta ver CI/producción.

Rollback: desactivar STATIC_PAGES_ENABLED, retirar la publicación en Settings → Pages si hace falta, revertir el PR. Sin migración ni cambios en API o extensión. Un sitio estático necesita ciclos regulares para renovar HTML y retirar URLs antiguas; sin JS la fecha de comprobación sigue visible pero el cliente no puede ocultar contenido de una copia vieja.

## Pendiente de verificación

Activación de Pages, primer catálogo productivo publicado y métricas Lighthouse reales. No se han ejecutado cuentas ni datos personales en Pages. El catálogo es informativo y gratuito; no debe convertirse en tienda ni SaaS comercial en Pages.
