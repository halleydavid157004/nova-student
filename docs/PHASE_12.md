# Fase 12 — Aprobación automática y acceso con GitHub

Versión 2.12.0. Migración nueva: `supabase/migrations/20261002230000_phase12_auto_approval.sql`
(rollback en `supabase/rollback/phase12_auto_approval.sql`). Variables nuevas, ambas opcionales:
`NOVA_AUTO_APPROVE` (por defecto `true`) y `SUPABASE_AUTH_GITHUB` (por defecto `false`).

## Por qué

El radar vigila más de mil fuentes, pero la base de datos impide que una verificación publique
(«Validation cannot publish»). Todo esperaba a una persona en `/admin.html`, y el panel ni siquiera
podía abrirse sin cuentas activadas. Resultado: unas 25 ofertas publicadas.

## Qué se publica solo

Al final de cada ciclo, después de verificar, el radar llama a `nova_auto_approve`. Una oferta se
publica sola únicamente si cumple **todo**:

- viene de una fuente **oficial** y habilitada, y su enlace está en el mismo dominio que esa fuente;
- su última verificación es `active`, de las últimas 24 horas, con puntuación ≥ 80 y sin cambios
  materiales;
- pasa exactamente la misma comprobación de evidencia y de duplicados que el botón «Aprobar» del
  panel (las dos usan `nova_private.approve_offer`);
- no tiene reportes de usuarios pendientes;
- nunca fue rechazada por una persona (ni otra ficha de la misma página) ni aprobada
  automáticamente antes.

Como máximo 25 por ciclo. Se publica con `official=true` y `reviewed=false`: no se finge una revisión
humana. La fecha de verificación es la del check real.

## Cómo deshacer

- Cada aprobación queda en el registro (`admin_actions`, acción `auto_approve`, sin actor) con la
  puntuación y el check usados. El panel la muestra como «Aprobada automáticamente».
- Durante 14 días, o hasta que alguien actúe, la oferta sigue en la cola del panel con el aviso
  «Publicada automáticamente». **Rechazar** la retira del catálogo y el radar no la vuelve a publicar.
- Apagar sin desplegar, en el SQL Editor de Supabase:
  `update nova_private.auto_approval_settings set enabled=false where id=1;`
  (también se pueden ajustar `min_score` 70–100, `max_per_run` 1–100 y `max_check_age`).
- Apagar desde la app: `NOVA_AUTO_APPROVE=false` en Render y en las variables del flujo de GitHub.

Si la migración todavía no se aplicó, el radar sigue funcionando como antes y el resumen del ciclo
muestra `autoApproval.error: migration_missing`.

## Acceso con GitHub (gratis, sin remitente de correo)

El acceso por enlace mágico depende del correo de Supabase, que sin SMTP propio solo envía a los
miembros del proyecto. GitHub OAuth no envía correos. `/account.html` muestra «Entrar con GitHub»
cuando `SUPABASE_AUTH_GITHUB=true`; usa el mismo PKCE y el mismo callback que el enlace.

## Activación (lo hace el propietario)

1. **Migración:** Supabase → SQL Editor → pegar y ejecutar el archivo de la migración de esta fase.
2. **GitHub OAuth:** en GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
   Homepage `https://nova-student-radar.onrender.com`, callback
   `https://<proyecto>.supabase.co/auth/v1/callback`. Copiar Client ID y generar Client Secret, y
   pegarlos en Supabase → Authentication → Sign In / Providers → GitHub.
3. **URLs de Auth:** Supabase → Authentication → URL Configuration: Site URL
   `https://nova-student-radar.onrender.com` y redirect exacto
   `https://nova-student-radar.onrender.com/account.html`.
4. **Render → Environment:** `SUPABASE_PUBLISHABLE_KEY` (la clave publicable, nunca `sb_secret_`),
   `SUPABASE_AUTH_ENABLED=true`, `SUPABASE_AUTH_GITHUB=true`.
5. **Rol de administrador:** entrar en `/account.html` con GitHub y asignar el rol a esa cuenta como
   indica `PHASE_8.md` (paso 3). Abrir `/admin.html`.

## Pendiente fuera del código

- Correos de alertas: requieren un remitente verificado (Resend con dominio propio ya disponible, o
  SMTP) y los datos del responsable; pasos en `PHASE_7.md`. Sin eso el sitio funciona completo, pero
  no envía correos.

## Validación

`test/phase12-sql.sql` (PostgreSQL en CI): publica solo la oferta válida; descarta fuente no
oficial, puntuación baja, reporte pendiente, dominio ajeno, duplicado y oferta rechazada; exige
lease del radar; no repite; aparece en la cola; se deshace con «Rechazar» sin republicarse; respeta
el interruptor. Las pruebas de la fase 8 se ejecutan otra vez sobre la función refactorizada.
`test/normalized-storage.test.js` y `test/accounts.test.js` cubren la sincronización del radar y
el acceso con GitHub.
