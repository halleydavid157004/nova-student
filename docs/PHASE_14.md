# Fase 14 — Cobertura de Latinoamérica

Versión 2.14.0. Sin migraciones ni variables nuevas.

## Por qué

Las 106 páginas curadas de la Fase 11 apuntaban casi todas a versiones de Estados Unidos o
globales. Un estudiante en Bogotá o Lima veía precios en dólares, o beneficios que no aplican en su
país. Además, en producción 465 de 516 ofertas vienen de pistas no oficiales sin verificar, y la
aprobación automática (Fase 12) solo publica ofertas de fuentes oficiales: hacen falta más páginas
oficiales locales.

## Qué se agrega

16 páginas oficiales en `src/data/curated-sources.js`, abiertas y revisadas el 2026-10-02 (cada
una existe y describe un beneficio para estudiantes):

| País | Páginas |
| --- | --- |
| Colombia | Spotify Premium para Estudiantes, tarifa preferencial del Metro de Medellín (Sapiencia), ISIC Colombia |
| México | Spotify Premium para Estudiantes, Apple precios para la educación |
| Chile | Spotify Premium para Estudiantes, Apple precios para la educación, Tarjeta Nacional Estudiantil (TNE) |
| Argentina | Spotify Premium para Estudiantes, Boleto Educativo de la Ciudad de Buenos Aires, ISIC Argentina |
| Perú | Spotify Premium para Estudiantes, ISIC Perú, Movistar Plan Estudiante |
| Brasil | Spotify Premium Universitário |
| Región | Adobe Creative Cloud para estudiantes (sitio de Latinoamérica) |

Son **fuentes**, no ofertas: nada se publica hasta que el radar extrae la evidencia de la página y
pasa la verificación normal (o la aprobación automática con puntuación ≥ 80). El radar las agrega
una sola vez en el próximo ciclo (`ensureCuratedSources` es idempotente por URL).

## Descartadas

- Páginas que no cargaron o no muestran un beneficio verificable (Cinemark Colombia, ID Estudantil
  de Brasil, JUNAEB, Medio Pasaje de Perú, Claro Panamá).
- Notas de prensa y comunicados (TransMilenio, Matrícula Cero): cambian cada semestre y no son una
  página de oferta estable.
- Office 365 A1 en México: es el mismo programa que la entrada global existente.

## Validación

`test/studentoffers.test.js` comprueba que no haya URL duplicadas, que las categorías sean válidas
y que haya páginas locales para CO, MX, CL, AR, PE y BR.
