# Fase 1 — almacenamiento normalizado

## Alcance y archivos

Plan: crear tablas privadas, importar la instantánea sin perder identificadores ni presupuesto, sustituir las escrituras completas por cambios por fila y probar el corte y su rollback. Archivos: `supabase/migrations/20260930194450_phase1_normalized_storage.sql`, `supabase/rollback/phase1_normalized_storage.sql`, `src/storage/normalized.js`, `src/db.js`, `src/migrate-state.js`, `src/services/brave.js`, `server.js`, tests, workflow Test y documentación. No cambia la regla de publicación ni traslada todavía el radar a Actions.

## Modelo y permisos

| Tabla en `nova_private` | Uso |
| --- | --- |
| `offers` | Ficha, identidad estable, publicación, búsqueda ES/EN y campos reservados para vigencia |
| `offer_versions` | Versiones de los datos importados o cambiados; evidencia breve y aprobación heredada |
| `sources` | URL única, estado y metadatos del rastreo |
| `checks` | Verificaciones con señales y referencias a fuente, versión y ejecución; motor en Fase 2 |
| `events` | Historial, con referencias a oferta y fuente |
| `reports` | Esquema para reportes; recepción y antiabuso en Fase 2 |
| `subscribers` | Correo normalizado único; estados de consentimiento, aún sin doble opt-in |
| `alerts` | Filtros y frecuencia, asociados al suscriptor |
| `worker_runs` | Importación del último ciclo conocido; registro de cada ciclo nuevo en Fase 3 |
| `budget_usage` | Reserva atómica del presupuesto de Brave por mes UTC |
| `app_runtime` | Metadatos pequeños por clave, separados de catálogo, correos y contadores |
| `storage_control` | Modo `legacy` o `normalized`, para el corte y rollback |

Todas las tablas tienen RLS, permisos explícitos y trigger `updated_at`. Hay índices para claves foráneas, prioridades, historial, países, categorías, texto ES/EN y trigramas de marca. `unaccent` y `pg_trgm` viven en `extensions`; la columna `search_document` se genera en PostgreSQL. La búsqueda web actual conserva su algoritmo hasta la Fase 5.

La única lectura anónima expuesta en la Data API es `public.public_offers`: vista con `security_invoker`, permisos por columna y RLS. Solo devuelve ofertas activas, oficiales o revisadas y sin vencimiento pasado. No incluye `extra`, extractos internos, correos ni tablas privadas. **No expongas `nova_private` en la Data API.** Los RPC de escritura, carga privada, importación y presupuesto son exclusivos de `service_role`, sin `SECURITY DEFINER`. La clave `sb_secret_` permanece solo en servidores o GitHub Secrets.

## Importación y corte sin perder cambios

1. Aplica la migración antes de desplegar 2.2.0. Crea `nova_state` protegida si el proyecto está vacío; conserva una tabla existente. Importa el JSON dentro de PostgreSQL, sin descargar datos personales al repositorio.
2. La importación es idempotente: IDs, URLs, slugs, suscriptores y hashes evitan duplicados. Preserva campos antiguos en `extra`; referencias huérfanas de eventos quedan como `legacy_source_id`/`legacy_offer_id`. El presupuesto importado solo puede aumentar, nunca reiniciarse.
3. El modo inicial es `legacy`. Un trigger mantiene las tablas al día cuando el servidor anterior guarda su instantánea. El servidor anterior sigue funcionando mientras preparas el despliegue.
4. Con las mismas `SUPABASE_URL` y `SUPABASE_SECRET_KEY`, 2.2.0 arranca en `SUPABASE_STORAGE_MODE=normalized` por defecto. `nova_activate_rows` bloquea el escritor antiguo, importa la última instantánea y cambia el modo en una transacción. Después las cargas leen las tablas y los guardados mandan solo filas/campos cambiados.
5. Una escritura antigua posterior al corte falla de forma explícita; no puede reemplazar cambios recientes. No vuelvas a arrancar código antiguo sin el rollback documentado.

