# Fase 6 — cuentas: base preparada, activación pendiente

Consulta y trabajo: 2026-10-01, Colombia. La fase todavía no está completa en producción.

## Plan y archivos

Migraciones `20261001170410_phase6_accounts.sql` y `20261001171847_phase6_account_policy_plan.sql` (cachea el JWT completo por consulta antes de leer su claim) y rollback no destructivo; `public/accounts`, `account.html`, configuración pública del servidor; integración de favoritos; extensión y generador `tools/extension/build.js`; tests de cliente, permisos y Playwright. Sin SDK de servidor, dependencia nueva ni servicio de pago.

## Implementado

- `user_profiles`, `user_favorites`, `user_saved_searches`: claves a Auth, índices, timestamps y RLS por `auth.uid()`. Los usuarios anónimos de Auth no pueden usarlas. No hay acceso `anon`, roles en perfiles ni autorización por `user_metadata`. Favoritos nuevos solo de ofertas publicadas.
- Fusión aditiva e idempotente de favoritos locales con los remotos. Se borra el conjunto de invitado solo tras confirmar la importación. La cuenta se sincroniza después de mostrar el catálogo, sin bloquear la primera búsqueda. La web autenticada guarda por fila y no mezcla los favoritos remotos con los de invitado. No se borran favoritos ante errores de red.
- Perfil opcional (país ISO, área, tipo de correo) y búsquedas guardadas privadas; estas últimas no activan envío ni sustituyen las alertas del catálogo.
- Magic link con PKCE S256 usando la API REST oficial. Verificador temporal en almacenamiento local del navegador (permite abrir el correo en otra pestaña del mismo navegador); tokens solo en `sessionStorage`, separados por proyecto. Validación del usuario con Auth, renovación compartida y cierre local. URLs de callback limpiadas, CSP propia de la cuenta, sin recursos de terceros en esa página. Este diseño no mantiene la sesión tras cerrar la pestaña.
- Extensión 1.1.0 con configuración única en `extension/settings.json`; regenerar con `node tools/extension/build.js`. Consultas por service worker y solo dominio, sin ruta ni parámetros. Renderiza texto mediante DOM, nunca HTML de ofertas. Avisos opt-in, apagados por defecto; popup bajo petición. Acceso a favoritos en la cuenta web; sincronización y login nativos dentro de la extensión todavía pendientes.
- Límites de 1.000 favoritos y 50 búsquedas por usuario con bloqueo transaccional. Inserciones de favoritos/búsquedas detenidas si la base supera 400 MB. No se generan artefactos con cuentas, correos o datos de suscriptores.

## Activación segura

No se habilitaron cuentas públicas ni se enviaron correos reales. `SUPABASE_AUTH_ENABLED` es false por defecto. La página muestra la disponibilidad real y mantiene favoritos locales.

Antes de activar:

1. En Supabase Auth → Emails, verificar un SMTP gratuito válido. El SMTP incluido solo envía a miembros del equipo (2/h); no sirve como acceso público. Resend necesita un dominio ya disponible y verificado: no comprar uno. Sus cuotas deben compartirse con los digests; falta incorporar los correos de Auth al presupuesto común antes de usar el mismo proveedor. Alternativa de costo cero: OAuth con GitHub, pendiente de configurar e integrar; no requiere enviar magic links.
2. Auth → URL Configuration: Site URL `https://nova-student-radar.onrender.com`, redirect exacto `https://nova-student-radar.onrender.com/account.html`; evitar comodines en producción.
3. Completar aviso y tratamiento de datos, opt-in y eliminación en fase 7, protección anti-abuso y prueba de correo con un destinatario autorizado.
4. En Render, configurar `SUPABASE_PUBLISHABLE_KEY` con la clave **publicable** del proyecto; nunca `sb_secret_` ni `service_role`. Después de los pasos anteriores, `SUPABASE_AUTH_ENABLED=true`. La API nunca devuelve la clave secreta existente.
5. Desplegar manualmente el commit validado. Abrir `/account.html`, solicitar enlace en el mismo navegador, guardar perfil/favorito y comprobarlo en otra sesión/dispositivo de la misma cuenta. No confundir fixtures E2E con un envío real.

## Pruebas y rollback

`npm test` verifica configuración, PKCE entre pestañas, ausencia de tokens en localStorage, renovación, revocación, importación publicada y protección XSS de extensión. CI PostgreSQL prueba aislamiento entre dos usuarios, reasignación, anónimos, publicación y cuotas; Playwright prueba callback/fusión/perfil/logout con proveedor simulado, sin correo real. Checks existentes de radar/alertas/health/Lighthouse se conservan.

Rollback: desactivar `SUPABASE_AUTH_ENABLED`, revertir PR y ejecutar `supabase/rollback/phase6_accounts.sql`. Conserva tablas y datos, revoca acceso de clientes. No aplicar rollback antes de detener usuarios activos. Para restaurar, ejecutar los GRANT explícitos de la migración (no recrear tablas).

## Distribución gratuita

Cargar `extension/` sin empaquetar en modo desarrollador en Chrome/Edge es la vía inmediata gratuita. Chrome Web Store exige tarifa de registro si no hay cuenta existente: no registrarse pagando. Microsoft Edge Add-ons no tiene tarifa de registro, pero requiere cuenta de desarrollador, acuerdo, política de privacidad, metadatos y revisión. No se ha publicado en ninguna tienda.

Eliminación de cuentas preparada: [flujo, bloqueo y límites](PHASE_7_ACCOUNTS.md). No se activó Auth público.
