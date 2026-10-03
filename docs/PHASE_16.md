# Fase 16 — Tarjetas directas, buscador y logos

Versión 2.16.0. Sin migraciones ni variables nuevas.

## Qué cambia

- **Tarjetas al estilo directo.** Cada oferta muestra logo, marca, categoría y tipo; el beneficio
  va arriba en un recuadro de color (verde gratis, morado créditos, naranja descuento, azul pack),
  una línea que dice qué es el producto y un botón **Obtener beneficio** que abre la página
  oficial sin pasar por el detalle. El detalle sigue en **Detalles** o al tocar la tarjeta.
- **Buscador.** Filtra mientras escribes, desde el hero o desde la caja nueva sobre el catálogo
  (las dos comparten la búsqueda). Las palabras de tema en español buscan la categoría entera
  (viajes, compras, ropa, salud, juegos, seguros, música…), y gratis, descuento y créditos buscan
  por tipo de oferta. Un parecido por error de tipeo solo cuenta si la palabra no aparece tal cual
  ("notion" ya no trae "Barbeque Nation"). Si ninguna oferta tiene todas las palabras, se muestran
  las que tienen más, con las palabras raras pesando más. Requisitos y verificación ya no se
  indexan, y los resúmenes genéricos raspados de páginas tampoco.
- **Categorías.** Píldoras con conteo justo encima del catálogo, sincronizadas con el selector.
  Tocar una categoría de "Explorar" lleva al catálogo filtrado (antes subía al inicio de la
  página). Los filtros avanzados quedan plegados en **Más filtros**.
- **Logos.** El logo sale del dominio principal de la marca (`public/search/logos.js`): se quitan
  subdominios de servicio (help., support., docs.…) y `brand-domains.js` corrige los casos
  conocidos. Simple Icons solo se usa si el icono viene del sitio de la marca o está en la lista
  curada; si no, el favicon grande del sitio (Google, luego icon.horse) sobre fondo blanco.

## Datos

Se corrigieron en producción la categoría (92 cambios) y el resumen de las 248 ofertas
publicadas: el resumen ahora dice qué es cada producto en una línea, en lugar del texto genérico
que venía de la página.
