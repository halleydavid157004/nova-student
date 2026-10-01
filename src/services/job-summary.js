const count=value=>Number.isFinite(value)?Math.max(0,Math.floor(value)):0;
export function jobSummary(result) {
  if(result.skipped)return `### Radar\n\nCiclo omitido (${['busy','already_completed','not_due','capacity_low'].includes(result.skipped)?result.skipped:'not_ready'}).\n`;
  const s=result.summary||{};
  return `### Nova Student Radar\n\n| Resultado | Total |\n| --- | ---: |\n| Fuentes nuevas | ${count(s.discovery?.newSources)} |\n| Fuentes comprobadas | ${count(s.scan?.total)} |\n| Errores de fuentes | ${count(s.scan?.errors)} |\n| Fuentes omitidas | ${count(s.scan?.skipped)} |\n| Ofertas públicas | ${count(s.catalog?.offers)} |\n| Correos aceptados | ${count(s.digests?.sent)} |\n| Intentos Brave del mes | ${count(s.brave?.used)} |\n\nSolo conteos; sin destinatarios, claves ni cuerpos de proveedores.\n`;
}
