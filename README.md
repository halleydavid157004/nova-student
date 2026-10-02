# Nova Student Radar

Una plataforma propia para descubrir, buscar y vigilar beneficios para estudiantes en todo el mundo: software gratuito, créditos cloud, planes académicos, descuentos, licencias educativas y ofertas verificables con correo institucional, SheerID, GitHub Education u otros métodos.

## Estado del proyecto

La versión 2.4.0 añade el ciclo completo en GitHub Actions con coordinación en Supabase, catálogo público y reservas de correo. Incluye validación de vigencia, tablas privadas y presupuesto Brave transaccional. El motor Actions requiere Secrets y activación explícita; consulta [Fase 3](docs/PHASE_3.md). La [Fase 1](docs/PHASE_1.md) documenta migración, despliegue manual y rollback; el cambio requiere aplicar el SQL antes de arrancar esta versión. La [auditoría de código](docs/AUDIT.md) describe las limitaciones y el orden de las fases; no se presentan como terminadas las funciones de la misión que aún no existen. Los [límites gratuitos](docs/FREE_TIER_LIMITS.md) tienen fuentes oficiales y fecha de consulta.

## Arranque en Windows

1. Descomprime completamente el ZIP.
2. Ejecuta **ABRIR_NOVA_STUDENT.cmd**.
3. El lanzador espera a que el servidor responda y abre `http://127.0.0.1:4310`.
4. Si algo falla, abre la ventana **Nova Student Radar Server** o ejecuta `ABRIR_NOVA_STUDENT.cmd --diagnostico`.

El único lanzador comprueba Node.js, crea `.env` desde el ejemplo, respeta `PORT` y detecta una instancia sana. El servidor inicializa la base si está vacía. Los errores aparecen en su consola; no se genera un `server.log` automáticamente.

## Arranque manual (sin dependencias)

