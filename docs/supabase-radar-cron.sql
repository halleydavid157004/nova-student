-- Nova Student: despertar el servidor existente cuatro veces al día.
-- Ejecutar con el rol postgres en SQL Editor. No contiene secretos.
-- El mismo nombre actualiza este trabajo sin crear copias.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'nova-student-six-hour-wake',
  '17 */6 * * *',
  $$
    select net.http_get(
      url := 'https://nova-student-radar.onrender.com/api/health',
      headers := '{"User-Agent":"NovaStudentSupabaseCron/1.0"}'::jsonb,
      timeout_milliseconds := 90000
    ) as request_id;
  $$
);

-- Inspección: debe existir un solo trabajo activo con este horario.
select jobname, schedule, active
from cron.job
where jobname = 'nova-student-six-hour-wake';

-- Para desactivar únicamente este trabajo:
-- select cron.unschedule('nova-student-six-hour-wake');
