# Auditoría de código — Fase 0

Fecha: **2026-09-30 UTC**. Base: `58899392e5701d39cb187af4db8c21b051e25266`. Se inspeccionaron los **52 archivos versionados**: servidor, servicios, semilla, web, extensión, 11 archivos de pruebas, workflows, SQL/documentación, configuración y lanzadores. El lockfile se revisó como JSON de dependencias e integridades; el acceso directo binario se identificó por su formato y se eliminó sin ejecutarlo. No se copiaron secretos, instantáneas privadas ni listas de suscriptores.

Esta fase cambia documentación, higiene del repo, lanzadores y CI. **No cambia la API, el catálogo, el worker, la validación ni la base de producción.** Una prueba verde no valida las condiciones comerciales de cada proveedor.

## Mapa de módulos

| Archivos | Responsabilidad y acoplamientos |
| --- | --- |
| `server.js` | HTTP nativo, estáticos, búsqueda, alertas, chat y administración. Arranca la persistencia y el worker. Rutas y validadores están concentrados en un archivo de líneas extensas. |
| `src/env.js`, `.env.example` | Carga local sin sobrescribir el entorno; configuración pública de ejemplo. |
| `src/db.js` | Objeto global mutable, IDs secuenciales, JSON local o una fila `nova_state`, guardado diferido y cierre. Todos los servicios dependen de sus arrays. |
| `src/seed.js`, `src/data/seed.js` | Catálogo/fuentes iniciales y correcciones editoriales aplicadas una vez por revisión. Conservan IDs y datos de usuarios. |
| `src/services/search.js` | Regla de publicación, búsqueda con normalización de tildes/categorías, ranking y filtros; resultados por dominio. |
| `src/services/crawler.js` | Descubrimiento StudentOffers/Brave/GitHub/Groq, robots simplificado, fetch, extracción y cambios por hash; actualización de fuentes y fichas. |
| `src/services/brave.js` | Ventanas de seis horas, rotación, reserva previa, contador mensual compartido y pausa por cuotas/errores. |
| `src/services/groq.js` | Cola limitada, pausa, alternativas de modelos, extracción JSON y chat con ofertas publicadas. |
| `src/services/api-limits.js` | Admisión global por tiempo y concurrencia para chat/alertas. |
| `src/services/email.js` | Resend HTTPS o SMTP local, digests y codificación SMTP. |
| `src/worker.js`, `src/scan-once.js`, `src/smoke-test.js` | Planificación y estado del radar; CLI de escaneo; comprobaciones básicas. |
| `public/index.html`, `app.js`, `styles.css` | Web sin framework; contenido del catálogo obtenido por API; favoritos locales, modales, radar, chat y temas. |
| `extension/*` | Manifest V3, popup y detección del dominio visitado. API y enlaces apuntan actualmente a localhost en tres archivos. |
| `.github/workflows/*`, `render.yaml` | Tests; horario que despierta/verifica Render. El YAML de Render no demuestra qué ajustes tiene el servicio real. |
| `docs/*.sql`, auditorías previas | Bootstrap privado, prueba reversible de permisos y Supabase Cron como disparador HTTP. Documentos históricos, no instrucciones para la futura arquitectura normalizada. |
| `package*.json`, `.gitignore`, lanzadores | Node ESM sin dependencias de runtime; jsdom solo de desarrollo. Arranque Windows y exclusión de archivos privados. |

## Flujo de datos y confianza

1. El arranque lee JSON local o `nova_state.state` completo. Si está vacío, inserta la semilla; si ya existe, aplica correcciones editoriales pendientes.
2. Temporizador, Supabase Cron y Actions activan **el mismo worker de Render**. Actions actualmente no descubre ni valida por sí mismo. Render dormido o suspendido sigue siendo una dependencia.
3. Brave reserva presupuesto antes del HTTP. Los resultados y agregadores incorporan fuentes con `official: false`; las fichas extraídas quedan `pending`.
4. El escaneo consulta robots, descarga HTML estático, compara un hash amplio y modifica campos de fuente/oferta. HTTP 200 actualiza `verified_at` sin confirmar el beneficio; HTTP 404/410 puede retirar una ficha con un solo fallo.
5. `isPublishedOffer` exige `status: active`, `official || reviewed` y vencimiento no pasado. API pública, chat y correo usan esa regla. No existe puntuación de vigencia ni decaimiento temporal.
6. Cada cambio modifica arrays y persiste una **instantánea completa**. No hay exclusión transaccional entre procesos ni versiones por fila. El navegador guarda sus propios favoritos; el email queda en la instantánea privada.

