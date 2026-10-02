# Referencia de producto: StudentOffers

Consulta pública: 2026-10-02 UTC. Fuentes: https://www.studentoffers.co/ , https://www.studentoffers.co/tools , https://www.studentoffers.co/api-docs , https://www.studentoffers.co/robots.txt . Observaciones del sitio, no verificación independiente de cada beneficio.

| Aspecto | Referencia observada | Nova y siguiente prioridad |
| --- | --- | --- |
| Cobertura | El sitio anuncia 595 ofertas, 15 categorías y colección GitHub Student Pack. | El catálogo publicado de Nova es menor. Ampliar fuentes oficiales y revisión; no relajar aprobación para igualar un contador. |
| Fichas | Marca, beneficio/valor, tipo de oferta y región visibles en las tarjetas. | Fase 9 pone beneficio, país legible y comprobación al frente; revisar después colecciones y páginas por categoría/marca. |
| Navegación | Búsqueda, favoritos, categorías y envío de sugerencias. | Búsqueda ES/EN, filtros ISO y favoritos existentes; faltan recorridos editoriales y una contribución de fuentes accesible al público. |
| Diferenciación | Catálogo amplio orientado a herramientas. | Elegibilidad orientativa, evidencia fechada, vigencia, calendario, Latinoamérica y cálculos personales sin precios inventados. No basta para afirmar superioridad. |
| Integración | API pública documentada, sin clave, 60 solicitudes/minuto/IP y 429 con Retry-After. | Su robots.txt general prohíbe `/api/` a NovaStudentRadar. No consultar la API automáticamente mientras esa regla exista; corregir el descubridor para aplicar robots/backoff. No suplantar otro User-Agent. |

La documentación de API y robots tienen una discrepancia relevante para integración automática. Mantener bloqueo y usar fuentes oficiales permitidas; una futura autorización específica o cambio de robots permite reconsiderar. No copiar contenido masivo ni incorporar precios, países o etiquetas de verificación de un agregador como hechos aprobados.

Orden propuesto tras fase 9: corregir cumplimiento del descubridor; colecciones útiles y fichas por marca/categoría; expansión de fuentes oficiales con cola de revisión; medir búsquedas sin resultados y cobertura por país. Publicación estática y activación segura del panel son necesarias para velocidad y crecimiento operativo.
