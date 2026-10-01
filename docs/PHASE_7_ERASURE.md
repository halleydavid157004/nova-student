# Fase 7 — supresión de suscripciones y conservación

Fecha: 2026-10-01, Colombia. Seguimiento del PR #21; no completa eliminación de cuentas Auth ni certifica cumplimiento jurídico.

## Plan y archivos

Migración phase7_email_erasure y rollback; subscriptions API, db/cache normalizado, preferencias, worker y aviso. Tests de API, DOM, caché, PostgreSQL y E2E. Sin nuevas dependencias, servicios ni pagos. Docs actuales de Supabase revisadas: changelog y managing-user-data/cascade-deletes. Ninguna nueva API Auth: borrar una fila de auth.users no revoca JWT, por eso la eliminación integral de cuentas requiere implementación propia posterior.

## Supresión por enlace

Solo un token vigente de preferencias permite POST /api/subscriptions/erase con confirm:true. GET, token de confirmación/baja, ID aportado por navegador, nonce de otro suscriptor o ausencia de confirmación no permiten borrar. La casilla de aceptación irreversible está inicialmente vacía. El RPC SECURITY INVOKER solo admite service_role; compara nonce y bloquea junto con los RPC de consentimiento. Elimina suscriptor y cascada alertas, consultas, consentimientos y registros de entrega. La respuesta pública solo contiene ok. Los enlaces anteriores dejan de funcionar. Un envío en curso puede llegar; los correos entregados y datos del proveedor no se retiran por esta acción.

Se eliminan del caché de este proceso las alertas afectadas, sin reproducir escrituras. Otros procesos pueden tener una vista temporalmente antigua; CAS impide reconstruir filas eliminadas y el contexto se vuelve a verificar antes del envío. Los contadores agregados de Brave/Resend se conservan para impedir que la supresión reinicie cuotas.

## Conservación

Actions ejecuta mantenimiento antes de cada radar: hasta 500 alertas no confirmadas con más de 30 días desde consent_requested_at (o created_at); hasta 500 suscriptores unconfirmed, sin alertas y creados hace más de 30 días. Una solicitud reciente protege su alerta aunque la búsqueda sea antigua. Nunca expira una alerta confirmada mediante esta regla. Suscriptores confirmed/withdrawn requieren supresión explícita o procedimiento del responsable; no se promete purga de toda cuenta. Los registros de entrega, también reservados, se eliminan a los 90 días; presupuesto agregado conserva 24 meses. Una pausa/fallo de Actions retrasa estos plazos. worker_runs almacena conteos agregados, sin consultas ni correos.

La migración limpia únicamente alerts del JSON congelado nova_state cuando el modo es normalized, conservando el catálogo y las tablas actuales. El trigger se deshabilita y restituye dentro de la migración transaccional; no se habilitan escrituras legacy. El rollback de fase 1 exporta filas actuales: no recupera datos suprimidos. No hay snapshots personales nuevos ni datos personales en repo.

## Prueba y rollback

npm test y CI PostgreSQL: aislamiento entre suscriptores, cascadas, enlaces revocados, conservación de presupuesto, rechazo de escritor antiguo, solicitudes recientes/confirmadas intactas, limpieza idempotente y permisos/rollback. Playwright exige casilla y elimina fichas de alertas con API simulada. No se han enviado mensajes ni ejecutado una supresión de un suscriptor real.

Antes del rollback detener Actions y retirar interfaz de supresión. supabase/rollback/phase7_email_erasure.sql revoca RPC de supresión y restaura mantenimiento anterior. Conserva esquema/catálogo y no restaura datos personales eliminados; tampoco el snapshot congelado de alertas. Una migración inversa no puede recuperar datos borrados y no debe intentar hacerlo.

## Pendiente

Cuenta Auth (perfil, favoritos, sesiones, búsquedas), gestión del responsable, remitente y entrega real siguen pendientes. Mantener Auth/correo desactivados hasta preparar configuración y presupuesto. El contacto del aviso atiende derechos que todavía no tienen autoservicio. La supresión aquí cubre suscripciones, no la eliminación integral de cuenta.