`official` expresa una aprobación previa del catálogo; no se debe inferir de HTTP 200, de un buscador o de un texto que diga «student». Las semillas y correcciones contienen afirmaciones cuya verificación debe renovarse con evidencia de cada beneficio, no con la mera accesibilidad de una URL. `REGIONAL` tampoco demuestra elegibilidad para un país concreto.

## Riesgos priorizados

Prioridad P0: antes de habilitar múltiples escritores o campañas públicas. P1: antes de ampliar adquisición/ingesta. P2: calidad y operación. Esfuerzo relativo: bajo (aislado), medio (un subsistema), alto (migración/varios subsistemas).

| ID / prioridad | Evidencia en código y consecuencia | Impacto / esfuerzo | Fase y solución |
| --- | --- | --- | --- |
| DATA-01 / P0 | `db.flushSave` sobrescribe toda la fila sin CAS. Dos procesos pierden cambios, reservas o alertas; secuencias locales pueden colisionar. | Muy alto / alto | 1: filas normalizadas, IDs del servidor, conflictos explícitos y reservas atómicas; conservar snapshot para rollback controlado. |
| LIVE-01 / P0 | `crawler.scanSource` usa HTTP 200 como fecha de verificación y 404/410 como desactivación inmediata. No detecta soft-404, pérdida del beneficio ni decaimiento. | Muy alto / alto | 2: señales, extracción validada, historial, evidencia relevante y dos fallos consecutivos en revisadas. |
| EMAIL-01 / P0 | `/api/alerts` activa una dirección sin confirmar titularidad. Sin doble opt-in, baja, preferencias, eliminación, registro de consentimiento ni cuota Resend distribuida. | Alto / alto | 6/7: identidad, consentimiento, cola/idempotencia y límites; no lanzar campañas antes. |
| XSS-01 / P1 | `public/app.js` interpola `source_domain` sin escape en `src` de logos; campos importados malformados pueden romper el atributo. `extension/popup.js` inserta título/beneficio/URL en `innerHTML` sin saneamiento. | Alto / medio | 2/4/6: esquema de ingesta, DOM/textContent, URLs y atributos validados; fixtures maliciosos. La CSP de extensión no sanea HTML ni enlaces. |
| FETCH-01 / P1 | URLs descubiertas/extraídas y redirecciones del crawler no bloquean de forma uniforme IP privadas, credenciales ni DNS interno. `response.text()` no limita bytes descargados. | Alto / medio | 2: URL/DNS/redirecciones seguras, HTTPS, timeout y tope de bytes; bloquear captchas/403 sin eludirlos. |
| ROBOTS-01 / P1 | `robotsAllows` solo interpreta prefijos Disallow; sin precedencia correcta, Allow/patrones ni caché por host. Errores HTTP de robots permiten rastrear; adaptadores de descubrimiento no comparten la política. UA usa enlace de repo incorrecto. | Alto / medio | 2/3: política por fuente, parser probado, UA con contacto válido, backoff exponencial y pausas por dominio. Revisar términos aparte de robots. |
| ADMIN-01 / P1 | `server.auth` rechaza vacío/`change-me-now`, pero usa un bearer compartido sin identidad, roles, revocación ni auditoría de acciones. | Alto / alto | 8: JWT validado y rol admin en base; retirar token compartido. |
| WEB-01 / P1 | CORS `*` también en rutas de escritura; no hay lista de orígenes. JSON tiene nosniff/no-store, pero estáticos no tienen CSP, frame-ancestors, Referrer-Policy ni Permissions-Policy. | Medio-alto / medio | 4/6: orígenes de web/extensión, métodos explícitos y cabeceras. Adaptar handlers inline antes de CSP estricta. CORS no sustituye autenticación. |
| INPUT-01 / P1 | Hay límites de mensaje, filtros, JSON objeto, timezone y 429; cuerpo limitado por caracteres, no bytes. Extracciones externas no validan tipos/arrays/fechas íntegros. | Alto / medio | 2/6: esquemas, tamaño en bytes, métodos/content-type, pruebas de formas maliciosas y límites distribuidos. |
| AI-01 / P1 | Solo publicación aprobada entra al chat, pero citas/recomendaciones dependen del prompt. Extracción admite JSON parcial, temperatura distinta de cero y no cita evidencia. Texto web permite prompt injection. | Alto / medio | 2/5: esquema/repair único, entradas no confiables delimitadas y respuesta ligada a IDs/fichas publicadas. |
| QUOTA-01 / P1 | Brave persiste intentos y pausa en 429 (positivo), pero exclusión es local; chat/crawler Groq comparten límites de proceso, no de organización. Reintentos de Groq no son exponenciales. | Alto / medio | 1/3: reservas transaccionales, presupuesto por proveedor y backoff. No atribuir al contador usos de otras aplicaciones. |
| OPS-01 / P2 | Ventana reservada antes de trabajo evita repetición, pero un crash puede dejar ciclo incompleto sin reanudación. SIGTERM guarda estado sin cancelar/esperar todo escaneo en curso; eventos se recortan a 2.000. | Medio-alto / medio | 3: leases/checkpoints, worker_runs con resultado y retención definida. |
| UI-01 / P2 | Catálogo inicial vacío y dependiente del arranque de Render; sin fichas estáticas, sitemap/JSON-LD/OG. Fonts/logos externos; animaciones sin reduced-motion. Navegación móvil se oculta. | Alto / alto | 4: HTML real, SEO, accesibilidad y Lighthouse medido en Actions. |
| SEARCH-01 / P2 | Búsqueda actual cubre tildes y marcas, pero no fuzzy/prefijo ni diccionario externo. Límites API de resultados y carga de fuentes acoplada a búsqueda; no 30 consultas de relevancia. | Medio-alto / medio | 5: índice cliente, sinónimos, filtros combinables y consultas esperadas. |
| SYNC-01 / P2 | Favoritos solo locales; `loadSaved` elimina IDs tras errores transitorios de API. No Auth/sync. Extensión requiere localhost y permisos amplios de visitas. | Alto / alto | 6: merge autenticado, conservar favoritos ante 503, config producción única y permisos mínimos. |
| RUNTIME-01 / P1 | Node 20 sigue siendo compatible pero su versión está EOL según fuente oficial consultada. CI anterior solo probaba 24. | Alto / bajo | 0: matriz 20/24 y nota explícita; recomendar LTS mantenido, sin cambiar el runtime de Render en esta fase. |