`npm run migrate:state` repite la importación **antes del corte**, usando variables secretas del servidor, e imprime solo recuentos. Después del corte rechaza reimportar la instantánea congelada. Para un JSON privado externo, impórtalo en la tabla protegida con el procedimiento anterior al corte; `SEED_DATABASE_PATH` es una opción del almacenamiento local/antiguo, no una importación posterior a la normalización.

## Escrituras concurrentes

Ya no hay un único escritor de toda la base. Cada lote es una transacción con comparación de los valores anteriores **solo de los campos editados**. Dos procesos pueden editar filas distintas o campos distintos de la misma fila. Si cambian el mismo campo, se devuelve un conflicto: no se sobrescribe el trabajo ajeno. No hay reintento ciego; el servidor conserva el lote pendiente y muestra `storage.error`.

Los IDs numéricos usados por la web y extensión se reservan en bloques disjuntos dentro de PostgreSQL. Puede haber saltos; no se reutilizan. Las altas de alertas usan un RPC y un índice único parcial para devolver la misma alerta activa ante solicitudes simultáneas. El presupuesto de Brave se reserva con bloqueo de fila antes de llamar al proveedor: hasta 600 intentos/mes y 100 auxiliares. Una respuesta de red ambigua consume capacidad conservadoramente; no se repite la reserva automáticamente.

La memoria del servidor se recarga desde las tablas como máximo una vez por minuto en las lecturas de API, cuando no hay cambios pendientes ni escaneo. Una recarga iniciada antes de una escritura local se descarta. La visibilidad entre procesos es eventual; las restricciones y reservas en PostgreSQL son inmediatas. Los metadatos de una misma ejecución del radar aún pueden entrar en conflicto: la coordinación de ciclos/leases pertenece a la Fase 3, no se permite iniciar varios escaneos de la misma ventana sin esa coordinación.

## Despliegue manual en Render

Una vez aplicada la migración e integrado el PR:

1. Conserva las variables actuales de Supabase, Groq, Brave y correo. Si existe `SUPABASE_STORAGE_MODE`, ponla en `normalized`.
2. En Render, **Manual Deploy → Deploy latest commit** de `main`. Mantén el plan Free. No hace falta crear servicios ni nuevas claves.
3. Abre `/api/health`: versión `2.2.0`, `storage.provider: supabase`, `storage.schema: normalized`, `ready: true`, `synced: true`, `error: false`.
4. Comprueba `/api/worker-status`, busca una oferta, abre su ficha y crea una alerta de prueba que controles. El resultado de guardar no confirma entrega de correo.

El radar sigue dentro de Render y conserva su cron de seis horas. No desactives sus disparadores todavía. La Fase 3 moverá la ejecución a Actions; esta migración no garantiza por sí sola un ciclo cuando Render duerme.

## Rollback

1. Detén todos los escritores: servidor y escaneos manuales/Actions. No ejecutes el rollback con una instancia normalizada escribiendo.
2. Ejecuta `supabase/rollback/phase1_normalized_storage.sql` con el propietario de la base. Exporta **las filas actuales** y los contadores a `nova_state`, cambia a `legacy` y conserva tablas e historial. No exportes ese JSON a GitHub.
3. Arranca el commit anterior `517e7f0` o la versión actual con `SUPABASE_STORAGE_MODE=snapshot`. Revisa salud y alertas.
4. Para volver a normalizado, detén los escritores antiguos y despliega la versión nueva con `normalized`; vuelve a importar el estado actualizado durante la activación.

Cambiar solo la variable a `snapshot` después del corte no constituye un rollback y puede leer datos obsoletos. El SQL es necesario. Los saltos de secuencia no se revierten y no afectan la identidad de filas existentes.

## Pruebas

```bash
npm ci
npm test
# Base desechable PostgreSQL 17 LOCAL, nunca un proyecto Supabase:
NOVA_TEST_DATABASE_URL=postgresql://postgres:nova-test@127.0.0.1:5432/nova_test node --test test/normalized-sql.test.js
```

