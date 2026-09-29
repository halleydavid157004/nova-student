# Nova Student Radar

Una plataforma propia para descubrir, buscar y vigilar beneficios para estudiantes en todo el mundo: software gratuito, créditos cloud, planes académicos, descuentos, licencias educativas y ofertas verificables con correo institucional, SheerID, GitHub Education u otros métodos.

## Arranque inmediato en Windows (recomendado)

1. Descomprime completamente el ZIP.
2. Ejecuta **ABRIR_NOVA_STUDENT.cmd**.
3. El lanzador espera a que el servidor responda y abre `http://127.0.0.1:4310`.
4. Si algo falla, ejecuta **DIAGNOSTICO_NOVA.cmd** o revisa `storage/server.log`.

El lanzador comprueba Node.js, crea `.env`, inicializa la base si hace falta y detecta una instancia ya iniciada.

## Arranque manual (sin dependencias)

Requiere únicamente **Node.js 20 o superior**.

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
- Fichas con beneficio, requisitos, pasos y fuente oficial.
- Favoritos.
- Alertas por correo: instantáneas, diarias o semanales.
- Worker que revisa fuentes periódicamente y registra cambios.
- Descubrimiento mediante la API pública de StudentOffers (como pista, nunca como fuente final) y, opcionalmente, Brave Search API.
- Detección de cambios por hash de contenido.
- API REST compartida entre web y extensión.
- Extensión Chrome/Edge Manifest V3 que detecta ofertas del dominio visitado.
- Persistencia JSON local o Supabase Postgres opcional para conservar datos en Render Free.

## Email

En Render, configura `GROQ_API_KEY` para activar Nova AI y `ADMIN_TOKEN` con un valor secreto distinto de `change-me-now` para usar los endpoints administrativos. El modelo principal es `openai/gpt-oss-20b`; puedes cambiarlo con `GROQ_MODEL` y configurar alternativas separadas por comas en `GROQ_FALLBACK_MODELS`. `/api/ai/status` indica el modelo que respondió por última vez y la categoría del último error.

Ejecuta `npm test` para comprobar el arranque, las rutas públicas, los controles de acceso y la recuperación ante un modelo bloqueado. Para probar la interfaz en un navegador real hace falta un navegador instalado.

Los favoritos se guardan en el navegador de cada visitante. La base JSON local de Render Free pierde sus cambios al reiniciar o desplegar. Configura Supabase para conservar alertas, fuentes y eventos antes de registrar suscripciones reales. Los archivos de `storage/` están ignorados por Git. No subas direcciones de suscriptores ni secretos al repositorio.

### Persistencia gratuita con Supabase

1. Crea un proyecto en el plan **Free** de Supabase. En **SQL Editor**, ejecuta este SQL una sola vez:

   ```sql
   create table if not exists public.nova_state (
     id integer primary key check (id = 1),
     state jsonb not null,
     updated_at timestamptz not null default now()
   );
   alter table public.nova_state enable row level security;
   revoke all on public.nova_state from public, anon, authenticated, service_role;
   grant select, insert, update on public.nova_state to service_role;
   ```

   También puedes ejecutar [docs/supabase-setup.sql](docs/supabase-setup.sql), que incluye la comprobación de permisos. [docs/supabase-verify.sql](docs/supabase-verify.sql) prueba lectura, inserción y actualización con `service_role` dentro de una transacción que se revierte; no deja datos de prueba. Ejecútalo antes de iniciar el servidor. La Data API debe estar activada y exponer el esquema `public`. Los permisos explícitos de `service_role` permiten el acceso del backend; `nova_state` no necesita permisos para `anon` ni `authenticated`. Mantén desactivada la exposición automática de nuevas tablas.

2. En el servicio **Free** existente de Render, agrega `SUPABASE_URL` con la URL HTTPS del proyecto y `SUPABASE_SECRET_KEY` con una clave que empiece por `sb_secret_` (**Settings → API Keys** en Supabase). Guárdala solo como variable secreta del servidor; no la compartas por chat ni la pongas en GitHub o en el navegador. Mantén `DATABASE_PATH` sin cambiar y el plan de Render en Free.
3. Despliega el último commit de `main`. Abre `/api/health`: `storage.provider` debe ser `supabase`, `ready: true`, `synced: true` y `error: false`. Si falta una variable, la tabla no existe o Supabase no responde, el servidor no arranca con una base temporal: revisa los registros y la configuración.