## Seguridad: controles que sí existen y límites

- El servidor falla al arrancar si Supabase configurado no responde; no cae silenciosamente a una base local temporal. URL Supabase acotada al dominio HTTPS del proyecto, clave solo servidor, redirecciones remotas rechazadas.
- SQL actual: RLS y revocación de anon/authenticated en `nova_state`. La clave secreta del servidor puede leer datos personales: nunca exponerla al cliente, logs o workflows de PR de forks.
- La web escapa títulos, requisitos y respuestas de chat antes del formato Markdown; `safeUrl` rechaza javascript/data. Falta cerrar la interpolación de dominios y validar todo material extraído. No se confirma una explotación de producción: se identifica la ruta vulnerable bajo datos importados malformados.
- Límites actuales de chat/alertas son globales por proceso. Frenan abuso, pero no permiten autorización por usuario ni reservas compartidas en Actions/Render. La validación de email es sintáctica, no prueba consentimiento.
- No se hallaron secretos reales versionados en los archivos inspeccionados. Esto no constituye un barrido de todos los commits históricos. Evitar registrar errores con cuerpos de proveedores o respuestas administrativas con emails.
- La ruta de estáticos comprueba que el archivo esté dentro de `public`. No hay sesiones/cookies hoy; los riesgos de CSRF y ownership deben reevaluarse al introducir Auth.

## Cobertura y deuda de pruebas

Base ejecutada localmente con **Node 24.19.0**: `npm test`, **36 correctas / 0 fallos**. `node --experimental-test-coverage --test test/*.test.js`: **81,43% líneas, 71,09% ramas, 72,99% funciones**. El informe de Node incluye servidor/subprocesos instrumentados; no mide cobertura real de navegador, políticas SQL remotas, proveedores reales ni requisitos editoriales. El código compacto puede producir cifras de líneas poco útiles: server 100% líneas pero 71,32% ramas y 69,23% funciones.

