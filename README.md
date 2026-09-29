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
- Persistencia JSON atómica para que la primera versión sea portátil y no requiera servidor de base de datos.

## Email

En Render, configura `GROQ_API_KEY` para activar Nova AI y `ADMIN_TOKEN` con un valor secreto distinto de `change-me-now` para usar los endpoints administrativos. El modelo principal es `openai/gpt-oss-20b`; puedes cambiarlo con `GROQ_MODEL` y configurar alternativas separadas por comas en `GROQ_FALLBACK_MODELS`. `/api/ai/status` indica el modelo que respondió por última vez y la categoría del último error.

Ejecuta `npm test` para comprobar el arranque, las rutas públicas, los controles de acceso y la recuperación ante un modelo bloqueado. Para probar la interfaz en un navegador real hace falta un navegador instalado.

Los favoritos se guardan en el navegador de cada visitante. La base JSON local requiere almacenamiento persistente: el sistema de archivos temporal del plan Free de Render pierde sus cambios al reiniciar o desplegar. Antes de usar alertas reales en producción, configura una base de datos persistente y migración de los registros actuales. El archivo `storage/nova-student.json` está versionado; no añadas datos personales nuevos a ese archivo.

### Resend

Configura `RESEND_API_KEY` y `RESEND_FROM`.

### Gmail / SMTP

Configura `SMTP_USER` y `SMTP_PASS`. Con Gmail, `SMTP_PASS` debe ser una **contraseña de aplicación**, no tu contraseña habitual. El servidor incluye un cliente SMTP TLS propio, por lo que tampoco necesita paquetes externos.

## Descubrimiento mundial

Por defecto, el radar puede usar la API pública de StudentOffers únicamente para descubrir posibles fuentes. La ficha visible debe terminar apuntando a la fuente oficial. Puedes desactivar este adaptador con `STUDENTOFFERS_DISCOVERY=false`.

Configura además `BRAVE_SEARCH_API_KEY` para ampliar el descubrimiento web. El agente ejecuta búsquedas periódicas y añade URLs nuevas como **fuentes descubiertas no verificadas**. Una fuente encontrada en buscador nunca se marca automáticamente como oficial.

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
