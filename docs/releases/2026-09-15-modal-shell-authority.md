# Shell modal canónico · 2026-09-15

## Qué cambia

- `src/features/entity-overlay/modal-shell.js` (`ui-modal-shell.v1`) emite la única estructura DOM de un diálogo privado (root → overlay → panel → header / body / footer), su ARIA, el botón cerrar y los estados comunes de carga, error y vacío. Las variantes son explícitas: `data-modal-size` (`detail`, `wide`, `form`, `compact`, `confirm`) y `data-modal-height` (`fixed`, `auto`).
- `src/css/components/detail-modal.css` pasa a ser la única fuente del CSS estructural y se importa con el área privada (`app.css` y `private.css`, layer `components`). Deja de cargarse por ruta (`router/styles.js`) y por el dispatcher. Absorbe el host del dispatcher y los estados que antes definía `src/css/features/entity-overlay.css`, que desaparece con sus clases sin consumidor (`generic-list/row`, `feedback`, `eyebrow`, `stack-back`, `muted`) y sus dos `!important`.
- `modal-lifecycle.js` recibe el click exterior (`onBackdrop`, sobre el backdrop del shell): el dueño del diálogo decide si cierra, igual que con Escape. El dispatcher de entidades usa ese camino y su superficie de carga/error se renderiza con el shell.
- La hoja entra en el área privada declarándola en `private.css` (frontera declarativa de [2026-09-15-private-css-declarative-boundary.md](2026-09-15-private-css-declarative-boundary.md)); el tooling confiable no cambia.

## Contrato

`tools/modal-shell-contract.mjs` (en `validate:source`): estructura y atributos del shell, escape de valores, variantes con fallback, estados, dispatcher sobre el shell, autoridad importada por ambos entrypoints y ausente de las listas de ruta, hoja antigua retirada, sin `!important` en la autoridad, y un inventario cerrado de shells `position: fixed` fuera de la autoridad con la unidad que los retira: cada entrada debe seguir existiendo o borrarse del inventario.

## Siguiente

Migración de Incidencias y Facturas al shell (misma infraestructura, contenido distinto), después el resto de la familia. La tabla de estado vive en [UI_MODAL_SYSTEM.md](../UI_MODAL_SYSTEM.md).
