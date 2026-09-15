# La Home pública mantiene alineado el fragmento solicitado · 2026-09-15

## Problema

Con los chunks en caché (por ejemplo al volver de una página de servicio), el controlador de la Home alineaba `#incidencia` en cuanto el formulario de intake estaba listo, pero las reglas de estilo de las secciones llegaban después (padding de 0 a 86 px por sección, +1969 px en total). El destino quedaba unos 1100 px por debajo de la ventana. Reproducido en una de cada tres a seis cargas en Chromium; el contrato `public-site` lo detectaba de forma intermitente en `main` y de forma determinista con el grafo de módulos de la unidad `cleanText` del kernel. El anclaje nativo de scroll no compensa este crecimiento porque la propia sección del fragmento también crece.

## Cambio

- `src/views/public/home/index.js`: la invalidación estructural que ya existía (`ResizeObserver` sobre la raíz, la navegación, la barra y el host) vuelve a programar la alineación del fragmento solicitado durante los primeros 8 s tras el montaje. Se detiene en cuanto el desplazamiento actual se aleja más de 2 px de la última alineación instantánea (el visitante ha tomado el control). Sin listeners nuevos: la guardia de rendimiento (`public_home_performance`) sigue con un único listener de scroll y sin `wheel`/`touchmove`.
- `tools/public-site-browser-contract.mjs`: escenario determinista. Tras alinear `#incidencia`, todas las secciones crecen 400 px y el destino vuelve a la ventana con la URL intacta; tras un desplazamiento del visitante, un crecimiento de 800 px ya no mueve la página ni persigue el fragmento. Contra el código anterior el contrato falla como en producción.
- Docs: fila de `/#incidencia` en `PUBLIC_EXPERIENCE.md`.

## Presupuesto de arranque

El chunk `home-*.js` crece 317 bytes (bootstrapPublicHome 217970 → 218293). El techo de `tools/invoice-api-split-dist-contract.mjs` pasa de 218000 a 218500 en una PR de tooling previa (R04), con el motivo y los 207 bytes que quedan documentados en el propio contrato.

## Comportamiento

Sin cambio visual en cargas normales: la re-alineación produce el mismo destino que la primera. Cuando el layout crece tarde, el fragmento queda donde el visitante lo pidió en lugar de 1100 px arriba.