En el primer arranque de una tabla vacía se cargan las fichas semilla. Una copia privada anterior se puede importar **antes** de ese primer arranque con `SEED_DATABASE_PATH` apuntando a un JSON accesible solo por el servidor; los datos temporales de Render no se transfieren solos. En Supabase Free hay 500 MB de base, 5 GB de salida incluidos, pausas por poca actividad y no hay copias automáticas. Descarga copias privadas periódicas de la fila `nova_state` desde el panel de Supabase; evita publicar la fila porque puede contener correos de suscriptores. Esta modalidad guarda una instantánea desde **un solo proceso escritor**: no ejecutes `npm run scan` en otra máquina contra la misma tabla ni escales a varias instancias. El worker de Render Free solo funciona mientras el servicio está despierto y no garantiza escaneos continuos.

El formulario informa si la alerta está guardada pero el proveedor de correo aún no está configurado. Guardar una alerta no prueba que un mensaje se haya entregado.

### Protección de recursos gratuitos

El chat admite dos peticiones simultáneas y 30 por cada 10 minutos para todo el proceso. El servicio Groq comparte como máximo tres operaciones entre chat y rastreador. Las altas de alertas admiten 20 peticiones por minuto y cuatro simultáneas. Los excesos devuelven HTTP 429 con `Retry-After`, sin acumular una cola ilimitada. Son límites globales para proteger las cuotas gratuitas; no sustituyen autenticación o un control distribuido si el proyecto crece.

### Resend

En Render Free usa el API HTTPS de Resend: configura `RESEND_API_KEY` y `RESEND_FROM` con un remitente de un dominio que ya controles y hayas verificado. El plan gratuito tiene límites de envío; el remitente de prueba `onboarding@resend.dev` no sirve para enviar alertas a cualquier suscriptor.

### Gmail / SMTP

El SMTP directo no funciona desde servicios Render Free porque bloquea los puertos 25, 465 y 587. Para ejecutar la app localmente, configura `SMTP_USER` y `SMTP_PASS`; con Gmail, `SMTP_PASS` debe ser una **contraseña de aplicación**, no tu contraseña habitual.

## Descubrimiento mundial

Por defecto, el radar puede usar la API pública de StudentOffers únicamente para descubrir posibles fuentes. La ficha visible debe terminar apuntando a la fuente oficial. Puedes desactivar este adaptador con `STUDENTOFFERS_DISCOVERY=false`.

Configura además `BRAVE_SEARCH_API_KEY` para ampliar el descubrimiento web. El agente ejecuta búsquedas periódicas y añade URLs nuevas como **fuentes descubiertas no verificadas**. Una fuente encontrada en buscador nunca se marca automáticamente como oficial.

Las fichas creadas automáticamente permanecen pendientes y se muestran como pistas en el Radar. El catálogo público, las alertas y Nova AI usan solo fichas activas con `official: true` o `reviewed: true`. Una respuesta HTTP 200 o un texto que contiene «student» no confirma por sí solo que exista un beneficio. Revisa el beneficio, las condiciones, la vigencia y el enlace de la marca antes de aprobar una ficha.

Si `DATABASE_PATH` apunta a un volumen persistente vacío, el servidor crea las fichas y fuentes iniciales desde `src/data/seed.js`. Los reinicios posteriores leen el volumen sin sobrescribir sus datos. Para importar una copia privada existente una sola vez, configura `SEED_DATABASE_PATH` con la ruta a esa copia fuera del repositorio. El servicio Free actual continúa con almacenamiento temporal hasta que se configure un recurso persistente. Las promociones con fecha de vencimiento dejan de publicarse automáticamente; sus condiciones vigentes se confirman en la fuente oficial.

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

## Antes de convertirlo en SaaS público

La arquitectura está preparada para evolucionar, pero una versión multiusuario pública debe sustituir el JSON local por PostgreSQL/Supabase, añadir autenticación, gestión de consentimiento/bajas de email, colas de trabajo, rate limiting, snapshots históricos, observabilidad, moderación/verificación editorial y reglas por dominio para respetar robots.txt y términos de uso.

## Reglas de calidad de datos

- Priorizar páginas oficiales.
- Mostrar fecha de última comprobación.
- Diferenciar `GLOBAL`, `REGIONAL` y países confirmados.
- No inventar disponibilidad regional.
- No publicar códigos privados ni de un solo uso.
- Respetar límites de frecuencia, robots.txt y términos de cada fuente.
- Hacer que el usuario confirme el precio y las condiciones finales en la fuente oficial antes de pagar.
