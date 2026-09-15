# Detalle de Clientes sobre el shell canónico · 2026-09-15

## Qué cambia

- `src/views/clientes/clientes.template.modal.js` renderiza el detalle con `renderModalShell`: el header lleva el hero (avatar, chips, título, resumen) y el botón cerrar del shell (`renderModalCloseButton`, acción `detail-close`); el body del shell es el único scroll y contiene la ranura de feedback, la rejilla de metadatos, los bloques y el pie. Identidad conservada: id de root y panel, `data-clientes-modal-root/-overlay/-panel`, `data-cliente-id`, `data-template-version`, `data-read-only`, `data-backend-contract`, `data-compatible-index`, `data-compatible-api`, `data-submitting`. Desaparecen los pares estructurales `incidencias-modal-(root|overlay|panel|header|body)` y los atributos `data-incidencias-modal-*` (la hoja de detalle de Incidencias no se carga en /clientes: en esa ruta eran peso muerto, y con la hoja cargada un doble estilo latente); el contenido conserva por ahora el préstamo `incidencias-modal-*` (hero, chips, título, meta, pie) hasta la unidad de contenido de los detalles.
- Controlador (mismo módulo): el click exterior llega por `modal-lifecycle` (`onBackdrop` → `closeBridge()`); desaparecen la rama `overlayClick` y los selectores de root, overlay y panel de `renderModalContent` (conserva `identityAttribute: "data-cliente-id"` y los atributos de foco); el foco del panel se resuelve sólo por `data-clientes-modal-panel`. El glifo `close` del mapa de iconos se retira (lo aporta el shell).
- CSS: `views/clientes/detail.css` 1038 → 786 líneas (fuera `box-sizing`, root, bloqueo del `body`, overlay, panel, header estructural, botón cerrar, scroll del body, tema claro del overlay, `@keyframes` y la geometría del shell en responsive y print). La anchura propia del detalle (1080 px frente a los 1160 px del tamaño `detail`) se declara como token del shell en `clientes-modal-root` (`--ui-detail-modal-panel-width`); unificarla con los otros detalles es una decisión de la unidad de contenido.

## Contratos

- `tools/modal-shell-contract.mjs`: el detalle de Clientes entra en `SHELL_CONSUMERS` (8); el inventario de shells históricos baja de 11 a 9 (la unidad `clientes-detail-shell` queda cerrada).
- Comportamiento verificado con `private-owner-modal-browser-contract` 51/51 (cliente: apertura, cierre, Escape, click exterior, reintento, foco, móvil y la aserción de cierre arriba a la derecha), `modal_lifecycle_contract` 22 (escenario real del detalle de Clientes), `modal_authority_contract`, `presentation-text-contract`, `avatar_system_contract`, `clientes_scale_contract`, `repo_integrity`, `private_css_authority_contract`.
- Geometría medida con los controladores reales antes y después (1366 px y 390 px): mismo panel (1080 × 828 en escritorio, pantalla completa en móvil), mismo contenido y scroll; el header pasa de 128 a 119 px por el padding del shell, el cierre queda alineado al inicio del header (1162, 55) en lugar de centrado (1153, 80) y en móvil mide 42 px como en el resto de diálogos (antes 38 px).

## Siguiente

Confirmaciones de Facturas (`facturas-confirm-shell`), Correo, visor multimedia y capas legacy de `ui.css`; después la unidad de contenido de los detalles (Incidencias, Facturas, Clientes): emparejar hero/chips/meta/secciones/pie con `ui-detail-modal-*` y retirar las reglas duplicadas y el préstamo `incidencias-modal-*` de Clientes.
