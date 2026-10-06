# Calidad del catálogo e IA — 6/oct/2026

Descuentos que el importador había llamado free se presentan como Descuento; los beneficios mixtos como combinado, créditos como créditos, pruebas temporales y términos sin evidencia explícita como consultar condiciones. Se deriva del beneficio aprobado, sin inventar precios ni fechas. La misma regla opera en búsqueda, catálogo, tarjetas y destacados. El importador deja de usar free como valor por defecto.

Las tarjetas y fichas distinguen Comprobada con evidencia, Comprobación en revisión y Última comprobación. Un intento fallido de extracción conserva la cita aprobada y la fecha de éxito original; no inventa una nueva verificación ni retira una oferta reviewed por un fallo de IA.

Nova AI solo recupera ofertas publicadas con estado activo, cita y comprobación vigente. El filtro de país ocurre antes de consultar Groq. Groq selecciona hasta tres IDs mediante JSON a temperatura 0; el servidor ignora IDs ajenos y construye los hechos y las fichas desde datos aprobados. No se muestra prosa generada ni se añaden las tres primeras fichas arbitrariamente. Una respuesta inválida usa recuperación determinista; sin coincidencias no se inventan ofertas ni se consume Groq.

Sin DDL ni secretos nuevos. No cambia la aprobación humana ni la regla de dos fallos reales. Los cambios materiales siguen requiriendo revisión del propietario; no se afirma que el código haya revalidado esos proveedores.

Tests: tipos, estado/evidencia, conservación de cita, 30 consultas de país ES/EN, selección de IDs, vigencia, candidatos no aprobados, JSON incorrecto y fallback de proveedor. Playwright/SQL siguen en CI. Rollback: revertir PR y desplegar commit anterior; mantener pausada la autoaprobación mientras exista incertidumbre de fuentes.
