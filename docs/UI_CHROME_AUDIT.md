# App Chrome V3 — auditoría de layout

## Síntoma observado en iPhone

Al cerrar el Sidebar, el Topbar no permanecía inmóvil: durante la transición recuperaba/soltaba un offset lateral y se percibía un salto antes de quedar alineado. Con el Sidebar abierto, contenido de la vista podía seguir componiéndose visualmente por encima del drawer.

## Causa raíz

La geometría estaba repartida entre cuatro autoridades:

1. `core/layout.css` calculaba `main-content` y tablehead desde `--app-sidebar-current-width`.
2. `topbar.css` mantenía su propio bridge de estado Sidebar y, en móvil, forzaba un offset de rail de `60px` (`56px` en móvil estrecho).
3. `sidebar.css` mantenía sus propios estados de ancho y un bloque responsive móvil adicional.
4. `mobile-shell.css` intentaba corregir todo lo anterior después.

Además `app.css` importaba `mobile-shell.css` con `layer(layout)` y ese archivo volvía a declarar `@layer layout` internamente. Eso lo colocaba en una subcapa `layout.layout`, de modo que reglas anteriores del Topbar/Sidebar en la capa padre podían prevalecer. El resultado era una composición temporal incoherente durante el cambio de estado.

## Refactor aplicado

- `mobile-shell.css` desaparece por completo.
- `chrome.css` se convierte en la única autoridad geométrica final y se importa el último dentro de `layer(layout)` sin declarar otra layer interna.
- El antiguo bridge Sidebar→Topbar se elimina de `topbar.css`.
- Los antiguos bloques mobile de `sidebar.css` se eliminan.
- `core/layout.css` deja de declarar la autoridad de ancho del Sidebar y las capas de mounts.
- `features/mobile-shell/index.js` pasa de controlador completo a puente mínimo hacia `ui/chrome/index.js`.
- `ui/chrome/index.js` posee ahora la interacción transversal del chrome.
- `ui/chrome/template.js` mantiene únicamente estructura/ARIA y agrupa mounts antes del primer render.

## Invariante móvil

A `<= 900px`:

```css
--chrome-sidebar-offset: 0px;
--app-sidebar-current-width: 0px;
--layout-main-inset-left: 0px;
--topbar-effective-sidebar-offset: 0px;
```

El Topbar y `main-content` no animan su posición horizontal. El Sidebar es un overlay de ancho constante que sólo entra/sale con `transform` y `opacity`.

Por tanto abrir/cerrar navegación no puede provocar una segunda transición de layout sobre la vista.

## Stacking

`#app-chrome` tiene un stacking context explícito por encima de `main-content`. Dentro de él, Topbar, backdrop y drawer usan niveles propios. Esto evita que texto/tarjetas de la vista se pinten por encima del Sidebar abierto.

## Código eliminado o retirado como autoridad

La migración elimina el antiguo `mobile-shell.css` completo, reduce `features/mobile-shell/index.js` a un puente mínimo y recorta reglas de geometría duplicadas en `topbar.css`, `sidebar.css` y `core/layout.css`.

La meta no es sumar una quinta capa correctora: es que sólo exista una autoridad para la geometría del chrome.
