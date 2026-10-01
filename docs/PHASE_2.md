# Fase 2 — vigencia y evidencia

Plan: sustituir la comprobación basada en HTTP por señales de vigencia, mantener aprobaciones humanas, guardar versiones/checks por fila y probar escenarios reales con fixtures. Archivos principales: `liveness.js`, `source-http.js`, `crawler.js`, `groq.js`, almacenamiento, migración y rollback de Fase 2, formulario de reportes, tests y `tools/browser/` con workflows aislados. El despliegue de Fase 1 se comprobó el 2026-09-30: 2.2.0 / `a88daf3`, `normalized`, almacenamiento sano, 357 ofertas y 34 públicas.

## Qué determina el motor

| Estado | Señales y comportamiento |
| --- | --- |
| `active` | HTTP válido, extracción tipada y evidencia presente en la sección relevante; no hay cambios materiales confirmados |
| `needs_review` | JSON inválido, IA no disponible, condiciones dudosas, precio cambiado, redirección o reportes; guarda señales sin cambiar la aprobación |
| `possibly_expired` | Soft-404, título de página inexistente o contenido insuficiente |
| `expired` | HTTP 404/410, texto que declara finalizada la oferta o fecha de vencimiento documentada y pasada |
| `blocked` | Robots, 401/403/429, captcha o control de acceso; no se intenta sortearlo |

La puntuación va de 0 a 100. Redirecciones a home/otro dominio, beneficio ausente, valor cambiado, condiciones y reportes bajan el score. Se conservan HTTP final, destinos de redirección, hash de sección y señales; `checks` referencia la versión extraída. `offer_versions` nunca convierte una extracción nueva en aprobada. La referencia es la última versión aprobada; importación inicial mantiene las aprobaciones existentes.

Un fallo conserva la oferta revisada. Dos verificaciones negativas consecutivas pueden retirarla, con evento y evidencia para revisar. No cuenta dos veces el reintento de la misma visita. Los fallos de IA, presupuesto agotado y diferencias dudosas de redacción/país/método **no** suman fallos de expiración. Traducciones de “plan gratuito” a “free plan” no se consideran desapariciones. Un precio confirmado distinto sí queda en revisión y suma fallo. La recuperación técnica de una ficha retirada no la republica: requiere aprobación. El motor nunca establece `official` ni `reviewed`.

Solo las comprobaciones con extracción válida actualizan `liveness_verified_at`; HTTP 200 por sí solo no renueva `verified_at`. Los reportes pendientes pueden señalar revisión sin invalidar una comprobación de página correcta. No se sustituyen los beneficios/requisitos aprobados por lo que sugiera el modelo.

## Extracción y huella

Groq usa temperatura 0, modo JSON y el esquema de `EXTRACTION_SCHEMA`: beneficio, valor, requisitos, verificación, países, vencimiento, cita y disponibilidad. Se validan claves exactas, tipos, límites, fecha absoluta, números del valor y presencia literal de la cita en el texto. No se acepta evidencia inventada. Un JSON inválido se reintenta una vez; sin resultado, revisión. Se comparten la cola y límites existentes de Groq con el chat. Por ciclo se admiten 12 llamadas de extracción, incluidos reintentos y extracción antigua de pistas; máximo configurable 25. Agotar este cupo no marca ofertas vencidas.

La huella toma `main`/`article` cuando existe, excluye navegación, scripts, estilos, cabecera y pie, y acota a 6.000 caracteres alrededor del contenido estudiantil. Banners ajenos a esa sección no cambian el hash. Es una heurística: una página con varias promociones puede requerir un selector específico futuro. El score ayuda a revisar; no prueba por sí solo elegibilidad ni condiciones contractuales.

## Acceso a fuentes

User-Agent identificable enlaza al repositorio correcto. El cliente consulta robots por origen, combina grupos y reglas, respeta `Allow`, `Disallow`, comodines y `Crawl-delay`, cachea una hora y comprueba cada destino antes de seguir una redirección. Robots inaccesible/5xx/captcha falla cerrado; 404 de robots permite acceso. 401/403 de robots se trata conservadoramente como bloqueo. `Retry-After` largo detiene la petición y el rastreador persiste espera entre ciclos; los errores repetidos aumentan la espera hasta 24 horas. No hay proxies, CAPTCHA solving ni rotación de identidad.