CI ejecuta Node 20/24, el lanzador de Windows y PostgreSQL 17 real. El test SQL comprueba importación repetida, FTS ES/EN, permisos anónimos, conflictos por campo, triggers, IDs, altas duplicadas, reserva de presupuesto, bloqueo de escrituras antiguas y rollback con una suscripción nueva. Los tests del adaptador cubren fallos pendientes, mutaciones durante el guardado y recargas obsoletas. El test HTTP arranca el servidor con RPC simulados y comprueba publicación, salud, estado y alertas. Todos los correos/URLs de fixtures son sintéticos bajo `example.invalid`.

Sin una base local, el test SQL se omite en `npm test`; el job `normalized-database` es obligatorio antes de integrar el PR. Playwright y Lighthouse no se incorporan en esta fase. El backend sigue sin dependencias de producción ni SDK pesado.

## Riesgos pendientes

- El historial inicial refleja el JSON conservado, no verificaciones retrospectivas inventadas. Su hash de contenido no es todavía la huella de una sección relevante: eso y la extracción validada corresponden a Fase 2.
- No se habilitan cuentas, reportes públicos, doble opt-in, roles de admin ni cola de Resend por tener tablas preparadas; siguen pendientes sus fases.
- Carga de filas completa en el arranque y recarga; escritura incremental. La Fase 3/4 debe limitar retención y servir catálogo estático para proteger 500 MB y ancho de banda.
- Lotes de hasta 1.000 cambios; lotes mayores fallan explícitamente y deben fraccionarse por operaciones coherentes. No hay reconciliación automática de conflictos del mismo campo.
- Supabase Free no aporta copias diarias automáticas. Conserva backups privados de todas las tablas antes de operaciones futuras.
- La migración puede bloquear brevemente una escritura antigua mientras importa. La activación exige disponibilidad de Supabase; falla sin arrancar una base temporal.

Documentación oficial consultada el 2026-09-30: [RLS y vistas invoker](https://supabase.com/docs/guides/database/postgres/row-level-security), [búsqueda de texto](https://supabase.com/docs/guides/database/full-text-search), [seguridad de la Data API](https://supabase.com/docs/guides/api/securing-your-api), [changelog](https://supabase.com/changelog), [cambios PostgreSQL 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes). No se usan operadores personalizados, `ltree`, cifrado PGP legado ni los casos afectados de `btree_gist`. El acceso REST con `fetch` evita depender de bibliotecas Supabase JS que ya retiraron soporte a Node 20. Los límites y decisiones gratuitas están en `FREE_TIER_LIMITS.md`.

## Comprobación del proyecto actual — 2026-09-30 UTC

Migración aplicada con versión registrada `20260930194450`, igual al archivo del repositorio. Las tablas quedaron en modo **legacy**; falta el despliegue manual para activar la versión 2.2.0. Recuentos contrastados: 357 ofertas, 708 fuentes, 1.056 eventos, 357 versiones iniciales y 34 fichas publicadas; cero suscriptores/alertas. Brave mantuvo 20 intentos de septiembre (4 auxiliares). Tamaño de base tras importar: 18.705.555 bytes, dentro del plan Free existente. La lectura con rol `anon` devolvió 34 fichas.

Los asesores no reportaron errores ni advertencias de seguridad. Informativos: [nova_state con RLS sin política](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), protección intencionada del formato antiguo que solo usa el backend; e [índices recién creados sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), que deben medirse después del despliegue antes de considerar retirarlos. No se concedió lectura anónima al JSON antiguo. El script [supabase-normalized-verify.sql](supabase-normalized-verify.sql) reproduce comprobaciones de permisos y recuentos sin mostrar datos personales.

El sitio seguía en 2.1.0 tras la migración, con almacenamiento sano. El radar completó las cuatro consultas de Brave de las 18:17 UTC sin errores y descubrió 23 fuentes; son pistas, no ofertas aprobadas. No se realizó un despliegue desde Render.

El despliegue manual se verificó el 2026-09-30 a las 20:20 UTC: versión 2.2.0, commit a88daf3, schema normalized, ready/synced true y error false. El corte quedó completado; el JSON antiguo está protegido contra escritores anteriores.
