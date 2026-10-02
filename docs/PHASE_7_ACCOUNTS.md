# Fase 7 — eliminación de cuentas preparada

Fecha de consulta: 2026-10-01, Colombia. Auth sigue desactivado; no se ha eliminado una cuenta real ni enviado correo.

## Plan y archivos

Migración phase7_account_erasure/rollback, account-deletion API y worker, db, accounts cliente/página, account.html y aviso. Tests API/cliente, SQL PostgreSQL y Playwright. Sin SDK ni dependencia de servidor nueva, ni cambios de pago, entorno de Render o proveedor Auth.

## Autorización y orden

POST /api/account/delete requiere JSON {confirm:"ELIMINAR"}, Bearer JWT y cuentas configuradas. No usa cookies. GET, IDs adicionales, origen externo, correo no verificado y usuarios anónimos se rechazan. Primero GET /auth/v1/user valida el token ante Auth; luego sub/session_id se contrastan con la identidad verificada. El RPC comprueba que la sesión existe en auth.sessions para ese usuario. Leer solo id/user_id requiere un GRANT explícito al backend; anon/authenticated no reciben acceso. No se usa user_metadata para autorizar.

El RPC SECURITY INVOKER solo acepta service_role. Crea un marcador de bloqueo y elimina perfil/favoritos/búsquedas/suscripciones del correo verificado o vinculadas al usuario. RLS restrictiva impide leer o recrear filas con JWT antiguo incluso si Auth todavía existe. Los límites agregados de Brave/Resend permanecen intactos. Cache de alertas se depura; CAS impide reponer filas antiguas. Se conserva la regla de publicación actual.

Después se intenta logout global y Auth Admin hard delete (should_soft_delete:false), usando sb_secret solo en apikey. No se modifica auth.users directamente en producción. Una respuesta 200 al DELETE no basta: se exige GET Admin con 404 y código user_not_found (o error_code histórico) antes de marcar completed. El esquema actual confirma cascada auth.sessions → auth.users. Esto elimina sesiones, pero no revoca la firma de JWT emitidos: RLS y después la ausencia del padre Auth cierran el acceso.

Si un resultado es desconocido, se responde pending y se mantiene bloqueo. La cola de Actions reclama hasta cinco solicitudes por ciclo con backoff durable de 1, 2, 4, 8, 16 y 24 h. Reintentar borrar es seguro; no hay email ni token guardado en cola. La cola sigue procesable aunque se desactive el inicio de sesión, con el backend normalizado configurado. Un error persistente, pausa del proyecto/radar o falta de permisos requiere intervención del responsable; no se promete plazo de eliminación.

## Datos mínimos y límites

Mientras esté pendiente, el backend conserva UUID para completar Auth; authenticated solo puede leer la huella de su propio marcador. Al completar se borra UUID y solo queda huella SHA-256 durante 14 días, depurada en el próximo ciclo de Actions. No se almacenan correos, tokens, consultas ni mensajes de proveedor en el marcador/resumen. No se publica historial personal en GitHub o catálogo. El navegador borra sesión/verificador y favoritos locales de este origen solo cuando la solicitud fue aceptada; si falla antes de registrar, los conserva para reintentar.

La supresión no retira correos ya enviados/en proceso, copias de dispositivos desconectados ni logs de auditoría/respaldos administrados por proveedores. Auth Admin genera registros técnicos propios; su retención y solicitudes se revisan con el operador, sin manipular tablas internas de auditoría. Si aparecieran objetos Storage asociados, el borrado puede quedar pendiente; actualmente no hay archivos ni cuentas y el producto no crea esos objetos. Otros correos o alias no asociados se gestionan mediante su enlace privado/responsable. No se afirma cumplimiento jurídico completo.

## Pruebas y rollback

npm test: ID nunca tomado del cliente, sesión/confirmación necesarias, headers/clave privada, ausencia confirmada ante Auth, estados desconocidos pendientes, backoff/lease, almacenamiento local en éxito/error. SQL aislado: sesiones inexistentes, aislamiento, cascadas, idempotencia, presupuesto, JWT antiguo sin capacidad de reinserción, marcador privado y purga. Playwright exige ELIMINAR, limpia perfil/listados/sesión y confirma interfaz. Todos los destinatarios/usuarios de fixtures son sintéticos; no confundir mocks con borrado real.

Rollback: detener eliminaciones y Actions, revertir código y ejecutar supabase/rollback/phase7_account_erasure.sql. Revoca RPC y permiso limitado de lectura de sesiones, conserva marcadores y gates. No retirar gates ni restaurar datos suprimidos. Para reactivar, restituir GRANT de sesión/RPC con código compatible. Una solicitud pendiente no se debe cancelar silenciosamente: completar con operador antes de retirar la cola.

## Activación pendiente

Mantener SUPABASE_AUTH_ENABLED=false hasta preparar proveedor gratuito y presupuesto de acceso, identidad/contacto del responsable y procedimiento de atención. Cuando exista una cuenta de prueba autorizada, verificar borrado real y fracaso/reintento sin tocar otras personas. Manual Deploy de latest commit en Render; no hay variables nuevas para este flujo. Panel admin y diferenciadores de fase 9 continúan pendientes.

Fuentes oficiales: [Sessions](https://supabase.com/docs/guides/auth/sessions), [deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [claves nuevas](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys), [Auth Admin implementación](https://github.com/supabase/auth/blob/master/internal/api/admin.go), [changelog](https://supabase.com/changelog). No se usan controles Pro de sesiones ni SQL SECURITY DEFINER.
