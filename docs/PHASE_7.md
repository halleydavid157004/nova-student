# Fase 7 — consentimiento y preferencias: base implementada, activación pendiente

Consulta: 2026-10-01, Colombia. No se afirma que la fase de cumplimiento esté completa ni se activa correo público.

## Plan y archivos

Migración phase7_email_consent, rollback no destructivo, RPC privada `nova_email_consent`, servicios subscriptions/subscription-api/email, endpoints de preferencias, privacy.html y preferences.html, integración del formulario de alertas y worker de Actions. Tests de tokens, API, cola, SQL y Playwright. Sin dependencias nuevas ni servicios de pago.

## Comportamiento

Guardar una búsqueda no autoriza correo. La casilla de consentimiento es independiente, desmarcada y deshabilitada si falta la identidad del responsable. Una nueva alerta necesita confirmación propia incluso si el correo ya tiene otra alerta confirmada. El registro guarda versión del aviso, solicitud y confirmación. La cola envía como máximo una solicitud por dirección cada 24 horas, con caducidad de 72 horas desde la solicitud. La ejecución cada seis horas puede retrasar el correo; no promete entrega inmediata.

Los enlaces HMAC SHA-256 tienen propósitos separados. No contienen correos, ni se almacenan tokens completos. Preferencias vence en 90 días; la baja no vence y puede repetirse. La baja cancela todas las alertas y los enlaces de confirmación pendientes. Las acciones requieren POST; abrir un enlace por GET no cambia datos. La página elimina el fragmento antes de llamar a la API, no usa recursos externos y escapa las consultas mediante DOM. La API ignora identidades de suscriptor aportadas por el navegador: usa la firma y vuelve a comparar el nonce en la base.

Los digests incluyen enlaces de preferencias/baja y cabeceras List-Unsubscribe y List-Unsubscribe-Post para RFC 8058. Un envío ya reservado/en curso puede llegar después de la baja. Las reservas de confirmaciones y digests comparten presupuesto persistente: 90 intentos diarios UTC y 2.700 mensuales. Cada confirmación se reserva antes del envío; si el resultado es incierto, no se reintenta automáticamente. Hay pacing y backoff. Esto no presupone que SMTP de Auth u otras aplicaciones compartan ese contador: Auth debe seguir desactivado hasta integrar su presupuesto.

RPC SECURITY INVOKER, search_path vacío y EXECUTE solo service_role. Sin acceso anónimo a suscriptores, nonce o preferencias. Las columnas nuevas conservan RLS y trigger de updated_at existentes. Un bloqueo transaccional evita carreras entre confirmación/baja. Los datos reales de suscriptores nunca son fixtures ni artefactos de catálogo.

## Configuración manual cuando exista un remitente gratuito válido

1. Identificar un responsable real y un correo para solicitudes sobre datos. Configurarlos en Render como PRIVACY_CONTROLLER y PRIVACY_CONTACT_EMAIL; no guardarlos en el repo. El aviso muestra la información y las finalidades, derechos y conservación actuales, con limitaciones expresas.
2. Generar una clave aleatoria de al menos 32 bytes para EMAIL_TOKEN_SECRET, conservarla en Render Environment y en el entorno GitHub existente `Variables` como Secret. Usar el mismo valor en ambos. No pegar claves en el chat. Rotarla invalida enlaces anteriores.
3. En ese entorno GitHub, añadir PRIVACY_CONTROLLER y PRIVACY_CONTACT_EMAIL como Variables, y RESEND_API_KEY/RESEND_FROM como Secrets. Usar un dominio ya disponible/verificado y un remitente real; no comprar dominios ni habilitar planes de pago. El remitente onboarding@resend.dev no activa envío público.
4. Desplegar manualmente el commit validado en Render. Consultar /privacy.html. Guardar una alerta con autorización y verificar correo únicamente con un destinatario autorizado. El primer correo se procesa en el siguiente ciclo de Actions. Abrir el enlace, revisar la alerta y pulsar Confirmar. Después probar preferencias y baja.

Sin esta configuración, el catálogo funciona y las búsquedas se guardan, pero no hay correos públicos. Las pruebas usan destinatarios .invalid y proveedor simulado; no son prueba de entrega real.

## Verificación y reversión

`npm test`: tokens manipulados/vencidos/propósito incorrecto, rechazo de GET, baja RFC 8058, identidad firmada, DOM seguro, cola/reserva/resultado incierto y cabeceras de digest. CI PostgreSQL prueba autorización por alerta, cooldown, límites compartidos, caducidad, baja idempotente y cancelación de enlaces. Playwright recorre confirmar, cambiar frecuencia y dar de baja sin correo real.

Rollback conserva columnas, historial y consentimiento. Desactiva envíos/configuración primero, revierte el PR y ejecuta supabase/rollback/phase7_email_consent.sql: revoca los RPC de correo para no regresar a un bypass de consentimiento. Reactivar requiere código compatible y restituir los GRANT explícitos de la migración; no recrear tablas.

## Pendiente antes de declarar completas las fases 6 y 7

- Eliminación integral de cuenta y datos, conservación/purga de solicitudes sin confirmar y procedimiento de atención al titular.
- Completar identificación y revisión del aviso para el operador real; no afirmar cumplimiento jurídico con campos vacíos.
- Presupuesto compartido con magic links de Auth o proveedor OAuth gratuito alternativo.
- Remitente verificado y prueba de entrega real con consentimiento; no se ha enviado correo ni activado Resend en esta fase.
