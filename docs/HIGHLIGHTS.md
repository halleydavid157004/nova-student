# Destacados y actualización del catálogo — 2.6.1

## Criterios editoriales

Las recomendaciones se calculan al consultar las tarjetas y al exportar el catálogo. No son publicidad, popularidad medida ni una forma de aprobar pistas del buscador. Los tags históricos hot/trending/must-have dejan de controlar destacados.

- **Hot**: oferta aprobada y activa, revisión efectiva de los últimos 7 días, puntuación ≥90.
- **Imperdible**: condiciones de Hot, puntuación ≥95, tipo gratis, `requires_card === false`, beneficio y requisitos documentados. No garantiza elegibilidad individual ni un ahorro cuantificado.
- **Por vencer**: fecha registrada futura dentro de 14 días.

Se usa primero la fecha/puntuación de liveness; para revisiones anteriores al motor se conserva verified_at/confidence. Una señal de liveness distinta de active excluye recomendaciones. Fechas inválidas, futuras y vencidas no reciben recomendaciones. Se respeta la ventana configurable al exportar y en el catálogo estático. Los motivos se muestran en cada etiqueta. No se cambian fechas ni estados para obtener una insignia.

## Escaneo

Un tercio del lote se reserva para fuentes con ofertas activas aprobadas sin comprobación en el último día. El resto conserva prioridad por antigüedad, score y visitas. Se normaliza la URL para enlazar fuentes y ofertas. Bloqueos por términos y backoff siguen excluidos. Los cambios se procesan con el validador existente, evidencia e historial; no se aprueban nuevas ofertas automáticamente.

## Incidente de activación detectado el 2026-10-01

Los secretos requeridos estaban en el entorno GitHub `Variables`; ambos workflows carecían de `environment`, y la variable de repositorio exigida no existía. Supabase mostraba 34 ofertas públicas y ninguna ejecución nativa de Actions. Los workflows ahora usan ese entorno y arrancan por defecto en el repo público, conservando parada explícita `RADAR_ACTIONS_ENABLED=false`. No se leen ni duplican claves. El cron sigue siendo 17 */6 UTC y conserva lease, concurrency, timeout y presupuesto de Brave.

## Validación y reversión

`npm test`: clasificación, exclusión de pistas/vencidas/bloqueadas, prevalencia de liveness, exportación sin promociones inyectadas, cuota de revisión y respeto de backoff, además de la suite existente. CI ejecuta flujos de navegador, Lighthouse y migraciones aisladas. No hay cambios de esquema ni nuevas dependencias.

Para revertir, revierte este PR; para detener escaneos, usa la variable de repositorio RADAR_ACTIONS_ENABLED=false. La revisión manual y los checks anteriores quedan conservados.

El despliegue en Render sigue siendo manual: Manual Deploy → Deploy latest commit. No es necesario crear más variables de Render para estas recomendaciones.
