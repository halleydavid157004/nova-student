# Límites gratuitos y decisiones

Consulta: **2026-09-30 UTC**. Fuentes oficiales; no es una inspección del consumo ni de la facturación de las cuentas. Antes de usar una función nueva se debe contrastar su límite y volver a fechar este documento.

| Servicio | Límite publicado consultado | Decisión para Nova |
| --- | --- | --- |
| [Render Free](https://render.com/docs/free) | 750 horas por espacio/mes; suspensión tras 15 minutos sin tráfico; archivos efímeros; SMTP 25/465/587 bloqueado. Ancho de banda y builds tienen cuotas separadas. | Mantener el servicio existente Free; no contratar discos, workers ni cron de Render. Migrar el radar a Actions y el catálogo a alojamiento estático. Si se agota la cuota, pausar. |
| [Supabase Free](https://supabase.com/pricing) | 500 MB de base; 5 GB de salida y 5 GB de salida en caché; 1 GB de archivos; 50.000 usuarios activos mensuales; máximo 2 proyectos activos; pausa tras una semana de inactividad. | Usar el proyecto existente. Evidencia breve, retención limitada, índices medidos y catálogo público estático. No guardar HTML completo ni copias con datos personales en GitHub. Free no incluye las copias diarias del plan Pro. |
| [GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) | Ejecución con runners estándar gratuita en repositorios públicos. Runners grandes siempre facturables; caché incluida hasta 10 GB por repo. | Ubuntu/Windows estándar, timeout y concurrencia; sin runners grandes ni ampliar caché. La caché de Playwright debe quedar por debajo del cupo. No subir artefactos privados. |
| [Brave Search](https://brave.com/search/api/) | Search: 5 USD/1.000 solicitudes; 5 USD de crédito mensual. | Conservar máximo 600 intentos/mes UTC y 100 auxiliares. A ese precio son 3 USD cubiertos si quedan créditos: no garantiza costo cero si otros usos de la cuenta los agotan. No activar gasto adicional; pausar sin saldo. |
| [Groq Free](https://console.groq.com/docs/rate-limits) | Para `openai/gpt-oss-20b` y `120b`, tabla consultada: 30 RPM, 1.000 RPD, 8.000 TPM, 200.000 TPD. Límites por organización, con posibles excepciones visibles en su panel. | Compartir cuota entre chat y radar; respetar 429 y cabeceras del proveedor. No habilitar Developer ni intentar eludir cuotas rotando cuentas. |
| [Resend Free](https://resend.com/pricing) | 3.000 correos/mes; 100/día. | Cola y reserva persistente antes de enviar, incluyendo mensajes de confirmación. El remitente público necesita dominio verificado ya disponible; no comprar un dominio. Sin remitente apto, mantener envío detenido. |

## Compatibilidad de Node

[Node.js Releases](https://nodejs.org/en/about/previous-releases), consultado el mismo día, clasifica Node 20 como **EOL** y Node 24 como **LTS**. La Fase 0 mantiene `engines.node >=20`, verifica Node 20/24 en CI y recomienda Node 24 para instalaciones nuevas. No modifica la versión del servicio existente. La compatibilidad con 20 no equivale a recibir parches de seguridad.

## Controles y límites pendientes

No se creó ni actualizó ningún recurso de pago. El consumo de otras aplicaciones de una cuenta no se puede deducir del contador de Nova. El actual presupuesto de Brave protege un único escritor; la Fase 1/3 debe convertirlo en reserva transaccional. El correo actual todavía carece de cola y tope persistente: no tratarlo como listo para una campaña pública. Auth, Pages y Playwright se documentarán con sus fuentes antes de esas fases.