Compatible con **Node.js 20 o superior**. Para nuevas instalaciones se recomienda **Node 24 LTS**: Node 20 está fuera de soporte según la [documentación oficial](https://nodejs.org/en/about/previous-releases), consultada el 2026-09-30. CI verifica compatibilidad con 20 y 24; no modifica el runtime de Render.

```bash
cp .env.example .env
npm run seed
npm start
```

Abre **http://localhost:4310**.

No necesita `npm install`: el backend usa solamente módulos incluidos en Node.js.

## Incluido

- Interfaz premium responsive, modo claro/oscuro.
- Buscador y filtros por país, categoría y método de verificación.
- Búsqueda sin distinción de tildes, términos combinados y prioridad para coincidencias de marca.
- Fichas con beneficio, requisitos, pasos y fuente oficial.
- Favoritos.
- Alertas por correo: instantáneas, diarias o semanales.
- Worker que revisa fuentes periódicamente y registra cambios.
- Descubrimiento mediante la API pública de StudentOffers (como pista, nunca como fuente final) y, opcionalmente, Brave Search API.
- Detección de cambios por hash de contenido.
- API REST compartida entre web y extensión.
- Extensión Chrome/Edge Manifest V3 que detecta ofertas del dominio visitado.
- Persistencia JSON local o Supabase Postgres opcional para conservar datos en Render Free.

## Nova AI — Groq

En Render, configura `GROQ_API_KEY` para activar Nova AI y `ADMIN_TOKEN` con un valor secreto distinto de `change-me-now` para usar los endpoints administrativos. El modelo principal es `openai/gpt-oss-20b`; puedes cambiarlo con `GROQ_MODEL` y configurar alternativas separadas por comas en `GROQ_FALLBACK_MODELS`. `/api/ai/status` indica el modelo que respondió por última vez y la categoría del último error.

## Pruebas y revisión de cambios

```bash
npm ci
npm test
node --experimental-test-coverage --test test/*.test.js
```

`npm ci` instala jsdom de desarrollo; no es necesario para arrancar el servidor. Los tests usan datos sintéticos, HTTP local y proveedores simulados. CI ejecuta Node 20/24 en Linux, el lanzador en Windows y migración/rollback en PostgreSQL 17 real con fixtures sintéticos. Las pruebas locales UI usan jsdom; Actions añade Chromium. No prueban entrega real de correos ni sustituyen Lighthouse. La auditoría recoge cobertura y huecos.

Las pruebas de navegador en Actions también buscan, abren una ficha y guardan una alerta; Playwright vive solo en `tools/browser`, fuera de las dependencias del servidor.

Cada fase tendrá un PR propio con plan, archivos, pruebas y riesgos. Antes de publicar, revisa `git diff` y `git status`; nunca subas `.env`, direcciones de suscriptores ni copias privadas. Se eliminaron el uploader automático y los lanzadores duplicados para evitar rutas personales y commits indiscriminados.

## Datos y favoritos

Los favoritos se guardan en el navegador de cada visitante. La base JSON local de Render Free pierde sus cambios al reiniciar o desplegar. Configura Supabase para conservar alertas, fuentes y eventos antes de registrar suscripciones reales. Los archivos de `storage/` están ignorados por Git. No subas direcciones de suscriptores ni secretos al repositorio.

## Persistencia gratuita con Supabase

1. En el proyecto **Free** existente, aplica las [migraciones de Fases 1–3](supabase/migrations/) en orden con el propietario de la base. Importa `nova_state` si existe y conserva un puente para el servidor anterior. No expongas el esquema `nova_private` en la Data API; mantén `public` expuesto y la exposición automática de nuevas tablas desactivada.
2. En Render Free, configura `SUPABASE_URL` y `SUPABASE_SECRET_KEY` (`sb_secret_`) **solo en el servidor**, y `SUPABASE_STORAGE_MODE=normalized`. Conserva las claves actuales si ya funcionan.
3. Haz **Manual Deploy → Deploy latest commit**. El arranque importa la última instantánea y activa las tablas. `/api/health` debe indicar versión `2.4.0`, `storage.schema: normalized`, proveedor `supabase`, `ready: true`, `synced: true`, `error: false`.

Solo `public_offers` permite lectura pública de fichas activas oficiales o revisadas. Suscriptores, alertas y RPC privados no admiten acceso anónimo. Las escrituras por fila protegen modificaciones simultáneas; el presupuesto se reserva en PostgreSQL antes de llamar a Brave. La [guía de Fase 1](docs/PHASE_1.md) explica pruebas, conflictos, recarga de memoria y rollback. `npm run migrate:state` repite la importación antes del corte e imprime solo recuentos.

La semilla se carga cuando el catálogo está vacío. `SEED_DATABASE_PATH` sirve para el almacenamiento local/antiguo; importa una copia privada anterior antes del corte, fuera del repositorio. Free incluye 500 MB y no copias diarias automáticas: conserva backups privados de las tablas. No publiques correos ni exports. Guardar una alerta no confirma entrega de correo. Tras activar la Fase 3, el radar no necesita Render despierto.

## Vigencia y evidencia

La [Fase 2](docs/PHASE_2.md) deja de aceptar HTTP 200 como verificación. Comprueba robots, redirecciones, soft-404, extracción con cita y cambios materiales. Un fallo aislado no retira una oferta revisada; dos fallos negativos consecutivos requieren revisión. Una recuperación no la republica automáticamente. Sin verificación exitosa durante 14 días (configurable), la ficha deja de mostrarse como vigente. La ficha diferencia comprobación antigua y evidencia validada, y recibe reportes con límites de abuso. Aplica la migración de Fase 2 antes de desplegar 2.3.0.

El workflow manual de validación usa headless solo en Actions, requiere Secrets y no despierta Render. La [Fase 3](docs/PHASE_3.md) ejecuta el ciclo completo cada seis horas en Actions tras configurar Secrets.

## Protección de recursos gratuitos

El chat admite dos peticiones simultáneas y 30 por cada 10 minutos para todo el proceso. El servicio Groq comparte como máximo tres operaciones entre chat y rastreador. Las altas de alertas admiten 20 peticiones por minuto y cuatro simultáneas. Los excesos devuelven HTTP 429 con `Retry-After`, sin acumular una cola ilimitada. Son límites globales para proteger las cuotas gratuitas; no sustituyen autenticación o un control distribuido si el proyecto crece.

## Correo

### Resend

En Render Free usa el API HTTPS de Resend: configura `RESEND_API_KEY` y `RESEND_FROM` con un remitente de un dominio que ya controles y hayas verificado. El plan gratuito tiene límites de envío; el remitente de prueba `onboarding@resend.dev` no sirve para enviar alertas a cualquier suscriptor.

### Gmail / SMTP

El SMTP directo no funciona desde servicios Render Free porque bloquea los puertos 25, 465 y 587. Para ejecutar la app localmente, configura `SMTP_USER` y `SMTP_PASS`; con Gmail, `SMTP_PASS` debe ser una **contraseña de aplicación**, no tu contraseña habitual.

## Descubrimiento mundial

Por defecto, el radar puede usar la API pública de StudentOffers únicamente para descubrir posibles fuentes. La ficha visible debe terminar apuntando a la fuente oficial. Puedes desactivar este adaptador con `STUDENTOFFERS_DISCOVERY=false`.

Configura además `BRAVE_SEARCH_API_KEY` para ampliar el descubrimiento web. El agente ejecuta búsquedas periódicas y añade URLs nuevas como **fuentes descubiertas no verificadas**. Una fuente encontrada en buscador nunca se marca automáticamente como oficial.

### Brave y radar cada 6 horas

El radar automático se ejecuta a las **00:17, 06:17, 12:17 y 18:17 UTC**: en Colombia, **01:17, 07:17, 13:17 y 19:17**. La primera puesta en marcha puede realizar el ciclo pendiente tras 30 segundos. Cada ventana se reserva y se guarda antes de hacer consultas: un reinicio dentro de esa ventana no repite la búsqueda. El valor antiguo de `SCAN_INTERVAL_MS` no puede volver a activar ciclos cada 30 minutos.

- Brave rota **4 consultas por ciclo**, incluyendo búsquedas para Colombia y Latinoamérica. No filtra todas las ofertas por fecha de publicación, para conservar programas educativos permanentes.
- `BRAVE_MONTHLY_LIMIT` fija un límite de **600 solicitudes al mes como máximo**, compartido entre descubrimiento y búsquedas auxiliares de IA. Las consultas auxiliares tienen además un máximo de **100**, para reservar capacidad al horario de seis horas. Cada intento se cuenta y se persiste antes de contactar con Brave; los errores y reinicios no recuperan ese presupuesto. El mes se calcula en UTC. Un 429 detiene el lote y respeta `Retry-After`.
- [Brave publica $5 de créditos mensuales y un precio de $5 por 1.000 solicitudes de Search](https://brave.com/search/api/). Hasta 600 solicitudes equivalen a $3 con ese precio cuando están cubiertas por créditos disponibles. **El contador controla esta aplicación desde esta versión; los usos anteriores y otros proyectos comparten los créditos de la cuenta.** Revisa el consumo de Brave y mantén desactivado cualquier gasto adicional. No hace falta contratar un cron de Render ni otro servidor.
- [Radar cada 6 horas](.github/workflows/radar-schedule.yml) ejecuta descubrimiento, validación, catálogo y digests directamente con Supabase al activar `RADAR_ACTIONS_ENABLED=true`. Usa Secrets, runner Ubuntu estándar, timeout de 25 minutos, concurrencia y lease persistente. Hasta activar conserva el despertar anterior de Render. Consulta los pasos de [Fase 3](docs/PHASE_3.md); no se declara activado por integrar el código.
- [Supabase Cron](docs/supabase-radar-cron.sql) mantiene temporalmente un GET a `/api/health` con el mismo horario `17 */6 * * *` y 90 segundos de timeout para el arranque de Render Free. El trabajo `nova-student-six-hour-wake` está activo en el proyecto actual durante la transición; se desactivará al confirmar el primer ciclo productivo de Actions. No necesita claves, Edge Functions ni otro proceso escritor. El script permite reproducirlo en SQL Editor; el mismo nombre actualiza el trabajo sin duplicarlo. En otro proyecto configura primero la persistencia y cambia la URL si el servidor es distinto.
- Antes de activar Actions, Render Free se despierta con Supabase Cron/GitHub y ejecuta el worker local. Después de activar y verificar el motor nuevo se retira el cron antiguo; Render sirve únicamente API y chat. GitHub puede retrasar u omitir ejecuciones programadas durante congestión y desactivar el horario de un repositorio público tras 60 días sin actividad. Supabase debe estar activo para ejecutar su Cron. Son disparadores gratuitos de mejor esfuerzo, sin garantía de hora exacta; las ventanas persistidas evitan duplicar consultas. Revisa el resultado de Brave en Radar y reactiva el workflow si GitHub lo deshabilita.

En Supabase, **Integrations → Cron** muestra el trabajo activo y su historial. Que el SQL de un trabajo termine correctamente confirma que se encoló el GET; no confirma por sí solo que Brave completó la búsqueda. El resultado HTTP queda seis horas en `net._http_response`; `/api/worker-status` conserva el resultado del proveedor. No expongas el esquema `net` en la Data API. `pg_net` se instala en `extensions` para evitar el aviso de extensión en el esquema público. El historial `cron.job_run_details` crece cuatro filas al día; revísalo periódicamente y conserva las comprobaciones que necesites.

`/api/worker-status` muestra la próxima ventana, el último ciclo, el resultado de Brave y el consumo controlado. La vista **Radar** muestra la conexión, la última búsqueda y la próxima ventana; diferencia fuentes restringidas, rastreo no permitido, fuentes desaparecidas y errores de conexión. La lista se carga por páginas de 80 fuentes para evitar cientos de filas al entrar.

El cursor y metadatos del worker se guardan por clave en `app_runtime`; la importación conserva el último ciclo conocido en `worker_runs`. La Fase 3 registra cada ejecución nueva y su resumen en `worker_runs`. Los ciclos automáticos y manuales comparten una sola ejecución. Un escaneo administrativo puede revisar fuentes fuera del horario; Brave mantiene su reserva por ventana y su presupuesto mensual.

Las fichas creadas automáticamente permanecen pendientes y se muestran como pistas en el Radar. El catálogo público, las alertas y Nova AI usan solo fichas activas con `official: true` o `reviewed: true`. Una respuesta HTTP 200 o un texto que contiene «student» no confirma por sí solo que exista un beneficio. Revisa el beneficio, las condiciones, la vigencia y el enlace de la marca antes de aprobar una ficha.

Si `DATABASE_PATH` apunta a un volumen persistente vacío, el servidor crea las fichas y fuentes iniciales desde `src/data/seed.js`. Los reinicios posteriores leen el volumen sin sobrescribir sus datos. Para importar una copia privada existente una sola vez, configura `SEED_DATABASE_PATH` con la ruta a esa copia fuera del repositorio. Sin las variables de Supabase, Render Free usa almacenamiento temporal; con Supabase configurado conserva las filas remotas. Las promociones con fecha de vencimiento dejan de publicarse automáticamente; sus condiciones vigentes se confirman en la fuente oficial.

```bash
npm run scan
```

## API administrativa

Cambia `ADMIN_TOKEN` en `.env`.

Escaneo manual:

```bash
curl -X POST http://localhost:4310/api/admin/scan \
  -H "Authorization: Bearer TU_ADMIN_TOKEN"
```

Prueba de digest:

```bash
curl -X POST http://localhost:4310/api/admin/test-digest \
  -H "Authorization: Bearer TU_ADMIN_TOKEN"
```

## Extensión Chrome / Edge

1. Abre `chrome://extensions` o `edge://extensions`.
2. Activa **Modo desarrollador**.
3. Pulsa **Cargar descomprimida**.
4. Selecciona la carpeta `extension/`.
5. Deja Nova Student ejecutándose en `http://localhost:4310`.

Para producción, cambia `http://localhost:4310` en `extension/manifest.json`, `popup.js` y `content.js` por tu dominio HTTPS.

## Evolución por fases

El orden es: auditoría (0), tablas normalizadas (1), vigencia con evidencia (2), motor Actions (3), catálogo estático/SEO (4), búsqueda (5), Auth y sincronización (6), consentimiento y correo (7), admin por rol (8) y elegibilidad/ahorro/calendario (9). Consulta [AUDIT.md](docs/AUDIT.md) para los riesgos actuales. Toda migración necesita importación idempotente, pruebas y rollback antes del corte; la Fase 1 permite varios escritores por fila, con conflictos explícitos para ediciones del mismo campo. El modo antiguo `snapshot` sigue limitado a un escritor y se reserva al rollback.

## Reglas de calidad de datos

- Priorizar páginas oficiales.
- Mostrar fecha de última comprobación.
- Diferenciar `GLOBAL`, `REGIONAL` y países confirmados.
- No inventar disponibilidad regional.
- No publicar códigos privados ni de un solo uso.
- Respetar límites de frecuencia, robots.txt y términos de cada fuente.
- Hacer que el usuario confirme el precio y las condiciones finales en la fuente oficial antes de pagar.

### Catálogo estático (fase 4)

La [fase 4](docs/PHASE_4.md) prepara HTML inicial con beneficios publicados, fichas, sitemap y SEO para GitHub Pages gratis. La publicación se activa por separado con `STATIC_PAGES_ENABLED`; Lighthouse ≥90 es una comprobación obligatoria en Actions, no una métrica asumida. Las dependencias de auditoría permanecen en `tools/browser`.

### Búsqueda (fase 5)

[Motor compartido ligero](docs/PHASE_5.md): prefijos, tolerancia a errores, tildes, sinónimos ES/EN y filtros de país, categoría, verificación, correo y fecha. El catálogo estático busca localmente; los huecos se registran solo como temas predefinidos sin texto libre ni datos personales. Nova AI enlaza fichas publicadas.

### Cobertura internacional y duplicados

El radar rota búsquedas por los 249 códigos ISO, con prioridad adicional para Latinoamérica y el mismo presupuesto de Brave. Activa «Explorar también otros países» para ampliar resultados; comprueba residencia y matrícula en cada ficha. La búsqueda y el catálogo agrupan duplicados conocidos sin borrar historial. Detalles, pruebas y límites: [docs/RADAR_COVERAGE.md](docs/RADAR_COVERAGE.md).

### Cuentas y extensión (base de fase 6)

`/account.html` prepara favoritos y perfil sincronizados con Supabase Auth. Las cuentas públicas siguen desactivadas hasta verificar SMTP gratuito, redirecciones y tratamiento de datos; los favoritos locales continúan funcionando. [Configuración y límites pendientes](docs/PHASE_6.md).

La extensión apunta a producción. Fuente de configuración: `extension/settings.json`; regenerar manifest/config con `node tools/extension/build.js`. Carga `extension/` sin empaquetar en modo desarrollador de Chrome/Edge. Los avisos al navegar son opt-in; los favoritos de cuenta se abren en la web. No está publicada en las tiendas.

### Destacados y actualización

Hot, Imperdible y Por vencer usan criterios explícitos de revisión, gratuidad y vencimiento; no popularidad inventada. El radar reserva capacidad para revisar las ofertas ya aprobadas. Consulta [criterios y operación](docs/HIGHLIGHTS.md).

### Consentimiento y correo

Las alertas guardadas requieren autorización separada y confirmación por alerta para enviar correo. Preferencias, baja y presupuesto compartido están preparados; el remitente y la identidad del responsable siguen pendientes de configurar. Consulta [fase 7 y activación](docs/PHASE_7.md) y [supresión de suscripciones y conservación](docs/PHASE_7_ERASURE.md), más [eliminación de cuentas](docs/PHASE_7_ACCOUNTS.md).
