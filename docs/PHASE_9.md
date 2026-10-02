# Fase 9 — Mis beneficios

Versión 2.9.0. Sin migración ni dependencia de servidor nueva.

## Comportamiento

`/benefits.html` compara país (249 códigos ISO), condición de estudiante, correo y carrera declarados. Distingue coincidencia, incompatibilidad y requisitos por comprobar. La fuente decide la elegibilidad final. Una VPN no sustituye residencia, matrícula ni documentos. Prioridad adicional para Latinoamérica; las variantes regionales legítimas se conservan.

Antes de comparar, sumar o mostrar vencimientos se reaplican publicación, vigencia y deduplicación compartidas. Solo ofertas activas oficiales o revisadas; las verificaciones futuras, antiguas y vencimientos pasados no entran. Una fecha de comprobación no se presenta como evidencia si falta cita. La carrera se interpreta solo ante requisitos explícitos; requisitos ambiguos necesitan comprobarse.

El ahorro es una estimación personal en USD: precio mensual habitual y estudiantil introducidos por el usuario, hasta 12 meses completos, limitado por vencimiento conocido. Sin precios no hay cifra. No convertir créditos únicos en ahorro anual ni sumar alternativas para un mismo gasto. Los cálculos y perfil permanecen en memoria y se borran al cerrar/recargar; no telemetría ni almacenamiento personal nuevo. El botón de perfil solicita solo los campos de la cuenta propia mediante el cliente existente y RLS, únicamente tras pulsarlo. Auth sigue condicionado a la configuración de fase 6.

Calendario en la zona horaria del navegador, solo vencimientos conocidos. Una fecha desconocida no implica disponibilidad ilimitada. El botón «Me funcionó» envía explícitamente el reporte existente, sin correo ni token de cuenta.

`GET /api/catalog` expone la lista pública permitida, con `schema: 1` y `max_age_days`. El sitio estático usa `catalog.json`, incluye Mis beneficios y funciona bajo el subdirectorio de Pages sin despertar Render. Reportar sí requiere la API. La página vuelve a comprobar fechas cada minuto sin peticiones automáticas; la actualización de catálogo es manual.

Tarjetas principales: beneficio concreto, país legible, fecha real de comprobación, acceso claro a requisitos y estado de evidencia. No se afirma «sin tarjeta» cuando el dato es desconocido. Los controles de favoritos mantienen su interacción por teclado.

## Validación

`npm test`: modelos, decimales exactos, límites temporales y fin de mes, elegibilidad, variantes/duplicados, XSS, privacidad, API y salida estática. `npm test --prefix tools/browser` en Actions: Chromium cubre comparación, filtro, ahorro, calendario, reporte y ausencia de almacenamiento tanto en Render como en Pages bajo subdirectorio. Lighthouse audita portada, ficha y Mis beneficios con umbral 90 para rendimiento/accesibilidad/SEO.

## Operación y rollback

Desplegar el último commit manualmente en Render; no requiere variables nuevas. Pages depende de la activación ya documentada en fase 4. Mantener cuotas y planes actuales: no nuevas llamadas a Groq, Brave, Resend ni tablas Supabase. Rollback: revertir el PR y desplegar el commit anterior; no DDL ni datos personales que revertir.

## Pendientes reales

No se garantiza elegibilidad, ahorro realizado ni cobertura de todas las ofertas de internet. La amplitud depende de nuevas fuentes y revisión con evidencia; no se publican pendientes para inflar el catálogo. SMTP/identidad del responsable, Auth público, rol admin y publicación Pages requieren configuración operativa documentada en sus fases. Comparación de producto: `STUDENTOFFERS_BENCHMARK.md`.