Se rechazan credenciales en URLs, puertos fuera de 80/443, localhost y direcciones privadas/reservadas. La comprobación DNS ocurre en el lookup del socket, para evitar resolver otra dirección sin verificar al conectar. Hay límites de tiempo, cinco redirecciones y 2 MB comprimidos/descomprimidos. La concurrencia por origen tiene cola y espera mínima de 1,1 segundos, ampliada por robots.

Revisa términos de cada fuente antes de habilitarla. Una URL de buscador y `official` no sustituyen permiso de rastreo. `enabled=false` evita visitar la fuente y `terms_blocked=true` impide su rastreo incluso si robots permite. Esta fase no afirma haber auditado los contratos de las 708 fuentes importadas; la gestión y registro de permisos de fuentes se ampliará con el panel. Las visitas a las fuentes vigiladas usan el cliente seguro; el adaptador StudentOffers usa su API pública y las consultas Brave usan su API y presupuesto.

## Headless solamente en Actions

`tools/browser/package.json` tiene Playwright **1.63.0** fijado y lockfile propio. No es dependencia del servidor, ni workspace de npm del paquete raíz: `npm install` o `npm ci --omit=dev` en Render no lo instala. El workflow Test usa Chromium con fixtures y un servidor local; no recibe secretos de producción, no envía correos ni llama a Groq/Brave. Verifica búsqueda, apertura de ficha y alerta persistida.

El renderer se inyecta solo desde el ejecutable de Actions cuando el HTML estático no contiene el beneficio. Cada GET del navegador pasa por el mismo transporte y robots; solo recursos del mismo origen, sin imágenes, fuentes, POST, cookies de cuenta, service workers ni WebSocket. Hay tope de 40 recursos y contextos desechables. Una web que necesita terceros o login queda para revisión, sin eludir su bloqueo.

`Validate offers with evidence` es manual en esta fase; no se dispara en PRs. Requiere GitHub Secrets `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GROQ_API_KEY`. **Ejecuta solo después de desplegar 2.3.0**, fuera del ciclo activo de Render. Tiene concurrencia común `nova-radar-writer`, timeout 20 minutos y lote de 30. La coordinación y ejecución completa cada seis horas se trasladan en Fase 3. No se modifica todavía el cron de despertar existente.

## Reportes y memoria

La ficha permite reportar que funcionó, cambió, terminó o el enlace falla. El servidor valida un enum, genera un HMAC de la dirección de conexión y envía solo el hash privado a PostgreSQL. No guarda IP, email ni texto libre en el reporte. Es seudonimización, no anonimato absoluto. Un reporte por oferta en 24 horas y tres por identidad de conexión al día, con bloqueo transaccional para llamadas simultáneas. Además se admiten hasta 20 llamadas por minuto y dos simultáneas en cada proceso API. Una red compartida detrás del proxy puede compartir cupo: conservador para evitar abuso; Auth permitirá una atribución más útil en fases siguientes.

Los reportes nuevos tienen peso 1; la suma neta reciente se limita a 3 y la penalización total a 15 puntos. No retiran una ficha por sí solos. La configuración de confianza/moderación corresponde al panel futuro. El formulario no pide datos personales y la evidencia se escapa al mostrarla.

Los checks usan UUID de idempotencia y comparación de valores anteriores de la oferta. Check, versión, cambios de vigencia y evento se guardan en una transacción. IDs de eventos nativos respetan el bloqueo de reserva de bloques. Se corrigió además la importación de rollback para preservar IDs huérfanos cuando un export normalizado trae una FK nula. Las recargas de memoria siguen descartándose si hubo una escritura nativa concurrente.

## Decaimiento y despliegue

