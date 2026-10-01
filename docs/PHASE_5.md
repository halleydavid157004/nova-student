# Fase 5 — Búsqueda compartida y catálogo en cliente

El índice invertido ligero `public/search/engine.js` se construye sobre catalog.json en el navegador y se comparte con la búsqueda de API. Sin paquetes nuevos ni solicitudes a Render para buscar en el sitio estático. Normaliza tildes/caso, prefijos y hasta uno/dos errores de escritura (incluidas transposiciones, desde cuatro/ocho letras). Diccionario ES/EN editable en synonyms.js; boost de marca exacta, categoría, fecha y score. Los términos cortos IA/AI no coinciden con substrings de otras palabras. Límites: consulta 200 caracteres/12 términos, resultados 500; vocabulario en memoria, sin índice persistente adicional.

Filtros combinables por país (249 códigos ISO alpha-2, con nombres de Intl.DisplayNames), categoría, verificación, correo y comprobación en siete días. GLOBAL no garantiza elegibilidad final. Correo se clasifica solo por campo explícito o texto inequívoco; ausencia queda unknown/consultar fuente. Se mantienen gating official/reviewed, vigencia y decaimiento configurable.

Sin resultados: sugerencias de vocabulario y botones accesibles. El endpoint POST /api/search-gap acepta únicamente hasta cuatro etiquetas de un vocabulario cerrado; rechaza campos adicionales, consultas libres, correos y números. No persiste consulta original, hashes de texto desconocido, IP, cookies ni usuario. Un evento por tema/día, presupuesto global del proceso 30/hora y un escritor simultáneo, deduplicación en ese proceso; varios procesos podrían registrar el mismo tema/día con IDs distintos. Eventos siguen la retención 90 días del radar. Señales de demanda orientativas, no evidencia de una oferta. Palabras desconocidas se omiten por privacidad: no pretende identificar cualquier hueco del catálogo.

Nova AI vuelve a filtrar ofertas publicadas dentro del servicio y recibe ficha, fuente, requisitos y pasos. Adjunta hasta tres enlaces a fichas del contexto, con apertura directa por ?offer=ID en Render (Pages aún no publicado). Esas fichas no son prueba de que cada recomendación generada sea correcta; la respuesta sigue siendo de un modelo y debe cotejarse con los requisitos.

## Pruebas

`npm test`: 38 consultas de relevancia, filtros combinados, códigos ISO, incertidumbre de correo, gating, sugerencias, cliente sin tildes, expiración de caché, rechazo/deduplicación de telemetría y exclusión de candidatos privados del chat. `npm test --prefix tools/browser`: flujos críticos en Render, búsqueda/filtros/ficha del catálogo estático y Lighthouse ≥90 en portada/ficha. CI usa datos sintéticos; métricas del catálogo real pendientes del primer despliegue de Pages.

Consultar [ISO](https://www.iso.org/iso-3166-country-codes.html) y [RIPE](https://www.ripe.net/community/internet-governance/internet-technical-community/the-rir-system/list-of-country-codes-and-rirs/) para mantener los códigos (consulta 2026-10-01). Diccionario de temas y códigos vive en archivos versionados.

## Activación y rollback

Sin migración ni nuevas claves. Desplegar último commit en Render para API/chat/interfaz. En Pages: completar los pasos de fase 4 y el radar generará los módulos del cliente junto al catálogo. Los filtros nuevos de correo/semana afectan la búsqueda del catálogo; las alertas conservan sus filtros anteriores hasta ampliar preferencias en fases 6/7. Rollback: revertir el PR y regenerar el sitio en el próximo ciclo; estructura de eventos compatible con tablas actuales. Cuentas, sincronización, doble opt-in y admin por rol siguen pendientes de fases 6–8.