| Pruebas existentes | Cobertura útil | Hueco principal |
| --- | --- | --- |
| app / api-limits | HTTP real local, reglas de publicación, token de ejemplo, entradas y 429 | CORS/cabeceras, roles, auth, SSRF, propiedad y reportes |
| brave | Rotación, meses, límites, 429/401, concurrencia y cursor | Varios procesos y reserva transaccional |
| storage / supabase-storage | Reinicios, snapshots ordenados, error/cierre lento, reserva duradera | SQL normalizado, RLS real, idempotencia y rollback |
| crawler | Batch válido, leads pendientes | Liveness; HTML activo/expirado/soft-404/redirect/bloqueado; robots completos |
| groq | Sobrecarga, cambio de modelo, auth y cuota diaria | JSON de extracción, retry validado, evidencia y prompt injection |
| catalog / search | Correcciones idempotentes, expiración, tildes, marca/categoría | Elegibilidad completa, fuzzy, 30 casos y datos estructurados |
| email | Dot-stuffing de SMTP | Envío real, double opt-in, baja, límite/cola/idempotencia |
| ui (jsdom) | Buscar, abrir ficha, favoritos, radar, alerta y chat escapado | No es Playwright; sin layout/Lighthouse/teclado/flujo real de proveedor |

Fase 0 añade una prueba del lanzador en runner Windows estándar: `.env` ausente, PORT personalizado e instancia sana existente. En Linux se omite por plataforma. CI amplía a Node 20/24 con timeout y permisos solo lectura. El arranque desde cero en escritorio y apertura real del navegador requieren comprobación manual Windows; no se atribuyen a jsdom.

Deuda estructural: arrays globales, líneas largas en rutas/crawler, semilla y afirmaciones sin historial de evidencia, JS/CSS monolíticos, metadatos mezclados con contenido, ausencia de contratos de repositorio, pruebas SQL/E2E y migraciones/rollback versionados. Refactorizar por contrato y fase, conservando endpoints/IDs para la extensión; no hacer una reescritura masiva.

## Higiene aplicada y cómo verificar

- Un único `ABRIR_NOVA_STUDENT.cmd`; crea `.env`, comprueba Node mínimo 20 y `/api/health`, respeta PORT y muestra errores en la consola del servidor. `--diagnostico` no imprime secretos; `--no-browser` permite la prueba de CI.
- Eliminados `.lnk`, variantes duplicadas, wrapper roto `.bat` y uploader de una ruta personal con `git add .`/push a main. Publicar cambios con revisión explícita de `git diff` y PR.
- README y LEEME alineados con archivos reales. Groq, almacenamiento, correo y radar tienen secciones propias. `.gitignore` protege variantes privadas de `.env`, todo `storage/` y futuros resultados de tests; conserva `.env.example`.
- Límites oficiales fechados en [FREE_TIER_LIMITS.md](FREE_TIER_LIMITS.md). No se creó un servicio ni se cambió el plan.

Validación: `npm ci && npm test`; informe de cobertura con el comando anterior; CI Node 20/24 y prueba Windows; `git diff --check`. En Windows: doble clic al único lanzador; repetir con la app abierta; ejecutar `ABRIR_NOVA_STUDENT.cmd --diagnostico`; configurar un PORT válido distinto en entorno y repetir. No hace falta desplegar esta fase para corregir el arranque local. Los riesgos funcionales de la tabla anterior siguen pendientes y cada fase necesita su propio PR, pruebas y documentación.

## Orden de implementación y migración segura

1. Fase 1: contrato de repositorio por fila, esquema/índices/RLS y fixture importado dos veces; rollback con mantenimiento, snapshot protegido y comprobación de conteos. No habilitar un segundo escritor hasta completar el corte y las reservas distribuidas.
2. Fase 2: señales/evidencia de vigencia, fetch/robots seguros y fixtures; conservar `official || reviewed` y barrera de dos fallos.
3. Fase 3: ciclo completo Actions, secretos solo en entorno protegido, exclusión y presupuesto persistentes; Render deja de rastrear.
4. Fases 4/5: catálogo estático, E2E/Lighthouse y búsqueda con casos de relevancia/citas.
5. Fases 6–9: Auth/sync, consentimiento/envíos, admin por rol y diferenciadores. Nunca dar por probado envío, elegibilidad, SEO o sincronización porque la UI muestra un botón.

## Actualización fase 8 (2026-10-02)

ADMIN-01: panel por rol de Supabase Auth, verificación de usuario y sesión actuales,
RPC exclusiva de backend y auditoría de decisiones. Retirados los endpoints de
token compartido que exponían alertas/correos o disparaban escaneos/digests. El rol
solo usa `app_metadata`; los perfiles editables no conceden permisos.
Activación Auth y designación del propietario siguen pendientes: ver PHASE_8.md.
