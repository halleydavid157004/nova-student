# Fase 10 — Interfaz premium

Versión 2.10.0. Sin migración, sin variables nuevas y sin dependencias de servidor nuevas.

## Qué cambia

Nueva interfaz de la portada (`public/index.html`, `public/styles.css`) con sistema visual propio: tipografías Unbounded / Hanken Grotesk / Geist Mono, modo claro y oscuro, tarjetas con logo de marca y vista de detalle en dos columnas.

`public/premium.js` es una capa nueva, cargada después de `app.js`, que no cambia el flujo de datos:

- **Logos de marca.** Monograma inmediato y, después, el logo de [Simple Icons](https://simpleicons.org) (CC0, versión fijada `16.33.0` en jsDelivr). Solo los iconos usados se guardan en `localStorage` (`nova-icons-v16`); si la marca no está en Simple Icons se intenta el icono del sitio (icon.horse, como antes). Si ambos fallan queda el monograma.
- **Radar en vivo** en la portada con los logos de `/api/catalog`, y franja de marcas.
- **Asistente «Para mí»**: 4 preguntas (nivel, país, intereses, qué tienes a mano) y lista de beneficios compatibles del catálogo publicado. Las respuestas viven solo en memoria, igual que Mis beneficios; no se guardan ni se envían.
- **Comparador** de hasta 3 ofertas y **paleta ⌘K / Ctrl K** (también `/`).
- **Nova AI**: sugerencias rápidas sobre el chat existente (`/api/ai/chat`, mismas cuotas).
- Barra de navegación inferior en móvil.

`public/app.js` conserva búsqueda, filtros, favoritos y sincronización de cuenta, alertas, reportes, radar y Nova AI. Cambios: marcado de tarjeta y detalle, etiquetas legibles de categoría y verificación, botón para copiar el enlace de una ficha (`/?offer=ID`), `window.NovaApp` (API mínima para `premium.js`) y `loadCountries` tolera locales inválidos del navegador (antes detenía la carga).

## Validación

- `npm test` incluye `test/premium-ui.test.js` (sin jsdom): todos los ids usados por `app.js`/`premium.js` existen, el orden de carga, sin telemetría ni perfil guardado, texto del catálogo escapado y librería de logos fijada.
- `test/ui.test.js` y `tools/browser` siguen cubriendo filtros, detalle, favoritos, radar, alertas e IA con los mismos ids.

## Operación y rollback

Render despliega con el push a `main`. Sin cambios en Supabase, Groq, Brave ni Resend. Rollback: revertir el PR y desplegar el commit anterior. El sitio estático de Pages (fase 4) no cambia.

## Pendientes

El catálogo público sigue mostrando solo ofertas oficiales o revisadas con evidencia reciente; la interfaz no infla el número de ofertas.
