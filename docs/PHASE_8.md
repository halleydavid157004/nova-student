# Fase 8: revisión administrativa con evidencia

Versión 2.8.0. Panel `/admin.html`; API `/api/admin/review`; RPC
`nova_admin_review`; migración `20261002173115_phase8_admin_review.sql`.

## Plan y archivos

- `public/admin/*` y `public/admin.html`: cola paginada, evidencia, diff,
  aprobación/rechazo, edición del título/pasos, habilitar/deshabilitar fuentes,
  consulta del registro de acciones. Todo contenido externo se inserta como texto.
- `src/services/admin-review.js`, `src/db.js`, `src/storage/normalized.js`:
  verificación de administrador, límites, operaciones por fila, actualización
  inmediata del catálogo en memoria y de su baseline sin instantáneas.
- Migración y rollback, tests de políticas/API, PostgreSQL y Playwright en Actions.

## Reglas de publicación

Una oferta descubierta nunca se aprueba sola. (Desde la [fase 12](PHASE_12.md), solo las de fuente oficial con evidencia fuerte se publican solas, con registro y deshacer en este panel.) Se exige una verificación de hace
como máximo siete días, HTTP final 2xx, extracción estructurada vinculada al check,
cita de 10–400 caracteres, beneficio disponible, requisitos, países conocidos y
vencimiento futuro o nulo. Se rechazan robots/captcha, soft-404, fallos, reportes
pendientes y redirecciones a una fuente distinta. Cuando la URL cambió, corregir
la fuente mediante el flujo de ingeniería y volver a verificar, sin evadir bloqueos.

El administrador debe abrir la fuente, verificar que corresponde al proveedor,
leer la cita, confirmar beneficio, valor, países, condiciones y cambios, y escribir
un motivo. No basta HTTP 200, una respuesta de Groq o un resultado de Brave. Cambios
materiales de precio/beneficio/país/método con extracción válida y score ≥55 se
pueden revisar explícitamente; las señales de beneficio finalizado o ausente impiden
aprobar. El score de 55 no da un sello Hot/Imperdible: se conserva el score real.

Se guarda `reviewed=true`; no se inventa `official=true`. La fecha de verificación
es la del check real, nunca la hora de pulsar Aprobar. Se registra la versión aprobada.
Sin check reciente no existe aprobación rápida; hace falta otro ciclo del radar.
La edición manual se limita a título y pasos. Beneficio, precio, países, requisitos,
URL o condición de oficial no se modifican desde este formulario.

Se comparan identidades compartidas con búsqueda/exportación: URL sin tracking,
marca/título/beneficio, país, método y tipo de oferta; se preservan query parameters
que distinguen planes. Una transacción serializa aprobaciones y vuelve a comprobar
la última versión, timestamp y duplicados. Los listados públicos mantienen además
su deduplicación final. No se afirma cobertura de todas las ofertas de internet.

## Acceso y activación pendiente

El panel está preparado pero no habilita cuentas automáticamente. No se crea una
cuenta ni se asigna el rol a un correo supuesto. Completar primero `PHASE_6.md`
(proveedor gratuito y redirects; revisar las limitaciones de correo de Supabase).

1. Desplegar el último commit manualmente en Render; aplicar la migración indicada
   si todavía no se aplicó al proyecto.
2. Activar Supabase Auth según fase 6 y `SUPABASE_AUTH_ENABLED=true` con la clave
   **publishable** del proyecto y el proveedor autorizado. Ninguna clave secret
   llega al navegador.
3. Iniciar sesión en `/account.html`. En Supabase, el propietario identifica el UUID
   de esa cuenta. Asignar exclusivamente desde SQL Editor o Auth Admin servidor:

   ```sql
   update auth.users
   set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"nova_role":"admin"}'::jsonb
   where id='UUID_DE_LA_CUENTA_VERIFICADA';
   ```

4. Abrir `/admin.html`, revisar primero una oferta pendiente y comprobar el registro.
   Para revocar el rol, eliminar la clave `nova_role` de `raw_app_meta_data`.
   No usar `user_metadata`, perfiles editables ni el viejo `ADMIN_TOKEN`.

El backend consulta el usuario verificado en cada petición y la RPC verifica
nuevamente el rol actual y `auth.sessions`. La eliminación pendiente de cuenta
bloquea la administración. Solo se conceden las columnas Auth indispensables al
backend, no el acceso público a `auth.users` ni a correos de suscriptores.

Los endpoints antiguos `/api/admin/scan`, `/api/admin/test-digest`, lectura general
`GET /api/alerts` y eliminación compartida `DELETE /api/alerts/:id` responden 410.
Escaneos: workflows Actions. Alertas: enlace privado de preferencias y baja.
`ADMIN_TOKEN` puede conservarse como fallback histórico del hash de reportes, pero
ya no concede acceso administrativo. `/api/health`, `/api/worker-status`, búsquedas,
chat y extensión conservan su contrato.

## Historial, concurrencia y rollback

`nova_private.admin_actions` tiene RLS y acceso exclusivo de backend. Incluye acción,
referencias, motivo y valores antes/después; no copia email ni tokens. El panel no
expone el UUID del actor. El actor interno pasa a null cuando se borra su Auth user.
Se purgan acciones de más de 90 días en la próxima petición administrativa; sin
actividad no se ejecuta un cron nuevo. La cola y el historial usan páginas de 50.

Una ficha editada o validada desde la carga de la cola produce conflicto. Se debe
recargar antes de decidir. Si falla la red, la operación puede haberse registrado:
consultar cola/historial antes de repetir; no hay envío de correo desde este panel.

`supabase/rollback/phase8_admin_review.sql` revoca la RPC y la columna de metadatos
Auth. Conserva ofertas, evidencia y auditoría. No deshace rechazos ni vuelve a
publicar ofertas, ni restaura un token compartido. Desactivar el panel o desplegar
el commit anterior antes del rollback. Conserva los bloqueos de eliminación de fase 7.

## Pruebas

- `npm test`: evidencia ausente, caducada, falsa/incompleta, roles falsificados,
  origen ajeno, input inválido, diferencias, duplicados y variantes internacionales.
- Job `normalized-database`: migraciones reales en PostgreSQL 17, RLS, sesión/rol
  revocados, bloqueos, versión antigua, fecha real, duplicados, edición y rollback.
- Job `browser`: revisión sin confirmación, aprobación explícita, fuente habilitada/
  deshabilitada, diff/evidencia con payload XSS, historial y ausencia de errores JS.
- Continúan búsqueda, fichas, alertas, cuentas, preferencias y Lighthouse de las fases
  anteriores. Fixtures sintéticas `.invalid`; no emails ni cuentas reales en tests.

Pendiente de prueba con cuenta real: activar Auth/proveedor gratuito y designar
al propietario administrador. No interpretar tests mock como acceso real habilitado.
