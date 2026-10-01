# Identidad de ofertas y cobertura internacional

Actualización: 2026-10-01. PR complementario a fases 3–5.

## Plan y resultado

Identidad compartida en `public/search/identity.js`, aplicada después del filtro de publicación en búsqueda, extensión y exportación. Quita fragmentos y parámetros conocidos de seguimiento; conserva parámetros de país, plan y otros significativos. Compara fuente canónica y variante (beneficio, países, tipo y verificación), o marca + título + variante para enlaces alternativos. Prefiere revisión humana, verificación reciente y score; desempata por ID. No borra filas ni historial. No agrupa por dominio: una marca puede ofrecer varios beneficios.

Las coincidencias semánticas con textos diferentes necesitan revisión humana: no prometemos detectar cualquier duplicado posible. Estos criterios garantizan una sola ficha por identidad reconocida en cada resultado. La exportación conserva parámetros públicos de país/región ISO y nombres de plan reconocidos; elimina parámetros privados o desconocidos. La ficha individual histórica conserva su URL e ID. El catálogo y la búsqueda no publican candidatos sin aprobación ni ofertas caducadas.

## Países y acceso

Brave intercala temas con búsquedas por los 249 códigos ISO asignados y una prioridad adicional para Latinoamérica. Continúa con máximo cuatro consultas cada seis horas, cursor persistente y presupuesto global existente `BRAVE_MONTHLY_LIMIT`; ampliar la lista no aumenta el tope. Un ciclo completo de la cola tarda semanas, no seis horas; las fuentes conocidas se verifican según prioridad y lote configurados.

El filtro por país sigue siendo estricto por defecto. «Explorar también otros países» amplía resultados y prioriza coincidencias locales, conservando países y requisitos originales. Las fichas muestran países y condiciones. VPN u otros métodos solo se pueden recomendar si los requisitos revisados de la fuente los permiten expresamente. No inferimos VPN por geobloqueo ni por país, ni evadimos robots, captcha o restricciones. Una VPN no demuestra residencia, matrícula ni elegibilidad. La evidencia y los requisitos se muestran tal como fueron aprobados; no se genera un requisito de VPN automáticamente.

No existe garantía de capturar todas las ofertas de internet: motores de búsqueda, páginas privadas, términos, idiomas y presupuesto limitan cobertura. La geografía de una consulta es una pista, no prueba de disponibilidad. Las nuevas pistas siguen pendientes hasta su revisión.

## Validación y despliegue

`npm test`: canonicalización, variantes legítimas, preferencia determinista, búsqueda/exportación sin duplicados conocidos, exploración internacional y cobertura de consultas. CI añade PostgreSQL y Playwright a los flujos existentes. No hay migración, dependencia nueva, secreto nuevo ni ajuste de Render. Desplegar manualmente el último commit después de los checks. Revertir este PR y regenerar catálogo para rollback; ninguna fila se elimina.
