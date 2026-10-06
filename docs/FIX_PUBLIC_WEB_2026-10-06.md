# Reparaciones de la web pública — 2026-10-06

## Cambios y alcance

- Render sirve `/catalogo/` con ofertas publicadas en el HTML inicial, una ficha por oferta, catálogo JSON, sitemap y robots reales. Reutiliza el generador estático existente sin Playwright ni nuevas dependencias de producción.
- El pie de página enlaza al catálogo disponible. Las rutas inexistentes responden 404 en lugar de la portada. Se conservan los contratos de health, worker-status y la extensión.
- Los endpoints de ofertas aplican la misma lista de campos públicos del catálogo: no entregan identificadores internos de fuentes, huellas ni metadatos de descubrimiento.
- Se añaden cabeceras de seguridad y CSP a la portada y al catálogo. La inicialización del tema se mueve a un archivo para evitar JavaScript inline.
- La caché se invalida al cambiar los datos públicos o dejar una oferta de ser publicable. Una fecha de comprobación en el futuro no acredita vigencia. Un estado pendiente de confianza se conserva al proyectar el catálogo.

Sin cambios de esquema. Rollback: revertir este PR; no es necesario revertir migraciones ni datos. No se modifican secretos ni configuraciones de Render.

## Verificación

`npm test`; CI en Node 20/24, PostgreSQL, Windows y Playwright. Las pruebas HTTP comprueban MIME de robots/sitemap, HTML inicial, 404, CSP y campos públicos. Las pruebas de caché incluyen retirada, caducidad y datos privados; las de confianza comprueban que una proyección no mejore artificialmente el estado.

## Activación y pendientes reales

1. En Render: Manual Deploy → Deploy latest commit. Comprobar `/api/health`: versión **2.17.1** y almacenamiento normalizado sincronizado.
2. Abrir `/catalogo/`, `/robots.txt` y `/sitemap.xml`. El catálogo en Render sigue sujeto al arranque en frío del plan Free. Esta reparación no activa GitHub Pages.
3. Para CDN gratuita: configurar GitHub Pages con GitHub Actions y la variable de repositorio `STATIC_PAGES_ENABLED=true`; consultar el workflow `radar-schedule.yml` y la documentación de catálogo estático antes de activarlo. El conector de esta sesión no permite configurar Pages ni disparar workflows.
4. La autoaprobación queda pausada en Supabase mientras se revisan las fuentes históricas. El radar programado continúa. Los cambios materiales de las ofertas requieren revisión, no una fecha o evidencia inventadas.
5. Cuentas/admin necesitan habilitar Supabase Auth y asignar un administrador real. Alertas por correo necesitan responsable/contacto reales (`PRIVACY_CONTROLLER`, `PRIVACY_CONTACT_EMAIL`) y remitente admitido por Resend. No se pueden inventar estos datos ni garantizar entrega sin una prueba consentida.

No se promete disponibilidad del 100% ni cobertura de todas las ofertas de internet. Hay servicios gratuitos con límites y fuentes que bloquean la extracción; estos casos deben quedar visibles como pendientes de revisión.
