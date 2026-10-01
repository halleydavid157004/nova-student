# Límites gratuitos y decisiones

Consulta: **2026-09-30 UTC**. Fuentes oficiales; no es una inspección del consumo ni de la facturación de las cuentas. Antes de usar una función nueva se debe contrastar su límite y volver a fechar este documento.

| Servicio | Límite publicado consultado | Decisión para Nova |
| --- | --- | --- |
| [Render Free](https://render.com/docs/free) | 750 horas por espacio/mes; suspensión tras 15 minutos sin tráfico; archivos efímeros; SMTP 25/465/587 bloqueado. Ancho de banda y builds tienen cuotas separadas. | Mantener el servicio existente Free; no contratar discos, workers ni cron de Render. Migrar el radar a Actions y el catálogo a alojamiento estático. Si se agota la cuota, pausar. |
| [Supabase Free](https://supabase.com/pricing) | 500 MB de base; 5 GB de salida y 5 GB de salida en caché; 1 GB de archivos; 50.000 usuarios activos mensuales; máximo 2 proyectos activos; pausa tras una semana de inactividad. | Usar el proyecto existente. Evidencia breve, retención limitada, índices medidos y catálogo público estático. No guardar HTML completo ni copias con datos personales en GitHub. Free no incluye las copias diarias del plan Pro. |
| [GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) | Ejecución con runners estándar gratuita en repositorios públicos. Runners grandes siempre facturables; caché incluida hasta 10 GB por repo. | Ubuntu/Windows estándar, timeout y concurrencia; sin runners grandes ni ampliar caché. La caché de Playwright debe quedar por debajo del cupo. No subir artefactos privados. |
| [Brave Search](https://brave.com/search/api/) | Search: 5 USD/1.000 solicitudes; 5 USD de crédito mensual. | Conservar máximo 600 intentos/mes UTC y 100 auxiliares. A ese precio son 3 USD cubiertos si quedan créditos: no garantiza costo cero si otros usos de la cuenta los agotan. No activar gasto adicional; pausar sin saldo. |
| [Groq Free](https://console.groq.com/docs/rate-limits) | Para `openai/gpt-oss-20b` y `120b`, tabla consultada: 30 RPM, 1.000 RPD, 8.000 TPM, 200.000 TPD. Límites por organización, con posibles excepciones visibles en su panel. | Compartir cuota entre chat y radar; respetar 429 y cabeceras del proveedor. No habilitar Developer ni intentar eludir cuotas rotando cuentas. |
| [Resend Free](https://resend.com/pricing) | 3.000 correos/mes; 100/día. | Cola y reserva persistente antes de enviar, incluyendo mensajes de confirmación. El remitente público necesita dominio verificado ya disponible; no comprar un dominio. Sin remitente apto, mantener envío detenido. |

## Compatibilidad de Node

[Node.js Releases](https://nodejs.org/en/about/previous-releases), consultado el mismo día, clasifica Node 20 como **EOL** y Node 24 como **LTS**. La Fase 0 mantiene `engines.node >=20`, verifica Node 20/24 en CI y recomienda Node 24 para instalaciones nuevas. No modifica la versión del servicio existente. La compatibilidad con 20 no equivale a recibir parches de seguridad.

## Controles y límites pendientes

No se creó ni actualizó ningún recurso de pago. El consumo de otras aplicaciones de una cuenta no se puede deducir del contador de Nova. La Fase 1 convierte el presupuesto de Brave en reserva transaccional por mes UTC, compartida entre procesos; el modo antiguo `snapshot` conserva la limitación de un escritor. La coordinación de ciclos pasa a Actions en Fase 3. La Fase 3 incorpora reservas y topes persistentes de correo; aún falta la cola recuperable y consentimiento completo de Fase 7: no tratarlo como listo para una campaña pública. Auth, Pages y Playwright se documentarán con sus fuentes antes de esas fases.

## Fase 2 — consultas 2026-09-30

No se habilitó pago ni se añadieron servicios. Playwright 1.63.0 vive en `tools/browser`; el runner Ubuntu estándar del repositorio público ejecuta Chromium, guarda una sola familia de caché por lockfile y no sube artefactos. No se aumenta la cuota de caché de GitHub. [Documentación de instalación](https://playwright.dev/docs/browsers) y [caché Actions](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows).

Groq mantiene free tier y los mismos modelos: 12 llamadas de extracción por ciclo, contando reintentos; el chat comparte el límite global ya existente. [JSON mode](https://console.groq.com/docs/structured-outputs) evita nuevos SDKs o modelos de pago. La restricción de frecuencia de cada fuente se conserva también durante renderizado headless. Las tablas/checks contienen señales y citas breves, no HTML completo; retención y tamaños se revisarán en Fase 3.

## Fase 3 — consultas 2026-10-01 UTC / 2026-09-30 Colombia

El radar usa runners Ubuntu estándar del repo público y la misma caché Chromium (~284 MB observados en CI), sin artefactos ni paquetes nuevos de servidor. La [facturación oficial](https://docs.github.com/en/billing/concepts/product-billing/github-actions) confirma runners estándar gratis en repos públicos; los artefactos comparten 500 MB de GitHub Free con Packages, por eso esta fase no los sube. No amplía caché ni contrata runners.

[Schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) admite retrasos/ejecuciones descartadas y desactiva cron público tras 60 días sin actividad. Se documenta la reactivación manual; no hay SLA inventado. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys) conserva claves 24 horas: Nova conserva sus intenciones privadas 90 días y no reintenta resultados inciertos. Reservas de digest: 90/día y 2.700/mes para dejar margen al opt-in futuro. Las cuotas de otras apps no se deducen de estos contadores; mantener gasto adicional deshabilitado.

## GitHub Pages — consulta 2026-10-01

[Documentación oficial](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits): disponible gratis en repositorios públicos; sitio máximo 1 GB, límite blando 100 GB/mes, timeout de publicación 10 minutos. Los 10 builds/h no aplican al workflow propio de Actions. Nova limita su salida a 10 MB y artefacto a un día, usando runners Ubuntu estándar. Pages no permite usarlo primordialmente para transacciones comerciales o SaaS comercial: se publica solo el catálogo informativo gratuito, sin cuentas/transacciones; API y altas siguen en Render. No comprar dominio ni contratar plan. La configuración inicial de Pages requiere administración del repo, que este conector no expone como operación.

## Fase 6 — consulta 2026-10-01 Colombia

[Supabase Free](https://supabase.com/pricing): Auth incluido, 50.000 MAU y 500 MB de base. Las tablas de cuentas usan RLS/grants explícitos, cuotas por usuario y pausa de inserciones de favoritos/búsquedas a 400 MB; no se habilita gasto. [SMTP predeterminado](https://supabase.com/docs/guides/auth/auth-smtp): solo destinatarios miembros del equipo, actualmente 2 mensajes/hora; no apto para público. Mantener Auth desactivado hasta comprobar un SMTP gratuito válido y el consentimiento. Resend requiere un dominio ya disponible y presupuesto compartido con digests; no comprar dominio.

[Chrome Web Store](https://developer.chrome.com/docs/webstore/register) exige una tarifa de registro para nuevos desarrolladores: no se paga ni se publica. Alternativas gratuitas: instalación sin empaquetar en modo desarrollador y [Microsoft Edge Add-ons](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account), sin tarifa de registro; acuerdo y revisión pendientes.

Se revisó [changelog Supabase](https://supabase.com/changelog): las tablas nuevas necesitan [GRANT explícito](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically). El cambio de [Postgres 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) no requiere usar ltree/btree_gist ni cifrado pgcrypto en esta fase. PKCE se contrastó con la [especificación oficial de Auth](https://github.com/supabase/auth/blob/master/openapi.yaml) y la [guía PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## 2026-10-01 — correo y consentimiento

Resend documenta 100 correos diarios por día UTC y 3.000 mensuales en Free; recibidos y enviados cuentan. Referencia oficial: https://resend.com/docs/knowledge-base/account-quotas-and-limits . La aplicación reserva 90 intentos/día y 2.700/mes para confirmaciones + digests, con margen; no usar el mismo presupuesto para Auth ni otras apps sin integrarlas. La API permite cabeceras personalizadas y claves idempotentes con caducidad de 24 horas: https://resend.com/docs/api-reference/emails/send-email . Las reservas durables evitan duplicación incluso después de esa caducidad. No se habilitan excedentes pagados.

Supabase changelog revisado: https://supabase.com/changelog . Se conservan grants explícitos, RPC privada por service_role y PostgreSQL normal; no OrioleDB ni producto de pago. Para el aviso se consultaron artículos 8–12 de la Ley 1581: https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981 y https://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html . El código no sustituye la identificación del operador ni permite afirmar cumplimiento completo mientras falten los pendientes documentados.