`LIVENESS_MAX_AGE_DAYS=14` por defecto, entre 1 y 90. El arranque configura el mismo valor en PostgreSQL; API, chat, extensión y vista pública excluyen ofertas sin comprobación exitosa dentro de la ventana. En filas antiguas se usa la fecha heredada hasta obtener evidencia nueva; no se inventa una verificación retrospectiva. La UI diferencia “última comprobación” de “verificada con evidencia”. Usa el mismo N en Render y Actions si lo cambias.

Orden: aplicar migración, integrar PR después de CI verde, desplegar latest commit manualmente en Render y comprobar `/api/health` 2.3.0 / normalized / sin error, búsqueda y ficha. No hacen falta nuevas variables para el funcionamiento estático: usa los valores por defecto y la clave Groq existente. Configura Secrets en GitHub para el workflow headless manual; no copies claves al repositorio o al chat.

Rollback: detén validación y todos los escritores, ejecuta `supabase/rollback/phase2_liveness.sql`, despliega `a88daf3` y deja `WORKER_ENABLED=false` mientras revisas fichas retiradas. Conserva checks, versiones y reportes. El SQL no vuelve a aprobar ofertas retiradas; el rastreador antiguo sí tiene un comportamiento de recuperación más débil, por eso no debes reactivarlo sin revisión. La Fase 1 no se revierte: Supabase sigue normalizado. Ninguna tabla de evidencia se elimina.

## Cómo probar y límites

```bash
npm ci && npm test
# PostgreSQL 17 desechable LOCAL:
NOVA_TEST_DATABASE_URL=postgresql://postgres:nova-test@127.0.0.1:5432/nova_test node --test test/normalized-sql.test.js
# Solo entorno de tests/Actions, nunca instalación de Render:
npm ci --prefix tools/browser
npx --prefix tools/browser playwright install --with-deps chromium
npm test --prefix tools/browser
```

Los fixtures incluyen activa, expirada, soft-404, bloqueada y dinámica; los tests construyen redirecciones. Se prueban importación, RLS invoker, N configurable, check repetido, dos fallos, prohibición de publicación, reportes deduplicados/topes, rollback y conservación de evidencia. CI exige PostgreSQL 17 real y Chromium además de Node 20/24 y Windows. La descarga local de Chromium estuvo bloqueada por el entorno; su validación obligatoria ocurre en Actions.

Pendiente: selectores por fuente para promociones múltiples, validar cobertura geográfica con ISO completo en Fase 5, retención y resúmenes por ejecución en Fase 3, aprobación/edición humana en Fase 8 y política completa/eliminación de datos en Fase 7. No se promete que todas las 357 fichas hayan pasado este motor al desplegarlo; deben verificarse progresivamente.

Fuentes oficiales consultadas 2026-09-30: [Groq JSON](https://console.groq.com/docs/structured-outputs), [robots RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html), [Playwright network](https://playwright.dev/docs/network), [BrowserContext](https://playwright.dev/docs/api/class-browsercontext), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [changelog](https://supabase.com/changelog). Se revisó el índice `.md`; los cambios PostgreSQL 15.19/17.11 no afectan las funciones/operadores utilizados. Ver `FREE_TIER_LIMITS.md` para límites y costos.

## Verificación aplicada

Migración `20261001005120_phase2_liveness.sql` aplicada el 2026-10-01 a las 00:51 UTC (2026-09-30, 19:51 Colombia), con el mismo identificador en el historial remoto. CI [36776149984](https://github.com/halleydavid157004/nova-student/actions/runs/36776149984) pasó los cinco trabajos: PostgreSQL 17, Node 20/24, Windows y Chromium. El navegador probó búsqueda, ficha y alerta, además del beneficio renderizado por JS y bloqueo de recursos externos. El despliegue manual de 2.3.0 en Render sigue pendiente.

Verificación posterior: 357 ofertas conservadas, 34 visibles también con rol `anon`, ventana de 14 días y sin acceso anónimo a esquema privado, suscriptores, alertas ni RPCs de escritura. El advisor de seguridad no emitió WARN/ERROR; la única INFO es `nova_state` con RLS sin política, que conserva el bloqueo intencional del snapshot antiguo. No se generaron checks ni reportes ficticios en producción. Repetir la comprobación con `docs/supabase-liveness-verify.sql`.
